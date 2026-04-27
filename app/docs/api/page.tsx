'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import toast from 'react-hot-toast';
import { API_DOC_SECTIONS, authLabel, type ApiEndpointDoc } from '@/lib/docs/apiEndpoints';

type DocsTheme = 'light' | 'dark';
type IntegrationExampleKey = 'job' | 'customer' | 'supplier';

const INTEGRATION_EXAMPLES: Record<
  IntegrationExampleKey,
  {
    label: string;
    endpoint: string;
    summary: string;
    payload: string;
  }
> = {
  job: {
    label: 'Job upsert',
    endpoint: '/api/integrations/jobs/upsert',
    summary:
      'Creates or updates parent jobs and variations. customerExternalId is matched against Customer.externalPartyId; if missing, AMFGI syncs the third-party customer list and retries.',
    payload: JSON.stringify(
      {
        companyExternalId: 'PM-COMPANY-001',
        job: {
          externalJobId: 'PM-JOB-001',
          parentExternalJobId: 'PM-PARENT-001',
          jobNumber: 'JOB-2026-001-1',
          customerExternalId: 10001,
          customerName: 'Demo Customer LLC',
          description: 'Variation 1 - GRP lining scope',
          site: 'Jebel Ali Site',
          projectName: 'Demo Swimming Pool Project',
          projectDetails: 'Parent holds reporting; variation holds budget and dispatch costing.',
          status: 'ACTIVE',
          startDate: '2026-04-25',
          endDate: '2026-12-31',
          quotationNumber: 'QTN-2026-001',
          quotationDate: '2026-04-25',
          lpoNumber: 'LPO-2026-001',
          lpoDate: '2026-04-25',
          lpoValue: 125000,
          address: 'Plot 12, Jebel Ali Industrial Area 1, Dubai',
          locationName: 'Site gate A',
          locationLat: 25.0048,
          locationLng: 55.1428,
          contacts: [
            {
              label: 'site',
              name: 'John Smith',
              number: '+971500000000',
              email: 'john@example.com',
              designation: 'Site Engineer',
            },
          ],
          contactPerson: 'John Smith',
          salesPerson: 'Ali Khan',
          externalUpdatedAt: '2026-04-25T10:00:00Z',
        },
      },
      null,
      2
    ),
  },
  customer: {
    label: 'Customer upsert',
    endpoint: '/api/integrations/customers/upsert',
    summary:
      'Creates or updates customers and stores externalPartyId. Future job sync uses customerExternalId to assign this customer instead of creating duplicates.',
    payload: JSON.stringify(
      {
        companyExternalId: 'PM-COMPANY-001',
        customer: {
          externalPartyId: 10001,
          name: 'Demo Customer LLC',
          contactPerson: 'John Smith',
          phone: '+971500000000',
          email: 'accounts@demo-customer.example',
          address: 'Business Bay, Dubai',
          isActive: true,
          trade_license_number: 'TL-10001',
          trade_license_authority: 'Dubai Economy',
          trade_license_expiry: '2027-12-31',
          trn_number: '100000000000001',
          trn_expiry: '2028-01-15',
          contacts: [
            {
              id: 501,
              contact_name: 'John Smith',
              email: 'john@example.com',
              phone: '+971500000000',
              sort_order: 0,
              created_at: '2026-04-25T10:00:00Z',
            },
          ],
        },
      },
      null,
      2
    ),
  },
  supplier: {
    label: 'Supplier upsert',
    endpoint: '/api/integrations/suppliers/upsert',
    summary:
      'Creates or updates suppliers and stores externalPartyId for future stock, purchasing, and receipt operations.',
    payload: JSON.stringify(
      {
        companyExternalId: 'PM-COMPANY-001',
        supplier: {
          externalPartyId: 20001,
          name: 'Demo Supplier LLC',
          contactPerson: 'Aisha Khan',
          phone: '+971501112233',
          email: 'sales@demo-supplier.example',
          address: 'Industrial Area 4, Sharjah',
          city: 'Sharjah',
          country: 'UAE',
          isActive: true,
          trade_license_number: 'SUP-TL-20001',
          trade_license_authority: 'Sharjah Economic Development Department',
          trade_license_expiry: '2027-10-31',
          trn_number: '100000000000002',
          trn_expiry: '2028-03-15',
          contacts: [
            {
              id: 701,
              contact_name: 'Aisha Khan',
              email: 'aisha@example.com',
              phone: '+971501112233',
              sort_order: 0,
              created_at: '2026-04-25T10:00:00Z',
            },
          ],
        },
      },
      null,
      2
    ),
  },
};

