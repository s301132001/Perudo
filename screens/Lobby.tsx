import React, { useState, useEffect } from 'react';
import { GameSettings } from '../types';
import { MAX_PLAYERS, MIN_PLAYERS, DEFAULT_STARTING_DICE } from '../constants';
import { Button } from '../components/Button';
import { generateRoomId, getShareUrl, getSettingsFromUrl } from '../utils/gameUtils';

interface LobbyProps {
  onStartGame: (settings: GameSettings) => void;
}

export const Lobby: React.FC<LobbyProps> = ({ onStartGame }) => {
  const [playerName, setPlayerName] = useState('');
  const [mode, setMode] = useState<'single' | 'multiplayer'>('single');
  
  // Settings
  const [playerCount, setPlayerCount] = useState(3);
  const [diceCount, setDiceCount] = useState(DEFAULT_STARTING_DICE);
  const [difficulty, setDifficulty] = useState<'easy' | 'hard'>('easy');
  const [roomId, setRoomId] = useState('');
  
  // UI State
  const [isCopied, setIsCopied] = useState(false);
  const [isGuest, setIsGuest] = useState(false);

  useEffect(() => {
    const urlSettings = getSettingsFromUrl();
    if (urlSettings) {
      // Auto-switch to Multiplayer Guest mode
      setMode('multiplayer');
      setRoomId(urlSettings.roomId);
      setIsGuest(true);
    } else {
      // Host Mode default
      setRoomId(generateRoomId());
      setIsGuest(false);
    }
  }, []);

  const handleCopy = () => {
    const url = getShareUrl(roomId);
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
      playerCount,
      startingDice: diceCount,
      playerName: playerName || '玩家 1',
      difficulty,
      mode,
      roomId: mode === 'multiplayer' ? roomId : undefined,
      isHost: mode === 'single' ? true : !isGuest
    });
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-slate-900 p-4 font-sans">
      <div className="w-full max-w-md bg-slate-800 rounded-2xl shadow-2xl p-8 border border-slate-700 relative overflow-hidden">
        
        <h1 className="text-4xl font-bold text-center mb-2 text-indigo-400">Gemini 吹牛大王</h1>
        <p className="text-slate-400 text-center mb-6">
          {mode === 'single' ? '單人 / AI 挑戰' : isGuest ? '加入多人連線房間' : '建立多人連線房間'}
        </p>

        {/* Mode Toggle */}
        {!isGuest && (
          <div className="flex bg-slate-900 p-1 rounded-xl mb-6 border border-slate-700">
            <button
              onClick={() => setMode('single')}
              className={`flex-1 py-2 text-sm font-bold rounded-lg transition-all ${mode === 'single' ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-400 hover:text-white'}`}
            >
              單人練習 (vs AI)
            </button>
            <button
              onClick={() => setMode('multiplayer')}
              className={`flex-1 py-2 text-sm font-bold rounded-lg transition-all ${mode === 'multiplayer' ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-400 hover:text-white'}`}
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

          <div className="border-t border-slate-700 my-4 pt-4">
              <p className="text-xs font-bold text-slate-500 mb-4 uppercase tracking-wider">
                  遊戲設定 {isGuest && '(由室長決定)'}
              </p>

              {/* Player Count */}
              <div className={`space-y-2 mb-4 transition-opacity ${isGuest ? 'opacity-60 pointer-events-none' : ''}`}>
                <div className="flex justify-between text-sm text-slate-300">
                   <span>玩家總數 (含 AI)</span>
                   <span className="font-bold text-indigo-400">{playerCount} 人</span>
                </div>
                <input 
                  type="range" 
                  min={MIN_PLAYERS} 
                  max={MAX_PLAYERS} 
                  value={playerCount} 
                  onChange={(e) => setPlayerCount(Number(e.target.value))}
                  disabled={isGuest}
                  className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-indigo-500 disabled:cursor-not-allowed"
                />
              </div>

              {/* Dice Count */}
              <div className={`space-y-2 mb-4 transition-opacity ${isGuest ? 'opacity-60 pointer-events-none' : ''}`}>
                 <div className="flex justify-between text-sm text-slate-300">
                   <span>每人起始骰子數</span>
                   <span className="font-bold text-indigo-400">{diceCount} 顆</span>
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

              {/* Difficulty */}
              <div className={`space-y-2 transition-opacity ${isGuest ? 'opacity-60 pointer-events-none' : ''}`}>
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
                    Gemini Pro (困難)
                  </button>
                </div>
              </div>
          </div>

          <Button onClick={handleStart} className="w-full py-3 text-lg mt-4">
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