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
    <div className="antialiased text-slate-100 selection:bg-indigo-500 selection:text-white">
      {!isPlaying ? (
        <Lobby onStartGame={handleStartGame} />
      ) : (
        settings && <GameRoom settings={settings} onLeave={handleLeaveGame} />
      )}
    </div>
  );
};

export default App;
