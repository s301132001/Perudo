
import React, { useState, useEffect, useRef } from 'react';
import { GameSettings, Player, GameLog, NetworkAction, GameState, Tile, GamePhase } from '../types';
import { getShareUrl } from '../utils/gameUtils';
import { generateDeck, sortHand, isValidSet } from '../utils/rummikubUtils';
import { getBotMove } from '../utils/rummikubBot';
import { Button } from '../components/Button';
import { AVATAR_COLORS, EMOJI_LIST } from '../constants';

// Declare PeerJS globally
declare const Peer: any;

interface RummikubRoomProps {
  settings: GameSettings;
  onLeave: () => void;
}

// --- Visual Constants ---
const BOARD_COLS = 13;
const MIN_BOARD_ROWS = 6;

// --- Helper: Organize Set (Smart Joker Sorting) ---
const organizeSet = (tiles: Tile[]): Tile[] => {
    if (tiles.length === 0) return [];
    
    const regular = tiles.filter(t => !t.isJoker).sort((a,b) => a.value - b.value);
    
    if (regular.length === 0) return tiles;

    const isGroup = regular.every(t => t.value === regular[0].value);
    if (isGroup) {
        return [...regular, ...tiles.filter(t => t.isJoker)];
    }

    const jokers = tiles.filter(t => t.isJoker);
    const result: Tile[] = [regular[0]];

    for (let i = 1; i < regular.length; i++) {
        const prev = regular[i-1];
        const curr = regular[i];
        const diff = curr.value - prev.value;

        if (diff > 1) {
            const gaps = diff - 1;
            for (let k = 0; k < gaps; k++) {
                if (jokers.length > 0) result.push(jokers.shift()!);
            }
        }
        result.push(curr);
    }

    let lastVal = regular[regular.length - 1].value;
    while (jokers.length > 0 && lastVal < 13) {
        result.push(jokers.shift()!);
        lastVal++;
    }
    while (jokers.length > 0) {
        result.unshift(jokers.shift()!);
    }

    return result;
};


// --- Tile Component ---
const RummikubTile: React.FC<{ 
    tile: Tile; 
    selected?: boolean; 
    onClick?: () => void; 
    onDoubleClick?: () => void;
    size?: 'sm' | 'md' | 'lg';
    variant: 'standard' | 'face-change';
    draggable?: boolean;
    onDragStart?: (e: React.DragEvent) => void;
    className?: string;
}> = ({ tile, selected, onClick, onDoubleClick, size = 'md', variant, draggable, onDragStart, className='' }) => {
    
    const sizeClasses = {
        sm: 'w-6 h-8 text-sm',
        md: 'w-10 h-14 text-xl',
        lg: 'w-12 h-16 text-2xl',
    };

    const colorMap: Record<string, string> = variant === 'face-change' 
        ? {
            red: 'text-rose-500',
            blue: 'text-sky-400',
            orange: 'text-amber-500',
            black: 'text-slate-200'
          }
        : {
            red: 'text-red-600',
            blue: 'text-blue-600',
            orange: 'text-orange-500',
            black: 'text-black'
          };

    const isFaceChange = variant === 'face-change';
    
    const bgClass = isFaceChange
        ? 'bg-slate-800 border-slate-600 shadow-lg shadow-black/50 ring-1 ring-white/10' 
        : 'bg-[#fdf6e3] border-gray-300 shadow-[0_2px_0_0_rgba(0,0,0,0.2)]';

    return (
        <div 
            draggable={draggable}
            onDragStart={onDragStart}
            onClick={(e) => { e.stopPropagation(); onClick?.(); }}
            onDoubleClick={(e) => { e.stopPropagation(); onDoubleClick?.(); }}
            className={`
                ${sizeClasses[size]} rounded-md flex flex-col items-center justify-center font-black select-none cursor-grab active:cursor-grabbing transition-all duration-150 relative
                border
                ${bgClass}
                ${selected ? 'ring-4 ring-indigo-400 -translate-y-3 z-20 shadow-[0_0_15px_rgba(99,102,241,0.6)] scale-110' : ''}
                ${tile.isJoker ? 'text-red-500' : colorMap[tile.color]}
                ${className}
            `}
        >
            {tile.isJoker ? (
                <span className="text-2xl">{isFaceChange ? (tile.color === 'red' ? '🤡' : '👹') : '☺'}</span>
            ) : (
                <>
                    <span className="-mb-1">{tile.value}</span>
                    {isFaceChange && <div className="absolute top-0.5 right-0.5 w-1.5 h-1.5 rounded-full bg-current opacity-30"></div>}
                </>
            )}
        </div>
    );
};

