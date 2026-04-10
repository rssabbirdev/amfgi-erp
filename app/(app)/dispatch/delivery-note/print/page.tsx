'use client';

import { useEffect, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { formatDate } from '@/lib/utils/formatters';
import toast from 'react-hot-toast';
import { TemplateRenderer } from '@/components/print-builder/TemplateRenderer';
import { buildDataContext } from '@/lib/utils/templateData';
import { DEFAULT_TEMPLATE } from '@/lib/utils/printDefaults';
import type { PrintTemplate, NamedPrintTemplate } from '@/lib/types/printTemplate';

interface Transaction {
  id: string;
  isDeliveryNote: boolean;
  notes?: string;
  date: string;
  totalCost: number;
  material?: { name: string; unit: string; unitCost: number };
  job?: { jobNumber: string; description: string };
}

interface Company {
  id: string;
  name: string;
  address?: string;
  phone?: string;
  email?: string;
  letterheadUrl?: string;
  printTemplates?: NamedPrintTemplate[] | null;
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
        const [txnRes, companyRes] = await Promise.all([
          fetch(`/api/transactions/${transactionId}`),
          fetch(`/api/companies`),
        ]);

        if (!txnRes.ok) {
          toast.error('Transaction not found');
          router.back();
          return;
        }

        const txnData = await txnRes.json();
        setTransaction(txnData.data);

        if (companyRes.ok) {
          const companyData = await companyRes.json();
          setCompany(companyData.data);
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

  useEffect(() => {
    if (!loading && transaction && company) {
      window.print();
    }
  }, [loading, transaction, company]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <p className="text-slate-500">Loading...</p>
      </div>
    );
  }

  if (!transaction || !company) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <p className="text-red-500">Failed to load data</p>
      </div>
    );
  }

  // Resolve template: templateId > isDefault for DN type > first DN template > DEFAULT_TEMPLATE
  let template: PrintTemplate | NamedPrintTemplate = DEFAULT_TEMPLATE;
  if (company.printTemplates && Array.isArray(company.printTemplates)) {
    if (templateId) {
      template = company.printTemplates.find((t: NamedPrintTemplate) => t.id === templateId) ?? DEFAULT_TEMPLATE;
    } else {
      // Find default for delivery-note
      const defaultDN = company.printTemplates.find(
        (t: NamedPrintTemplate) => t.itemType === 'delivery-note' && t.isDefault
      );
      if (defaultDN) {
        template = defaultDN;
      } else {
        // Find first delivery-note template
        const firstDN = company.printTemplates.find((t: NamedPrintTemplate) => t.itemType === 'delivery-note');
        if (firstDN) {
          template = firstDN;
        }
      }
    }
  }

  const data = buildDataContext('delivery-note', transaction as any, company as any);

  return (
    <>
      <style>{`
        @page {
          margin: 0;
          size: A4;
        }

        body {
          margin: 0;
          padding: 0;
          font-family: Arial, sans-serif;
          background: white;
        }

        .no-print {
          display: none;
        }

        @media screen {
          .no-print {
            display: block;
            position: fixed;
            top: 0;
            right: 0;
            padding: 20px;
            z-index: 1000;
          }

          .no-print button {
            padding: 10px 20px;
            margin-left: 10px;
            background: #0066cc;
            color: white;
            border: none;
            border-radius: 4px;
            cursor: pointer;
            font-weight: bold;
          }

          .no-print button:hover {
            background: #0052a3;
          }
        }
      `}</style>

      <div className="no-print">
        <button onClick={() => window.print()}>Print</button>
        <button onClick={() => router.back()} style={{ background: '#666' }}>Back</button>
      </div>

      <TemplateRenderer template={template} data={data as any} useCSSUnits={true} />
    </>
  );
}
