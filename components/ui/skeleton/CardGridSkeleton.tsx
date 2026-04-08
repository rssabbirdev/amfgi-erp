import { SkeletonBlock } from './SkeletonBlock';

export function CardGridSkeleton({ count = 6, cols = 'grid-cols-3' }: { count?: number; cols?: string }) {
  return (
    <div className={`grid ${cols} gap-4`}>
      {Array.from({ length: count }).map((_, idx) => (
        <SkeletonBlock key={idx} w="w-full" h="h-48" />
      ))}
    </div>
  );
}
