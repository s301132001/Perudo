import React, { useState } from 'react';
import { Lobby } from './screens/Lobby';
import { GameRoom } from './screens/GameRoom';
import { GameSettings } from './types';

const App: React.FC = () => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [settings, setSettings] = useState<GameSettings | null>(null);

  const handleStartGame = (newSettings: GameSettings) => {
    setSettings(newSettings);
    setIsPlaying(true);
  };

  const handleLeaveGame = () => {
    // Confirm logic could go here
    setIsPlaying(false);
    setSettings(null);
  };

  return (
    <div className="antialiased text-slate-100 selection:bg-indigo-500 selection:text-white relative">
      {!isPlaying ? (
        <Lobby onStartGame={handleStartGame} />
      ) : (
        settings && <GameRoom settings={settings} onLeave={handleLeaveGame} />
      )}
      
      {/* Version Footer */}
      <div className="fixed bottom-1 right-2 text-[10px] text-slate-600 font-mono pointer-events-none z-50 opacity-60">
        v1.0.2
      </div>
    </div>
  );
};

export default App;