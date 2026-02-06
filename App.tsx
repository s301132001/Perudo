
import React, { useState, useEffect } from 'react';
import { GameHall } from './screens/GameHall';
import { Lobby } from './screens/Lobby';
import { GameRoom } from './screens/GameRoom';
import { RummikubRoom } from './screens/RummikubRoom';
import { GameSettings, GameType } from './types';
import { getSettingsFromUrl } from './utils/gameUtils';

const App: React.FC = () => {
  const [screen, setScreen] = useState<'hall' | 'lobby' | 'game'>('hall');
  const [selectedGame, setSelectedGame] = useState<GameType>('liar');
  const [settings, setSettings] = useState<GameSettings | null>(null);

  // Check URL on load to bypass Hall if joining a room via link
  useEffect(() => {
    const urlSettings = getSettingsFromUrl();
    if (urlSettings) {
      // Direct link to a room
      setSelectedGame(urlSettings.gameType);
      setScreen('lobby');
    }
  }, []);

  const handleSelectGame = (game: GameType) => {
    setSelectedGame(game);
    setScreen('lobby');
  };

  const handleBackToHall = () => {
    setScreen('hall');
    // Optional: Clear URL params if user manually backs out
    window.history.pushState({}, '', window.location.pathname);
  };

  const handleStartGame = (newSettings: GameSettings) => {
    setSettings(newSettings);
    setScreen('game');
  };

  const handleLeaveGame = () => {
    setScreen('lobby');
    setSettings(null);
  };

  return (
    <div className="antialiased text-slate-100 selection:bg-indigo-500 selection:text-white relative">
      
      {screen === 'hall' && (
        <GameHall onSelectGame={handleSelectGame} />
      )}

      {screen === 'lobby' && (
        <Lobby 
          initialGameType={selectedGame}
          onStartGame={handleStartGame} 
          onBack={handleBackToHall}
        />
      )}

      {screen === 'game' && settings && (
        <>
          {settings.gameType === 'liar' ? (
             <GameRoom settings={settings} onLeave={handleLeaveGame} />
          ) : (
             <RummikubRoom settings={settings} onLeave={handleLeaveGame} />
          )}
        </>
      )}
      
      {/* Version Footer */}
      <div className="fixed bottom-1 right-2 text-[10px] text-slate-600 font-mono pointer-events-none z-50 opacity-60">
        v1.2.0
      </div>
    </div>
  );
};

export default App;
