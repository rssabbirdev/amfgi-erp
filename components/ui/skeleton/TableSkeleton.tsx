import { SkeletonLine } from './SkeletonLine';

const columnWidths = ['w-3/4', 'w-1/2', 'w-2/3', 'w-1/3', 'w-1/2'];

export function TableSkeleton({ rows = 5, columns = 5 }: { rows?: number; columns?: number }) {
  return (
    <>
      {Array.from({ length: rows }).map((_, rowIdx) => (
        <tr key={`skeleton-row-${rowIdx}`} className="border-b border-slate-700/50" suppressHydrationWarning>
          {Array.from({ length: columns }).map((_, colIdx) => {
            const widthClass = columnWidths[colIdx % columnWidths.length];
            return (
              <td key={`skeleton-col-${rowIdx}-${colIdx}`} className="px-6 py-3" suppressHydrationWarning>
                <SkeletonLine w={widthClass} h="h-4" />
              </td>
            );
          })}
        </tr>
      ))}
    </>
  );
}
