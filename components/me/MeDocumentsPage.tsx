'use client';

import { useEffect, useMemo, useState } from 'react';
import { useSession } from 'next-auth/react';
import { Button } from '@/components/ui/shadcn/button';
import Modal from '@/components/ui/Modal';
import {
  type EmployeeRecord,
  type PortalDocRow,
  daysUntilExpiry,
  documentValidityLabel,
  documentValidityToneClass,
  formatDate,
  InfoCard,
  upcomingPortalDocumentRow,
} from './shared';

export default function MeDocumentsPage() {
  const { data: session } = useSession();
  const [employee, setEmployee] = useState<EmployeeRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [viewingDoc, setViewingDoc] = useState<PortalDocRow | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (!session?.user?.linkedEmployeeId) {
        if (!cancelled) {
          setError('No employee portal is linked to your login.');
          setLoading(false);
        }
        return;
      }

      setLoading(true);
      setError(null);
      const res = await fetch('/api/me/employee', { cache: 'no-store' });
      const json = await res.json();
      if (cancelled) return;

      if (!res.ok || !json?.success) {
        setError(json?.error ?? 'Could not load documents.');
        setEmployee(null);
      } else {
        setEmployee(json.data as EmployeeRecord);
      }
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [session?.user?.linkedEmployeeId]);

  const portalDocuments = employee?.portalDocuments ?? [];
  const documentsOnFileCount = employee?.documentsOnFileCount ?? 0;
  const nextDocument = useMemo(() => upcomingPortalDocumentRow(portalDocuments), [portalDocuments]);

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-sm text-slate-500 dark:text-slate-400">
        Loading documents...
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-2xl border border-amber-300 bg-amber-50 p-6 text-sm text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
        {error}
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-5">
      <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-[0_18px_45px_rgba(15,23,42,0.06)] dark:border-slate-800 dark:bg-slate-900/80 dark:shadow-none sm:p-6">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900 dark:text-white">My documents</h1>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            Documents HR has shared with you in the employee portal.
          </p>
        </div>

        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          <InfoCard label="Documents on file" value={String(documentsOnFileCount)} subtle />
          <InfoCard
            label="Visible in portal"
            value={portalDocuments.length > 0 ? String(portalDocuments.length) : '-'}
            subtle
          />
        </div>

        {portalDocuments.length === 0 ? (
          <p className="mt-6 text-sm text-slate-500 dark:text-slate-400">
            {documentsOnFileCount > 0
              ? 'You have documents on file. HR has not shared details for self-service yet.'
              : 'No documents on file.'}
          </p>
        ) : (
          <div className="mt-6 space-y-3">
            {nextDocument ? (
              <p className="text-sm text-slate-600 dark:text-slate-300">
                Next expiry:{' '}
                <span className="font-medium text-slate-900 dark:text-white">
                  {nextDocument.name} · {formatDate(nextDocument.expiryDate)}
                </span>
                <span
                  className={`ml-2 font-medium ${documentValidityToneClass(daysUntilExpiry(nextDocument.expiryDate))}`}
                >
                  ({documentValidityLabel(daysUntilExpiry(nextDocument.expiryDate))})
                </span>
              </p>
            ) : null}
            <p className="text-xs text-slate-500 dark:text-slate-400">Click a document to view details.</p>
            <div className="overflow-hidden rounded-xl border border-slate-200 dark:border-slate-700">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-slate-200 bg-white text-xs uppercase text-slate-500 dark:border-slate-700 dark:bg-slate-900/60">
                  <tr>
                    <th className="px-3 py-2">Document</th>
                    <th className="px-3 py-2">Expiry</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                  {portalDocuments.map((doc) => {
                    const validityDays = daysUntilExpiry(doc.expiryDate);
                    return (
                    <tr
                      key={doc.id}
                      className="cursor-pointer text-slate-700 transition-colors hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800/70"
                      onClick={() => setViewingDoc(doc)}
                    >
                      <td className="px-3 py-2 font-medium text-slate-900 dark:text-white">{doc.name}</td>
                      <td className="px-3 py-2">
                        <div className="text-slate-600 dark:text-slate-400">{formatDate(doc.expiryDate)}</div>
                        <div className={`text-xs font-medium ${documentValidityToneClass(validityDays)}`}>
                          {documentValidityLabel(validityDays)}
                        </div>
                      </td>
                    </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>

      {viewingDoc && (
        <Modal isOpen onClose={() => setViewingDoc(null)} title={viewingDoc.name} size="lg">
          <div className="space-y-6">
            <dl className="grid gap-4 sm:grid-cols-2">
              <div>
                <dt className="text-xs font-medium uppercase tracking-wider text-slate-500">Type</dt>
                <dd className="mt-1 text-sm text-slate-900 dark:text-slate-100">{viewingDoc.documentType.name}</dd>
              </div>
              <div>
                <dt className="text-xs font-medium uppercase tracking-wider text-slate-500">Document number</dt>
                <dd className="mt-1 font-mono text-sm text-slate-900 dark:text-slate-100">{viewingDoc.documentNumber ?? '-'}</dd>
              </div>
              <div>
                <dt className="text-xs font-medium uppercase tracking-wider text-slate-500">Issue date</dt>
                <dd className="mt-1 text-sm text-slate-900 dark:text-slate-100">{formatDate(viewingDoc.issueDate)}</dd>
              </div>
              <div>
                <dt className="text-xs font-medium uppercase tracking-wider text-slate-500">Expiry date</dt>
                <dd className="mt-1 text-sm text-slate-900 dark:text-slate-100">
                  {formatDate(viewingDoc.expiryDate)}
                  {viewingDoc.expiryDate ? (
                    <span
                      className={`ml-2 text-xs font-medium ${documentValidityToneClass(daysUntilExpiry(viewingDoc.expiryDate))}`}
                    >
                      {documentValidityLabel(daysUntilExpiry(viewingDoc.expiryDate))}
                    </span>
                  ) : null}
                </dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="text-xs font-medium uppercase tracking-wider text-slate-500">Issuing authority</dt>
                <dd className="mt-1 text-sm text-slate-900 dark:text-slate-100">{viewingDoc.issuingAuthority ?? '-'}</dd>
              </div>
              {viewingDoc.notes ? (
                <div className="sm:col-span-2">
                  <dt className="text-xs font-medium uppercase tracking-wider text-slate-500">Notes</dt>
                  <dd className="mt-1 whitespace-pre-wrap text-sm text-slate-700 dark:text-slate-300">{viewingDoc.notes}</dd>
                </div>
              ) : null}
            </dl>
            <div className="flex justify-end gap-2 border-t border-slate-200 pt-4 dark:border-slate-700">
              <Button type="button" variant="ghost" onClick={() => setViewingDoc(null)}>
                Close
              </Button>
              {viewingDoc.canDownload ? (
                <Button
                  type="button"
                  onClick={() => {
                    window.open(`/api/me/documents/${viewingDoc.id}/download`, '_blank', 'noopener,noreferrer');
                  }}
                >
                  Download file
                </Button>
              ) : null}
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