function EndpointRow({ e }: { e: ApiEndpointDoc }) {
  return (
    <tr className="border-b border-slate-200/80 align-top last:border-0 dark:border-slate-800/80">
      <td className="px-4 py-3 font-mono text-xs font-semibold text-emerald-700 whitespace-nowrap dark:text-emerald-300">
        {e.methods}
      </td>
      <td className="px-4 py-3 font-mono text-xs text-slate-900 dark:text-slate-100">{e.path}</td>
      <td className="px-4 py-3 text-xs text-amber-700 whitespace-nowrap dark:text-amber-200">{authLabel(e.auth)}</td>
      <td className="px-4 py-3 text-sm text-slate-600 dark:text-slate-400">{e.summary}</td>
    </tr>
  );
}

function CodeBlock({ title, children }: { title: string; children: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(children);
      setCopied(true);
      toast.success(`${title} copied`);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      toast.error(`Could not copy ${title.toLowerCase()}`);
    }
  };

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
      <div className="flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3 dark:border-slate-800 dark:bg-slate-900">
        <h3 className="text-sm font-semibold text-slate-900 dark:text-white">{title}</h3>
        <div className="flex items-center gap-2">
          <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300">
            Example
          </span>
          <button
            type="button"
            onClick={handleCopy}
            className="rounded-full border border-slate-300 bg-white px-3 py-1.5 text-[11px] font-semibold text-slate-700 transition hover:border-emerald-300 hover:text-emerald-700 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200 dark:hover:border-emerald-500 dark:hover:text-emerald-300"
          >
            {copied ? 'Copied' : 'Copy'}
          </button>
        </div>
      </div>
      <pre
        data-user-select="text"
        className="allow-text-select overflow-x-auto border-t border-slate-100 bg-slate-50 p-4 font-mono text-xs leading-relaxed text-slate-800 dark:border-slate-800 dark:bg-black/35 dark:text-emerald-100"
      >
        {children}
      </pre>
    </div>
  );
}

