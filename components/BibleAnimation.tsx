
import React, { useEffect } from 'react';

interface BibleAnimationProps {
  onComplete: () => void;
}

const BibleAnimation: React.FC<BibleAnimationProps> = ({ onComplete }) => {
  useEffect(() => {
    const timer = setTimeout(() => onComplete(), 2000);
    return () => clearTimeout(timer);
  }, [onComplete]);

  return (
    <div className="fixed inset-0 flex flex-col items-center justify-center bg-black z-50 overflow-hidden">
      <div className="relative flex flex-col items-center space-y-6 animate-pulse">
        <div className="w-24 h-24 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-4xl shadow-[0_0_50px_rgba(255,255,255,0.05)]">
           📖
        </div>
        <h1 className="text-4xl font-black tracking-[12px] uppercase opacity-80 pl-[12px]">
          Infiltrado
        </h1>
        <div className="text-[10px] font-bold tracking-[4px] uppercase opacity-30">
          Cargando sabiduría
        </div>
      </div>
      <div className="absolute inset-0 bg-white/[0.02] blur-[150px] rounded-full scale-150"></div>
    </div>
  );
};

export default BibleAnimation;
