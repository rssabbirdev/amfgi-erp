'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';

import { Badge } from '@/components/ui/shadcn/badge';
import { Button } from '@/components/ui/shadcn/button';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/shadcn/card';
import { Input } from '@/components/ui/shadcn/input';
import Modal from '@/components/ui/Modal';
import { cn } from '@/lib/utils';
import type { ContextMenuOption } from '@/components/ui/ContextMenu';
import type { DocumentTemplate, ItemType } from '@/lib/types/documentTemplate';
import { ITEM_TYPE_LABELS, getItemTypeLabel } from '@/lib/utils/itemTypeFields';
import { KNOWN_ITEM_TYPES } from '@/lib/types/documentTemplate';
import { useGlobalContextMenu } from '@/providers/ContextMenuProvider';
import { NEW_PRINT_TEMPLATE_SESSION_KEY } from '@/lib/utils/printTemplateSession';
import {
  readCompanyDocumentTemplates,
  writeCompanyDocumentTemplates,
} from '@/lib/utils/companyPrintTemplates';
import { createWorkScheduleTemplateDraft } from '@/lib/utils/documentDefaults';
import {
  canAccessSettingsPrintFormat,
  type SettingsAccessUser,
} from '@/lib/auth/settingsAccess';

function TemplateMetaBadge({ isDefault, itemType }: { isDefault: boolean; itemType: string }) {
  const label = isDefault ? 'Default' : getItemTypeLabel(String(itemType));
  return (
    <Badge
      variant="outline"
      className={cn(
        'text-[10px] font-semibold uppercase tracking-wide',
        isDefault
          ? 'border-emerald-500/35 bg-emerald-500/10 text-emerald-800 dark:text-emerald-200'
          : 'border-border bg-muted/40 text-muted-foreground',
      )}
    >
      {label}
    </Badge>
  );
}

function toSettingsUser(session: ReturnType<typeof useSession>['data']): SettingsAccessUser {
  return {
    isSuperAdmin: session?.user?.isSuperAdmin ?? false,
    permissions: (session?.user?.permissions ?? []) as string[],
  };
}

