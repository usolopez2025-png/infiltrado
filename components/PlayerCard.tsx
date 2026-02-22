
import React from 'react';
import { Player, Role } from '../types';

interface PlayerCardProps {
  player: Player;
  onVote?: (id: number) => void;
  canVote?: boolean;
  isSelected?: boolean;
}

const PlayerCard: React.FC<PlayerCardProps> = ({ 
  player, 
  onVote, 
  canVote,
  isSelected,
}) => {
  return (
    <div 
      className={`glass-card p-6 transition-all duration-300 transform flex flex-row items-center gap-6 min-h-[90px] relative ${
        isSelected ? 'ring-2 ring-white/40 bg-white/5 shadow-[0_0_30px_rgba(255,255,255,0.05)]' : ''
      } ${
        canVote ? 'cursor-pointer active:scale-[0.98]' : 'opacity-80'
      }`}
      onClick={() => canVote && onVote && onVote(player.id)}
    >
      <div className="text-4xl transition-transform">
        {player.isRevealed ? (player.role === Role.IMPOSTOR ? '🐺' : '🐑') : '👤'}
      </div>
      
      <div className="flex flex-col flex-1">
        <h3 className="font-black text-xl tracking-tight truncate">{player.name}</h3>
        {player.isRevealed && (
          <span className={`mt-1 px-3 py-0.5 rounded-full text-[9px] font-black uppercase tracking-widest self-start ${
            player.role === Role.IMPOSTOR ? 'bg-white text-black' : 'bg-white/10'
          }`}>
            {player.role === Role.IMPOSTOR ? 'Infiltrado' : 'Fiel'}
          </span>
        )}
      </div>

      {player.votes > 0 && (
        <div className="bg-white text-black w-8 h-8 rounded-full flex items-center justify-center text-sm font-black shadow-2xl mr-10">
          {player.votes}
        </div>
      )}
    </div>
  );
};

export default PlayerCard;
