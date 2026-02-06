
import React, { useState, useEffect } from 'react';
import { GameMode, GameSettings, GameType, RummikubVersion } from '../types';
import { MAX_PLAYERS, MIN_PLAYERS, DEFAULT_STARTING_DICE, DEFAULT_MAX_HEALTH } from '../constants';
import { Button } from '../components/Button';
import { generateRoomId, getShareUrl, getSettingsFromUrl } from '../utils/gameUtils';

interface LobbyProps {
  initialGameType?: GameType;
  onStartGame: (settings: GameSettings) => void;
  onBack: () => void;
}

export const Lobby: React.FC<LobbyProps> = ({ initialGameType = 'liar', onStartGame, onBack }) => {
  const [playerName, setPlayerName] = useState('');
  const [mode, setMode] = useState<'single' | 'multiplayer'>('single');
  
  // State for Game Type handling
  const [gameType, setGameType] = useState<GameType>(initialGameType);

  // Common Settings
  const [playerCount, setPlayerCount] = useState(3);
  const [difficulty, setDifficulty] = useState<'easy' | 'hard'>('easy');
  const [roomId, setRoomId] = useState('');
  
  // Liar Settings
  const [diceCount, setDiceCount] = useState(DEFAULT_STARTING_DICE);
  const [gameMode, setGameMode] = useState<GameMode>('classic');
  const [maxHealth, setMaxHealth] = useState(DEFAULT_MAX_HEALTH);

  // Rummikub Settings
  const [rummikubVersion, setRummikubVersion] = useState<RummikubVersion>('standard');
  
  // UI State
  const [isCopied, setIsCopied] = useState(false);
  const [isGuest, setIsGuest] = useState(false);

  // Constants based on game
  const MAX_PLAYERS_GAME = gameType === 'rummikub' ? 4 : MAX_PLAYERS;

  useEffect(() => {
    const urlSettings = getSettingsFromUrl();
    if (urlSettings) {
      // Auto-switch to Multiplayer Guest mode
      setMode('multiplayer');
      setRoomId(urlSettings.roomId);
      setGameType(urlSettings.gameType); // Sync game type from URL
      setIsGuest(true);
    } else {
      // Host Mode default
      setRoomId(generateRoomId());
      setIsGuest(false);
      setGameType(initialGameType);
    }
  }, [initialGameType]);

  const handleCopy = () => {
    const url = getShareUrl(roomId, gameType);
    navigator.clipboard.writeText(url);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
  };

  const handleStart = () => {
    if (!playerName.trim()) {
      alert("請輸入您的暱稱");
      return;
    }
    
    onStartGame({
      gameType,
      playerCount,
      startingDice: diceCount,
      playerName: playerName || '玩家 1',
      difficulty,
      mode,
      roomId: mode === 'multiplayer' ? roomId : undefined,
      isHost: mode === 'single' ? true : !isGuest,
      gameMode,
      maxHealth,
      rummikubVersion
    });
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-slate-900 p-4 font-sans">
      <div className="w-full max-w-md bg-slate-800 rounded-2xl shadow-2xl p-8 border border-slate-700 relative overflow-hidden animate-fade-in-up">
        
        <div className="flex items-center justify-between mb-6">
            <Button variant="ghost" onClick={onBack} className="text-xs -ml-2 text-slate-500 hover:text-white">
                ← 回大廳
            </Button>
            <div className="text-xs font-bold uppercase tracking-wider text-slate-500 bg-slate-900 px-2 py-1 rounded">
                {gameType === 'liar' ? 'Liar\'s Dice' : 'Rummikub'}
            </div>
        </div>

        <h1 className={`text-4xl font-bold text-center mb-2 ${gameType === 'liar' ? 'text-indigo-400' : 'text-rose-400'}`}>
            {gameType === 'liar' ? 'Gemini 吹牛大王' : '拉密數字牌'}
        </h1>
        <p className="text-slate-400 text-center mb-6">
          {mode === 'single' ? '單人 / AI 挑戰' : isGuest ? '加入多人連線房間' : '建立多人連線房間'}
        </p>

        {/* Mode Toggle */}
        {!isGuest && (
          <div className="flex bg-slate-900 p-1 rounded-xl mb-6 border border-slate-700">
            <button
              onClick={() => setMode('single')}
              className={`flex-1 py-2 text-sm font-bold rounded-lg transition-all ${mode === 'single' ? 'bg-white/10 text-white shadow-lg' : 'text-slate-400 hover:text-white'}`}
            >
              單人練習 (vs AI)
            </button>
            <button
              onClick={() => setMode('multiplayer')}
              className={`flex-1 py-2 text-sm font-bold rounded-lg transition-all ${mode === 'multiplayer' ? 'bg-white/10 text-white shadow-lg' : 'text-slate-400 hover:text-white'}`}
            >
              多人連線
            </button>
          </div>
        )}

        <div className="space-y-6">
          {/* Room Info (Multiplayer Only) */}
          {mode === 'multiplayer' && (
            <div className="bg-slate-900/50 p-4 rounded-xl border border-slate-700">
              <div className="flex items-center justify-between mb-2">
                <div>
                   <p className="text-xs text-slate-500 uppercase tracking-wider font-bold">房間代碼 (Room ID)</p>
                   {isGuest ? (
                     <p className="text-xl font-mono text-white tracking-widest">{roomId}</p>
                   ) : (
                     <div className="flex items-center gap-2">
                       <p className="text-xl font-mono text-white tracking-widest">{roomId}</p>
                       <Button variant="ghost" onClick={handleCopy} className="text-xs h-8 px-2">
                         {isCopied ? '已複製！' : '複製連結'}
                       </Button>
                     </div>
                   )}
                </div>
              </div>
               {!isGuest && <p className="text-xs text-slate-400">將連結傳給朋友，他們即可加入。</p>}
               {isGuest && <p className="text-xs text-slate-400">您將加入此房間。</p>}
            </div>
          )}

          {/* Nickname */}
          <div className="space-y-2">
             <label className="block text-sm font-medium text-slate-300">您的暱稱</label>
             <input 
                type="text" 
                value={playerName} 
                onChange={(e) => setPlayerName(e.target.value)}
                placeholder="輸入名字"
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-3 text-white focus:ring-2 focus:ring-indigo-500 focus:outline-none"
             />
          </div>

          <div className="border-t border-slate-700 my-4 pt-4 relative">
              <p className="text-xs font-bold text-slate-500 mb-4 uppercase tracking-wider flex justify-between">
                  <span>遊戲設定</span>
                  {isGuest && <span className="text-indigo-400 animate-pulse">由室長決定</span>}
              </p>
              
              {/* Guest Overlay blocker */}
              {isGuest && <div className="absolute inset-0 top-10 bg-slate-900/40 z-10 cursor-not-allowed backdrop-blur-[1px] rounded-lg border border-white/5"></div>}

              {/* === GAME SPECIFIC SETTINGS === */}
              
              {/* 1. LIAR'S DICE SETTINGS */}
              {gameType === 'liar' && (
                  <>
                    <div className={`space-y-2 mb-4 transition-opacity ${isGuest ? 'opacity-50' : ''}`}>
                        <label className="block text-sm font-medium text-slate-300">對戰規則</label>
                        <div className="flex gap-2 bg-slate-900 p-1 rounded-lg">
                            <button
                            onClick={() => !isGuest && setGameMode('classic')}
                            disabled={isGuest}
                            className={`flex-1 py-1.5 text-xs font-bold rounded transition-colors ${gameMode === 'classic' ? 'bg-slate-700 text-white shadow' : 'text-slate-500 hover:text-slate-300'}`}
                            >
                            經典 (扣骰子)
                            </button>
                            <button
                            onClick={() => !isGuest && setGameMode('hearts')}
                            disabled={isGuest}
                            className={`flex-1 py-1.5 text-xs font-bold rounded transition-colors ${gameMode === 'hearts' ? 'bg-rose-900/50 text-rose-300 shadow ring-1 ring-rose-800' : 'text-slate-500 hover:text-slate-300'}`}
                            >
                            生命值 (扣愛心)
                            </button>
                        </div>
                    </div>

                    {gameMode === 'classic' ? (
                        <div className={`space-y-2 mb-4 transition-opacity ${isGuest ? 'opacity-50' : ''}`}>
                            <div className="flex justify-between text-sm text-slate-300">
                                <span>每人起始骰子數</span>
                                <span className="font-bold text-indigo-400">{isGuest ? '?' : diceCount} 顆</span>
                            </div>
                            <input 
                                type="range" 
                                min={1} 
                                max={6} 
                                value={diceCount} 
                                onChange={(e) => setDiceCount(Number(e.target.value))}
                                disabled={isGuest}
                                className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-indigo-500 disabled:cursor-not-allowed"
                            />
                        </div>
                    ) : (
                        <div className={`space-y-2 mb-4 transition-opacity ${isGuest ? 'opacity-50' : ''}`}>
                            <div className="flex justify-between text-sm text-slate-300">
                                <span>每人生命值 (愛心)</span>
                                <span className="font-bold text-rose-400">{isGuest ? '?' : maxHealth} ❤️</span>
                            </div>
                            <input 
                                type="range" 
                                min={1} 
                                max={10} 
                                value={maxHealth} 
                                onChange={(e) => setMaxHealth(Number(e.target.value))}
                                disabled={isGuest}
                                className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-rose-500 disabled:cursor-not-allowed"
                            />
                        </div>
                    )}
                  </>
              )}

              {/* 2. RUMMIKUB SETTINGS */}
              {gameType === 'rummikub' && (
                  <div className={`space-y-2 mb-4 transition-opacity ${isGuest ? 'opacity-50' : ''}`}>
                        <label className="block text-sm font-medium text-slate-300">遊戲版本</label>
                        <div className="flex gap-2 bg-slate-900 p-1 rounded-lg">
                            <button
                            onClick={() => !isGuest && setRummikubVersion('standard')}
                            disabled={isGuest}
                            className={`flex-1 py-1.5 text-xs font-bold rounded transition-colors ${rummikubVersion === 'standard' ? 'bg-slate-700 text-white shadow' : 'text-slate-500 hover:text-slate-300'}`}
                            >
                            普通版
                            </button>
                            <button
                            onClick={() => !isGuest && setRummikubVersion('face-change')}
                            disabled={isGuest}
                            className={`flex-1 py-1.5 text-xs font-bold rounded transition-colors ${rummikubVersion === 'face-change' ? 'bg-amber-900/50 text-amber-300 shadow ring-1 ring-amber-700' : 'text-slate-500 hover:text-slate-300'}`}
                            >
                            變臉版 🤡
                            </button>
                        </div>
                        <p className="text-[10px] text-slate-500 mt-1">
                            {rummikubVersion === 'standard' ? '經典配色與標準字體。' : '使用特殊變臉符號，視覺效果更逗趣。'}
                        </p>
                    </div>
              )}

              {/* Common Player Count */}
              <div className={`space-y-2 mb-4 transition-opacity ${isGuest ? 'opacity-50' : ''}`}>
                <div className="flex justify-between text-sm text-slate-300">
                   <span>玩家總數 (含 AI)</span>
                   <span className={`font-bold ${gameType === 'liar' ? 'text-indigo-400' : 'text-rose-400'}`}>{isGuest ? '?' : playerCount} 人</span>
                </div>
                <input 
                  type="range" 
                  min={MIN_PLAYERS} 
                  max={MAX_PLAYERS_GAME} 
                  value={Math.min(playerCount, MAX_PLAYERS_GAME)} 
                  onChange={(e) => setPlayerCount(Number(e.target.value))}
                  disabled={isGuest}
                  className={`w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer disabled:cursor-not-allowed ${gameType === 'liar' ? 'accent-indigo-500' : 'accent-rose-500'}`}
                />
              </div>

              {/* Difficulty */}
              <div className={`space-y-2 transition-opacity ${isGuest ? 'opacity-50' : ''}`}>
                <label className="block text-sm font-medium text-slate-300">AI 難度</label>
                <div className="grid grid-cols-2 gap-2">
                  <button 
                    onClick={() => !isGuest && setDifficulty('easy')}
                    disabled={isGuest}
                    className={`px-4 py-2 rounded-lg border text-sm font-semibold transition-colors ${difficulty === 'easy' ? 'bg-green-600/20 border-green-500 text-green-400' : 'bg-slate-900 border-slate-700 text-slate-400'}`}
                  >
                    標準
                  </button>
                  <button 
                    onClick={() => !isGuest && setDifficulty('hard')}
                    disabled={isGuest}
                    className={`px-4 py-2 rounded-lg border text-sm font-semibold transition-colors ${difficulty === 'hard' ? 'bg-red-600/20 border-red-500 text-red-400' : 'bg-slate-900 border-slate-700 text-slate-400'}`}
                  >
                    Gemini Pro
                  </button>
                </div>
              </div>
          </div>

          <Button 
            onClick={handleStart} 
            className="w-full py-3 text-lg mt-4" 
            variant={gameType === 'liar' ? 'primary' : 'danger'} // Use 'danger' (red) for Rummikub to distinguish
          >
            {mode === 'single' ? '開始單人遊戲' : (isGuest ? '加入房間' : '建立房間並等待')}
          </Button>
          
          {mode === 'multiplayer' && !isGuest && (
             <p className="text-xs text-center text-slate-500 mt-2">
               按下按鈕後將進入等待室，等待朋友加入。
             </p>
          )}
        </div>
      </div>
    </div>
  );
};
