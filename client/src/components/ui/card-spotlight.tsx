/**
 * @file card-spotlight.tsx
 * @description Aceternity UI Card Spotlight component.
 * Provides a subtle, luxury mouse-following spotlight glow with double-bezel hardware styling.
 * Supports both institutional Dark Mode (obsidian) and Light Mode (crisp white/neutral).
 */

import React, { useState, MouseEvent } from 'react';
import { motion, useMotionTemplate, useMotionValue } from 'framer-motion';
import { cn } from '@/lib/utils';

export const CardSpotlight = ({
  children,
  radius = 350,
  color,
  className,
  outerClassName,
  ...props
}: {
  radius?: number;
  color?: string;
  children: React.ReactNode;
  className?: string;
  outerClassName?: string;
} & React.HTMLAttributes<HTMLDivElement>) => {
  const mouseX = useMotionValue(0);
  const mouseY = useMotionValue(0);

  function handleMouseMove({ currentTarget, clientX, clientY }: MouseEvent) {
    const { left, top } = currentTarget.getBoundingClientRect();
    mouseX.set(clientX - left);
    mouseY.set(clientY - top);
  }

  const [isHovered, setIsHovered] = useState(false);

  // Default spotlight color if not explicitly provided
  const spotlightColor = color || 'rgba(120, 120, 120, 0.08)';

  return (
    <div
      className={cn(
        'group/spotlight relative p-[1px] rounded-2xl bg-neutral-200/80 dark:bg-neutral-900/60 border border-neutral-200/90 dark:border-neutral-800/80 transition-all duration-200 hover:border-neutral-300 dark:hover:border-neutral-700/80 shadow-sm',
        outerClassName
      )}
      onMouseMove={handleMouseMove}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      {...props}
    >
      {/* Mouse Spotlight Layer */}
      <motion.div
        className="pointer-events-none absolute -inset-px rounded-2xl opacity-0 transition duration-300 group-hover/spotlight:opacity-100"
        style={{
          background: useMotionTemplate`
            radial-gradient(
              ${radius}px circle at ${mouseX}px ${mouseY}px,
              ${spotlightColor},
              transparent 80%
            )
          `,
        }}
      />
      {/* Inner Hardware Core Container */}
      <div
        className={cn(
          'relative rounded-[15px] bg-white dark:bg-[#0c0e14] text-neutral-900 dark:text-neutral-100 p-4 h-full w-full overflow-hidden transition-colors duration-200',
          className
        )}
      >
        {children}
      </div>
    </div>
  );
};

export default CardSpotlight;
