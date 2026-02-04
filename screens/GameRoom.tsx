
import React, { useState, useEffect, useRef } from 'react';
import { GameSettings, Player, Bid, GamePhase, GameLog, AiMove, NetworkAction, GameState } from '../types';
import { rollDice, isValidBid, countDice } from '../utils/gameUtils';
import { getAiMove } from '../services/geminiService';
import { Dice } from '../components/Dice';
import { Button } from '../components/Button';
import { AVATAR_COLORS, DICE_LABELS, DICE_FACES } from '../constants';

// Declare PeerJS globally
declare const Peer: any;

interface GameRoomProps {
  settings: GameSettings;
  onLeave: () => void;
}

export const GameRoom: React.FC<GameRoomProps> = ({ settings: initialSettings, onLeave }) => {
  // --- Game State (Synced across network) ---
  const [settingsState, setSettingsState] = useState<GameSettings>(initialSettings);
  const [players, setPlayers] = useState<Player[]>([]);
  const [currentPlayerIndex, setCurrentPlayerIndex] = useState(0);
  const [currentBid, setCurrentBid] = useState<Bid | null>(null);
  const [bidHistory, setBidHistory] = useState<Bid[]>([]);
  const [logs, setLogs] = useState<GameLog[]>([]);
  const [phase, setPhase] = useState<GamePhase>(GamePhase.LOBBY);
  const [totalDiceInGame, setTotalDiceInGame] = useState(0);
  const [roundWinner, setRoundWinner] = useState<string | null>(null);
  const [challengeResult, setChallengeResult] = useState<{loserId: string, actualCount: number, bid: Bid} | null>(null);

  // --- State Ref Pattern (Fix for Stale Closures in PeerJS) ---
  // This ref always holds the latest state, accessible inside event listeners
  const gameStateRef = useRef<GameState>({
    players: [],
    currentPlayerIndex: 0,
    currentBid: null,
    bidHistory: [],
    logs: [],
    phase: GamePhase.LOBBY,
    totalDiceInGame: 0,
    roundWinner: null,
    challengeResult: null,
    settings: initialSettings
  });

  // Sync state to ref whenever it changes
  useEffect(() => {
    gameStateRef.current = {
      players, currentPlayerIndex, currentBid, bidHistory, logs, phase, totalDiceInGame, roundWinner, challengeResult, settings: settingsState
    };
  }, [players, currentPlayerIndex, currentBid, bidHistory, logs, phase, totalDiceInGame, roundWinner, challengeResult, settingsState]);

  // --- Local UI State ---
  const [selectedQuantity, setSelectedQuantity] = useState(1);
  const [selectedFace, setSelectedFace] = useState(2);
  const [isAiThinking, setIsAiThinking] = useState(false);
  const [myId, setMyId] = useState<string>(initialSettings.isHost ? 'host' : 'guest-temp');
  const logsEndRef = useRef<HTMLDivElement>(null);

  // --- Networking Refs ---
  const peerRef = useRef<any>(null);
  const connectionsRef = useRef<any[]>([]); // For Host: list of guest connections
  const hostConnectionRef = useRef<any>(null); // For Guest: connection to host

  // ==========================================
  // Initialization & Networking
  // ==========================================
  useEffect(() => {
    // 1. Initialize Player List (Locally for Host first)
    if (initialSettings.isHost) {
      const initialPlayer: Player = {
        id: 'host', // Host always has ID 'host' internally
        name: initialSettings.playerName,
        isAi: false,
        dice: [],
        diceCount: initialSettings.startingDice,
        isEliminated: false,
        avatarSeed: 0,
        isHost: true
      };
      setPlayers([initialPlayer]);
      setMyId('host');
      
      if (initialSettings.mode === 'single') {
        // Single Player: Fill with AI immediately and start
        initSinglePlayerGame(initialPlayer);
      } else {
        // Multiplayer Host: Init Peer and Wait
        initHostPeer();
      }
    } else {
      // Multiplayer Guest: Init Peer and Connect
      initGuestPeer();
    }

    return () => {
      peerRef.current?.destroy();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // --- Host Logic: Init Peer ---
  const initHostPeer = () => {
    const peerId = `gemini-liar-${initialSettings.roomId}`;
    const peer = new Peer(peerId);
    peerRef.current = peer;

    peer.on('open', () => {
      addLog(`房間已建立，代碼：${initialSettings.roomId}。等待玩家加入...`);
    });

    peer.on('connection', (conn: any) => {
      conn.on('open', () => {
        connectionsRef.current.push(conn);
        // Immediately sync current settings to the new guest
        // We use setTimeout to ensure connection is fully ready
        setTimeout(() => broadcastState(), 500);
      });

      conn.on('data', (data: NetworkAction) => {
        handleNetworkAction(data);
      });

      conn.on('close', () => {
        addLog('有玩家斷線', 'error');
      });
    });

    peer.on('error', (err: any) => {
      console.error(err);
      if (err.type === 'unavailable-id') {
         addLog('房間 ID 衝突或尚未清理，請稍後再試或重新整理', 'error');
      } else {
         addLog(`連線錯誤: ${err.type}`, 'error');
      }
    });
  };

  // --- Guest Logic: Init Peer ---
  const initGuestPeer = () => {
    // Attempt to recover previous session ID for reconnection
    const savedId = sessionStorage.getItem('gemini-liar-guest-id');
    
    // If we have a savedId, try to use it. If not, PeerJS generates one.
    let peer: any;
    try {
        peer = savedId ? new Peer(savedId) : new Peer();
    } catch(e) {
        peer = new Peer();
    }

    peerRef.current = peer;

    peer.on('open', (id: string) => {
      setMyId(id);
      sessionStorage.setItem('gemini-liar-guest-id', id); // Persist ID
      
      addLog('正在連線至房間...');
      const hostId = `gemini-liar-${initialSettings.roomId}`;
      const conn = peer.connect(hostId);
      
      conn.on('open', () => {
        hostConnectionRef.current = conn;
        addLog('已連線！等待室長開始遊戲。');
        
        // Send Join Request
        const me: Player = {
          id: id,
          name: initialSettings.playerName,
          isAi: false,
          dice: [],
          diceCount: initialSettings.startingDice,
          isEliminated: false,
          avatarSeed: Math.floor(Math.random() * 100)
        };
        conn.send({ type: 'JOIN', player: me });
      });

      conn.on('data', (data: NetworkAction) => {
        if (data.type === 'SYNC') {
          syncState(data.state);
        }
      });
      
      conn.on('error', () => addLog('連線失敗', 'error'));
    });

    peer.on('error', (err: any) => {
        if (err.type === 'unavailable-id') {
             // ID taken (maybe tab is still open?), retry with fresh ID
             sessionStorage.removeItem('gemini-liar-guest-id');
             peer.destroy();
             // Simple recursive retry with fresh Peer
             const newPeer = new Peer();
             peerRef.current = newPeer;
             // Re-bind listeners (simplified for brevity, ideally extract setup function)
             initGuestPeer(); 
        } else {
            addLog(`連線錯誤: ${err.type}`, 'error');
        }
    });
  };

  // --- Host Logic: Handle Network Actions ---
  const handleNetworkAction = (action: NetworkAction) => {
    // CRITICAL: Read from Ref to get latest state
    const currentState = gameStateRef.current;
    if (!currentState.settings.isHost) return;

    switch (action.type) {
      case 'JOIN':
        const existingPlayer = currentState.players.find(p => p.id === action.player.id);
        
        // Allow Reconnection if player exists, otherwise only join in Lobby
        if (currentState.phase !== GamePhase.LOBBY && !existingPlayer) {
            return; 
        }

        if (existingPlayer) {
            // Reconnection logic: Just sync them up.
            // We might want to update their name if they changed it, but ID matches.
            broadcastState(); 
        } else {
            const newPlayer = action.player;
            // Ensure we use the settings from Host for this new player (like start dice)
            newPlayer.diceCount = currentState.settings.startingDice; 
            
            const updatedPlayers = [...currentState.players, newPlayer];
            setPlayers(updatedPlayers);
            // We need to update the log immediately in state for the broadcast to pick it up? 
            // Better to just invoke broadcast with the new values.
            const joinLog = {id: Date.now().toString(), message: `${newPlayer.name} 加入了房間`, type: 'info' as const};
            setLogs(prev => [...prev, joinLog]);
            
            broadcastState({ 
                players: updatedPlayers, 
                logs: [...currentState.logs, joinLog] 
            });
        }
        break;
      case 'BID':
        // Use current state to determine whose turn it is
        submitBid(currentState.players[currentState.currentPlayerIndex].id, action.quantity, action.face);
        break;
      case 'CHALLENGE':
        handleChallenge(currentState.players[currentState.currentPlayerIndex].id);
        break;
    }
  };

  // --- Host Logic: Broadcast State ---
  const broadcastState = (partialState?: Partial<GameState>) => {
    const currentState = gameStateRef.current;
    if (!currentState.settings.isHost) return;

    const stateToSend: Partial<GameState> = {
        players: currentState.players,
        currentPlayerIndex: currentState.currentPlayerIndex,
        currentBid: currentState.currentBid,
        bidHistory: currentState.bidHistory,
        logs: currentState.logs,
        phase: currentState.phase,
        totalDiceInGame: currentState.totalDiceInGame,
        roundWinner: currentState.roundWinner,
        challengeResult: currentState.challengeResult,
        settings: currentState.settings, // Sync settings!
        ...partialState
    };

    const payload = { type: 'SYNC', state: stateToSend };
    
    connectionsRef.current.forEach(conn => {
      if (conn.open) conn.send(payload);
    });
  };

  // --- Guest Logic: Sync State ---
  const syncState = (newState: Partial<GameState>) => {
    if (newState.players) setPlayers(newState.players);
    if (newState.currentPlayerIndex !== undefined) setCurrentPlayerIndex(newState.currentPlayerIndex);
    if (newState.currentBid !== undefined) setCurrentBid(newState.currentBid);
    if (newState.bidHistory) setBidHistory(newState.bidHistory);
    if (newState.logs) setLogs(newState.logs);
    if (newState.phase) setPhase(newState.phase);
    if (newState.totalDiceInGame !== undefined) setTotalDiceInGame(newState.totalDiceInGame);
    if (newState.roundWinner !== undefined) setRoundWinner(newState.roundWinner);
    if (newState.challengeResult !== undefined) setChallengeResult(newState.challengeResult);
    if (newState.settings) setSettingsState(newState.settings); // Sync Settings
  };

  // ==========================================
  // Game Logic (Host Only)
  // ==========================================

  const initSinglePlayerGame = (humanPlayer: Player) => {
    const newPlayers = [humanPlayer];
    // Add AI
    for (let i = 1; i < initialSettings.playerCount; i++) {
      newPlayers.push({
        id: `ai-${i}`,
        name: `Gemini AI ${i}`,
        isAi: true,
        dice: [],
        diceCount: initialSettings.startingDice,
        isEliminated: false,
        avatarSeed: i
      });
    }
    setPlayers(newPlayers);
    startNewRound(newPlayers, 0);
  };

  const startMultiplayerGame = () => {
    // Fill remaining spots with AI
    let currentPlayers = [...players];
    const humansCount = currentPlayers.length;
    const needed = settingsState.playerCount - humansCount;
    
    for(let i=0; i < needed; i++) {
       currentPlayers.push({
        id: `bot-${i}`,
        name: `Bot ${i+1}`,
        isAi: true,
        dice: [],
        diceCount: settingsState.startingDice,
        isEliminated: false,
        avatarSeed: 50 + i
      });
    }
    
    setPlayers(currentPlayers);
    startNewRound(currentPlayers, 0);
  };

  const startNewRound = (currentPlayers: Player[], startPlayerIndex: number) => {
    const activePlayers = currentPlayers.map(p => ({
      ...p,
      dice: p.isEliminated ? [] : rollDice(p.diceCount)
    }));
    
    const totalDice = activePlayers.reduce((acc, p) => acc + p.diceCount, 0);

    // Update Local Host State
    setPlayers(activePlayers);
    setTotalDiceInGame(totalDice);
    setCurrentBid(null);
    setBidHistory([]);
    setPhase(GamePhase.PLAYING);
    setChallengeResult(null);
    setRoundWinner(null);
    setSelectedQuantity(1);
    setSelectedFace(2);

    let nextIndex = startPlayerIndex;
    while(activePlayers[nextIndex].isEliminated) {
        nextIndex = (nextIndex + 1) % activePlayers.length;
    }
    setCurrentPlayerIndex(nextIndex);

    const newLog: GameLog = { id: Date.now().toString(), message: `新回合開始！場上共有 ${totalDice} 顆骰子。`, type: 'info' };
    setLogs(prev => [...prev, newLog]);

    // Broadcast
    broadcastState({
      players: activePlayers,
      totalDiceInGame: totalDice,
      currentBid: null,
      bidHistory: [],
      phase: GamePhase.PLAYING,
      challengeResult: null,
      roundWinner: null,
      currentPlayerIndex: nextIndex,
      logs: [...logs, newLog]
    });
  };

  // --- AI Logic Hook (Host Only) ---
  useEffect(() => {
    if (!settingsState.isHost) return;
    const activePlayer = players[currentPlayerIndex];
    if (phase === GamePhase.PLAYING && activePlayer?.isAi && !isAiThinking) {
      handleAiTurn(activePlayer);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPlayerIndex, phase, players]);

  // Auto-scroll logs
  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  const addLog = (message: string, type: GameLog['type'] = 'info') => {
    const newLog: GameLog = { id: Date.now().toString(), message, type };
    setLogs(prev => [...prev, newLog]);
  };

  const handleAiTurn = async (aiPlayer: Player) => {
    setIsAiThinking(true);
    // Broadcast thinking state? Optional, but we can simulate by holding state
    await new Promise(r => setTimeout(r, 1500));

    // Use Refs inside async callback to ensure latest state
    const current = gameStateRef.current;

    try {
      const move: AiMove = await getAiMove(
        aiPlayer,
        current.currentBid,
        current.totalDiceInGame,
        current.bidHistory,
        settingsState.difficulty
      );

      if (move.action === 'BID' && move.quantity && move.face) {
        if (isValidBid(current.currentBid, move.quantity, move.face)) {
            submitBid(aiPlayer.id, move.quantity, move.face);
        } else {
           handleChallenge(aiPlayer.id); // Fallback
        }
      } else {
        handleChallenge(aiPlayer.id);
      }
    } catch (e) {
      handleChallenge(aiPlayer.id);
    } finally {
      setIsAiThinking(false);
    }
  };

  const submitBid = (playerId: string, quantity: number, face: number) => {
    // Only Host updates state
    if (!settingsState.isHost) {
        hostConnectionRef.current?.send({ type: 'BID', quantity, face });
        return;
    }

    // Always read from Ref in logic functions
    const current = gameStateRef.current;

    const newBid: Bid = { playerId, quantity, face };
    const player = current.players.find(p => p.id === playerId);
    const newLogs = [...current.logs, { id: Date.now().toString(), message: `${player?.name} 喊叫： ${quantity} 個 ${DICE_LABELS[face]}`, type: 'bid' as const }];
    const newHistory = [...current.bidHistory, newBid];

    let nextIndex = (current.currentPlayerIndex + 1) % current.players.length;
    while(current.players[nextIndex].isEliminated) {
        nextIndex = (nextIndex + 1) % current.players.length;
    }

    // Update Local
    setCurrentBid(newBid);
    setBidHistory(newHistory);
    setLogs(newLogs);
    setCurrentPlayerIndex(nextIndex);

    // Broadcast
    broadcastState({
        currentBid: newBid,
        bidHistory: newHistory,
        logs: newLogs,
        currentPlayerIndex: nextIndex
    });

    // Helper update for Host UI
    if (playerId === 'host') {
        if (quantity >= selectedQuantity) {
            setSelectedQuantity(quantity);
            if (face >= 6) {
                setSelectedQuantity(quantity + 1);
                setSelectedFace(2);
            } else {
                setSelectedFace(face + 1);
            }
        }
    }
  };

  const handleChallenge = (challengerId: string) => {
    if (!settingsState.isHost) {
        hostConnectionRef.current?.send({ type: 'CHALLENGE' });
        return;
    }

    const current = gameStateRef.current;
    if (!current.currentBid) return;

    const actualCount = countDice(current.players, current.currentBid.face);
    const bidderId = current.currentBid.playerId;
    const bidder = current.players.find(p => p.id === bidderId);
    const challenger = current.players.find(p => p.id === challengerId);

    let loserId = '';
    let message = '';

    if (actualCount >= current.currentBid.quantity) {
       loserId = challengerId;
       message = `抓錯了！場上有 ${actualCount} 個 ${DICE_LABELS[current.currentBid.face]}。${challenger?.name} 失去一顆骰子。`;
    } else {
       loserId = bidderId;
       message = `抓到了！場上只有 ${actualCount} 個 ${DICE_LABELS[current.currentBid.face]}。${bidder?.name} 失去一顆骰子。`;
    }

    const result = { loserId, actualCount, bid: current.currentBid };
    const newLogs = [...current.logs, { id: Date.now().toString(), message, type: 'challenge' as const }];

    setPhase(GamePhase.ROUND_END);
    setChallengeResult(result);
    setLogs(newLogs);

    broadcastState({
        phase: GamePhase.ROUND_END,
        challengeResult: result,
        logs: newLogs
    });

    setTimeout(() => {
        resolveRound(loserId);
    }, 4000);
  };

  const resolveRound = (loserId: string) => {
      // Use Ref to get latest players, as they might have changed (unlikely in this timeout but safe)
      const current = gameStateRef.current;
      
      const updatedPlayers = current.players.map(p => {
          if (p.id === loserId) {
              const newCount = p.diceCount - 1;
              return { 
                  ...p, 
                  diceCount: newCount,
                  isEliminated: newCount <= 0
              };
          }
          return p;
      });

      const survivors = updatedPlayers.filter(p => !p.isEliminated);
      if (survivors.length === 1) {
          const winnerName = survivors[0].name;
          setPlayers(updatedPlayers);
          setPhase(GamePhase.GAME_OVER);
          setRoundWinner(winnerName);
          const winLog = { id: Date.now().toString(), message: `遊戲結束！${winnerName} 獲勝！`, type: 'win' as const};
          setLogs(prev => [...prev, winLog]);
          
          broadcastState({
              players: updatedPlayers,
              phase: GamePhase.GAME_OVER,
              roundWinner: winnerName,
              logs: [...current.logs, winLog] 
          });
          return;
      }

      let nextStarterIdx = updatedPlayers.findIndex(p => p.id === loserId);
      if (updatedPlayers[nextStarterIdx].isEliminated) {
          do {
              nextStarterIdx = (nextStarterIdx + 1) % updatedPlayers.length;
          } while (updatedPlayers[nextStarterIdx].isEliminated);
      }

      startNewRound(updatedPlayers, nextStarterIdx);
  };


  // ==========================================
  // RENDER UI
  // ==========================================

  // --- 1. Lobby Waiting Room ---
  if (phase === GamePhase.LOBBY) {
      return (
          <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center p-4">
              <div className="bg-slate-800 p-8 rounded-2xl shadow-2xl w-full max-w-md border border-slate-700">
                  <h2 className="text-2xl font-bold mb-6 text-center text-indigo-400">
                      {settingsState.isHost ? '等待玩家加入...' : '已加入房間，等待室長開始'}
                  </h2>
                  
                  <div className="space-y-4 mb-8">
                      {players.map(p => (
                          <div key={p.id} className="flex items-center gap-4 bg-slate-700/50 p-3 rounded-lg">
                              <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold ${AVATAR_COLORS[p.avatarSeed! % AVATAR_COLORS.length]}`}>
                                  {p.name.charAt(0)}
                              </div>
                              <span className="font-medium">{p.name} {p.id === myId ? '(我)' : ''}</span>
                              {p.isHost && <span className="text-xs bg-indigo-500 px-2 py-0.5 rounded text-white ml-auto">室長</span>}
                          </div>
                      ))}
                      {/* Placeholders - Uses settingsState for accurate count */}
                      {Array.from({length: Math.max(0, settingsState.playerCount - players.length)}).map((_, i) => (
                          <div key={i} className="flex items-center gap-4 border border-dashed border-slate-600 p-3 rounded-lg opacity-50">
                              <div className="w-10 h-10 rounded-full bg-slate-700"></div>
                              <span className="text-slate-500">等待加入... {settingsState.isHost ? '(或由 AI 遞補)' : ''}</span>
                          </div>
                      ))}
                  </div>

                  {settingsState.isHost ? (
                      <div className="flex flex-col gap-3">
                        <Button onClick={startMultiplayerGame} className="w-full py-3 text-lg">
                            開始遊戲 ({players.length}/{settingsState.playerCount}人)
                        </Button>
                        <p className="text-xs text-center text-slate-500">不足的人數將由 AI 遞補</p>
                      </div>
                  ) : (
                      <div className="text-center text-slate-400 animate-pulse">
                          室長正在準備遊戲...
                          <br/><span className="text-xs text-slate-500 mt-2 block">如果斷線，請重新整理頁面即可重連</span>
                      </div>
                  )}
                   <Button variant="ghost" onClick={onLeave} className="w-full mt-4">離開房間</Button>
              </div>
          </div>
      );
  }

  // --- 2. Playing UI ---
  const activePlayer = players[currentPlayerIndex];
  const isMyTurn = activePlayer?.id === myId && phase === GamePhase.PLAYING;
  
  // Calculate relative rendering for Poker table
  // Always put "Me" at bottom center
  const me = players.find(p => p.id === myId);
  const opponents = players.filter(p => p.id !== myId);

  // Helper to check if I can see dice
  const canSeeDice = (p: Player) => {
      if (phase === GamePhase.GAME_OVER) return true;
      if (p.id === myId) return true;
      if (phase === GamePhase.ROUND_END && (challengeResult?.loserId === p.id || challengeResult?.bid.playerId === p.id)) {
        return true; 
      }
      return false;
  };

  return (
    <div className="min-h-screen bg-slate-900 text-white flex flex-col overflow-hidden font-sans">
        {/* Header */}
        <div className="h-14 border-b border-slate-800 flex items-center justify-between px-4 bg-slate-950">
            <span className="font-bold text-indigo-400 tracking-wider">GEMINI 吹牛大王 {settingsState.mode === 'multiplayer' ? `(Room: ${settingsState.roomId})` : ''}</span>
            <Button variant="ghost" onClick={onLeave} className="text-xs">離開</Button>
        </div>

        {/* Main Table Area */}
        <div className="flex-1 relative flex flex-col">
            
            {/* Opponents Area */}
            <div className="flex-1 flex items-start justify-center p-4 gap-4 flex-wrap content-start">
                {opponents.map((p) => (
                    <div 
                        key={p.id} 
                        className={`
                            relative flex flex-col items-center p-3 rounded-xl transition-all duration-300 min-w-[120px]
                            ${activePlayer?.id === p.id ? 'bg-indigo-900/40 ring-2 ring-indigo-500 shadow-[0_0_20px_rgba(99,102,241,0.3)]' : 'bg-slate-800/50'}
                            ${p.isEliminated ? 'opacity-30 grayscale' : ''}
                        `}
                    >
                        {/* Avatar */}
                        <div className={`w-12 h-12 rounded-full mb-2 flex items-center justify-center font-bold text-lg shadow-lg ${AVATAR_COLORS[p.avatarSeed! % AVATAR_COLORS.length]}`}>
                            {p.name.charAt(0)}
                        </div>
                        <div className="text-sm font-semibold mb-1">{p.name}</div>
                        {/* Dice */}
                        <div className="flex gap-1 flex-wrap justify-center">
                            {p.dice.map((face, idx) => (
                                <Dice 
                                    key={idx} 
                                    value={face} 
                                    hidden={!canSeeDice(p)} 
                                    size="sm"
                                />
                            ))}
                             {Array.from({length: p.diceCount - p.dice.length}).map((_, i) => (
                                <div key={`lost-${i}`} className="w-8 h-8 rounded border border-slate-700 bg-slate-800 opacity-50"></div>
                             ))}
                        </div>
                        
                        {/* Bubble */}
                        {currentBid?.playerId === p.id && (
                             <div className="absolute -bottom-8 left-1/2 -translate-x-1/2 bg-white text-slate-900 text-xs px-2 py-1 rounded-full font-bold shadow whitespace-nowrap z-10">
                                喊叫: {currentBid.quantity} 個 {DICE_LABELS[currentBid.face]}
                             </div>
                        )}
                         {challengeResult?.loserId === p.id && phase === GamePhase.ROUND_END && (
                             <div className="absolute -bottom-8 left-1/2 -translate-x-1/2 bg-rose-500 text-white text-xs px-2 py-1 rounded-full font-bold shadow whitespace-nowrap z-10 animate-bounce">
                                輸了這局
                             </div>
                        )}
                    </div>
                ))}
            </div>

            {/* Center Info - The "Pot" */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none z-0">
                 <div className="bg-slate-950/80 backdrop-blur-sm p-6 rounded-3xl border border-slate-700 flex flex-col items-center shadow-2xl">
                     <div className="text-xs text-slate-400 uppercase tracking-widest mb-2">目前叫價</div>
                     {currentBid ? (
                         <div className="flex items-center gap-3">
                             <span className="text-5xl font-black text-indigo-400">{currentBid.quantity}</span>
                             <span className="text-2xl text-slate-500">x</span>
                             <Dice value={currentBid.face} size="md" />
                         </div>
                     ) : (
                         <div className="text-slate-500 italic">等待開始叫價...</div>
                     )}
                     <div className="mt-4 text-xs text-slate-500">
                         場上總骰數: {totalDiceInGame}
                     </div>
                 </div>
            </div>

            {/* Logs Area */}
            <div className="absolute left-4 bottom-32 w-64 h-48 pointer-events-none hidden md:block">
                 <div className="h-full overflow-y-auto flex flex-col justify-end text-sm space-y-1 mask-linear-gradient" ref={logsEndRef}>
                     {logs.slice(-6).map(log => (
                         <div key={log.id} className={`
                            px-3 py-1.5 rounded bg-black/40 backdrop-blur-md border-l-2 mb-1
                            ${log.type === 'bid' ? 'border-indigo-400 text-indigo-100' : ''}
                            ${log.type === 'challenge' ? 'border-rose-500 text-rose-100' : ''}
                            ${log.type === 'info' ? 'border-slate-500 text-slate-300' : ''}
                            ${log.type === 'error' ? 'border-red-500 text-red-300' : ''}
                            ${log.type === 'win' ? 'border-yellow-500 text-yellow-300' : ''}
                         `}>
                             {log.message}
                         </div>
                     ))}
                 </div>
            </div>
            
            {/* My Player Area */}
            {me && (
                 <div className={`mt-auto bg-slate-900 border-t border-slate-800 p-4 transition-colors duration-500 ${isMyTurn ? 'bg-indigo-950/30' : ''}`}>
                     <div className="max-w-4xl mx-auto flex flex-col md:flex-row items-center gap-6">
                         
                         {/* My Hand */}
                         <div className="flex flex-col items-center">
                             <div className="flex gap-2 mb-2">
                                {me.dice.map((d, i) => <Dice key={i} value={d} size="md" />)}
                             </div>
                             <div className="text-xs font-bold text-slate-500 uppercase">你的手牌 ({me.name})</div>
                         </div>

                         {/* Controls */}
                         <div className="flex-1 w-full flex flex-col gap-3">
                             {/* Only show controls if human turn */}
                             {isMyTurn ? (
                                 <div className="flex flex-col gap-3 animate-fade-in-up">
                                     <div className="flex flex-wrap items-center justify-center gap-4 bg-slate-800 p-3 rounded-xl border border-slate-700">
                                         {/* Quantity Selector */}
                                         <div className="flex items-center gap-2">
                                             <button 
                                                className="w-8 h-8 rounded bg-slate-700 hover:bg-slate-600 flex items-center justify-center font-bold"
                                                onClick={() => setSelectedQuantity(Math.max(1, selectedQuantity - 1))}
                                             >-</button>
                                             <div className="w-12 text-center font-mono text-xl">{selectedQuantity}</div>
                                             <button 
                                                className="w-8 h-8 rounded bg-slate-700 hover:bg-slate-600 flex items-center justify-center font-bold"
                                                onClick={() => setSelectedQuantity(selectedQuantity + 1)}
                                             >+</button>
                                         </div>
                                         <span className="text-slate-500">個</span>
                                         {/* Face Selector */}
                                         <div className="flex gap-1">
                                             {DICE_FACES.map(face => (
                                                 <button
                                                    key={face}
                                                    onClick={() => setSelectedFace(face)}
                                                    className={`
                                                        w-10 h-10 rounded-lg flex items-center justify-center transition-all
                                                        ${selectedFace === face ? 'bg-indigo-600 ring-2 ring-indigo-400 scale-110' : 'bg-slate-700 hover:bg-slate-600 opacity-70'}
                                                    `}
                                                 >
                                                     <Dice value={face} size="sm" />
                                                 </button>
                                             ))}
                                         </div>
                                     </div>
                                     
                                     <div className="flex gap-4 justify-center">
                                         {currentBid && (
                                             <Button 
                                                variant="danger" 
                                                onClick={() => handleChallenge(me.id)}
                                                className="flex-1 max-w-[150px]"
                                             >
                                                 抓！(開牌)
                                             </Button>
                                         )}
                                         <Button 
                                            variant="primary" 
                                            onClick={() => {
                                                if (isValidBid(currentBid, selectedQuantity, selectedFace)) {
                                                    submitBid(me.id, selectedQuantity, selectedFace);
                                                } else {
                                                    alert("喊叫必須比上家數量更多，或是數量相同但點數更大。");
                                                }
                                            }}
                                            disabled={!isValidBid(currentBid, selectedQuantity, selectedFace)}
                                            className="flex-1 max-w-[200px]"
                                         >
                                             喊叫 (Bid)
                                         </Button>
                                     </div>
                                 </div>
                             ) : (
                                 <div className="flex items-center justify-center h-full">
                                     <div className="text-slate-400 animate-pulse font-mono">
                                         {isAiThinking ? "AI 正在思考..." : `等待 ${activePlayer?.name} 行動...`}
                                     </div>
                                 </div>
                             )}
                         </div>
                     </div>
                 </div>
            )}
            
             {/* Game Over Modal */}
            {phase === GamePhase.GAME_OVER && (
              <div className="absolute inset-0 z-50 bg-black/80 flex items-center justify-center p-4 backdrop-blur-sm">
                  <div className="bg-slate-800 p-8 rounded-2xl shadow-2xl text-center border border-slate-700 max-w-sm w-full animate-bounce-in">
                      <h1 className="text-4xl font-bold text-white mb-4">遊戲結束</h1>
                      <div className="text-6xl mb-4">👑</div>
                      <p className="text-2xl text-indigo-400 mb-8">獲勝者：{roundWinner}</p>
                      <Button onClick={onLeave} className="w-full">返回大廳</Button>
                  </div>
              </div>
            )}
        </div>
    </div>
  );
};
