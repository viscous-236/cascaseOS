/**
 * @file background-dots.tsx
 * @description Aceternity UI Dot Grid & Ambient Spotlight Background.
 * Supports both institutional Dark Mode (obsidian) and Light Mode (crisp white/neutral).
 */

import React from 'react';
import { cn } from '@/lib/utils';

export const BackgroundDots = ({
  children,
  className,
}: {
  children?: React.ReactNode;
  className?: string;
}) => {
  return (
    <div
      className={cn(
        'relative w-full overflow-hidden bg-slate-50 dark:bg-[#07090e] transition-colors duration-200',
        className
      )}
    >
      {/* Precision Dot Pattern */}
      <div className="absolute inset-0 bg-[radial-gradient(rgba(0,0,0,0.06)_1px,transparent_1px)] dark:bg-[radial-gradient(rgba(255,255,255,0.06)_1px,transparent_1px)] [background-size:20px_20px] pointer-events-none" />

      {/* Ambient Vignette Overlay */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_60%_at_50%_0%,rgba(14,165,233,0.03),transparent)] pointer-events-none" />

      {/* Content */}
      <div className="relative z-10">{children}</div>
    </div>
  );
};

export default BackgroundDots;
