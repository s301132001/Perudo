export enum GamePhase {
  LOBBY = 'LOBBY',       // Waiting for players in multiplayer
  PLAYING = 'PLAYING',
  ROUND_END = 'ROUND_END',
  GAME_OVER = 'GAME_OVER'
}

export interface Player {
  id: string;
  name: string;
  isAi: boolean;
  dice: number[]; // Array of face values
  diceCount: number; // Current number of dice holding
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
  type: 'info' | 'bid' | 'challenge' | 'error' | 'win';
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
  challengeResult: {loserId: string, actualCount: number, bid: Bid} | null;
}