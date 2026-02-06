
import React from 'react';
import { GameType } from '../types';

interface GameHallProps {
  onSelectGame: (game: GameType) => void;
}

export const GameHall: React.FC<GameHallProps> = ({ onSelectGame }) => {
  return (
    <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center p-6 font-sans">
      <div className="max-w-4xl w-full">
        <header className="text-center mb-12">
          <h1 className="text-5xl md:text-6xl font-black text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 via-purple-400 to-pink-400 mb-4 tracking-tight drop-shadow-lg">
            GEMINI 遊戲大廳
          </h1>
          <p className="text-slate-400 text-lg">選擇一款遊戲，開始你的多人對戰或 AI 挑戰</p>
        </header>

        <div className="grid md:grid-cols-2 gap-8">
          {/* Card 1: Liar's Dice */}
          <button 
            onClick={() => onSelectGame('liar')}
            className="group relative bg-slate-800 rounded-3xl p-1 overflow-hidden transition-all duration-300 hover:scale-105 hover:shadow-[0_0_40px_rgba(99,102,241,0.4)] text-left"
          >
            <div className="absolute inset-0 bg-gradient-to-br from-indigo-500 to-purple-600 opacity-10 group-hover:opacity-20 transition-opacity"></div>
            <div className="bg-slate-900/90 rounded-[22px] h-full p-8 flex flex-col relative z-10 border border-slate-700 group-hover:border-indigo-500/50">
              <div className="text-6xl mb-6 group-hover:scale-110 transition-transform duration-300 origin-left">🎲</div>
              <h2 className="text-3xl font-bold text-white mb-2 group-hover:text-indigo-400 transition-colors">吹牛大王</h2>
              <h3 className="text-sm font-bold text-indigo-500 uppercase tracking-widest mb-4">Liar's Dice</h3>
              <p className="text-slate-400 mb-6 flex-1 leading-relaxed">
                經典的派對遊戲。觀察對手、計算機率，用心理戰擊敗他們。支援「經典模式」與「愛心血量模式」。
              </p>
              <div className="flex items-center gap-2 text-sm text-slate-500">
                <span className="bg-slate-800 px-3 py-1 rounded-full border border-slate-700">2-6 人</span>
                <span className="bg-slate-800 px-3 py-1 rounded-full border border-slate-700">AI 支援</span>
              </div>
            </div>
          </button>

          {/* Card 2: Rummikub */}
          <button 
            onClick={() => onSelectGame('rummikub')}
            className="group relative bg-slate-800 rounded-3xl p-1 overflow-hidden transition-all duration-300 hover:scale-105 hover:shadow-[0_0_40px_rgba(244,63,94,0.4)] text-left"
          >
            <div className="absolute inset-0 bg-gradient-to-br from-rose-500 to-orange-600 opacity-10 group-hover:opacity-20 transition-opacity"></div>
            <div className="bg-slate-900/90 rounded-[22px] h-full p-8 flex flex-col relative z-10 border border-slate-700 group-hover:border-rose-500/50">
              {/* Joker / Smile Face Representation */}
              <div className="w-16 h-20 bg-slate-100 rounded-lg mb-6 group-hover:scale-110 transition-transform duration-300 origin-left shadow-lg flex items-center justify-center border-2 border-slate-300 relative overflow-hidden">
                   <div className="absolute top-1 left-1 text-[10px] text-red-500 font-bold">☺</div>
                   <div className="text-4xl">🤡</div>
                   <div className="absolute bottom-1 right-1 text-[10px] text-red-500 font-bold rotate-180">☺</div>
              </div>
              
              <h2 className="text-3xl font-bold text-white mb-2 group-hover:text-rose-400 transition-colors">拉密數字牌</h2>
              <h3 className="text-sm font-bold text-rose-500 uppercase tracking-widest mb-4">Rummikub</h3>
              <p className="text-slate-400 mb-6 flex-1 leading-relaxed">
                以色列麻將。考驗你的排列組合能力。將手中的數字牌組成「合法的牌組」並最先出完。
              </p>
              <div className="flex items-center gap-2 text-sm text-slate-500">
                <span className="bg-slate-800 px-3 py-1 rounded-full border border-slate-700">2-4 人</span>
                <span className="bg-slate-800 px-3 py-1 rounded-full border border-slate-700">AI 支援</span>
              </div>
            </div>
          </button>
        </div>
        
        <footer className="mt-12 text-center text-slate-600 text-sm">
           Designed with Gemini AI • v1.3.1
        </footer>
      </div>
    </div>
  );
};
