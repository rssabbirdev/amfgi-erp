'use client';

import { Suspense, useCallback, useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter, useSearchParams } from 'next/navigation';
import toast from 'react-hot-toast';
import { TemplateBuilder } from '@/components/print-builder/TemplateBuilder';
import type { DocumentTemplate } from '@/lib/types/documentTemplate';
import {
  NEW_PRINT_TEMPLATE_SESSION_KEY,
  type NewPrintTemplateDraft,
} from '@/lib/utils/printTemplateSession';
import {
  readCompanyDocumentTemplates,
  writeCompanyDocumentTemplates,
} from '@/lib/utils/companyPrintTemplates';

function PrintTemplateEditInner() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const searchParams = useSearchParams();
  const idParam = searchParams.get('id');
  const isNew = searchParams.get('new') === '1';

  const [loading, setLoading] = useState(true);
  const [templates, setTemplates] = useState<DocumentTemplate[]>([]);
  const [companyData, setCompanyData] = useState<Record<string, unknown> | null>(null);
  const [workingTemplate, setWorkingTemplate] = useState<DocumentTemplate | null>(null);
  const [editorIndex, setEditorIndex] = useState<number>(-1);
  const [dirty, setDirty] = useState(false);

  const perms = (session?.user?.permissions ?? []) as string[];
  const isSA = session?.user?.isSuperAdmin ?? false;
  const canManage = isSA || perms.includes('settings.manage');

  const load = useCallback(async () => {
    if (!session?.user?.activeCompanyId) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/companies/${session.user.activeCompanyId}`);
      if (!res.ok) throw new Error('Failed to load company');
      const json = await res.json();
      const company = json.data ?? json;
      setCompanyData(company);
      let list: DocumentTemplate[] = readCompanyDocumentTemplates(company.printTemplates);
      if (list.length === 0 && company.printTemplate) {
        list = [company.printTemplate];
      }
      setTemplates(list);

      if (isNew) {
        const raw = sessionStorage.getItem(NEW_PRINT_TEMPLATE_SESSION_KEY);
        if (!raw) {
          toast.error('Create a new template from Settings first.');
          setLoading(false);
          router.replace('/settings?tab=template');
          return;
        }
        let draft: NewPrintTemplateDraft;
        try {
          draft = JSON.parse(raw) as NewPrintTemplateDraft;
        } catch {
          toast.error('Invalid new-template draft.');
          setLoading(false);
          router.replace('/settings?tab=template');
          return;
        }
        setWorkingTemplate(draft.template);
        setEditorIndex(
          typeof draft.insertIndex === 'number' ? draft.insertIndex : list.length
        );
      } else if (idParam) {
        const found = list.find((t) => t.id === idParam);
        if (!found) {
          toast.error('Template not found.');
          setLoading(false);
          router.replace('/settings?tab=template');
          return;
        }
        setWorkingTemplate(found);
        setEditorIndex(list.findIndex((t) => t.id === idParam));
      } else {
        router.replace('/settings?tab=template');
      }
    } catch (e) {
      console.error(e);
      toast.error('Failed to load data');
      router.replace('/settings?tab=template');
    } finally {
      setLoading(false);
    }
  }, [session?.user?.activeCompanyId, idParam, isNew, router]);

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.replace('/login');
      return;
    }
    if (status === 'authenticated' && !canManage) {
      toast.error('You do not have access to print templates.');
      router.replace('/settings');
      return;
    }
    if (status === 'authenticated' && canManage) void load();
  }, [status, load, router, canManage]);

  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [dirty]);

  const handleSave = async (updated: DocumentTemplate) => {
    if (!session?.user?.activeCompanyId) {
      toast.error('No active company');
      throw new Error('No active company');
    }
    try {
      let newTemplates: DocumentTemplate[];
      const wasEditingExistingSlot = editorIndex >= 0 && editorIndex < templates.length;
      const normalizedUpdated =
        wasEditingExistingSlot && templates[editorIndex]
          ? {
              ...templates[editorIndex],
              ...updated,
              id: templates[editorIndex].id,
              itemType: updated.itemType ?? templates[editorIndex].itemType,
              isDefault:
                typeof updated.isDefault === 'boolean'
                  ? updated.isDefault
                  : templates[editorIndex].isDefault,
            }
          : updated;
      if (wasEditingExistingSlot) {
        newTemplates = templates.map((t, i) => (i === editorIndex ? normalizedUpdated : t));
      } else {
        newTemplates = [...templates, normalizedUpdated];
      }

      const res = await fetch(`/api/companies/${session.user.activeCompanyId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          printTemplates: writeCompanyDocumentTemplates(companyData?.printTemplates, newTemplates),
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast.error(err.error || 'Failed to save template');
        throw new Error('SAVE_FAILED');
      }

      if (isNew) sessionStorage.removeItem(NEW_PRINT_TEMPLATE_SESSION_KEY);
      setTemplates(newTemplates);
      setWorkingTemplate(normalizedUpdated);
      if (wasEditingExistingSlot) {
        setEditorIndex(newTemplates.findIndex((t) => t.id === normalizedUpdated.id));
      } else {
        setEditorIndex(newTemplates.length - 1);
      }
      toast.success(wasEditingExistingSlot ? 'Template saved' : 'Template created and saved');
      if (isNew && normalizedUpdated.id) {
        router.replace(`/settings/print-template/edit?id=${encodeURIComponent(normalizedUpdated.id)}`, {
          scroll: false,
        });
      }
    } catch (e) {
      if (e instanceof Error && e.message === 'SAVE_FAILED') throw e;
      if (e instanceof Error && e.message === 'No active company') throw e;
      console.error(e);
      toast.error('Failed to save template');
      throw e;
    }
  };

  const handleClose = () => {
    router.push('/settings?tab=template');
  };

  if (status === 'loading' || loading || !workingTemplate) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center bg-slate-100 text-sm text-slate-500 dark:bg-slate-950 dark:text-slate-400">
        Loading editor...
      </div>
    );
  }

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-slate-100 dark:bg-slate-950">
      <TemplateBuilder
        key={workingTemplate.id}
        template={workingTemplate}
        letterheadUrl={companyData?.letterheadUrl as string | undefined}
        companyId={session?.user?.activeCompanyId ?? undefined}
        companySnapshot={companyData}
        onSave={handleSave}
        onClose={handleClose}
        onDirtyChange={setDirty}
      />
    </div>
  );
}

export default function PrintTemplateEditPage() {
  return (
    <div className="flex min-h-0 flex-1 flex-col bg-slate-100 dark:bg-slate-950">
      <Suspense
        fallback={
          <div className="flex flex-1 flex-col items-center justify-center bg-slate-100 text-sm text-slate-500 dark:bg-slate-950 dark:text-slate-400">
            Loading editor...
          </div>
        }
      >
        <PrintTemplateEditInner />
      </Suspense>
    </div>
  );
}
