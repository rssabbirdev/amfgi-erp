'use client';

import { useCallback, useState } from 'react';

import { Button } from '@/components/ui/shadcn/button';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/shadcn/collapsible';
import {
  FORMULA_FUNCTION_META,
  FORMULA_VARIABLE_META,
  labelForFormulaVariable,
} from '@/lib/hr/payroll/formulaLabels';
import { FORMULA_VARIABLE_GROUPS } from '@/lib/hr/payroll/formulaEngine';
import { formulaScriptForMode } from '@/lib/hr/payroll/formulaModeScripts';
import type { PayCalculationMode } from '@/lib/hr/payroll/types';

export default function PayFormulaBuilder({
  mode,
  formulaScript,
  onFormulaScriptChange,
  onSwitchToCustom,
  readOnly,
}: {
  mode: PayCalculationMode;
  formulaScript: string;
  onFormulaScriptChange: (script: string) => void;
  onSwitchToCustom: () => void;
  readOnly?: boolean;
}) {
  const [helpOpen, setHelpOpen] = useState(true);

  const insertToken = useCallback(
    (token: string) => {
      onFormulaScriptChange(formulaScript ? `${formulaScript.trimEnd()}\n${token}` : token);
    },
    [formulaScript, onFormulaScriptChange]
  );

  const loadTemplate = () => {
    onFormulaScriptChange(formulaScriptForMode(mode === 'CUSTOM' ? 'MONTHLY_CALENDAR_DEDUCT' : mode));
  };

  const isCustom = mode === 'CUSTOM';

  if (!isCustom) {
    if (readOnly) return null;
    return (
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-dashed border-border px-3 py-3">
        <div>
          <p className="text-sm font-medium">Need a different calculation?</p>
          <p className="text-xs text-muted-foreground">
            Built-in modes above cover most cases. Switch to custom only if you need your own formula.
          </p>
        </div>
        <Button type="button" size="sm" variant="outline" onClick={onSwitchToCustom}>
          Use custom formula
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-3 rounded-lg border border-border p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-medium">Custom formula script</p>
          <p className="text-xs text-muted-foreground">
            One calculation per line. The last line must set <span className="font-mono">gross</span> to the
            final pay amount.
          </p>
        </div>
        {!readOnly ? (
          <Button type="button" size="sm" variant="ghost" onClick={loadTemplate}>
            Load example
          </Button>
        ) : null}
      </div>

      <textarea
        className="min-h-[160px] w-full rounded-md border border-border bg-background p-3 font-mono text-xs leading-relaxed"
        value={formulaScript}
        readOnly={readOnly}
        onChange={(e) => onFormulaScriptChange(e.target.value)}
        spellCheck={false}
        placeholder={'daily_rate = monthly_basic / days_in_month\ndeduction = absent_days * daily_rate\ngross = monthly_basic - deduction'}
      />

      {!readOnly ? (
        <Collapsible open={helpOpen} onOpenChange={setHelpOpen}>
          <CollapsibleTrigger asChild>
            <Button type="button" variant="ghost" size="sm" className="h-8 px-2 text-xs">
              {helpOpen ? 'Hide formula reference' : 'Show formula reference'}
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="space-y-4 pt-3">
            <p className="text-xs text-muted-foreground">
              Click a name to insert its code into the script. Each item shows what it means in plain language.
            </p>

            {FORMULA_VARIABLE_GROUPS.map((group) => (
              <div key={group.label}>
                <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  {group.label}
                </p>
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  {group.vars.map((v) => {
                    const meta = FORMULA_VARIABLE_META[v];
                    return (
                      <button
                        key={v}
                        type="button"
                        className="rounded-md border border-border bg-background px-3 py-2 text-left hover:bg-muted/50"
                        onClick={() => insertToken(v)}
                      >
                        <p className="text-sm font-medium">{meta?.label ?? labelForFormulaVariable(v)}</p>
                        <p className="font-mono text-[10px] text-muted-foreground">{v}</p>
                        {meta?.description ? (
                          <p className="mt-1 text-[11px] text-muted-foreground leading-snug">{meta.description}</p>
                        ) : null}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}

            <div>
              <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Functions</p>
              <ul className="mt-2 space-y-2">
                {FORMULA_FUNCTION_META.map((fn) => (
                  <li
                    key={fn.signature}
                    className="rounded-md border border-border bg-muted/20 px-3 py-2"
                  >
                    <button
                      type="button"
                      className="font-mono text-xs text-foreground hover:underline"
                      onClick={() => insertToken(fn.signature.replace('...', ''))}
                    >
                      {fn.signature}
                    </button>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">{fn.description}</p>
                  </li>
                ))}
              </ul>
            </div>
          </CollapsibleContent>
        </Collapsible>
      ) : null}
    </div>
  );
}
