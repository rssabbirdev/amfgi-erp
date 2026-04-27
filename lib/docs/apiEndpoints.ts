/** Human-readable catalog for `/docs/api` (keep in sync when adding routes). */

export type ApiDocAuth = 'session_cookie' | 'integration_key' | 'public';

export type ApiEndpointDoc = {
  methods: string;
  path: string;
  auth: ApiDocAuth;
  summary: string;
};

export type ApiDocSection = { title: string; endpoints: ApiEndpointDoc[] };

export const API_DOC_SECTIONS: ApiDocSection[] = [
  {
    title: 'Authentication & session',
    endpoints: [
      { methods: 'ALL', path: '/api/auth/[...nextauth]', auth: 'public', summary: 'NextAuth handlers (sign-in, callbacks, etc.).' },
      { methods: 'POST', path: '/api/session/switch-company', auth: 'session_cookie', summary: 'Switch active company for the signed-in user.' },
      { methods: 'POST', path: '/api/session/switch-profile', auth: 'session_cookie', summary: 'Switch user profile context where applicable.' },
    ],
  },
  {
    title: 'Integrations (API key)',
    endpoints: [
      {
        methods: 'POST',
        path: '/api/integrations/jobs/upsert',
        auth: 'integration_key',
        summary: 'Create or update a parent job or variation from an external PM system. customerExternalId is resolved against Customer.externalPartyId.',
      },
      {
        methods: 'POST',
        path: '/api/integrations/customers/upsert',
        auth: 'integration_key',
        summary: 'Create or update a customer by externalPartyId and store the external id for future job matching.',
      },
      {
        methods: 'POST',
        path: '/api/integrations/suppliers/upsert',
        auth: 'integration_key',
        summary: 'Create or update a supplier by externalPartyId and store the external id for future purchasing/stock operations.',
      },
    ],
  },
  {
    title: 'Companies & company profile',
    endpoints: [
      { methods: 'GET, POST', path: '/api/companies', auth: 'session_cookie', summary: 'List companies; create (super-admin).' },
      { methods: 'GET, PUT', path: '/api/companies/[id]', auth: 'session_cookie', summary: 'Get or update a company (incl. print templates, external id, job source mode).' },
      { methods: 'GET, POST', path: '/api/company-profiles', auth: 'session_cookie', summary: 'Company profile helpers for the active company.' },
    ],
  },
  {
    title: 'Users & roles',
    endpoints: [
      { methods: 'GET, POST', path: '/api/users', auth: 'session_cookie', summary: 'List or create users (admin).' },
      { methods: 'GET, PUT, DELETE', path: '/api/users/[id]', auth: 'session_cookie', summary: 'User detail, update, or deactivate.' },
      { methods: 'GET, POST', path: '/api/roles', auth: 'session_cookie', summary: 'List or create roles.' },
      { methods: 'GET, PUT, DELETE', path: '/api/roles/[id]', auth: 'session_cookie', summary: 'Role detail, update, or delete.' },
    ],
  },
  {
    title: 'Master data',
    endpoints: [
      { methods: 'GET, POST', path: '/api/units', auth: 'session_cookie', summary: 'Units of measure.' },
      { methods: 'PUT, DELETE', path: '/api/units/[id]', auth: 'session_cookie', summary: 'Update or delete a unit.' },
      { methods: 'GET, POST', path: '/api/categories', auth: 'session_cookie', summary: 'Material categories.' },
      { methods: 'PUT, DELETE', path: '/api/categories/[id]', auth: 'session_cookie', summary: 'Update or delete a category.' },
      { methods: 'GET, POST', path: '/api/warehouses', auth: 'session_cookie', summary: 'Warehouses.' },
      { methods: 'PUT, DELETE', path: '/api/warehouses/[id]', auth: 'session_cookie', summary: 'Update or delete a warehouse.' },
    ],
  },
  {
    title: 'Customers & suppliers',
    endpoints: [
      { methods: 'GET, POST', path: '/api/customers', auth: 'session_cookie', summary: 'Customers for the active company.' },
      { methods: 'GET, PUT, DELETE', path: '/api/customers/[id]', auth: 'session_cookie', summary: 'Customer CRUD.' },
      { methods: 'GET', path: '/api/customers/[id]/check-delete', auth: 'session_cookie', summary: 'Pre-check delete impact.' },
      { methods: 'POST', path: '/api/customers/sync', auth: 'session_cookie', summary: 'Bulk/sync customers from payload.' },
      { methods: 'GET, POST', path: '/api/suppliers', auth: 'session_cookie', summary: 'Suppliers.' },
      { methods: 'GET, PUT, DELETE', path: '/api/suppliers/[id]', auth: 'session_cookie', summary: 'Supplier CRUD.' },
      { methods: 'GET', path: '/api/suppliers/[id]/check-delete', auth: 'session_cookie', summary: 'Pre-check delete impact.' },
      { methods: 'POST', path: '/api/suppliers/sync', auth: 'session_cookie', summary: 'Bulk/sync suppliers.' },
    ],
  },
  {
    title: 'Materials & stock',
    endpoints: [
      { methods: 'GET, POST', path: '/api/materials', auth: 'session_cookie', summary: 'Materials list and create.' },
      { methods: 'GET, PUT, DELETE', path: '/api/materials/[id]', auth: 'session_cookie', summary: 'Material detail, update, delete.' },
      { methods: 'GET', path: '/api/materials/[id]/check-delete', auth: 'session_cookie', summary: 'Pre-check delete impact.' },
      { methods: 'GET', path: '/api/materials/[id]/logs', auth: 'session_cookie', summary: 'Stock movement logs for a material.' },
      { methods: 'GET', path: '/api/materials/[id]/price-logs', auth: 'session_cookie', summary: 'Price history for a material.' },
      { methods: 'POST', path: '/api/materials/bulk', auth: 'session_cookie', summary: 'Bulk material operations.' },
      { methods: 'POST', path: '/api/materials/logs', auth: 'session_cookie', summary: 'Create or adjust stock log entries (server rules apply).' },
      { methods: 'POST', path: '/api/materials/price-logs', auth: 'session_cookie', summary: 'Record price changes.' },
      { methods: 'GET', path: '/api/materials/cross-company', auth: 'session_cookie', summary: 'Cross-company material lookup (permissioned).' },
      { methods: 'GET', path: '/api/materials/dispatch-history', auth: 'session_cookie', summary: 'Dispatch history listing.' },
      { methods: 'GET', path: '/api/materials/dispatch-history-entries', auth: 'session_cookie', summary: 'Dispatch history line items.' },
      { methods: 'GET', path: '/api/materials/receipt-history-entries', auth: 'session_cookie', summary: 'Receipt history listing.' },
      { methods: 'GET, DELETE', path: '/api/materials/receipt-history-entries/[receiptNumber]', auth: 'session_cookie', summary: 'Receipt detail or remove (rules apply).' },
    ],
  },
  {
    title: 'Jobs',
    endpoints: [
      { methods: 'GET, POST', path: '/api/jobs', auth: 'session_cookie', summary: 'Jobs list and create.' },
      { methods: 'GET, PUT, DELETE', path: '/api/jobs/[id]', auth: 'session_cookie', summary: 'Job detail, update, delete.' },
      { methods: 'GET', path: '/api/jobs/[id]/check-delete', auth: 'session_cookie', summary: 'Pre-check delete impact.' },
      { methods: 'GET', path: '/api/jobs/[id]/materials', auth: 'session_cookie', summary: 'Materials allocated or linked to a job.' },
      { methods: 'GET', path: '/api/jobs/[id]/consumption-costing', auth: 'session_cookie', summary: 'Consumption / costing for a job.' },
    ],
  },
  {
    title: 'Transactions',
    endpoints: [
      { methods: 'GET, POST', path: '/api/transactions', auth: 'session_cookie', summary: 'Stock transactions list and create.' },
      { methods: 'GET, DELETE', path: '/api/transactions/[id]', auth: 'session_cookie', summary: 'Transaction detail or cancel/delete per rules.' },
      { methods: 'POST', path: '/api/transactions/batch', auth: 'session_cookie', summary: 'Batch transaction create.' },
      { methods: 'POST', path: '/api/transactions/transfer', auth: 'session_cookie', summary: 'Inter-warehouse or transfer flows.' },
      { methods: 'GET', path: '/api/transactions/dispatch-entry', auth: 'session_cookie', summary: 'Dispatch entry lookup / listing.' },
    ],
  },
  {
    title: 'Reports',
    endpoints: [
      { methods: 'GET', path: '/api/reports/consumption', auth: 'session_cookie', summary: 'Consumption report.' },
      { methods: 'GET', path: '/api/reports/job-consumption', auth: 'session_cookie', summary: 'Job-level consumption.' },
      { methods: 'GET', path: '/api/reports/stock-valuation', auth: 'session_cookie', summary: 'Stock valuation.' },
    ],
  },
  {
    title: 'Media & uploads',
    endpoints: [
      { methods: 'GET', path: '/api/media', auth: 'session_cookie', summary: 'List media metadata.' },
      { methods: 'DELETE', path: '/api/media/[id]', auth: 'session_cookie', summary: 'Delete a media record/file.' },
      { methods: 'POST', path: '/api/media/cleanup', auth: 'session_cookie', summary: 'Cleanup orphaned or stale media.' },
      { methods: 'POST', path: '/api/upload/user-profile-image', auth: 'session_cookie', summary: 'Upload user avatar.' },
      { methods: 'POST', path: '/api/upload/user-signature', auth: 'session_cookie', summary: 'Upload signature image.' },
      { methods: 'POST', path: '/api/upload/letterhead', auth: 'session_cookie', summary: 'Upload letterhead asset.' },
      { methods: 'POST', path: '/api/upload/template-image', auth: 'session_cookie', summary: 'Upload template-related image.' },
      { methods: 'POST', path: '/api/upload/signed-copy', auth: 'session_cookie', summary: 'Upload signed document copy.' },
    ],
  },
  {
    title: 'User profile',
    endpoints: [
      { methods: 'GET, PATCH', path: '/api/user/profile', auth: 'session_cookie', summary: 'Current user profile read/update.' },
    ],
  },
  {
    title: 'Settings (integrations)',
    endpoints: [
      { methods: 'GET, POST', path: '/api/settings/api-credentials', auth: 'session_cookie', summary: 'List or create integration API keys (settings.manage).' },
      { methods: 'PATCH, DELETE', path: '/api/settings/api-credentials/[id]', auth: 'session_cookie', summary: 'Update label/allowed domains or revoke a credential.' },
      { methods: 'GET', path: '/api/settings/integration-logs', auth: 'session_cookie', summary: 'Paginated integration sync logs.' },
      { methods: 'POST', path: '/api/settings/integration-logs/[id]/retry', auth: 'session_cookie', summary: 'Retry a failed inbound job sync from stored payload.' },
    ],
  },
  {
    title: 'Other',
    endpoints: [
      { methods: 'GET', path: '/api/delivery-notes/next-number', auth: 'session_cookie', summary: 'Next delivery note number for sequencing.' },
    ],
  },
];

export function authLabel(auth: ApiDocAuth): string {
  switch (auth) {
    case 'public':
      return 'Public (auth routes)';
    case 'integration_key':
      return 'Integration API key (x-api-key or Bearer)';
    case 'session_cookie':
    default:
      return 'Signed-in session (browser cookie)';
  }
}