export function PrintFormatSettingsPanel() {
  const { data: session } = useSession();
  const router = useRouter();
  const { openMenu: openContextMenu } = useGlobalContextMenu();

  const canAccess = canAccessSettingsPrintFormat(toSettingsUser(session));

  const [companyPrintTemplatesRaw, setCompanyPrintTemplatesRaw] = useState<unknown>(undefined);
  const [templates, setTemplates] = useState<DocumentTemplate[]>([]);
  const [newTplModal, setNewTplModal] = useState(false);
  const [newTplForm, setNewTplForm] = useState({
    name: '',
    itemType: 'delivery-note' as ItemType,
    customItemKind: '',
  });
  const [tplSaving, setTplSaving] = useState(false);

  useEffect(() => {
    if (!session?.user?.activeCompanyId) return;
    const loadCompanyPrintTemplates = async () => {
      try {
        const res = await fetch(`/api/companies/${session.user.activeCompanyId}`);
        if (res.ok) {
          const data = await res.json();
          const company = data.data;
          setCompanyPrintTemplatesRaw(company.printTemplates);
          const parsedTemplates = readCompanyDocumentTemplates(company.printTemplates);
          if (parsedTemplates.length > 0) {
            setTemplates(parsedTemplates);
          } else if (company.printTemplate) {
            setTemplates([company.printTemplate]);
          } else {
            setTemplates([]);
          }
        }
      } catch (err) {
        console.error('Failed to load company print templates:', err);
      }
    };
    void loadCompanyPrintTemplates();
  }, [session?.user?.activeCompanyId]);

  const handleTemplateDelete = async (index: number) => {
    if (!session?.user?.activeCompanyId) return;
    if (!window.confirm('Delete this template?')) return;

    setTplSaving(true);
    try {
      const newTemplates = templates.filter((_, i) => i !== index);
      const res = await fetch(`/api/companies/${session.user.activeCompanyId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          printTemplates: writeCompanyDocumentTemplates(companyPrintTemplatesRaw, newTemplates),
        }),
      });

      if (res.ok) {
        setTemplates(newTemplates);
        setCompanyPrintTemplatesRaw(writeCompanyDocumentTemplates(companyPrintTemplatesRaw, newTemplates));
        toast.success('Template deleted');
      } else {
        toast.error('Failed to delete template');
      }
    } catch {
      toast.error('Failed to delete template');
    } finally {
      setTplSaving(false);
    }
  };

  const handleTemplateDuplicate = async (index: number) => {
    const original = templates[index];
    const duplicated: DocumentTemplate = {
      ...original,
      id: `template-${Date.now()}`,
      name: `${original.name} (Copy)`,
      isDefault: false,
    };

    if (!session?.user?.activeCompanyId) return;
    setTplSaving(true);
    try {
      const newTemplates = [...templates, duplicated];
      const res = await fetch(`/api/companies/${session.user.activeCompanyId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          printTemplates: writeCompanyDocumentTemplates(companyPrintTemplatesRaw, newTemplates),
        }),
      });

      if (res.ok) {
        setTemplates(newTemplates);
        setCompanyPrintTemplatesRaw(writeCompanyDocumentTemplates(companyPrintTemplatesRaw, newTemplates));
        toast.success('Template duplicated');
      } else {
        toast.error('Failed to duplicate template');
      }
    } catch {
      toast.error('Failed to duplicate template');
    } finally {
      setTplSaving(false);
    }
  };

  const handleSetDefault = async (index: number) => {
    const itemType = templates[index].itemType;
    const newTemplates = templates.map((t, i) => ({
      ...t,
      isDefault: t.itemType === itemType && i === index,
    }));

    if (!session?.user?.activeCompanyId) return;
    setTplSaving(true);
    try {
      const res = await fetch(`/api/companies/${session.user.activeCompanyId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          printTemplates: writeCompanyDocumentTemplates(companyPrintTemplatesRaw, newTemplates),
        }),
      });

      if (res.ok) {
        setTemplates(newTemplates);
        setCompanyPrintTemplatesRaw(writeCompanyDocumentTemplates(companyPrintTemplatesRaw, newTemplates));
        toast.success('Default template set');
      } else {
        toast.error('Failed to set default');
      }
    } catch {
      toast.error('Failed to set default');
    } finally {
      setTplSaving(false);
    }
  };

  const closeNewTemplateModal = () => {
    setNewTplModal(false);
    setNewTplForm({ name: '', itemType: 'delivery-note', customItemKind: '' });
  };

  if (!canAccess) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Print format</CardTitle>
          <CardDescription>You do not have permission to manage print formats.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <>
      <div className="space-y-4">
        <div className="flex justify-end">
          <Button type="button" size="sm" onClick={() => setNewTplModal(true)} disabled={tplSaving}>
            + New Template
          </Button>
        </div>

        {templates.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border bg-muted/20 py-12 text-center">
            <p className="mb-4 text-muted-foreground">No print formats saved yet.</p>
            <Button type="button" onClick={() => setNewTplModal(true)}>
              + New Template
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            {templates.map((tpl, idx) => (
              <div
                key={tpl.id || `tpl-${idx}`}
                className="flex items-center justify-between rounded-lg border border-border bg-card p-4 shadow-sm transition-colors hover:bg-muted/30"
                onContextMenu={(e) => {
                  e.preventDefault();
                  const options: ContextMenuOption[] = [
                    {
                      label: 'Edit',
                      icon: (
                        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                          />
                        </svg>
                      ),
                      action: () => router.push(`/settings/print-template/edit?id=${encodeURIComponent(tpl.id)}`),
                    },
                    { divider: true },
                    {
                      label: 'Duplicate',
                      icon: (
                        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
                          />
                        </svg>
                      ),
                      action: () => handleTemplateDuplicate(idx),
                    },
                    {
                      label: tpl.isDefault ? 'Unset as Default' : 'Set as Default',
                      icon: (
                        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.381-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"
                          />
                        </svg>
                      ),
                      action: () => handleSetDefault(idx),
                    },
                    { divider: true },
                    {
                      label: 'Delete',
                      icon: (
                        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                          />
                        </svg>
                      ),
                      action: () => handleTemplateDelete(idx),
                      danger: true,
                    },
                  ];
                  openContextMenu(e.clientX, e.clientY, options);
                }}
              >
                <div className="flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-medium text-foreground">{tpl.name}</h3>
                    <TemplateMetaBadge isDefault={tpl.isDefault} itemType={String(tpl.itemType)} />
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">{tpl.itemType}</p>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  onClick={() => router.push(`/settings/print-template/edit?id=${encodeURIComponent(tpl.id)}`)}
                  disabled={tplSaving}
                >
                  Edit
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>

      <Modal isOpen={newTplModal} onClose={closeNewTemplateModal} title="Create New Template">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!newTplForm.name.trim()) {
              toast.error('Template name is required');
              return;
            }
            const kind = newTplForm.customItemKind.trim().replace(/\s+/g, '-') || newTplForm.itemType;
            const newTemplate: DocumentTemplate =
              kind === 'work-schedule'
                ? createWorkScheduleTemplateDraft(`template-${Date.now()}`, newTplForm.name)
                : {
                    id: `template-${Date.now()}`,
                    name: newTplForm.name,
                    itemType: kind as ItemType,
                    isDefault: false,
                    pageMargins: { top: 10, right: 12, bottom: 10, left: 12 },
                    sections: [],
                    canvasMode: true,
                    canvasRects: [],
                  };
            try {
              sessionStorage.setItem(
                NEW_PRINT_TEMPLATE_SESSION_KEY,
                JSON.stringify({
                  template: newTemplate,
                  insertIndex: templates.length,
                }),
              );
            } catch {
              toast.error('Could not start editor (storage blocked).');
              return;
            }
            closeNewTemplateModal();
            router.push('/settings/print-template/edit?new=1');
          }}
          className="space-y-4"
        >
          <div className="space-y-2">
            <label htmlFor="new-template-name" className="text-sm font-medium text-foreground">
              Template name *
            </label>
            <Input
              id="new-template-name"
              type="text"
              value={newTplForm.name}
              onChange={(e) => setNewTplForm({ ...newTplForm, name: e.target.value })}
              placeholder="e.g., Delivery Note - Standard"
              autoFocus
              required
            />
          </div>
          <div className="space-y-3">
            <span className="text-sm font-medium text-foreground">Document type *</span>
            <div className="grid grid-cols-2 gap-2 sm:gap-3">
              {KNOWN_ITEM_TYPES.map((type) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => setNewTplForm({ ...newTplForm, itemType: type, customItemKind: '' })}
                  className={cn(
                    'rounded-lg border-2 p-3 text-left text-sm font-medium transition-colors',
                    newTplForm.itemType === type && !newTplForm.customItemKind.trim()
                      ? 'border-primary bg-primary/10 text-foreground'
                      : 'border-border bg-muted/30 text-muted-foreground hover:border-muted-foreground/40 hover:text-foreground',
                  )}
                >
                  {ITEM_TYPE_LABELS[type]}
                </button>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              Or enter a custom document kind (slug, e.g. <code className="text-foreground">work-order</code>). Register
              fields in code with <code className="text-foreground">registerPrintItemTypeFields</code>, or the builder
              will show the merged field catalog.
            </p>
            <Input
              type="text"
              value={newTplForm.customItemKind}
              onChange={(e) => setNewTplForm({ ...newTplForm, customItemKind: e.target.value })}
              placeholder="Custom kind (optional)…"
            />
          </div>
          <div className="flex gap-3 border-t border-border pt-4">
            <Button type="button" variant="outline" className="flex-1" onClick={closeNewTemplateModal}>
              Cancel
            </Button>
            <Button type="submit" className="flex-1">
              Create & edit
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}
