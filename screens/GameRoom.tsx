
import React, { useState, useEffect, useRef } from 'react';
import { GameSettings, Player, Bid, GamePhase, GameLog, AiMove, NetworkAction, GameState } from '../types';
import { rollDice, isValidBid, countDice, getShareUrl } from '../utils/gameUtils';
import { getAiMove } from '../services/geminiService';
import { Dice } from '../components/Dice';
import { Button } from '../components/Button';
import { AVATAR_COLORS, DICE_LABELS, DICE_FACES, EMOJI_LIST, DEFAULT_STARTING_DICE } from '../constants';

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
  const [finalLoser, setFinalLoser] = useState<string | null>(null); // Track the loser
  const [challengeResult, setChallengeResult] = useState<{loserId: string, actualCount: number, bid: Bid} | null>(null);

  // --- State Ref Pattern (Fix for Stale Closures in PeerJS) ---
  const gameStateRef = useRef<GameState>({
    players: [],
    currentPlayerIndex: 0,
    currentBid: null,
    bidHistory: [],
    logs: [],
    phase: GamePhase.LOBBY,
    totalDiceInGame: 0,
    roundWinner: null,
    finalLoser: null,
    challengeResult: null,
    settings: initialSettings
  });

  // Sync state to ref whenever it changes
  useEffect(() => {
    gameStateRef.current = {
      players, currentPlayerIndex, currentBid, bidHistory, logs, phase, totalDiceInGame, roundWinner, finalLoser, challengeResult, settings: settingsState
    };
  }, [players, currentPlayerIndex, currentBid, bidHistory, logs, phase, totalDiceInGame, roundWinner, finalLoser, challengeResult, settingsState]);

  // --- Local UI State ---
  const [selectedQuantity, setSelectedQuantity] = useState(1);
  const [selectedFace, setSelectedFace] = useState(2);
  const [isAiThinking, setIsAiThinking] = useState(false);
  const [myId, setMyId] = useState<string>(initialSettings.isHost ? 'host' : 'guest-temp');
  const [isCopied, setIsCopied] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [activeEmotes, setActiveEmotes] = useState<Record<string, string>>({}); // playerId -> emoji
  const [chatMessage, setChatMessage] = useState(''); // NEW: Chat Input State
  const logsEndRef = useRef<HTMLDivElement>(null);

  // --- Networking Refs ---
  const peerRef = useRef<any>(null);
  const connectionsRef = useRef<any[]>([]); 
  const hostConnectionRef = useRef<any>(null);

  // ==========================================
  // Initialization & Networking
  // ==========================================
  useEffect(() => {
    if (initialSettings.isHost) {
      const initialPlayer: Player = {
        id: 'host', 
        name: initialSettings.playerName,
        isAi: false,
        dice: [],
        diceCount: initialSettings.gameMode === 'hearts' ? DEFAULT_STARTING_DICE : initialSettings.startingDice,
        health: initialSettings.maxHealth,
        maxHealth: initialSettings.maxHealth,
        isEliminated: false,
        avatarSeed: 0,
        isHost: true
      };
      setPlayers([initialPlayer]);
      setMyId('host');
      
      if (initialSettings.mode === 'single') {
        initSinglePlayerGame(initialPlayer);
      } else {
        initHostPeer();
      }
    } else {
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
       if (err.type === 'unavailable-id') {
         addLog('房間 ID 衝突，請重新整理', 'error');
       }
    });
  };

  // --- Guest Logic: Init Peer ---
  const initGuestPeer = () => {
    const savedId = sessionStorage.getItem('gemini-liar-guest-id');
    let peer: any;
    try {
        peer = savedId ? new Peer(savedId) : new Peer();
    } catch(e) {
        peer = new Peer();
    }
    peerRef.current = peer;

    peer.on('open', (id: string) => {
      setMyId(id);
      sessionStorage.setItem('gemini-liar-guest-id', id);
      
      addLog('正在連線至房間...');
      const hostId = `gemini-liar-${initialSettings.roomId}`;
      const conn = peer.connect(hostId);
      
      conn.on('open', () => {
        hostConnectionRef.current = conn;
        addLog('已連線！');
        
        const me: Player = {
          id: id,
          name: initialSettings.playerName,
          isAi: false,
          dice: [],
          diceCount: initialSettings.gameMode === 'hearts' ? DEFAULT_STARTING_DICE : initialSettings.startingDice,
          health: initialSettings.maxHealth, // Will be overwritten by sync
          maxHealth: initialSettings.maxHealth,
          isEliminated: false,
          avatarSeed: Math.floor(Math.random() * 100)
        };
        conn.send({ type: 'JOIN', player: me });
      });

      conn.on('data', (data: NetworkAction) => {
        if (data.type === 'SYNC') {
          syncState(data.state);
        } else if (data.type === 'EMOTE') {
           displayEmote(data.playerId, data.emoji);
        }
      });
    });
  };

  // --- Host Logic: Handle Network Actions ---
  const handleNetworkAction = (action: NetworkAction) => {
    const currentState = gameStateRef.current;
    if (!currentState.settings.isHost) return;

    switch (action.type) {
      case 'JOIN':
        const existingPlayer = currentState.players.find(p => p.id === action.player.id);
        if (currentState.phase !== GamePhase.LOBBY && !existingPlayer) return;

        if (existingPlayer) {
            broadcastState(); 
        } else {
            const newPlayer = action.player;
            // Force Settings
            newPlayer.diceCount = currentState.settings.gameMode === 'hearts' ? DEFAULT_STARTING_DICE : currentState.settings.startingDice;
            newPlayer.health = currentState.settings.maxHealth;
            newPlayer.maxHealth = currentState.settings.maxHealth;
            
            const updatedPlayers = [...currentState.players, newPlayer];
            setPlayers(updatedPlayers);
            const joinLog = {id: Date.now().toString(), message: `${newPlayer.name} 加入了房間`, type: 'info' as const};
            setLogs(prev => [...prev, joinLog]);
            
            broadcastState({ 
                players: updatedPlayers, 
                logs: [...currentState.logs, joinLog] 
            });
        }
        break;
      case 'BID':
        if (!currentState.players[currentState.currentPlayerIndex]) return;
        submitBid(currentState.players[currentState.currentPlayerIndex].id, action.quantity, action.face);
        break;
      case 'CHALLENGE':
        if (!currentState.players[currentState.currentPlayerIndex]) return;
        handleChallenge(currentState.players[currentState.currentPlayerIndex].id);
        break;
      case 'EMOTE':
        displayEmote(action.playerId, action.emoji);
        // Relay emote to others
        connectionsRef.current.forEach(conn => {
            if (conn.open && conn.peer !== action.playerId) { // Don't echo back if unnecessary, but PeerJS usually handles own logic separate
                conn.send({ type: 'EMOTE', playerId: action.playerId, emoji: action.emoji });
            }
        });
        break;
      case 'CHAT': {
        const sender = currentState.players.find(p => p.id === action.playerId);
        const chatLog = {
           id: Date.now().toString(),
           message: `${sender?.name || 'Unknown'}: ${action.message}`,
           type: 'chat' as const
        };
        const newLogs = [...currentState.logs, chatLog];
        setLogs(newLogs);
        broadcastState({ logs: newLogs });
        break;
      }
    }
  };

  // --- Host Logic: Broadcast ---
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
        finalLoser: currentState.finalLoser,
        challengeResult: currentState.challengeResult,
        settings: currentState.settings,
        ...partialState
    };

    const payload = { type: 'SYNC', state: stateToSend };
    connectionsRef.current.forEach(conn => {
      if (conn.open) conn.send(payload);
    });
  };

  // --- Guest Logic: Sync ---
  const syncState = (newState: Partial<GameState>) => {
    if (newState.players) setPlayers(newState.players);
    if (newState.currentPlayerIndex !== undefined) setCurrentPlayerIndex(newState.currentPlayerIndex);
    if (newState.currentBid !== undefined) setCurrentBid(newState.currentBid);
    if (newState.bidHistory) setBidHistory(newState.bidHistory);
    if (newState.logs) setLogs(newState.logs);
    if (newState.phase) setPhase(newState.phase);
    if (newState.totalDiceInGame !== undefined) setTotalDiceInGame(newState.totalDiceInGame);
    if (newState.roundWinner !== undefined) setRoundWinner(newState.roundWinner);
    if (newState.finalLoser !== undefined) setFinalLoser(newState.finalLoser);
    if (newState.challengeResult !== undefined) setChallengeResult(newState.challengeResult);
    
    if (newState.settings) {
        setSettingsState(prev => ({
            ...newState.settings!,
            isHost: prev.isHost,
            mode: prev.mode
        }));
    }
  };

  // ==========================================
  // Game Logic
  // ==========================================

  const initSinglePlayerGame = (humanPlayer: Player) => {
    const newPlayers = [humanPlayer];
    const diceStart = initialSettings.gameMode === 'hearts' ? DEFAULT_STARTING_DICE : initialSettings.startingDice;
    
    for (let i = 1; i < initialSettings.playerCount; i++) {
      newPlayers.push({
        id: `ai-${i}`,
        name: `Gemini AI ${i}`,
        isAi: true,
        dice: [],
        diceCount: diceStart,
        health: initialSettings.maxHealth,
        maxHealth: initialSettings.maxHealth,
        isEliminated: false,
        avatarSeed: i
      });
    }
    setPlayers(newPlayers);
    startNewRound(newPlayers, 0);
  };

  const startMultiplayerGame = () => {
    // Filter out existing bots to prevent duplication if restarting from lobby
    const humans = players.filter(p => !p.isAi);
    let currentPlayers = [...humans];
    const humansCount = humans.length;
    const needed = settingsState.playerCount - humansCount;
    const diceStart = settingsState.gameMode === 'hearts' ? DEFAULT_STARTING_DICE : settingsState.startingDice;
    
    for(let i=0; i < needed; i++) {
       currentPlayers.push({
        id: `bot-${i}`,
        name: `Bot ${i+1}`,
        isAi: true,
        dice: [],
        diceCount: diceStart,
        health: settingsState.maxHealth,
        maxHealth: settingsState.maxHealth,
        isEliminated: false,
        avatarSeed: 50 + i
      });
    }
    setPlayers(currentPlayers);
    startNewRound(currentPlayers, 0);
  };

  // New: Restart Game Directly (Host Only)
  const handleRestartGame = () => {
    if (!settingsState.isHost) return;

    // Reset all current players (including bots) to initial state
    const resetPlayers = players.map(p => ({
        ...p,
        dice: [],
        diceCount: settingsState.gameMode === 'hearts' ? DEFAULT_STARTING_DICE : settingsState.startingDice,
        health: settingsState.maxHealth,
        isEliminated: false
    }));

    setPlayers(resetPlayers);
    startNewRound(resetPlayers, 0);
    
    const restartLog: GameLog = { id: Date.now().toString(), message: '--- 遊戲重新開始 ---', type: 'info' };
    setLogs([restartLog]);
    
    // Broadcast the full reset state
    broadcastState({
        players: resetPlayers,
        logs: [restartLog]
    });
  };

  // New: Back to Room Lobby (Host Only)
  const handleBackToRoom = () => {
      if (!settingsState.isHost) return;
      
      // Remove bots when returning to lobby
      const humansOnly = players.filter(p => !p.isAi);
      setPlayers(humansOnly);
      setPhase(GamePhase.LOBBY);
      setLogs([]);

      broadcastState({
          players: humansOnly,
          phase: GamePhase.LOBBY,
          logs: [],
          roundWinner: null,
          finalLoser: null
      });
  };

  const startNewRound = (currentPlayers: Player[], startPlayerIndex: number) => {
    const activePlayers = currentPlayers.map(p => ({
      ...p,
      // Dice count handling: In Classic, diceCount is reduced. In Hearts, diceCount is constant.
      // But in resolveRound we update the state.diceCount. 
      // If Hearts mode, diceCount should remain 5 (or whatever default)
      dice: p.isEliminated ? [] : rollDice(p.diceCount)
    }));
    
    const totalDice = activePlayers.reduce((acc, p) => acc + (p.isEliminated ? 0 : p.diceCount), 0);

    setPlayers(activePlayers);
    setTotalDiceInGame(totalDice);
    setCurrentBid(null);
    setBidHistory([]);
    setPhase(GamePhase.PLAYING);
    setChallengeResult(null);
    setRoundWinner(null);
    setFinalLoser(null);
    setSelectedQuantity(1);
    setSelectedFace(2);

    let nextIndex = startPlayerIndex;
    while(activePlayers[nextIndex].isEliminated) {
        nextIndex = (nextIndex + 1) % activePlayers.length;
    }
    setCurrentPlayerIndex(nextIndex);

    const newLog: GameLog = { id: Date.now().toString(), message: `新回合開始！場上共有 ${totalDice} 顆骰子。`, type: 'info' };
    setLogs(prev => [...prev, newLog]);

    broadcastState({
      players: activePlayers,
      totalDiceInGame: totalDice,
      currentBid: null,
      bidHistory: [],
      phase: GamePhase.PLAYING,
      challengeResult: null,
      roundWinner: null,
      finalLoser: null,
      currentPlayerIndex: nextIndex,
      logs: [...logs, newLog]
    });
  };

  // --- Emote System ---
  const sendEmote = (emoji: string) => {
      displayEmote(myId, emoji); // Show local
      setShowEmojiPicker(false);
      
      if (settingsState.isHost) {
          // Host sends to everyone else
           connectionsRef.current.forEach(conn => {
            if (conn.open) conn.send({ type: 'EMOTE', playerId: myId, emoji });
          });
      } else {
          // Guest sends to host
          hostConnectionRef.current?.send({ type: 'EMOTE', playerId: myId, emoji });
      }
  };

  const displayEmote = (playerId: string, emoji: string) => {
      setActiveEmotes(prev => ({ ...prev, [playerId]: emoji }));
      setTimeout(() => {
          setActiveEmotes(prev => {
              const newState = { ...prev };
              delete newState[playerId];
              return newState;
          });
      }, 3000);
  };

  // --- Chat System ---
  const handleSendChat = () => {
    if (!chatMessage.trim()) return;
    const msg = chatMessage.trim();
    setChatMessage('');

    if (settingsState.isHost) {
        // Host: Update local state and broadcast
        const me = players.find(p => p.id === myId);
        const newLog: GameLog = { 
            id: Date.now().toString(), 
            message: `${me?.name || 'Host'}: ${msg}`, 
            type: 'chat' 
        };
        const newLogs = [...logs, newLog];
        setLogs(newLogs);
        broadcastState({ logs: newLogs });
    } else {
        // Guest: Send to Host
        hostConnectionRef.current?.send({ type: 'CHAT', playerId: myId, message: msg });
    }
  };

  // --- AI Logic Hook ---
  useEffect(() => {
    if (!settingsState.isHost) return;
    const activePlayer = players[currentPlayerIndex];
    if (phase === GamePhase.PLAYING && activePlayer?.isAi && !isAiThinking) {
      handleAiTurn(activePlayer);
    }
  }, [currentPlayerIndex, phase, players]);

  // Logs Scroll
  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  const addLog = (message: string, type: GameLog['type'] = 'info') => {
    const newLog: GameLog = { id: Date.now().toString(), message, type };
    setLogs(prev => [...prev, newLog]);
  };

  const handleAiTurn = async (aiPlayer: Player) => {
    setIsAiThinking(true);
    await new Promise(r => setTimeout(r, 1500));
    
    // 10% Chance for AI to emote
    if (Math.random() < 0.1) {
        const randomEmote = EMOJI_LIST[Math.floor(Math.random() * EMOJI_LIST.length)];
        // Host locally displays it, also needs to broadcast if logic requires, but handled by handleNetworkAction logic flow
        displayEmote(aiPlayer.id, randomEmote);
        broadcastState(); // Sync isn't strict for emotes, but good to have
        connectionsRef.current.forEach(conn => conn.send({type: 'EMOTE', playerId: aiPlayer.id, emoji: randomEmote}));
    }

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
           handleChallenge(aiPlayer.id); 
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
    if (!settingsState.isHost) {
        hostConnectionRef.current?.send({ type: 'BID', quantity, face });
        return;
    }

    const current = gameStateRef.current;
    const newBid: Bid = { playerId, quantity, face };
    const player = current.players.find(p => p.id === playerId);
    const newLogs = [...current.logs, { id: Date.now().toString(), message: `${player?.name} 喊叫： ${quantity} 個 ${DICE_LABELS[face]}`, type: 'bid' as const }];
    const newHistory = [...current.bidHistory, newBid];

    let nextIndex = (current.currentPlayerIndex + 1) % current.players.length;
    while(current.players[nextIndex].isEliminated) {
        nextIndex = (nextIndex + 1) % current.players.length;
    }

    setCurrentBid(newBid);
    setBidHistory(newHistory);
    setLogs(newLogs);
    setCurrentPlayerIndex(nextIndex);

    broadcastState({
        currentBid: newBid,
        bidHistory: newHistory,
        logs: newLogs,
        currentPlayerIndex: nextIndex
    });

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
       message = `抓錯了！場上有 ${actualCount} 個 ${DICE_LABELS[current.currentBid.face]}。${challenger?.name} 失去一顆${settingsState.gameMode === 'hearts' ? '愛心' : '骰子'}。`;
    } else {
       loserId = bidderId;
       message = `抓到了！場上只有 ${actualCount} 個 ${DICE_LABELS[current.currentBid.face]}。${bidder?.name} 失去一顆${settingsState.gameMode === 'hearts' ? '愛心' : '骰子'}。`;
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
      const current = gameStateRef.current;
      
      const updatedPlayers = current.players.map(p => {
          if (p.id === loserId) {
              if (current.settings.gameMode === 'hearts') {
                  // Hearts Mode
                  const newHealth = p.health - 1;
                  return {
                      ...p,
                      health: newHealth,
                      isEliminated: newHealth <= 0
                  };
              } else {
                  // Classic Mode
                  const newCount = p.diceCount - 1;
                  return { 
                      ...p, 
                      diceCount: newCount,
                      isEliminated: newCount <= 0
                  };
              }
          }
          return p;
      });

      const survivors = updatedPlayers.filter(p => !p.isEliminated);
      if (survivors.length === 1) {
          const winnerName = survivors[0].name;
          // Identify the Loser (the one who just got eliminated to end the game)
          const loserName = updatedPlayers.find(p => p.id === loserId)?.name || 'Unknown';
          
          setPlayers(updatedPlayers);
          setPhase(GamePhase.GAME_OVER);
          setRoundWinner(winnerName);
          setFinalLoser(loserName);
          const winLog = { id: Date.now().toString(), message: `遊戲結束！${winnerName} 獲勝！`, type: 'win' as const};
          setLogs(prev => [...prev, winLog]);
          
          broadcastState({
              players: updatedPlayers,
              phase: GamePhase.GAME_OVER,
              roundWinner: winnerName,
              finalLoser: loserName,
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

  const handleCopy = () => {
    if (!settingsState.roomId) return;
    const url = getShareUrl(settingsState.roomId);
    navigator.clipboard.writeText(url);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
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

                  {/* Host: Show Room ID and Copy Button */}
                  {settingsState.isHost && (
                    <div className="bg-slate-900/50 p-4 rounded-xl border border-slate-600 mb-6 flex items-center justify-between">
                        <div>
                            <p className="text-xs text-slate-400 uppercase tracking-wider font-bold mb-1">房間代碼</p>
                            <p className="text-xl font-mono text-indigo-300 tracking-widest">{settingsState.roomId}</p>
                        </div>
                        <Button variant="secondary" onClick={handleCopy} className="text-xs py-1 h-9 min-w-[80px]">
                            {isCopied ? '已複製' : '複製'}
                        </Button>
                    </div>
                  )}
                  
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
                      {/* Placeholders */}
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
  const me = players.find(p => p.id === myId);
  const opponents = players.filter(p => p.id !== myId);
  const isSpectating = !me && phase === GamePhase.PLAYING;

  const canSeeDice = (p: Player) => {
      if (phase === GamePhase.GAME_OVER) return true;
      if (phase === GamePhase.ROUND_END) return true; // Show all dice during reveal
      if (p.id === myId) return true;
      if (me?.isEliminated) return true; // Eliminated players can see everything (Observer mode)
      return false;
  };

  if (isSpectating) {
      return (
          <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center p-4">
               <div className="bg-slate-800 p-8 rounded-2xl border border-rose-900/50 text-center max-w-md">
                   <div className="text-4xl mb-4">🚫</div>
                   <h2 className="text-xl font-bold text-white mb-2">無法加入遊戲</h2>
                   <p className="text-slate-400 mb-6">遊戲已經開始，且您不在玩家清單中。</p>
                   <Button onClick={onLeave}>返回大廳</Button>
               </div>
          </div>
      );
  }

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
                            ${activePlayer?.id === p.id ? 'bg-indigo-900/40 ring-2 ring-indigo-500 shadow-[0_0_20px_rgba(99,102,241,0.3)] scale-105' : 'bg-slate-800/50'}
                            ${p.isEliminated ? 'opacity-30 grayscale' : ''}
                        `}
                    >
                        {/* Avatar */}
                        <div className={`relative w-12 h-12 rounded-full mb-2 flex items-center justify-center font-bold text-lg shadow-lg ${AVATAR_COLORS[p.avatarSeed! % AVATAR_COLORS.length]}`}>
                            {p.name.charAt(0)}
                            {/* Emote Display */}
                            {activeEmotes[p.id] && (
                                <div className="absolute -top-10 -right-4 text-4xl animate-bounce-in z-20 filter drop-shadow-lg">
                                    {activeEmotes[p.id]}
                                </div>
                            )}
                        </div>
                        <div className="text-sm font-semibold mb-1">{p.name}</div>
                        
                        {/* Status (Hearts or Dice) */}
                        {settingsState.gameMode === 'hearts' ? (
                            <div className="flex gap-0.5 mb-1 h-4">
                                {Array.from({length: Math.max(0, p.health)}).map((_, i) => (
                                    <span key={i} className="text-xs text-rose-500 drop-shadow-sm">❤️</span>
                                ))}
                            </div>
                        ) : null}

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
                             {settingsState.gameMode === 'classic' && Array.from({length: p.diceCount - p.dice.length}).map((_, i) => (
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
                                輸了!
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

            {/* Logs Area & Chat Input - Bottom Left */}
            <div className="absolute left-4 bottom-24 w-72 flex flex-col gap-2 z-30 hidden md:flex">
                 {/* Logs */}
                 <div className="h-48 overflow-y-auto flex flex-col justify-end text-sm space-y-1 mask-linear-gradient" ref={logsEndRef}>
                     {logs.slice(-8).map(log => (
                         <div key={log.id} className={`
                            px-3 py-1.5 rounded backdrop-blur-md border-l-2 mb-1 shadow-sm break-words
                            ${log.type === 'bid' ? 'bg-black/40 border-indigo-400 text-indigo-100' : ''}
                            ${log.type === 'challenge' ? 'bg-black/40 border-rose-500 text-rose-100' : ''}
                            ${log.type === 'info' ? 'bg-black/20 border-slate-500 text-slate-300' : ''}
                            ${log.type === 'error' ? 'bg-black/40 border-red-500 text-red-300' : ''}
                            ${log.type === 'win' ? 'bg-black/40 border-yellow-500 text-yellow-300' : ''}
                            ${log.type === 'chat' ? 'bg-slate-800/80 border-white/50 text-white' : ''}
                         `}>
                             {log.message}
                         </div>
                     ))}
                 </div>
                 
                 {/* Chat Input */}
                 <div className="flex gap-2">
                    <input 
                      type="text"
                      value={chatMessage}
                      onChange={(e) => setChatMessage(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleSendChat()}
                      placeholder="輸入訊息..."
                      className="flex-1 bg-slate-800/80 border border-slate-600 rounded px-3 py-1.5 text-sm focus:outline-none focus:border-indigo-500 placeholder-slate-500"
                    />
                    <Button variant="secondary" onClick={handleSendChat} className="px-3 py-1.5 text-xs h-auto">
                        送出
                    </Button>
                 </div>
            </div>
            
            {/* My Player Area */}
            {me && (
                 <div className={`mt-auto bg-slate-900 border-t border-slate-800 p-4 transition-colors duration-500 ${isMyTurn ? 'bg-indigo-950/30' : ''} relative`}>
                     
                     {/* Emote Button & Picker */}
                     <div className="absolute top-[-60px] right-4 z-40">
                        {showEmojiPicker && (
                            <div className="absolute bottom-16 right-0 bg-slate-800 p-4 rounded-2xl shadow-2xl border border-slate-600 grid grid-cols-4 gap-4 animate-fade-in-up w-max z-50">
                                {EMOJI_LIST.map(emoji => (
                                    <button 
                                        key={emoji} 
                                        className="text-3xl hover:scale-125 transition-transform p-2 bg-slate-700/50 rounded-lg hover:bg-slate-600"
                                        onClick={() => sendEmote(emoji)}
                                    >
                                        {emoji}
                                    </button>
                                ))}
                            </div>
                        )}
                        <button 
                            onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                            className="bg-slate-800 hover:bg-slate-700 text-3xl w-12 h-12 rounded-full shadow-lg border border-slate-600 transition-colors flex items-center justify-center"
                        >
                            😀
                        </button>
                     </div>

                     <div className="max-w-4xl mx-auto flex flex-col md:flex-row items-center gap-6">
                         
                         {/* My Hand */}
                         <div className="flex flex-col items-center">
                             {/* My Emote Display */}
                             <div className="relative">
                                {activeEmotes[me.id] && (
                                    <div className="absolute -top-12 left-1/2 -translate-x-1/2 text-4xl animate-bounce-in z-20">
                                        {activeEmotes[me.id]}
                                    </div>
                                )}
                                <div className="flex gap-2 mb-2">
                                    {me.dice.map((d, i) => <Dice key={i} value={d} size="md" />)}
                                </div>
                             </div>
                             
                             <div className="text-xs font-bold text-slate-500 uppercase flex items-center gap-2">
                                 你的手牌 ({me.name})
                                 {settingsState.gameMode === 'hearts' && (
                                     <div className="flex gap-0.5 ml-2">
                                        {Array.from({length: Math.max(0, me.health)}).map((_, i) => (
                                            <span key={i} className="text-sm text-rose-500 drop-shadow-sm">❤️</span>
                                        ))}
                                     </div>
                                 )}
                             </div>
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
                                    {me.isEliminated ? (
                                        <div className="text-rose-400 font-bold animate-pulse">
                                            您已淘汰，目前為觀察者模式 (可查看所有手牌)
                                        </div>
                                    ) : (
                                        <div className="text-slate-400 animate-pulse font-mono flex items-center gap-2">
                                            {isAiThinking && <span className="animate-spin text-xl">⏳</span>}
                                            {isAiThinking ? "AI 正在思考..." : `等待 ${activePlayer?.name} 行動...`}
                                        </div>
                                    )}
                                 </div>
                             )}
                         </div>
                     </div>
                 </div>
            )}
            
             {/* Game Over Modal */}
            {phase === GamePhase.GAME_OVER && (
              <div className="absolute inset-0 z-50 bg-black/90 flex items-center justify-center p-4 backdrop-blur-md">
                  <div className="bg-slate-900 p-10 rounded-3xl shadow-2xl text-center border-2 border-slate-700 max-w-md w-full animate-bounce-in relative overflow-hidden">
                      {/* Define Custom Animation within the component scope */}
                      <style>{`
                        @keyframes grow-pulse {
                            0% { transform: scale(1); }
                            50% { transform: scale(1.1); }
                            100% { transform: scale(1); }
                        }
                        .animate-grow {
                            animation: grow-pulse 1.5s infinite ease-in-out;
                        }
                      `}</style>

                      <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500"></div>
                      
                      {/* Winner Section */}
                      <div className="mb-10">
                          <h2 className="text-4xl md:text-5xl font-black text-indigo-400 uppercase tracking-[0.2em] mb-4 drop-shadow-md">Winner</h2>
                          <div className="text-8xl mb-4 drop-shadow-lg">👑</div>
                          <p className="text-6xl font-black text-white drop-shadow-[0_0_15px_rgba(99,102,241,0.5)]">{roundWinner}</p>
                      </div>

                      {/* Loser Section */}
                      <div className="mb-10 p-6 bg-rose-950/40 rounded-2xl border-2 border-rose-900/50">
                           <h2 className="text-4xl md:text-5xl font-black text-rose-500 uppercase tracking-[0.2em] mb-2 animate-grow drop-shadow-md">Loser</h2>
                           <div className="text-5xl mb-2 grayscale opacity-80">💀</div>
                           <p className="text-4xl font-bold text-rose-200">{finalLoser}</p>
                      </div>

                      {/* Host Actions */}
                      {settingsState.isHost ? (
                          <div className="flex flex-col gap-3">
                              <Button onClick={handleRestartGame} className="w-full py-4 text-xl font-bold bg-indigo-600 hover:bg-indigo-500">
                                  再玩一局 (Restart)
                              </Button>
                              <div className="flex gap-2">
                                  <Button onClick={handleBackToRoom} variant="secondary" className="flex-1">
                                      回到房間
                                  </Button>
                                  <Button onClick={onLeave} variant="ghost" className="flex-1 text-slate-400">
                                      完全離開
                                  </Button>
                              </div>
                          </div>
                      ) : (
                          <div>
                             <p className="text-slate-400 animate-pulse mb-4">等待室長決定下一局...</p>
                             <Button onClick={onLeave} variant="secondary" className="w-full">離開房間</Button>
                          </div>
                      )}
                  </div>
              </div>
            )}
        </div>
    </div>
  );
};
