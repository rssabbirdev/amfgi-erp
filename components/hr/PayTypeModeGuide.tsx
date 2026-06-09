'use client';

import { formulaDefinitionForMode, substituteConfigInFormulaLines } from '@/lib/hr/payroll/payTypeFormulas';
import { labelForCompensationInput } from '@/lib/hr/payroll/formulaLabels';
import type { PayCalculationMode, PayTypeConfig } from '@/lib/hr/payroll/types';

const sectionClass = 'text-[11px] font-medium uppercase tracking-wide text-muted-foreground';

export default function PayTypeModeGuide({
  mode,
  config,
}: {
  mode: PayCalculationMode;
  config: PayTypeConfig;
}) {
  const def = formulaDefinitionForMode(mode);
  if (!def) return null;

  const formulaLines =
    mode === 'CUSTOM'
      ? def.formulaLines
      : substituteConfigInFormulaLines(mode, config);

  return (
    <div className="rounded-lg border border-border bg-muted/20 p-4 space-y-4">
      <div>
        <p className="text-sm font-medium">How this salary structure works</p>
        <p className="mt-0.5 text-xs text-muted-foreground">{def.label}</p>
      </div>

      {def.compensationInputs.length > 0 ? (
        <div>
          <p className={sectionClass}>Employee compensation must include</p>
          <ul className="mt-1.5 space-y-1 text-sm">
            {def.compensationInputs.map((key) => (
              <li key={key} className="flex items-baseline gap-2">
                <span className="text-primary">•</span>
                <span>{labelForCompensationInput(key)}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {def.configParameters.length > 0 ? (
        <div>
          <p className={sectionClass}>Settings you can adjust</p>
          <ul className="mt-1.5 space-y-1 text-sm text-muted-foreground">
            {def.configParameters.map((p) => {
              const value = p.key === 'otPercent' ? config.otPercent ?? p.defaultValue : p.defaultValue;
              return (
                <li key={p.key}>
                  <span className="text-foreground">{p.label}</span>
                  {value != null ? ` — currently ${value}` : ''}
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}

      <div>
        <p className={sectionClass}>Calculation steps</p>
        <ol className="mt-1.5 list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
          {formulaLines.map((line, i) => (
            <li key={i} className="leading-relaxed">
              {line}
            </li>
          ))}
        </ol>
      </div>

      {def.attendanceRules.length > 0 ? (
        <div>
          <p className={sectionClass}>Attendance rules</p>
          <ul className="mt-1.5 space-y-1 text-sm text-muted-foreground">
            {def.attendanceRules.map((rule, i) => (
              <li key={i} className="flex gap-2">
                <span className="shrink-0 text-primary">•</span>
                <span>{rule}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {mode === 'CUSTOM' ? (
        <p className="text-xs text-amber-700 dark:text-amber-300">
          Custom mode uses your formula script below. Variable names in the script match the labels in the
          formula editor help panel.
        </p>
      ) : null}
    </div>
  );
}
