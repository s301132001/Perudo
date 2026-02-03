import React from 'react';

interface DiceProps {
  value: number;
  size?: 'sm' | 'md' | 'lg';
  hidden?: boolean;
}

export const Dice: React.FC<DiceProps> = ({ value, size = 'md', hidden = false }) => {
  const sizeClasses = {
    sm: 'w-8 h-8 text-lg',
    md: 'w-12 h-12 text-2xl',
    lg: 'w-16 h-16 text-4xl',
  };

  const dotPosition = {
    1: ['justify-center items-center'],
    2: ['justify-start items-start', 'justify-end items-end'],
    3: ['justify-start items-start', 'justify-center items-center', 'justify-end items-end'],
    4: ['justify-start items-start', 'justify-end items-start', 'justify-start items-end', 'justify-end items-end'],
    5: ['justify-start items-start', 'justify-end items-start', 'justify-center items-center', 'justify-start items-end', 'justify-end items-end'],
    6: ['justify-start items-start', 'justify-end items-start', 'justify-start items-center', 'justify-end items-center', 'justify-start items-end', 'justify-end items-end'],
  };

  if (hidden) {
    return (
      <div className={`${sizeClasses[size]} bg-slate-700 rounded-lg shadow-md flex items-center justify-center border-2 border-slate-600`}>
        <span className="text-slate-500 font-bold">?</span>
      </div>
    );
  }

  // Use CSS grid for custom dice face rendering instead of unicode characters for better control
  return (
    <div className={`${sizeClasses[size]} bg-white rounded-lg shadow-inner shadow-gray-400 flex relative overflow-hidden border border-gray-300`}>
       <div className="grid grid-cols-3 grid-rows-3 w-full h-full p-1 gap-0.5">
          {/* Create a 3x3 grid and place dots based on value */}
          {[...Array(9)].map((_, i) => {
             // Map 3x3 grid index to potential dot positions
             // This is a simplified "draw dots" logic
             const showDot = getDotVisibility(value, i);
             return (
               <div key={i} className="flex justify-center items-center">
                 {showDot && <div className={`rounded-full bg-black ${size === 'sm' ? 'w-1.5 h-1.5' : 'w-2.5 h-2.5'}`}></div>}
               </div>
             )
          })}
       </div>
       {value === 1 && (
         <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-20 text-red-500 font-bold">
            ★
         </div>
       )}
    </div>
  );
};

// Helper to determine if a dot should be shown at index i (0-8) for value v (1-6)
function getDotVisibility(v: number, i: number): boolean {
  // 0 1 2
  // 3 4 5
  // 6 7 8
  const maps: Record<number, number[]> = {
    1: [4],
    2: [0, 8], // Or 2, 6
    3: [0, 4, 8],
    4: [0, 2, 6, 8],
    5: [0, 2, 4, 6, 8],
    6: [0, 2, 3, 5, 6, 8],
  };
  return maps[v]?.includes(i) || false;
}
