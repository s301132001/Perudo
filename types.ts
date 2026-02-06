
export enum GamePhase {
  LOBBY = 'LOBBY',       // Waiting for players in multiplayer
  PLAYING = 'PLAYING',
  ROUND_END = 'ROUND_END',
  GAME_OVER = 'GAME_OVER'
}

export type GameMode = 'classic' | 'hearts';
export type GameType = 'liar' | 'rummikub'; 
export type RummikubVersion = 'standard' | 'face-change'; // Updated from 'deluxe'

// --- Rummikub Specific Types ---
export type TileColor = 'red' | 'blue' | 'orange' | 'black';

export interface Tile {
  id: string;
  value: number; // 1-13
  color: TileColor;
  isJoker: boolean;
}

export interface Player {
  id: string;
  name: string;
  isAi: boolean;
  // Liar Data
  dice: number[]; 
  diceCount: number; 
  health: number; 
  maxHealth: number; 
  // Rummikub Data
  hand: Tile[]; 
  hasInitialMeld: boolean; // NEW: Track if player has broken the ice (30 points)
  isEliminated: boolean;
  avatarSeed?: number;
  isHost?: boolean; 
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
  // Common Props
  gameType: GameType; 
  playerCount: number; 
  playerName: string;
  difficulty: 'easy' | 'hard';
  mode: 'single' | 'multiplayer';
  roomId?: string; 
  isHost?: boolean; 
  
  // Liar's Dice Specific
  startingDice: number;
  gameMode: GameMode;
  maxHealth: number;

  // Rummikub Specific
  rummikubVersion: RummikubVersion; 
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
  | { type: 'EMOTE'; playerId: string; emoji: string }
  | { type: 'CHAT'; playerId: string; message: string }
  // Rummikub Actions Updated
  | { type: 'RUMMIKUB_UPDATE_BOARD'; boardSets: Tile[][]; hand: Tile[] } // Final Commit: Send valid board + new hand state
  | { type: 'RUMMIKUB_SYNC_WORKING'; workingGrid: (Tile | null)[] } // NEW: Real-time visual sync of moves
  | { type: 'RUMMIKUB_DRAW' }
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
  finalLoser: string | null;
  challengeResult: {loserId: string, actualCount: number, bid: Bid} | null;
  settings: GameSettings;
  // Rummikub State
  boardSets: Tile[][]; // Array of sets (runs or groups)
  tilePoolCount: number; // Number of tiles remaining in deck
}
