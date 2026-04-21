import Link from 'next/link';
import { API_DOC_SECTIONS, authLabel, type ApiEndpointDoc } from '@/lib/docs/apiEndpoints';

function EndpointRow({ e }: { e: ApiEndpointDoc }) {
  return (
    <tr className="border-b border-slate-800/80 align-top">
      <td className="py-2.5 pr-4 font-mono text-xs text-emerald-300/95 whitespace-nowrap">{e.methods}</td>
      <td className="py-2.5 pr-4 font-mono text-xs text-slate-200">{e.path}</td>
      <td className="py-2.5 pr-4 text-xs text-amber-200/90 whitespace-nowrap">{authLabel(e.auth)}</td>
      <td className="py-2.5 text-sm text-slate-400">{e.summary}</td>
    </tr>
  );
}

export default function ApiDocsPage() {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-200">
      <header className="border-b border-slate-800 bg-slate-900/80">
        <div className="mx-auto max-w-5xl px-4 py-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold text-white">AMFGI HTTP API reference</h1>
            <p className="text-sm text-slate-400 mt-0.5">
              Route catalog, authentication model, and integration examples.
            </p>
          </div>
          <Link
            href="/login"
            className="text-sm text-emerald-400 hover:text-emerald-300 underline underline-offset-2"
          >
            Sign in
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-8 space-y-10">
        <section className="rounded-xl border border-slate-800 bg-slate-900/50 p-5 space-y-3">
          <h2 className="text-lg font-medium text-white">How authentication works</h2>
          <ul className="list-disc pl-5 text-sm text-slate-400 space-y-2">
            <li>
              <span className="text-slate-300">Browser app:</span> most routes expect a signed-in NextAuth session (session
              cookie). Unauthenticated API calls return <code className="text-amber-200/90">401</code> JSON.
            </li>
            <li>
              <span className="text-slate-300">Integration API key:</span> only routes documented as “Integration API key”
              accept <code className="text-amber-200/90">x-api-key</code> or{' '}
              <code className="text-amber-200/90">Authorization: Bearer …</code>. Today that is{' '}
              <code className="text-amber-200/90">POST /api/integrations/jobs/upsert</code> — the key does not grant access
              to the rest of the ERP API; those routes still require a normal user session and permissions.
            </li>
            <li>
              <span className="text-slate-300">Allowed domains (optional):</span> per credential you can store hostnames.
              When the list is non-empty, the request must include an <code className="text-amber-200/90">Origin</code> or{' '}
              <code className="text-amber-200/90">Referer</code> whose host matches (exact or subdomain). Server-to-server
              clients without a browser should send e.g.{' '}
              <code className="text-amber-200/90">Origin: https://your-registered-app.example.com</code>. Empty list = no
              domain check.
            </li>
          </ul>
          <p className="text-xs text-slate-500">
            Job sync payload and fields are described in the repo file <code className="text-slate-400">API-job-sync.md</code>.
          </p>
        </section>

        <section className="rounded-xl border border-slate-800 bg-slate-900/50 p-5 space-y-4">
          <h2 className="text-lg font-medium text-white">Integration: job upsert</h2>
          <p className="text-sm text-slate-400">
            Replace <code className="text-slate-300">BASE_URL</code> with your deployment (e.g.{' '}
            <code className="text-slate-300">https://erp.example.com</code>) and <code className="text-slate-300">API_KEY</code>{' '}
            with your <code className="text-slate-300">amfgi_…</code> key. If the credential has allowed domains, include a
            matching <code className="text-slate-300">Origin</code> header.
          </p>

          <div>
            <h3 className="text-sm font-medium text-slate-300 mb-2">Node.js (fetch)</h3>
            <pre className="overflow-x-auto rounded-lg bg-slate-950 border border-slate-800 p-4 text-xs text-emerald-200/90 font-mono leading-relaxed">
{`const BASE_URL = 'https://your-amfgi-host.example';
const API_KEY = process.env.AMFGI_API_KEY;

const payload = {
  companyExternalId: 'PM-COMPANY-001',
  job: {
    externalJobId: 'PM-JOB-001',
    jobNumber: 'JOB-2026-001',
    customerName: 'Demo Customer',
    description: 'Synced from PM',
    status: 'ACTIVE',
  },
};

const body = JSON.stringify(payload);
const res = await fetch(\`\${BASE_URL}/api/integrations/jobs/upsert\`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'x-api-key': API_KEY,
    Origin: 'https://your-allowed-origin.example',
  },
  body,
});
const json = await res.json();
console.log(res.status, json);`}
            </pre>
          </div>

          <div>
            <h3 className="text-sm font-medium text-slate-300 mb-2">PHP (curl)</h3>
            <pre className="overflow-x-auto rounded-lg bg-slate-950 border border-slate-800 p-4 text-xs text-emerald-200/90 font-mono leading-relaxed">
{`<?php
$base = 'https://your-amfgi-host.example';
$apiKey = getenv('AMFGI_API_KEY');
$payload = [
  'companyExternalId' => 'PM-COMPANY-001',
  'job' => [
    'externalJobId' => 'PM-JOB-001',
    'jobNumber' => 'JOB-2026-001',
    'customerName' => 'Demo Customer',
    'description' => 'Synced from PM',
    'status' => 'ACTIVE',
  ],
];
$body = json_encode($payload);
$ch = curl_init("$base/api/integrations/jobs/upsert");
curl_setopt_array($ch, [
  CURLOPT_POST => true,
  CURLOPT_HTTPHEADER => [
    'Content-Type: application/json',
    'x-api-key: ' . $apiKey,
    'Origin: https://your-allowed-origin.example',
  ],
  CURLOPT_POSTFIELDS => $body,
  CURLOPT_RETURNTRANSFER => true,
]);
$response = curl_exec($ch);
$code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
curl_close($ch);
echo $code . " " . $response;`}
            </pre>
          </div>

          <div>
            <h3 className="text-sm font-medium text-slate-300 mb-2">Python (urllib)</h3>
            <pre className="overflow-x-auto rounded-lg bg-slate-950 border border-slate-800 p-4 text-xs text-emerald-200/90 font-mono leading-relaxed">
{`import json
import os
import urllib.request

BASE = 'https://your-amfgi-host.example'
API_KEY = os.environ['AMFGI_API_KEY']

payload = {
    'companyExternalId': 'PM-COMPANY-001',
    'job': {
        'externalJobId': 'PM-JOB-001',
        'jobNumber': 'JOB-2026-001',
        'customerName': 'Demo Customer',
        'description': 'Synced from PM',
        'status': 'ACTIVE',
    },
}
body = json.dumps(payload).encode('utf-8')
req = urllib.request.Request(
    f'{BASE}/api/integrations/jobs/upsert',
    data=body,
    method='POST',
    headers={
        'Content-Type': 'application/json',
        'x-api-key': API_KEY,
        'Origin': 'https://your-allowed-origin.example',
    },
)
with urllib.request.urlopen(req) as resp:
    print(resp.status, resp.read().decode())`}
            </pre>
          </div>
        </section>

        <section className="space-y-6">
          <h2 className="text-lg font-medium text-white">All application API routes</h2>
          <p className="text-sm text-slate-400">
            Paths use Next.js App Router conventions; <code className="text-slate-300">[id]</code> and similar segments are
            dynamic route parameters.
          </p>
          {API_DOC_SECTIONS.map((section) => (
            <div key={section.title} className="rounded-xl border border-slate-800 bg-slate-900/40 overflow-hidden">
              <h3 className="px-4 py-3 text-sm font-semibold text-white bg-slate-900 border-b border-slate-800">
                {section.title}
              </h3>
              <div className="overflow-x-auto">
                <table className="w-full min-w-2xl text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-800 text-xs uppercase tracking-wide text-slate-500">
                      <th className="py-2 px-4 font-medium">Methods</th>
                      <th className="py-2 px-4 font-medium">Path</th>
                      <th className="py-2 px-4 font-medium">Auth</th>
                      <th className="py-2 px-4 font-medium">Summary</th>
                    </tr>
                  </thead>
                  <tbody className="px-4">
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
  );
}
