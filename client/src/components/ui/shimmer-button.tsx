/**
 * @file shimmer-button.tsx
 * @description Aceternity UI Shimmer Button.
 * Executive-grade button with high-precision moving light reflection along the perimeter.
 * Supports both Dark and Light themes.
 */

import React from 'react';
import { cn } from '@/lib/utils';

export interface ShimmerButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  shimmerColor?: string;
  shimmerSize?: string;
  borderRadius?: string;
  shimmerDuration?: string;
  background?: string;
  className?: string;
  children?: React.ReactNode;
}

export const ShimmerButton = React.forwardRef<HTMLButtonElement, ShimmerButtonProps>(
  (
    {
      shimmerColor,
      shimmerSize = '0.05em',
      shimmerDuration = '3s',
      borderRadius = '12px',
      background,
      className,
      children,
      ...props
    },
    ref
  ) => {
    return (
      <button
        ref={ref}
        style={
          {
            '--spread': '90deg',
            '--shimmer-color': shimmerColor || '#94a3b8',
            '--radius': borderRadius,
            '--speed': shimmerDuration,
            '--cut': shimmerSize,
          } as React.CSSProperties
        }
        className={cn(
          'group relative z-0 flex cursor-pointer items-center justify-center overflow-hidden whitespace-nowrap border border-neutral-300 dark:border-white/10 px-5 py-2.5 text-xs font-mono font-medium text-neutral-900 dark:text-white [border-radius:var(--radius)] transition-all duration-300 hover:scale-[1.01] hover:border-neutral-400 dark:hover:border-white/20 active:scale-[0.99] disabled:pointer-events-none disabled:opacity-50',
          className
        )}
        {...props}
      >
        {/* Subtle moving sheen */}
        <div
          className={cn(
            '-z-30 blur-[2px]',
            'absolute inset-0 overflow-visible [container-type:size]'
          )}
        >
          <div className="absolute inset-0 h-[100cqh] animate-shimmer-slide [aspect-ratio:1] [border-radius:0] [mask:none]">
            <div className="animate-spin-around absolute -inset-full w-auto rotate-0 [background:conic-gradient(from_calc(270deg-(var(--spread)*0.5)),transparent_0,var(--shimmer-color)_var(--spread),transparent_var(--spread))] [translate:0_0]" />
          </div>
        </div>

        {/* Backdrop overlay */}
        <div className="absolute inset-[1px] -z-20 rounded-[inherit] bg-neutral-100 dark:bg-[#0d1017] transition-colors group-hover:bg-neutral-200 dark:group-hover:bg-[#121622]" />

        {/* Content */}
        <span className="relative z-10 flex items-center gap-2">{children}</span>
      </button>
    );
  }
);

ShimmerButton.displayName = 'ShimmerButton';

export default ShimmerButton;
