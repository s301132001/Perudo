
export enum GamePhase {
  LOBBY = 'LOBBY',       // Waiting for players in multiplayer
  PLAYING = 'PLAYING',
  ROUND_END = 'ROUND_END',
  GAME_OVER = 'GAME_OVER'
}

export type GameMode = 'classic' | 'hearts';

export interface Player {
  id: string;
  name: string;
  isAi: boolean;
  dice: number[]; // Array of face values
  diceCount: number; // Current number of dice holding
  health: number; // NEW: For Hearts mode
  maxHealth: number; // NEW
  isEliminated: boolean;
  avatarSeed?: number;
  isHost?: boolean; // For multiplayer display
}

export interface Bid {
  playerId: string;
  quantity: number;
  face: number;
}

export interface GameLog {
  id: string;
  message: string;
  type: 'info' | 'bid' | 'challenge' | 'error' | 'win' | 'emote' | 'chat';
}

export interface GameSettings {
  playerCount: number; // Total players including human and AI
  startingDice: number;
  playerName: string;
  difficulty: 'easy' | 'hard';
  // Multiplayer Props
  mode: 'single' | 'multiplayer';
  roomId?: string; // If hosting or joining
  isHost?: boolean; // True if created the room
  // NEW: Game Mode Settings
  gameMode: GameMode;
  maxHealth: number;
}

export interface AiMove {
  action: 'BID' | 'CHALLENGE';
  quantity?: number;
  face?: number;
  reasoning: string;
}

// Networking Types
export type NetworkAction = 
  | { type: 'JOIN'; player: Player }
  | { type: 'SYNC'; state: Partial<GameState> }
  | { type: 'BID'; quantity: number; face: number }
  | { type: 'CHALLENGE' }
  | { type: 'EMOTE'; playerId: string; emoji: string } // NEW
  | { type: 'CHAT'; playerId: string; message: string } // NEW
  | { type: 'RESTART' };

export interface GameState {
  players: Player[];
  currentPlayerIndex: number;
  currentBid: Bid | null;
  bidHistory: Bid[];
  logs: GameLog[];
  phase: GamePhase;
  totalDiceInGame: number;
  roundWinner: string | null;
  finalLoser: string | null; // NEW: Track the specific loser at game end
  challengeResult: {loserId: string, actualCount: number, bid: Bid} | null;
  settings: GameSettings; // Synced settings
}
