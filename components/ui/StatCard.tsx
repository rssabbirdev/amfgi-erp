import type { ReactNode } from 'react';

interface StatCardProps {
  title:     string;
  value:     string | number;
  icon:      ReactNode;
  sub?:      string;
  color?:    'green' | 'blue' | 'orange' | 'red';
}

const colorMap = {
  green:  'text-emerald-400 bg-emerald-500/10',
  blue:   'text-blue-400 bg-blue-500/10',
  orange: 'text-orange-400 bg-orange-500/10',
  red:    'text-red-400 bg-red-500/10',
};

export default function StatCard({ title, value, icon, sub, color = 'green' }: StatCardProps) {
  return (
    <div className="rounded-xl bg-slate-800 border border-slate-700 p-5 flex items-center gap-4">
      <div className={`rounded-lg p-3 ${colorMap[color]}`}>{icon}</div>
      <div className="min-w-0">
        <p className="text-sm text-slate-400 truncate">{title}</p>
        <p className="text-2xl font-bold text-white mt-0.5">{value}</p>
        {sub && <p className="text-xs text-slate-500 mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}
