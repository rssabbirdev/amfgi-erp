/**
 * Full-viewport shell for the print template builder (no app sidebar/header).
 * Lives under app/settings/... (not route groups) so /settings/print-template/edit resolves reliably.
 */
export default function PrintTemplateEditLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-dvh w-full flex-col overflow-hidden bg-slate-950 text-white antialiased">
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">{children}</div>
    </div>
  );
}