export const RummikubRoom: React.FC<RummikubRoomProps> = ({ settings: initialSettings, onLeave }) => {
  const [players, setPlayers] = useState<Player[]>([]);
  const [deck, setDeck] = useState<Tile[]>([]);
  const [tilePoolCount, setTilePoolCount] = useState(0);
  const [currentPlayerIndex, setCurrentPlayerIndex] = useState(0);
  const [phase, setPhase] = useState<GamePhase>(GamePhase.LOBBY);
  const [winner, setWinner] = useState<string | null>(null);
  const [logs, setLogs] = useState<GameLog[]>([]);
  const [myId, setMyId] = useState<string>(initialSettings.isHost ? 'host' : 'guest-temp');

  const initialGridSize = MIN_BOARD_ROWS * BOARD_COLS;
  const [boardGrid, setBoardGrid] = useState<(Tile | null)[]>(Array(initialGridSize).fill(null));
  const [workingGrid, setWorkingGrid] = useState<(Tile | null)[]>(Array(initialGridSize).fill(null));
  const [remoteWorkingGrid, setRemoteWorkingGrid] = useState<(Tile | null)[] | null>(null);

  const [workingHand, setWorkingHand] = useState<Tile[]>([]);
  const [initialTurnHand, setInitialTurnHand] = useState<Tile[]>([]); 
  
  const [chatMessage, setChatMessage] = useState('');
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [activeEmotes, setActiveEmotes] = useState<Record<string, string>>({});
  const [isCopied, setIsCopied] = useState(false);
  const [sortMode, setSortMode] = useState<'number' | 'color'>('number');
  const [selectedHandIndices, setSelectedHandIndices] = useState<number[]>([]);

  const logsEndRef = useRef<HTMLDivElement>(null);
  const peerRef = useRef<any>(null);
  const connectionsRef = useRef<any[]>([]); 
  const hostConnectionRef = useRef<any>(null);

  const stateRef = useRef({
      players,
      currentPlayerIndex,
      myId,
      boardGrid,
      phase
  });

  useEffect(() => {
      stateRef.current = { players, currentPlayerIndex, myId, boardGrid, phase };
  }, [players, currentPlayerIndex, myId, boardGrid, phase]);


  const isFaceChange = initialSettings.rummikubVersion === 'face-change';

  useEffect(() => {
    if (initialSettings.isHost) {
      const fullDeck = generateDeck();
      const initialPlayer: Player = {
        id: 'host', name: initialSettings.playerName, isAi: false,
        dice: [], diceCount: 0, health: 0, maxHealth: 0, isEliminated: false, avatarSeed: 0, isHost: true,
        hand: [], hasInitialMeld: false
      };
      
      const hostHand = fullDeck.splice(0, 14);
      initialPlayer.hand = sortHand(hostHand);
      
      const startingPlayers = [initialPlayer];

      if (initialSettings.mode === 'single') {
         for (let i = 1; i < initialSettings.playerCount; i++) {
             const aiHand = fullDeck.splice(0, 14);
             startingPlayers.push({
                 id: `ai-${i}`, name: `Bot ${i}`, isAi: true,
                 dice: [], diceCount: 0, health: 0, maxHealth: 0, isEliminated: false, avatarSeed: i,
                 hand: sortHand(aiHand),
                 hasInitialMeld: false
             });
         }
         setPhase(GamePhase.PLAYING);
      } else {
          initHostPeer();
      }

      setPlayers(startingPlayers);
      setDeck(fullDeck);
      setTilePoolCount(fullDeck.length);
      setMyId('host');
      
      setWorkingHand(initialPlayer.hand);
      setInitialTurnHand(initialPlayer.hand);
    } else {
      initGuestPeer();
    }
    return () => peerRef.current?.destroy();
  }, []);

  useEffect(() => {
    if (!initialSettings.isHost || phase !== GamePhase.PLAYING) return;
    
    const activePlayer = players[currentPlayerIndex];
    if (activePlayer && activePlayer.isAi) {
        const timer = setTimeout(() => {
            handleBotTurn(activePlayer);
        }, 1500);
        return () => clearTimeout(timer);
    }
  }, [currentPlayerIndex, phase, players, boardGrid, initialSettings.isHost]); 

  const initHostPeer = () => {
    const peer = new Peer(`gemini-liar-${initialSettings.roomId}`);
    peerRef.current = peer;
    peer.on('connection', (conn: any) => {
      conn.on('open', () => {
        connectionsRef.current.push(conn);
        const s = stateRef.current;
        conn.send({ 
            type: 'SYNC', 
            state: { players: s.players, boardSets: gridToSets(s.boardGrid), tilePoolCount: deck.length, phase: s.phase, currentPlayerIndex: s.currentPlayerIndex } 
        });
      });
      conn.on('data', (data: NetworkAction) => handleNetworkAction(data));
    });
  };

  const initGuestPeer = () => {
    const peer = new Peer();
    peerRef.current = peer;
    peer.on('open', (id: string) => {
      setMyId(id);
      const conn = peer.connect(`gemini-liar-${initialSettings.roomId}`);
      hostConnectionRef.current = conn;
      conn.on('open', () => {
        conn.send({ type: 'JOIN', player: { 
            id, name: initialSettings.playerName, isAi: false, 
            dice: [], diceCount: 0, health: 0, maxHealth: 0, isEliminated: false, 
            avatarSeed: Math.floor(Math.random() * 100),
            hand: [], hasInitialMeld: false
        }});
      });
      conn.on('data', (data: NetworkAction) => {
        if (data.type === 'SYNC') {
            if (data.state.players) {
                setPlayers(data.state.players);
                
                const myIdVal = id;
                const me = data.state.players.find((p: Player) => p.id === myIdVal);
                
                if (me) {
                    const incomingIdx = data.state.currentPlayerIndex !== undefined ? data.state.currentPlayerIndex : stateRef.current.currentPlayerIndex;
                    const currentPlayerId = data.state.players[incomingIdx]?.id;
                    
                    if (currentPlayerId !== myIdVal) {
                         setWorkingHand(me.hand);
                         setInitialTurnHand(me.hand);
                         setSelectedHandIndices([]);
                    }
                }
            }
            if (data.state.boardSets) {
                const newGrid = setsToGrid(data.state.boardSets);
                setBoardGrid(newGrid);
                const incomingIdx = data.state.currentPlayerIndex !== undefined ? data.state.currentPlayerIndex : stateRef.current.currentPlayerIndex;
                const currentPlayerId = data.state.players?.[incomingIdx]?.id;

                if (currentPlayerId !== id) {
                    setWorkingGrid(newGrid);
                    setRemoteWorkingGrid(null); 
                }
            }
            if (data.state.tilePoolCount !== undefined) setTilePoolCount(data.state.tilePoolCount);
            if (data.state.logs) setLogs(data.state.logs);
            if (data.state.phase) setPhase(data.state.phase);
            if (data.state.currentPlayerIndex !== undefined) {
                setCurrentPlayerIndex(data.state.currentPlayerIndex);
                setRemoteWorkingGrid(null);
            }
            if (data.state.roundWinner) setWinner(data.state.roundWinner);
        } else if (data.type === 'EMOTE') {
            displayEmote(data.playerId, data.emoji);
        } else if (data.type === 'RUMMIKUB_SYNC_WORKING') {
            setRemoteWorkingGrid(data.workingGrid);
        }
      });
    });
  };

  const handleNetworkAction = (action: NetworkAction) => {
      if (!initialSettings.isHost) return;

      const currentState = stateRef.current;
      const currentPlayers = currentState.players;
      
      switch(action.type) {
          case 'JOIN': {
              if (currentState.phase !== GamePhase.LOBBY) return;
              const newP = action.player;
              const newHand = deck.splice(0, 14);
              newP.hand = sortHand(newHand);
              newP.hasInitialMeld = false;
              const updatedPlayers = [...currentPlayers, newP];
              setPlayers(updatedPlayers);
              setDeck(deck);
              setTilePoolCount(deck.length);
              broadcast({ players: updatedPlayers, tilePoolCount: deck.length });
              break;
          }
          case 'RUMMIKUB_SYNC_WORKING': {
              const activeP = currentPlayers[currentState.currentPlayerIndex];
              if (activeP?.id !== currentState.myId) {
                 setRemoteWorkingGrid(action.workingGrid);
              }
              connectionsRef.current.forEach(c => c.send(action)); 
              break;
          }
          case 'RUMMIKUB_UPDATE_BOARD': {
              const pIdx = currentState.currentPlayerIndex;
              const player = currentPlayers[pIdx];
              const newSets = action.boardSets;
              const newGrid = setsToGrid(newSets);
              setBoardGrid(newGrid);
              setWorkingGrid(newGrid); 
              setRemoteWorkingGrid(null); 
              
              const updatedPlayers = [...currentPlayers];
              updatedPlayers[pIdx] = { ...updatedPlayers[pIdx], hand: action.hand };
              
              if (!updatedPlayers[pIdx].hasInitialMeld) {
                  updatedPlayers[pIdx].hasInitialMeld = true; 
              }
              
              if (action.hand.length === 0) {
                  setWinner(updatedPlayers[pIdx].name);
                  setPhase(GamePhase.GAME_OVER);
                  broadcast({ roundWinner: updatedPlayers[pIdx].name, phase: GamePhase.GAME_OVER });
              }

              const nextIdx = (pIdx + 1) % currentPlayers.length;
              setCurrentPlayerIndex(nextIdx);
              setPlayers(updatedPlayers);
              
              const logMsg = `${player.name} 完成了出牌`;
              const newLogs = [...logs, { id: Date.now().toString(), message: logMsg, type: 'info' as const }];
              setLogs(newLogs);

              broadcast({
                  players: updatedPlayers,
                  boardSets: newSets,
                  currentPlayerIndex: nextIdx,
                  logs: newLogs
              });
              break;
          }
          case 'RUMMIKUB_DRAW': {
              const pIdx = currentState.currentPlayerIndex;
              const player = currentPlayers[pIdx];
              const updatedDeck = [...deck];
              const updatedPlayers = [...currentPlayers];
              let logMsg = '';

              setRemoteWorkingGrid(null); 

              if (updatedDeck.length > 0) {
                  const drawTile = updatedDeck.shift()!;
                  const newHand = sortHand([...updatedPlayers[pIdx].hand, drawTile]);
                  updatedPlayers[pIdx] = { ...updatedPlayers[pIdx], hand: newHand };
                  logMsg = `${player.name} 摸了一張牌`;

                  if (player.id === currentState.myId) {
                      setWorkingHand(newHand);
                      setInitialTurnHand(newHand);
                      setSelectedHandIndices([]);
                  }

              } else {
                  logMsg = `牌堆沒牌了！${player.name} 跳過回合`;
              }

              const nextIdx = (pIdx + 1) % currentPlayers.length;
              setCurrentPlayerIndex(nextIdx);
              setPlayers(updatedPlayers);
              setDeck(updatedDeck);
              setTilePoolCount(updatedDeck.length);

              const newLogs = [...logs, { id: Date.now().toString(), message: logMsg, type: 'info' as const }];
              setLogs(newLogs);

              broadcast({
                  players: updatedPlayers,
                  tilePoolCount: updatedDeck.length,
                  currentPlayerIndex: nextIdx,
                  logs: newLogs
              });
              break;
          }
          case 'CHAT': {
            const sender = currentPlayers.find(p => p.id === action.playerId);
            const newLog: GameLog = { id: Date.now().toString(), message: `${sender?.name}: ${action.message}`, type: 'chat' };
            const newLogs = [...logs, newLog];
            setLogs(newLogs);
            broadcast({ logs: newLogs });
            break;
          }
          case 'EMOTE':
            displayEmote(action.playerId, action.emoji);
            connectionsRef.current.forEach(c => { if(c.peer !== action.playerId) c.send(action); });
            break;
      }
  };

  const broadcast = (state: Partial<GameState>) => {
      const payload = { type: 'SYNC', state };
      connectionsRef.current.forEach(c => c.send(payload));
  };

  const startGame = () => {
      if (!initialSettings.isHost) return;
      setPhase(GamePhase.PLAYING);
      setCurrentPlayerIndex(0);
      broadcast({ phase: GamePhase.PLAYING, currentPlayerIndex: 0 });
      setWorkingHand(players[0].hand);
      setInitialTurnHand(players[0].hand);
      setBoardGrid(setsToGrid([]));
      setWorkingGrid(setsToGrid([]));
  };

  const handleBotTurn = (bot: Player) => {
      if (!initialSettings.isHost) return;
      const currentSets = gridToSets(boardGrid);
      const move = getBotMove(bot.hand, currentSets, bot.hasInitialMeld);

      if (move.action === 'DRAW') {
          handleNetworkAction({ type: 'RUMMIKUB_DRAW' });
      } else {
          let newSets = [...currentSets];
          let newHand = [...bot.hand];

          if (move.action === 'PLAY_SET' && move.tiles) {
             newSets.push(move.tiles);
             const usedIds = new Set(move.tiles.map(t => t.id));
             newHand = newHand.filter(t => !usedIds.has(t.id));
          } else if (move.action === 'ADD_TO_SET' && move.tiles && move.targetSetIndex !== undefined) {
             const target = newSets[move.targetSetIndex];
             const combined = [...target, ...move.tiles];
             const sortedCombined = combined.every(t => combined[0].color === t.color || t.isJoker) 
                 ? combined.sort((a,b) => a.value - b.value) 
                 : combined;
             
             newSets[move.targetSetIndex] = sortedCombined;
             const usedIds = new Set(move.tiles.map(t => t.id));
             newHand = newHand.filter(t => !usedIds.has(t.id));
          }

          handleNetworkAction({ 
              type: 'RUMMIKUB_UPDATE_BOARD', 
              boardSets: newSets, 
              hand: newHand 
          });
      }
  };


  const setsToGrid = (sets: Tile[][]): (Tile | null)[] => {
      let grid: (Tile | null)[] = [];
      let currentRowCount = 0;
      let currentCol = 0;

      sets.forEach(set => {
          if (currentCol + set.length > BOARD_COLS) {
              const remaining = BOARD_COLS - currentCol;
              for(let i=0; i<remaining; i++) grid.push(null);
              
              currentRowCount++;
              currentCol = 0;
          }

          set.forEach(tile => {
              grid.push(tile);
              currentCol++;
          });

          if (currentCol < BOARD_COLS) {
              grid.push(null);
              currentCol++;
          }
      });

      const remainingInLastRow = BOARD_COLS - currentCol;
      for(let i=0; i<remainingInLastRow; i++) grid.push(null);
      currentRowCount++;

      while (currentRowCount < MIN_BOARD_ROWS + 2) {
          for(let i=0; i<BOARD_COLS; i++) grid.push(null);
          currentRowCount++;
      }
      
      return grid;
  };

  // Fixed: Row-Aware Set Extraction logic
  const gridToSets = (grid: (Tile | null)[]): Tile[][] => {
      const sets: Tile[][] = [];
      let currentSet: Tile[] = [];
      
      for (let i = 0; i < grid.length; i++) {
          // KEY FIX: Force break at new row start
          if (i > 0 && i % BOARD_COLS === 0) {
              if (currentSet.length > 0) {
                  sets.push(currentSet);
                  currentSet = [];
              }
          }

          const cell = grid[i];
          if (cell) {
              currentSet.push(cell);
          } else {
              if (currentSet.length > 0) {
                  sets.push(currentSet);
                  currentSet = [];
              }
          }
      }
      if (currentSet.length > 0) sets.push(currentSet);
      return sets;
  };

  const toggleSelectHandTile = (index: number) => {
      setSelectedHandIndices(prev => {
          if (prev.includes(index)) return prev.filter(i => i !== index);
          return [...prev, index].sort((a,b) => a-b);
      });
  };

  const handleDoubleSelectHandTile = (index: number) => {
    const target = workingHand[index];
    if (!target) return;

    const indicesToSelect = new Set<number>([index, ...selectedHandIndices]);
    workingHand.forEach((t, i) => {
        if (i === index) return;
        const isGroupMatch = t.value === target.value && t.value !== 0;
        const isRunMatch = t.color === target.color && Math.abs(t.value - target.value) === 1;
        const isJoker = t.isJoker || target.isJoker;

        if (isGroupMatch || isRunMatch || isJoker) {
             indicesToSelect.add(i);
        }
    });

    setSelectedHandIndices(Array.from(indicesToSelect).sort((a,b) => a-b));
  };


  const handleDragStart = (e: React.DragEvent, source: 'HAND' | 'BOARD', index: number) => {
      if (source === 'BOARD') {
          if (!myPlayer?.hasInitialMeld) {
              const tileId = workingGrid[index]?.id;
              const isLocked = boardGrid.some(t => t?.id === tileId);
              if (isLocked) {
                  e.preventDefault();
                  alert("⚠️ 尚未破冰！本回合只能操作您剛剛打出的牌，不能移動桌上原有的牌組。");
                  return;
              }
          }
          
          e.dataTransfer.setData('source', JSON.stringify({ source, index }));
      } else {
          let indicesToDrag = [index];
          if (selectedHandIndices.includes(index)) {
              indicesToDrag = selectedHandIndices;
          }
          
          e.dataTransfer.setData('source', JSON.stringify({ source, indices: indicesToDrag }));
      }
      
      e.dataTransfer.effectAllowed = 'move';
  };

  const insertTilesIntoGrid = (
      grid: (Tile | null)[], 
      startIndex: number, 
      tiles: Tile[]
  ): (Tile | null)[] => {
      const newGrid = [...grid];
      
      const pushRight = (idx: number, itemToPush: Tile | null) => {
          if (!itemToPush) return;
          
          if (idx >= newGrid.length) {
              newGrid.push(itemToPush);
              return;
          }

          if (newGrid[idx] === null) {
              newGrid[idx] = itemToPush;
              return;
          } else {
              const currentItem = newGrid[idx];
              newGrid[idx] = itemToPush;
              pushRight(idx + 1, currentItem);
          }
      };

      tiles.forEach((tile, i) => {
          const targetPos = startIndex + i;
          pushRight(targetPos, tile);
      });
      
      return newGrid;
  };

  const handleDropOnBoard = (e: React.DragEvent, targetIndex: number) => {
      e.preventDefault();
      if (phase !== GamePhase.PLAYING) return;
      if (players[currentPlayerIndex].id !== myId) return;

      const data = e.dataTransfer.getData('source');
      if (!data) return;
      const parsed = JSON.parse(data);
      const { source } = parsed;

      let tempGrid = [...workingGrid];
      let newHand = [...workingHand];
      let tilesToInsert: Tile[] = [];

      if (source === 'BOARD') {
          const index = parsed.index;
          const tile = tempGrid[index];
          if (!tile) return;
          tempGrid[index] = null;
          tilesToInsert = [tile];
      } else if (source === 'HAND') {
          const indices: number[] = parsed.indices;
          tilesToInsert = indices.map(i => workingHand[i]);
          
          const movedIds = new Set(tilesToInsert.map(t => t.id));
          newHand = newHand.filter(t => !movedIds.has(t.id));
          setSelectedHandIndices([]);
          setWorkingHand(newHand);
      }

      tempGrid = insertTilesIntoGrid(tempGrid, targetIndex, tilesToInsert);

      while (tempGrid.length % BOARD_COLS !== 0) {
          tempGrid.push(null);
      }
      
      const lastCells = tempGrid.slice(-BOARD_COLS * 2);
      const hasContentAtBottom = lastCells.some(t => t !== null);
      if (hasContentAtBottom || tempGrid.length < (MIN_BOARD_ROWS + 2) * BOARD_COLS) {
           for(let i=0; i < BOARD_COLS * 2; i++) tempGrid.push(null);
      }

      setWorkingGrid(tempGrid);
      broadcastWorkingState(tempGrid);
  };

  const handleDropOnHand = (e: React.DragEvent) => {
      e.preventDefault();
      const data = e.dataTransfer.getData('source');
      if (!data) return;
      const { source, index } = JSON.parse(data);

      if (source === 'BOARD') {
          const tile = workingGrid[index];
          if (!tile) return;
          
          const newGrid = [...workingGrid];
          newGrid[index] = null;
          setWorkingGrid(newGrid);
          setWorkingHand([...workingHand, tile]);
          broadcastWorkingState(newGrid);
      }
  };

  const broadcastWorkingState = (grid: (Tile | null)[]) => {
      const action: NetworkAction = { type: 'RUMMIKUB_SYNC_WORKING', workingGrid: grid };
      if (initialSettings.isHost) {
          handleNetworkAction(action);
      } else {
          hostConnectionRef.current?.send(action);
      }
  };

  const handleReset = () => {
      setWorkingGrid([...boardGrid]); 
      setWorkingHand([...initialTurnHand]); 
      setSelectedHandIndices([]);
      broadcastWorkingState([...boardGrid]);
  };

  const handleConfirm = () => {
      if (workingHand.length >= initialTurnHand.length) {
          alert("您必須至少打出一張手牌才能結束回合 (或是選擇摸牌)！");
          return;
      }

      let sets = gridToSets(workingGrid);
      
      sets = sets.map(organizeSet);

      const allValid = sets.every(isValidSet);
      if (!allValid) {
          alert("棋盤上有不合法的牌組 (群組或順子)！請檢查是否有單獨的牌，或牌組是否跨越了行。");
          return;
      }

      const initialIds = new Set(initialTurnHand.map(t => t.id));
      const currentHandIds = workingHand.map(t => t.id);
      const stolenTiles = currentHandIds.filter(id => !initialIds.has(id));
      
      if (stolenTiles.length > 0) {
          alert("您不能將原本在桌上的牌收回手牌！(只能收回本回合打出的牌)");
          return;
      }

      const myPlayer = players.find(p => p.id === myId);
      if (myPlayer && !myPlayer.hasInitialMeld) {
          const currentHandIdsSet = new Set(workingHand.map(t => t.id));
          const playedTiles = initialTurnHand.filter(t => !currentHandIdsSet.has(t.id));
          const playedScore = playedTiles.reduce((sum, t) => sum + (t.isJoker ? 30 : t.value), 0);
          
          if (playedScore < 30) {
              alert(`尚未破冰！首輪出牌總分需滿 30 分 (您打出了約 ${playedScore} 分)`);
              return;
          }
      }

      const action: NetworkAction = {
          type: 'RUMMIKUB_UPDATE_BOARD',
          boardSets: sets,
          hand: workingHand
      };

      if (initialSettings.isHost) {
          handleNetworkAction(action);
      } else {
          hostConnectionRef.current?.send(action);
      }
      
      setInitialTurnHand(workingHand);
      setSelectedHandIndices([]);
  };

  const handleDraw = () => {
      if (workingHand.length !== initialTurnHand.length) {
          alert("您已經動過牌了，請復原後再摸牌，或確認出牌。");
          return;
      }
      
      handleReset();
      
      const action: NetworkAction = { type: 'RUMMIKUB_DRAW' };
      if (initialSettings.isHost) {
          handleNetworkAction(action);
      } else {
          hostConnectionRef.current?.send(action);
      }
  };

  const handleSort = () => {
     const newMode = sortMode === 'number' ? 'color' : 'number';
     setSortMode(newMode);
     
     let sorted = [];
     if (newMode === 'number') {
         sorted = [...workingHand].sort((a,b) => {
             if (a.isJoker) return 1; if (b.isJoker) return -1;
             if (a.value !== b.value) return a.value - b.value;
             return a.color.localeCompare(b.color);
         });
     } else {
         sorted = sortHand(workingHand);
     }
     setWorkingHand(sorted);
  };

  const myPlayer = players.find(p => p.id === myId);
  const isMyTurn = myPlayer && players[currentPlayerIndex]?.id === myId && phase === GamePhase.PLAYING;
  
  const displayGrid = isMyTurn 
      ? workingGrid 
      : (remoteWorkingGrid && phase === GamePhase.PLAYING) 
          ? remoteWorkingGrid 
          : boardGrid;

  const renderGridCells = () => {
      return displayGrid.map((tile, index) => {
          const rowIndex = Math.floor(index / BOARD_COLS);
          const isEvenRow = rowIndex % 2 === 0;
          
          return (
            <div 
                key={index}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => handleDropOnBoard(e, index)}
                className={`
                    border border-white/5 flex items-center justify-center relative min-w-[36px] min-h-[56px]
                    ${tile ? '' : (isEvenRow ? 'bg-white/[0.02] hover:bg-white/10' : 'bg-transparent hover:bg-white/10')}
                    transition-colors duration-200
                    ${index % BOARD_COLS === 0 ? 'border-l-white/10' : ''}
                    ${(index + 1) % BOARD_COLS === 0 ? 'border-r-white/10' : ''}
                `}
            >
                {index % BOARD_COLS === 0 && (
                    <div className="absolute -left-4 text-[8px] text-slate-600 font-mono select-none">{rowIndex + 1}</div>
                )}
                
                {tile && (
                    <RummikubTile 
                        tile={tile} 
                        size="md" 
                        variant={initialSettings.rummikubVersion} 
                        draggable={isMyTurn}
                        onDragStart={(e) => handleDragStart(e, 'BOARD', index)}
                        className={(!isMyTurn && remoteWorkingGrid) ? "opacity-90 ring-1 ring-white/20" : ""}
                    />
                )}
            </div>
          );
      });
  };

  const handleSendChat = () => {
      if(!chatMessage.trim()) return;
      if(initialSettings.isHost) {
          const newLog: GameLog = { id: Date.now().toString(), message: `Host: ${chatMessage}`, type: 'chat' };
          const newLogs = [...logs, newLog];
          setLogs(newLogs);
          broadcast({ logs: newLogs });
      } else {
          hostConnectionRef.current?.send({ type: 'CHAT', playerId: myId, message: chatMessage });
      }
      setChatMessage('');
  };

  const sendEmote = (emoji: string) => {
      displayEmote(myId, emoji);
      setShowEmojiPicker(false);
      if(initialSettings.isHost) {
         connectionsRef.current.forEach(c => c.send({ type: 'EMOTE', playerId: myId, emoji }));
      } else {
          hostConnectionRef.current?.send({ type: 'EMOTE', playerId: myId, emoji });
      }
  };

  const displayEmote = (pid: string, emoji: string) => {
      setActiveEmotes(p => ({...p, [pid]: emoji}));
      setTimeout(() => setActiveEmotes(p => { const n={...p}; delete n[pid]; return n; }), 3000);
  };

  const handleCopy = () => {
    const url = getShareUrl(initialSettings.roomId || '', 'rummikub');
    navigator.clipboard.writeText(url);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
  };

  useEffect(() => { logsEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [logs]);

  return (
    <div className={`min-h-screen flex flex-col font-sans text-white overflow-hidden ${isFaceChange ? 'bg-neutral-900 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-neutral-800 to-black' : 'bg-slate-900'}`}>
        {/* Header */}
        <div className={`h-14 border-b flex items-center justify-between px-4 z-10 ${isFaceChange ? 'bg-black/50 border-amber-900/30' : 'bg-slate-950 border-slate-800'}`}>
            <span className={`font-bold tracking-wider ${isFaceChange ? 'text-amber-500' : 'text-rose-400'}`}>
                {isFaceChange ? '🤡 Rummikub Face-Change 🤡' : '拉密數字牌'} {initialSettings.roomId && `(Room: ${initialSettings.roomId})`}
            </span>
            <div className="flex gap-2">
                 {initialSettings.isHost && initialSettings.mode === 'multiplayer' && phase === GamePhase.LOBBY && (
                     <Button variant="secondary" onClick={handleCopy} className="text-xs h-8">
                        {isCopied ? '已複製' : '邀請連結'}
                     </Button>
                 )}
                <Button variant="ghost" onClick={onLeave} className="text-xs">離開</Button>
            </div>
        </div>

        {/* --- MAIN GAME AREA --- */}
        <div className="flex-1 relative flex flex-col overflow-hidden">
            
            {/* LOBBY VIEW */}
            {phase === GamePhase.LOBBY && (
                 <div className="absolute inset-0 flex items-center justify-center bg-black/50 z-20 backdrop-blur-sm">
                     <div className="bg-slate-800 p-8 rounded-2xl max-w-md w-full text-center border border-slate-700 shadow-2xl">
                         <h2 className="text-2xl font-bold mb-4 text-white">等待玩家... ({players.length}/{initialSettings.playerCount})</h2>
                         <div className="flex justify-center gap-4 mb-8">
                             {players.map(p => (
                                 <div key={p.id} className="flex flex-col items-center">
                                     <div className={`w-12 h-12 rounded-full ${AVATAR_COLORS[p.avatarSeed! % AVATAR_COLORS.length]} flex items-center justify-center font-bold`}>
                                         {p.name.charAt(0)}
                                     </div>
                                     <span className="text-xs mt-2 text-slate-400">{p.name}</span>
                                 </div>
                             ))}
                              {Array.from({length: Math.max(0, initialSettings.playerCount - players.length)}).map((_, i) => (
                                <div key={i} className="w-12 h-12 rounded-full bg-slate-700 animate-pulse border-2 border-slate-600 border-dashed"></div>
                             ))}
                         </div>
                         {initialSettings.isHost ? (
                             <Button onClick={startGame} className="w-full text-lg py-3">開始遊戲</Button>
                         ) : (
                             <div className="text-slate-500 animate-pulse">等待室長開始...</div>
                         )}
                     </div>
                 </div>
            )}

            {/* OPPONENTS BAR */}
            <div className="flex justify-center gap-4 p-2 bg-black/20 z-10">
                {players.filter(p => p.id !== myId).map(p => (
                    <div key={p.id} className={`flex flex-col items-center p-2 rounded-lg transition-all ${players[currentPlayerIndex]?.id === p.id ? 'bg-indigo-900/50 ring-1 ring-indigo-500' : ''}`}>
                        <div className={`relative w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs ${AVATAR_COLORS[p.avatarSeed! % AVATAR_COLORS.length]}`}>
                            {p.name.charAt(0)}
                            {activeEmotes[p.id] && <div className="absolute -top-8 text-3xl animate-bounce">{activeEmotes[p.id]}</div>}
                        </div>
                        <span className="text-[10px] mt-1">{p.name}</span>
                        <span className="text-[10px] bg-slate-700 px-1 rounded text-slate-300 mt-0.5">🀄 {p.hand?.length || 0}</span>
                        {!p.hasInitialMeld && phase === GamePhase.PLAYING && <span className="text-[8px] text-amber-500">❄️未破冰</span>}
                        {players[currentPlayerIndex]?.id === p.id && phase === GamePhase.PLAYING && <span className="text-[9px] text-green-400 animate-pulse">思考中...</span>}
                    </div>
                ))}
            </div>

            {/* BOARD GRID */}
            <div className="flex-1 overflow-auto p-4 flex justify-center items-start bg-slate-900/50">
                <div 
                    className="grid gap-y-1 p-4 bg-slate-800/50 rounded-xl border border-white/5 shadow-inner transition-all min-w-max"
                    style={{ 
                        gridTemplateColumns: `repeat(${BOARD_COLS}, minmax(40px, 1fr))`,
                    }}
                >
                    {renderGridCells()}
                </div>
            </div>

            {/* MY CONTROL AREA */}
            <div 
                className={`relative p-4 border-t transition-colors z-20 ${isMyTurn ? (isFaceChange ? 'bg-amber-900/10 border-amber-500/30' : 'bg-indigo-900/10 border-indigo-500/30') : 'bg-slate-950 border-slate-800'}`}
                onDragOver={(e) => e.preventDefault()}
                onDrop={handleDropOnHand}
            >
                {/* Status Bar */}
                <div className="absolute top-0 left-0 w-full -translate-y-full px-4 py-2 flex justify-between items-end pointer-events-none">
                     {/* Chat Logs */}
                     <div className="w-64 h-32 overflow-y-auto flex flex-col justify-end text-sm space-y-1 mask-linear-gradient pointer-events-auto" ref={logsEndRef}>
                         {logs.slice(-5).map(log => (
                             <div key={log.id} className="px-2 py-1 rounded bg-black/60 backdrop-blur-md text-white/90 shadow text-xs">
                                 {log.message}
                             </div>
                         ))}
                     </div>
                     {/* Pool Count */}
                     <div className="bg-black/60 backdrop-blur px-3 py-1 rounded-t-lg text-sm text-slate-300 border-t border-x border-slate-700">
                         剩餘牌數: {tilePoolCount}
                     </div>
                </div>

                {/* My Hand & Controls */}
                {myPlayer && (
                    <div className="flex flex-col gap-4 max-w-6xl mx-auto">
                        
                         {/* Hand Tiles */}
                        <div 
                            className="flex flex-wrap justify-center gap-2 p-2 min-h-[90px] bg-black/20 rounded-xl border border-white/5 shadow-inner select-none"
                            onClick={() => setSelectedHandIndices([])} // Click background to deselect
                        >
                            {workingHand.length === 0 && <span className="text-slate-500 text-sm self-center">手牌已空</span>}
                            {workingHand.map((tile, i) => (
                                <RummikubTile 
                                    key={tile.id} 
                                    tile={tile} 
                                    variant={initialSettings.rummikubVersion}
                                    draggable={isMyTurn}
                                    selected={selectedHandIndices.includes(i)}
                                    onClick={() => toggleSelectHandTile(i)}
                                    onDoubleClick={() => handleDoubleSelectHandTile(i)}
                                    onDragStart={(e) => handleDragStart(e, 'HAND', i)}
                                />
                            ))}
                        </div>
                        {selectedHandIndices.length > 0 && isMyTurn && (
                            <div className="text-center text-xs text-indigo-300 -mt-2 animate-pulse">
                                已選取 {selectedHandIndices.length} 張 (拖曳其中一張即可整組移動)
                            </div>
                        )}

                         {/* Action Buttons */}
                        <div className="flex items-center justify-between gap-4">
                             <div className="flex gap-2">
                                <Button 
                                    onClick={handleSort} 
                                    variant="secondary" 
                                    className="text-xs h-10 px-3 z-30" 
                                    disabled={phase !== GamePhase.PLAYING}
                                >
                                    排序: {sortMode === 'number' ? '123' : 'RGB'}
                                </Button>
                                {!myPlayer.hasInitialMeld && phase === GamePhase.PLAYING && (
                                    <div className="flex items-center text-xs text-amber-400 bg-amber-900/30 px-3 rounded border border-amber-900/50">
                                        ⚠️ 需破冰 (30分)
                                    </div>
                                )}
                             </div>

                             {isMyTurn && (
                                <div className="flex gap-2 animate-fade-in-up">
                                    <Button onClick={handleReset} variant="ghost" className="text-slate-400 hover:text-white">
                                        復原
                                    </Button>
                                    <Button onClick={handleDraw} variant="secondary">
                                        摸牌
                                    </Button>
                                    <Button onClick={handleConfirm} variant="primary" className="px-6 bg-green-600 hover:bg-green-500 shadow-green-900/50">
                                        確認 (Confirm)
                                    </Button>
                                </div>
                             )}
                             
                             {!isMyTurn && phase === GamePhase.PLAYING && (
                                <div className="text-slate-500 text-sm animate-pulse ml-auto">
                                    等待 {players[currentPlayerIndex]?.name} 行動...
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>

            {/* Chat Input & Emote */}
            <div className="absolute bottom-20 left-4 z-40 flex gap-2 w-64 pointer-events-none">
                <div className="pointer-events-auto flex gap-2 w-full">
                    <input 
                        type="text" value={chatMessage} onChange={(e) => setChatMessage(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleSendChat()}
                        placeholder="輸入訊息..."
                        className="flex-1 bg-slate-900/80 backdrop-blur border border-white/20 rounded px-3 py-1.5 text-xs text-white focus:outline-none"
                    />
                    <button 
                        onClick={() => setShowEmojiPicker(!showEmojiPicker)} 
                        className="bg-slate-700 w-8 h-8 rounded flex items-center justify-center hover:bg-slate-600"
                    >
                        😀
                    </button>
                </div>
                {showEmojiPicker && (
                    <div className="absolute bottom-10 left-0 bg-slate-800 p-2 rounded-lg grid grid-cols-4 gap-2 shadow-xl border border-slate-600 w-max pointer-events-auto">
                        {EMOJI_LIST.map(e => <button key={e} onClick={() => sendEmote(e)} className="text-xl hover:scale-125">{e}</button>)}
                    </div>
                )}
            </div>

            {/* Game Over Overlay */}
            {phase === GamePhase.GAME_OVER && (
                 <div className="absolute inset-0 z-50 bg-black/90 flex items-center justify-center p-4 backdrop-blur-md animate-fade-in-up">
                      <div className="text-center">
                          <h2 className="text-5xl font-black text-amber-400 mb-4">WINNER</h2>
                          <div className="text-8xl mb-4">👑</div>
                          <p className="text-4xl font-bold text-white mb-8">{winner}</p>
                          <Button onClick={onLeave} className="text-xl px-8 py-3">返回大廳</Button>
                      </div>
                 </div>
            )}
        </div>
    </div>
  );
};
