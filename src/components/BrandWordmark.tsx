import React from 'react';

interface BrandWordmarkProps {
  size?: 'sm' | 'md' | 'lg';
}

export const BrandWordmark: React.FC<BrandWordmarkProps> = ({ size = 'md' }) => {
  const isLarge = size === 'lg';
  const isSmall = size === 'sm';

  return (
    <span
      className="inline-flex items-center gap-2 select-none whitespace-nowrap shrink-0 group"
      aria-label="HBL videolab"
    >
      <span
        className={`relative inline-flex items-center justify-center rounded-lg bg-gradient-to-br from-sky-400 via-indigo-500 to-fuchsia-500 p-[1.5px] shadow-[0_0_16px_rgba(56,189,248,0.35)] ${
          isLarge ? 'w-8 h-8' : isSmall ? 'w-6 h-6' : 'w-7 h-7'
        }`}
      >
        <span className="w-full h-full rounded-[6.5px] bg-[#090D16] flex items-center justify-center relative overflow-hidden">
          <span className="absolute inset-0 bg-gradient-to-tr from-sky-500/20 via-transparent to-fuchsia-500/20" />
          <svg
            viewBox="0 0 24 24"
            className={`${isLarge ? 'w-4 h-4' : 'w-3.5 h-3.5'} relative z-10`}
            fill="none"
            aria-hidden="true"
          >
            <path
              d="M4.5 6.5V17.5M4.5 12H11.5M11.5 6.5V17.5"
              stroke="url(#hblGrad)"
              strokeWidth="2.3"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path
              d="M15.5 7.5L20.5 12L15.5 16.5V7.5Z"
              fill="url(#hblGrad)"
            />
            <defs>
              <linearGradient id="hblGrad" x1="4" y1="6" x2="21" y2="18" gradientUnits="userSpaceOnUse">
                <stop offset="0%" stopColor="#38BDF8" />
                <stop offset="52%" stopColor="#A78BFA" />
                <stop offset="100%" stopColor="#F472B6" />
              </linearGradient>
            </defs>
          </svg>
        </span>
      </span>

      <span className="inline-flex items-baseline gap-1.5 leading-none">
        <span
          style={{ fontFamily: "'Syne', sans-serif" }}
          className={`font-extrabold tracking-[0.08em] bg-gradient-to-r from-white via-sky-200 to-cyan-300 bg-clip-text text-transparent drop-shadow-[0_0_10px_rgba(56,189,248,0.3)] ${
            isLarge ? 'text-xl' : isSmall ? 'text-sm' : 'text-base sm:text-[17px]'
          }`}
        >
          HBL
        </span>
        <span
          style={{ fontFamily: "'Outfit', sans-serif" }}
          className={`font-semibold italic tracking-[0.06em] bg-gradient-to-r from-sky-300 via-violet-300 to-fuchsia-300 bg-clip-text text-transparent ${
            isLarge ? 'text-lg' : isSmall ? 'text-xs' : 'text-[14px] sm:text-[15px]'
          }`}
        >
          videolab
        </span>
      </span>
    </span>
  );
};
