import { Bid, Player } from '../types';

export const rollDice = (count: number): number[] => {
  return Array.from({ length: count }, () => Math.floor(Math.random() * 6) + 1);
};

export const isValidBid = (currentBid: Bid | null, newQuantity: number, newFace: number): boolean => {
  if (!currentBid) return true; // First bid is always valid if within bounds (handled by UI)

  if (newQuantity > currentBid.quantity) return true;
  if (newQuantity === currentBid.quantity && newFace > currentBid.face) return true;

  return false;
};

export const countDice = (players: Player[], targetFace: number): number => {
  let count = 0;
  players.forEach(p => {
    p.dice.forEach(face => {
      if (face === targetFace || face === 1) { // 1 is Wild
        count++;
      }
    });
  });
  return count;
};

// Generates a short ID for the room
export const generateRoomId = () => {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let result = '';
  for (let i = 0; i < 4; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
};

// Generate Share URL with Room ID
// Updated to support subdirectories (e.g. GitHub Pages) by strictly using the current location
export const getShareUrl = (roomId: string) => {
  const url = new URL(window.location.href);
  url.search = ''; // Clear existing search params if any
  url.searchParams.set('room', roomId);
  return url.toString();
};

// Parse settings from URL
export const getSettingsFromUrl = () => {
  const params = new URLSearchParams(window.location.search);
  const roomId = params.get('room');
  
  if (!roomId) return null;

  return {
    roomId,
    isGuest: true
  };
};