'use client';

type Props = {
  portalViewEnabled: boolean;
  portalDownloadEnabled: boolean;
  onPortalViewChange: (enabled: boolean) => void;
  onPortalDownloadChange: (enabled: boolean) => void;
  labelClass: string;
  checkboxClass?: string;
};

export function DocumentPortalSelfServiceFields({
  portalViewEnabled,
  portalDownloadEnabled,
  onPortalViewChange,
  onPortalDownloadChange,
  labelClass,
  checkboxClass = 'h-4 w-4 rounded border-white/20 bg-slate-950 text-emerald-600',
}: Props) {
  return (
    <div className="sm:col-span-2 rounded-xl border border-white/10 bg-slate-950/40 p-4 space-y-3">
      <div>
        <h4 className="text-sm font-medium text-white">Employee portal</h4>
        <p className="mt-1 text-xs text-slate-500">
          Control what this employee can see in self-service. Without view access, only the total document count is shown.
        </p>
      </div>
      <label className="flex items-start gap-3">
        <input
          type="checkbox"
          name="portalViewEnabled"
          checked={portalViewEnabled}
          onChange={(e) => {
            const enabled = e.target.checked;
            onPortalViewChange(enabled);
            if (!enabled) onPortalDownloadChange(false);
          }}
          className={`mt-0.5 ${checkboxClass}`}
        />
        <span>
          <span className={`block ${labelClass} normal-case tracking-normal text-slate-300`}>
            View document in self-service
          </span>
          <span className="mt-1 block text-xs text-slate-500">
            Employee can open document details in their portal.
          </span>
        </span>
      </label>
      <label className={`flex items-start gap-3 ${portalViewEnabled ? '' : 'opacity-50'}`}>
        <input
          type="checkbox"
          name="portalDownloadEnabled"
          checked={portalViewEnabled && portalDownloadEnabled}
          disabled={!portalViewEnabled}
          onChange={(e) => onPortalDownloadChange(e.target.checked)}
          className={`mt-0.5 ${checkboxClass}`}
        />
        <span>
          <span className={`block ${labelClass} normal-case tracking-normal text-slate-300`}>
            Allow download from self-service
          </span>
          <span className="mt-1 block text-xs text-slate-500">
            Requires view access. Employee can download the saved file when one is attached.
          </span>
        </span>
      </label>
    </div>
  );
}
