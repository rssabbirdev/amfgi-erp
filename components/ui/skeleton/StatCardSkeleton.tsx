import { SkeletonBlock } from './SkeletonBlock';
import { SkeletonLine } from './SkeletonLine';

export function StatCardSkeleton() {
  return (
    <div className="bg-slate-800 border border-slate-700 rounded-lg p-6">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <SkeletonLine w="w-1/2" h="h-4" />
          <div className="mt-4">
            <SkeletonLine w="w-2/3" h="h-8" />
          </div>
        </div>
        <div className="ml-4">
          <SkeletonBlock w="w-12" h="h-12" />
        </div>
      </div>
    </div>
  );
}
