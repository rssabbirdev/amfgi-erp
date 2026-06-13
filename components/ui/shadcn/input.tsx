import * as React from 'react';

import { cn } from '@/lib/utils';
import { createBlockInputWheelRef } from '@/lib/utils/blockInputWheelChange';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {}

const Input = React.forwardRef<HTMLInputElement, InputProps>(({ className, type = 'text', onKeyDown, ...props }, ref) => {
  const inputRef = type === 'number' ? createBlockInputWheelRef(ref) : ref;

  return (
    <input
      ref={inputRef}
      type={type}
      onKeyDown={(event) => {
        if (type === 'number' && (event.key === 'ArrowUp' || event.key === 'ArrowDown')) {
          event.preventDefault();
        }
        onKeyDown?.(event);
      }}
      className={cn(
        'flex h-9 w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm text-foreground',
        'placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        'disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      {...props}
    />
  );
});
Input.displayName = 'Input';

export { Input };

