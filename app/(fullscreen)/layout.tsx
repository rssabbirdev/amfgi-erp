/**
 * Full-viewport shell for tools that need the whole screen (no app sidebar/header).
 */
export default function FullscreenLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-dvh w-full flex-col overflow-hidden bg-slate-950 text-white antialiased">
      <div className="flex min-h-0 flex-1 flex-col">{children}</div>
    </div>
  );
}
