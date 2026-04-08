export function SkeletonBlock({ w = 'w-full', h = 'h-32' }: { w?: string; h?: string }) {
  return <div className={`${w} ${h} bg-slate-700/60 rounded-lg animate-pulse`} />;
}
