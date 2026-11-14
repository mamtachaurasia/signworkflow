import { LoaderPinwheel } from 'lucide-react';
import { cn } from '@/lib/utils';

interface LoaderProps {
  text?: string;
  size?: number;
  className?: string;
}

export function Loader({
  text = 'Loading...',
  size = 40,
  className = '',
}: LoaderProps) {
  return (
    <div className={cn('flex flex-col items-center justify-center gap-4', className)}>
      <LoaderPinwheel className="animate-spin shrink-0 text-brand-600" size={size} />
      <span className="text-sm font-medium text-muted-foreground">{text}</span>
    </div>
  );
}