export default function ApiDocsPage() {
  const [selectedIntegration, setSelectedIntegration] = useState<IntegrationExampleKey>('job');
  const [theme, setTheme] = useState<DocsTheme>(() => {
    if (typeof window === 'undefined') return 'light';
    const stored = window.localStorage.getItem('amfgi-api-docs-theme') as DocsTheme | null;
    if (stored === 'light' || stored === 'dark') {
      return stored;
    }
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  });

  useEffect(() => {
    const root = document.documentElement;
    const body = document.body;
    const previous = {
      rootDark: root.classList.contains('dark'),
      rootLight: root.classList.contains('light'),
      bodyDark: body.classList.contains('dark'),
      bodyLight: body.classList.contains('light'),
      dataTheme: root.dataset.theme,
      colorScheme: root.style.colorScheme,
    };
    const isLight = theme === 'light';
    const isDark = theme === 'dark';

    root.dataset.theme = theme;
    root.style.colorScheme = theme;
    root.classList.toggle('light', isLight);
    root.classList.toggle('dark', isDark);
    body.classList.toggle('light', isLight);
    body.classList.toggle('dark', isDark);

    return () => {
      root.classList.toggle('dark', previous.rootDark);
      root.classList.toggle('light', previous.rootLight);
      body.classList.toggle('dark', previous.bodyDark);
      body.classList.toggle('light', previous.bodyLight);
      if (previous.dataTheme) {
        root.dataset.theme = previous.dataTheme;
      } else {
        delete root.dataset.theme;
      }
      root.style.colorScheme = previous.colorScheme;
    };
  }, [theme]);

  const toggleTheme = () => {
    setTheme((current) => {
      const next = current === 'dark' ? 'light' : 'dark';
      window.localStorage.setItem('amfgi-api-docs-theme', next);
      return next;
    });
  };

  const endpointCount = API_DOC_SECTIONS.reduce((total, section) => total + section.endpoints.length, 0);
  const currentIntegration = INTEGRATION_EXAMPLES[selectedIntegration];
  const fetchExample = `const BASE_URL = 'https://your-amfgi-host.example';
const API_KEY = process.env.AMFGI_API_KEY;
const IDEMPOTENCY_KEY = crypto.randomUUID();

const payload = ${currentIntegration.payload};

const res = await fetch(\`\${BASE_URL}${currentIntegration.endpoint}\`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'x-api-key': API_KEY,
    'x-idempotency-key': IDEMPOTENCY_KEY,
    Origin: 'https://your-allowed-origin.example',
  },
  body: JSON.stringify(payload),
});

console.log(res.status, await res.json());`;
  const headerExample = `POST ${currentIntegration.endpoint}
Content-Type: application/json
x-api-key: amfgi_your_generated_key
x-idempotency-key: unique-request-id-123
Origin: https://your-allowed-origin.example

Alternative auth header:
Authorization: Bearer amfgi_your_generated_key`;

  return (
    <div className={theme === 'dark' ? 'dark' : ''}>
      <div
        data-native-context-menu="true"
        data-user-select="text"
        className="allow-text-select min-h-screen bg-[#f7f4ed] text-slate-900 dark:bg-slate-950 dark:text-slate-100"
      >
        <header className="sticky top-0 z-30 border-b border-slate-200/80 bg-[#f7f4ed]/90 backdrop-blur-xl dark:border-slate-800 dark:bg-slate-950/86">
          <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-4">
            <Link href="/docs/api" className="group flex items-center gap-3">
              <span className="grid h-10 w-10 place-items-center rounded-2xl bg-emerald-700 text-sm font-black text-white shadow-lg shadow-emerald-700/20 transition group-hover:scale-105 dark:bg-emerald-400 dark:text-slate-950">
                API
              </span>
              <span>
                <span className="block text-sm font-semibold text-slate-950 dark:text-white">AMFGI API Docs</span>
                <span className="block text-xs text-slate-500 dark:text-slate-400">Route catalog and integration guide</span>
              </span>
            </Link>
            <nav className="flex flex-wrap items-center gap-2 text-sm">
              <a href="#auth" className="rounded-full px-3 py-2 text-slate-600 hover:bg-white hover:text-slate-950 dark:text-slate-300 dark:hover:bg-slate-900 dark:hover:text-white">
                Auth
              </a>
              <a href="#integrations" className="rounded-full px-3 py-2 text-slate-600 hover:bg-white hover:text-slate-950 dark:text-slate-300 dark:hover:bg-slate-900 dark:hover:text-white">
                Integrations
              </a>
              <a href="#routes" className="rounded-full px-3 py-2 text-slate-600 hover:bg-white hover:text-slate-950 dark:text-slate-300 dark:hover:bg-slate-900 dark:hover:text-white">
                Routes
              </a>
              <button
                type="button"
                onClick={toggleTheme}
                className="rounded-full border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-emerald-300 hover:text-emerald-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:border-emerald-500 dark:hover:text-emerald-300"
              >
                {theme === 'dark' ? 'Light mode' : 'Dark mode'}
              </button>
              <Link
                href="/settings/api"
                className="rounded-full bg-slate-950 px-4 py-2 font-semibold text-white shadow-sm transition hover:bg-emerald-700 dark:bg-white dark:text-slate-950 dark:hover:bg-emerald-200"
              >
                API Center
              </Link>
            </nav>
          </div>
        </header>

        <main className="mx-auto max-w-7xl px-4 py-8 sm:py-10">
          <section className="overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-xl shadow-slate-200/70 dark:border-slate-800 dark:bg-slate-900 dark:shadow-none">
            <div className="grid gap-px bg-slate-200 dark:bg-slate-800 lg:grid-cols-[minmax(0,1.3fr)_minmax(18rem,0.7fr)]">
              <div className="bg-[radial-gradient(circle_at_15%_15%,rgba(16,185,129,0.17),transparent_34%),linear-gradient(135deg,#ffffff,#f0fdf4)] p-6 sm:p-10 dark:bg-[radial-gradient(circle_at_15%_15%,rgba(16,185,129,0.22),transparent_34%),linear-gradient(135deg,#020617,#0f172a)]">
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-emerald-700 dark:text-emerald-300">
                  Developer Reference
                </p>
                <h1 className="mt-4 max-w-3xl text-4xl font-semibold tracking-tight text-slate-950 dark:text-white sm:text-5xl">
                  Clean integration docs for the full AMFGI application API.
                </h1>
                <p className="mt-4 max-w-3xl text-base leading-7 text-slate-600 dark:text-slate-300">
                  Start with the live job, customer, and supplier upsert integrations today, then use this route
                  catalog as the foundation for future materials, stock, HR, and reporting APIs.
                </p>
                <div className="mt-6 flex flex-wrap gap-3">
                  <a href="#integrations" className="rounded-full bg-emerald-700 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-emerald-700/20 transition hover:bg-emerald-800 dark:bg-emerald-400 dark:text-slate-950 dark:hover:bg-emerald-300">
                    View integration examples
                  </a>
                  <a href="#routes" className="rounded-full border border-slate-300 bg-white px-5 py-3 text-sm font-semibold text-slate-700 transition hover:border-emerald-300 hover:text-emerald-700 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200 dark:hover:border-emerald-500 dark:hover:text-emerald-300">
                    Browse all routes
                  </a>
                </div>
              </div>
              <div className="grid bg-white p-6 dark:bg-slate-900 sm:p-8">
                <div className="grid gap-3">
                  {[
                    { label: 'Documented routes', value: String(endpointCount), note: 'from App Router catalog' },
                    { label: 'Auth models', value: '2', note: 'session + integration key' },
                    { label: 'Live integrations', value: '3', note: 'job, customer, supplier' },
                  ].map((item) => (
                    <div key={item.label} className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-950/55">
                      <p className="text-xs text-slate-500">{item.label}</p>
                      <p className="mt-1 text-2xl font-semibold text-slate-950 dark:text-white">{item.value}</p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">{item.note}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </section>

          <section id="auth" className="mt-8 grid gap-4 lg:grid-cols-3">
            {[
              {
                title: 'Browser app',
                body: 'Most ERP API routes expect a signed-in NextAuth session cookie. Unauthenticated calls return 401 JSON.',
              },
              {
                title: 'Integration key',
                body: 'Routes marked as Integration API key accept x-api-key or Authorization: Bearer. The key does not unlock normal ERP APIs.',
              },
              {
                title: 'Allowed domains',
                body: 'Credential host allowlists validate Origin or Referer. Empty allowlist means no domain check beyond the key.',
              },
            ].map((item) => (
              <article key={item.title} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
                <h2 className="text-base font-semibold text-slate-950 dark:text-white">{item.title}</h2>
                <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-400">{item.body}</p>
              </article>
            ))}
          </section>

          <section id="integrations" className="mt-8 rounded-[1.75rem] border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:p-6">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-700 dark:text-emerald-300">
                  Integration examples
                </p>
                <h2 className="mt-2 text-2xl font-semibold text-slate-950 dark:text-white">{currentIntegration.label}</h2>
                <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600 dark:text-slate-400">
                  Select an integration route to replace the examples below. Each sample includes required headers, API key usage,
                  idempotency key, and the full payload keys accepted by the route.
                </p>
              </div>
              <label className="min-w-64 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                Example route
                <select
                  value={selectedIntegration}
                  onChange={(event) => setSelectedIntegration(event.target.value as IntegrationExampleKey)}
                  className="mt-2 w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm normal-case tracking-normal text-slate-900 outline-none transition focus:border-emerald-400 focus:ring-2 focus:ring-emerald-500/20 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                >
                  {Object.entries(INTEGRATION_EXAMPLES).map(([key, example]) => (
                    <option key={key} value={key}>
                      {example.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="mt-5 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 dark:border-emerald-500/25 dark:bg-emerald-500/10">
              <code className="text-xs font-semibold text-emerald-800 dark:text-emerald-200">
                POST {currentIntegration.endpoint}
              </code>
              <p className="mt-2 text-sm leading-6 text-emerald-900/80 dark:text-emerald-100/75">{currentIntegration.summary}</p>
            </div>

            <div className="mt-6 grid gap-4 xl:grid-cols-[minmax(0,0.8fr)_minmax(0,1.1fr)_minmax(0,1.1fr)]">
              <CodeBlock title="Required headers">{headerExample}</CodeBlock>
              <CodeBlock title="Full JSON payload">{currentIntegration.payload}</CodeBlock>
              <CodeBlock title="Node.js fetch">{fetchExample}</CodeBlock>
            </div>
          </section>

          <section id="routes" className="mt-8 space-y-5">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Route Catalog</p>
                <h2 className="mt-1 text-2xl font-semibold text-slate-950 dark:text-white">All application API routes</h2>
              </div>
              <p className="max-w-xl text-sm text-slate-600 dark:text-slate-400">
                Dynamic segments such as <code>[id]</code> follow Next.js App Router conventions.
              </p>
            </div>

            {API_DOC_SECTIONS.map((section) => (
              <div key={section.title} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-800 dark:bg-slate-950/55">
                  <h3 className="text-sm font-semibold text-slate-950 dark:text-white">{section.title}</h3>
                  <span className="rounded-full bg-slate-200 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-600 dark:bg-slate-800 dark:text-slate-400">
                    {section.endpoints.length} routes
                  </span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[52rem] border-collapse text-left">
                    <thead>
                      <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500 dark:border-slate-800">
                        <th className="px-4 py-3 font-semibold">Methods</th>
                        <th className="px-4 py-3 font-semibold">Path</th>
                        <th className="px-4 py-3 font-semibold">Auth</th>
                        <th className="px-4 py-3 font-semibold">Summary</th>
                      </tr>
                    </thead>
                    <tbody>
                      {section.endpoints.map((e) => (
                        <EndpointRow key={`${e.path}-${e.methods}`} e={e} />
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </section>
        </main>
      </div>
    </div>
  );
}
