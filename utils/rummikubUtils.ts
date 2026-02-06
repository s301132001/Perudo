
import { Tile } from '../types';
import { TILE_COLORS } from '../constants';

// Generate full deck of 106 tiles
export const generateDeck = (): Tile[] => {
  const deck: Tile[] = [];
  let idCounter = 0;

  // 2 sets of (1-13 * 4 colors)
  for (let set = 0; set < 2; set++) {
    for (const color of TILE_COLORS) {
      for (let val = 1; val <= 13; val++) {
        deck.push({
          id: `t-${idCounter++}`,
          value: val,
          color: color,
          isJoker: false
        });
      }
    }
  }

  // 2 Jokers
  deck.push({ id: `joker-1`, value: 0, color: 'black', isJoker: true });
  deck.push({ id: `joker-2`, value: 0, color: 'red', isJoker: true });

  return shuffle(deck);
};

export const shuffle = <T>(array: T[]): T[] => {
  const newArray = [...array];
  for (let i = newArray.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [newArray[i], newArray[j]] = [newArray[j], newArray[i]];
  }
  return newArray;
};

// Sort logic: Group by Color then Value
export const sortHand = (hand: Tile[]): Tile[] => {
  return [...hand].sort((a, b) => {
    if (a.isJoker) return 1; // Jokers at end
    if (b.isJoker) return -1;
    if (a.color !== b.color) return a.color.localeCompare(b.color);
    return a.value - b.value;
  });
};

// Sort logic: Group by Value (Run check helper)
export const sortHandByValue = (hand: Tile[]): Tile[] => {
    return [...hand].sort((a, b) => {
        if (a.isJoker) return 1;
        if (b.isJoker) return -1;
        if (a.value !== b.value) return a.value - b.value;
        return a.color.localeCompare(b.color);
    });
};

// --- Validation Logic ---

// Validate if a set of tiles is a valid Run or Group
export const isValidSet = (tiles: Tile[]): boolean => {
  if (tiles.length < 3) return false;
  return isGroup(tiles) || isRun(tiles);
};

// Calculate total points for icebreaker rule (>= 30)
export const calculateSetScore = (tiles: Tile[]): number => {
    if (!isValidSet(tiles)) return 0;
    
    // Check if it's a group (different colors, same value)
    // Heuristic: If valid group, look for a non-joker for value
    const nonJoker = tiles.find(t => !t.isJoker);
    
    if (isGroup(tiles) && nonJoker) {
        // In a group, Joker assumes the value of the group
        return tiles.length * nonJoker.value;
    }
    
    if (isRun(tiles)) {
        // In a run, need to determine value of each position
        // Strategy: Find first non-joker, deduce start value
        const nonJokers = tiles.filter(t => !t.isJoker).sort((a,b) => a.value - b.value);
        if (nonJokers.length === 0) return 0; 

        const sortedNonJokers = [...nonJokers].sort((a,b) => a.value - b.value);
        
        // 1. Fill internal gaps
        let jokerTotal = tiles.filter(t => t.isJoker).length;
        
        // Let's just create a continuous range of integers that includes all non-jokers.
        const minVal = sortedNonJokers[0].value;
        const maxVal = sortedNonJokers[sortedNonJokers.length - 1].value;
        const rangeNeeded = maxVal - minVal + 1;
        const jokersForGaps = rangeNeeded - sortedNonJokers.length;
        
        // Remaining jokers can be before or after.
        const freeJokers = jokerTotal - jokersForGaps;
        
        // Construct sequence
        let finalSeq: number[] = [];
        
        // Fill gaps inside
        for(let v = minVal; v <= maxVal; v++) {
            finalSeq.push(v);
        }
        
        // Append free jokers to end until 13, then prepend
        let rightVal = maxVal + 1;
        let leftVal = minVal - 1;
        
        for(let k=0; k<freeJokers; k++) {
            if (rightVal <= 13) {
                finalSeq.push(rightVal);
                rightVal++;
            } else if (leftVal >= 1) {
                finalSeq.unshift(leftVal);
                leftVal--;
            }
        }
        
        return finalSeq.reduce((a, b) => a + b, 0);
    }
    
    return 0;
};

// Group: Same value, different colors
const isGroup = (tiles: Tile[]): boolean => {
  if (tiles.length > 4) return false;

  // Filter out jokers to check values
  const nonJokers = tiles.filter(t => !t.isJoker);
  if (nonJokers.length === 0) return true; // All jokers is valid (technically)

  const targetValue = nonJokers[0].value;
  // All non-jokers must have same value
  if (nonJokers.some(t => t.value !== targetValue)) return false;

  // Colors must be unique
  const colors = new Set<string>();
  
  for (const t of nonJokers) {
    if (colors.has(t.color)) return false;
    colors.add(t.color);
  }

  return true;
};

// Run: Same color, consecutive values
const isRun = (tiles: Tile[]): boolean => {
  // Check colors
  const nonJokers = tiles.filter(t => !t.isJoker);
  if (nonJokers.length === 0) return true;

  const targetColor = nonJokers[0].color;
  if (nonJokers.some(t => t.color !== targetColor)) return false;

  // Sort by value to check sequence
  // We need to incorporate Jokers into the gaps
  const sorted = [...nonJokers].sort((a, b) => a.value - b.value);
  let jokerCount = tiles.length - nonJokers.length;

  for (let i = 0; i < sorted.length - 1; i++) {
    const diff = sorted[i+1].value - sorted[i].value;
    if (diff === 0) return false; // Duplicate number in run
    if (diff > 1) {
      const gap = diff - 1;
      if (jokerCount >= gap) {
        jokerCount -= gap;
      } else {
        return false; // Not enough jokers to fill gap
      }
    }
  }
  return true;
};
