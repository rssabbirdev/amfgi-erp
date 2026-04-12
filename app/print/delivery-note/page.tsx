'use client';

import { useEffect, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { DocumentRenderer } from '@/components/print-builder/DocumentRenderer';
import { buildDataContext } from '@/lib/utils/templateData';
import { DEFAULT_DELIVERY_NOTE } from '@/lib/utils/documentDefaults';
import type { DocumentTemplate } from '@/lib/types/documentTemplate';

interface Transaction {
  id: string;
  companyId: string;
  isDeliveryNote: boolean;
  notes?: string;
  date: string;
  totalCost: number;
  quantity: number;
  material?: { name: string; unit: string; unitCost: number };
  job?: { jobNumber: string; description: string; site?: string; lpoNumber?: string; quotationNumber?: string };
}

interface Company {
  id: string;
  name: string;
  address?: string;
  phone?: string;
  email?: string;
  letterheadUrl?: string;
  printTemplates?: any[] | null;
}

export default function PrintDeliveryNotePage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const transactionId = searchParams.get('id');
  const templateId = searchParams.get('templateId');

  const [transaction, setTransaction] = useState<Transaction | null>(null);
  const [company, setCompany] = useState<Company | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      if (!transactionId) {
        toast.error('No transaction ID provided');
        router.back();
        return;
      }

      try {
        const txnRes = await fetch(`/api/transactions/${transactionId}`);

        if (!txnRes.ok) {
          toast.error('Transaction not found');
          router.back();
          return;
        }

        const txnData = await txnRes.json();
        const txn = txnData.data as Transaction;
        setTransaction(txn);

        // Must load the transaction's company — GET /api/companies returns a list, not one row with printTemplates.
        const cid = txn?.companyId;
        if (cid) {
          const companyRes = await fetch(`/api/companies/${cid}`);
          if (companyRes.ok) {
            const companyJson = await companyRes.json();
            setCompany(companyJson.data as Company);
          }
        }
      } catch (err) {
        console.error('Failed to load data:', err);
        toast.error('Failed to load transaction');
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [transactionId, router]);

  // Auto-print after data loads
  useEffect(() => {
    if (!loading && transaction && company) {
      // Small delay to let the renderer paint
      const timer = setTimeout(() => window.print(), 400);
      return () => clearTimeout(timer);
    }
  }, [loading, transaction, company]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <p style={{ color: '#666', fontFamily: 'Arial' }}>Loading document...</p>
      </div>
    );
  }

  if (!transaction || !company) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <p style={{ color: '#c00', fontFamily: 'Arial' }}>Failed to load data</p>
      </div>
    );
  }

  // Resolve template
  let template: DocumentTemplate = DEFAULT_DELIVERY_NOTE;
  if (company.printTemplates && Array.isArray(company.printTemplates)) {
    if (templateId) {
      const found = company.printTemplates.find((t: any) => t.id === templateId);
      if (found) template = found;
    } else {
      const defaultDN = company.printTemplates.find(
        (t: any) => t.itemType === 'delivery-note' && t.isDefault
      );
      if (defaultDN) template = defaultDN;
      else {
        const firstDN = company.printTemplates.find((t: any) => t.itemType === 'delivery-note');
        if (firstDN) template = firstDN;
      }
    }
  }

  const data = buildDataContext('delivery-note', transaction as any, company as any);

  return (
    <>
      {/* Print-specific CSS */}
      <style>{`
        /* Reset everything for print */
        *, *::before, *::after {
          box-sizing: border-box;
        }

        html, body {
          margin: 0;
          padding: 0;
          background: white;
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
        }

        @page {
          size: A4;
          margin: 0;
        }

        @media print {
          /* Hide screen-only controls */
          .screen-only {
            display: none !important;
          }

          /* Let tables break across pages with repeated headers */
          thead {
            display: table-header-group;
          }

          /* Prevent rows from splitting across pages */
          tr {
            page-break-inside: avoid;
            break-inside: avoid;
          }

          /* Prevent signatures from splitting */
          .document-renderer > div:last-child {
            page-break-inside: avoid;
            break-inside: avoid;
          }
        }

        @media screen {
          body {
            background: #e5e7eb;
          }
          .print-page-wrapper {
            max-width: 210mm;
            margin: 20px auto;
            box-shadow: 0 4px 20px rgba(0,0,0,0.15);
          }
        }
      `}</style>

      {/* Screen-only controls */}
      <div className="screen-only" style={{
        position: 'fixed', top: 0, left: 0, right: 0,
        padding: '12px 20px',
        background: '#1e293b',
        display: 'flex', alignItems: 'center', gap: '12px',
        zIndex: 100,
        boxShadow: '0 2px 10px rgba(0,0,0,0.3)',
      }}>
        <button
          onClick={() => window.print()}
          style={{
            padding: '8px 20px', background: '#059669', color: '#fff',
            border: 'none', borderRadius: '6px', cursor: 'pointer',
            fontWeight: 600, fontSize: '14px',
          }}
        >
          Print
        </button>
        <button
          onClick={() => window.close()}
          style={{
            padding: '8px 20px', background: '#475569', color: '#fff',
            border: 'none', borderRadius: '6px', cursor: 'pointer',
            fontWeight: 600, fontSize: '14px',
          }}
        >
          Close
        </button>
        <span style={{ color: '#94a3b8', fontSize: '13px', marginLeft: '8px' }}>
          {template.name} &mdash; DN #{(data as any).dn?.number ?? ''}
        </span>
      </div>

      {/* Spacer for the fixed header on screen */}
      <div className="screen-only" style={{ height: '60px' }} />

      {/* The actual document */}
      <div className="print-page-wrapper">
        <DocumentRenderer template={template} data={data} mode="print" />
      </div>
    </>
  );
}
