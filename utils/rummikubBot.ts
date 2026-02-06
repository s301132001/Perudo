
import { Tile } from '../types';
import { calculateSetScore, isValidSet } from './rummikubUtils';

type BotAction = 
  | { action: 'PLAY_SET'; tiles: Tile[] }
  | { action: 'ADD_TO_SET'; tiles: Tile[]; targetSetIndex: number }
  | { action: 'DRAW' };

export const getBotMove = (
    hand: Tile[], 
    boardSets: Tile[][], 
    hasInitialMeld: boolean
): BotAction => {
    
    // 1. Try to find a valid Group (Set of 3 or 4 same value)
    // Group by value
    const valueMap = new Map<number, Tile[]>();
    const jokers = hand.filter(t => t.isJoker);
    const regularTiles = hand.filter(t => !t.isJoker);

    regularTiles.forEach(t => {
        if (!valueMap.has(t.value)) valueMap.set(t.value, []);
        valueMap.get(t.value)?.push(t);
    });

    // Heuristic: Check Groups first
    for (const [, tiles] of valueMap.entries()) {
        // Simple logic: if we have 3 distinct colors, play.
        // If 2 distinct + joker, play.
        const distinctColorTiles = uniqueColorTiles(tiles);
        const needed = 3 - distinctColorTiles.length;
        
        if (needed <= 0 || (needed <= jokers.length)) {
            // Construct set
            let playTiles = [...distinctColorTiles];
            let usedJokers: Tile[] = [];
            
            // Add jokers if needed
            for(let i=0; i<needed; i++) {
                usedJokers.push(jokers[i]);
            }
            // If we have 3, maybe add 4th if available? 
            // Bot Strategy: Minimal valid move to save tiles? Or Max? 
            // Let's do minimal valid (3) to keep logic simple, or 4 if distinct.
            
            playTiles = [...playTiles, ...usedJokers];
            
            if (isValidSet(playTiles)) {
                // Check Icebreaker
                if (!hasInitialMeld) {
                    if (calculateSetScore(playTiles) >= 30) {
                        return { action: 'PLAY_SET', tiles: playTiles };
                    }
                } else {
                    return { action: 'PLAY_SET', tiles: playTiles };
                }
            }
        }
    }

    // 2. Try to find a valid Run (Sequence)
    // Group by Color
    const colorMap: Record<string, Tile[]> = { red: [], blue: [], orange: [], black: [] };
    regularTiles.forEach(t => colorMap[t.color].push(t));

    for (const color in colorMap) {
        const tiles = colorMap[color].sort((a,b) => a.value - b.value);
        if (tiles.length === 0) continue;

        // Find sequences
        // Simple approach: Sliding window or finding continuous blocks
        // e.g. 4, 5, 6
        // e.g. 4, 6 (needs joker)
        
        // Very basic run detector: checking subsets of length 3
        for (let i = 0; i < tiles.length; i++) {
            let potentialRun = [tiles[i]];
            let currentVal = tiles[i].value;
            let availableJokers = [...jokers];
            
            // Try to extend
            for (let j = i + 1; j < tiles.length; j++) {
                const nextTile = tiles[j];
                const diff = nextTile.value - currentVal;
                
                if (diff === 1) {
                    potentialRun.push(nextTile);
                    currentVal = nextTile.value;
                } else if (diff > 1) {
                    // Can we fill gap with jokers?
                    const gaps = diff - 1;
                    if (availableJokers.length >= gaps) {
                        for(let k=0; k<gaps; k++) {
                            potentialRun.push(availableJokers.pop()!);
                        }
                        potentialRun.push(nextTile);
                        currentVal = nextTile.value;
                    } else {
                        break; // Broken run
                    }
                }
                
                // If length >= 3, check validity and score
                if (potentialRun.length >= 3) {
                     if (isValidSet(potentialRun)) {
                        if (!hasInitialMeld) {
                            if (calculateSetScore(potentialRun) >= 30) {
                                return { action: 'PLAY_SET', tiles: potentialRun };
                            }
                        } else {
                            return { action: 'PLAY_SET', tiles: potentialRun };
                        }
                    }
                }
            }
        }
    }

    // 3. If Ice is broken, try to add to board
    if (hasInitialMeld) {
        for (let tIdx = 0; tIdx < hand.length; tIdx++) {
            const tile = hand[tIdx];
            // Try adding this tile to any set on board
            for (let sIdx = 0; sIdx < boardSets.length; sIdx++) {
                const targetSet = boardSets[sIdx];
                // Try append end
                const tryEnd = [...targetSet, tile];
                // Try sorting the combined set to handle run insertion (simple sort)
                const tryEndSorted = sortSetForValidation(tryEnd);

                if (isValidSet(tryEndSorted)) {
                    return { action: 'ADD_TO_SET', tiles: [tile], targetSetIndex: sIdx };
                }
            }
        }
    }

    return { action: 'DRAW' };
};

// Helper: Get unique colors from a list of same-value tiles
const uniqueColorTiles = (tiles: Tile[]) => {
    const seen = new Set<string>();
    return tiles.filter(t => {
        if (seen.has(t.color)) return false;
        seen.add(t.color);
        return true;
    });
};

// Helper: roughly sort for validation (Runs by value, Groups just need grouping)
const sortSetForValidation = (tiles: Tile[]) => {
    // Check if it looks like a run (same color)
    const nonJokers = tiles.filter(t => !t.isJoker);
    if (nonJokers.length > 0 && nonJokers.every(t => t.color === nonJokers[0].color)) {
        return [...tiles].sort((a,b) => a.value - b.value); // Sort by value for runs
    }
    return tiles; // Leave as is for groups
};
