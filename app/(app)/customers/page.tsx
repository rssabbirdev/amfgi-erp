'use client';

import { useState, useMemo, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import Modal from '@/components/ui/Modal';
import toast from 'react-hot-toast';
import {
  useGetCustomersQuery,
  useGetJobsQuery,
  useCreateCustomerMutation,
  useUpdateCustomerMutation,
  useDeleteCustomerMutation,
  useDeleteJobMutation,
  useSyncCustomersFromPartyApiMutation,
  type Customer,
} from '@/store/hooks';
import { useGlobalContextMenu } from '@/providers/ContextMenuProvider';
import type { Job } from '@/store/api/endpoints/jobs';
import {
  customerPartyFormToApiBody,
  customerToPartyFormState,
  emptyCustomerPartyFormState,
  type CustomerPartyFormState,
  type PartyContactRow,
} from '@/lib/partyFormUi';

interface SearchResult {
  type: 'customer' | 'job';
  customer?: Customer;
  job?: Job;
  companyName?: string;
}

// Helper function to highlight matching text
const highlightMatch = (text: string, query: string) => {
  const parts = text.split(new RegExp(`(${query})`, 'gi'));
  return parts.map((part, i) =>
    part.toLowerCase() === query.toLowerCase() ? (
      <span key={i} className="bg-yellow-400/30 font-semibold text-yellow-200">{part}</span>
    ) : (
      part
    )
  );
};

export default function CustomersPage() {
  const router = useRouter();
  const { data: session } = useSession();
  const { data: customers = [], isFetching } = useGetCustomersQuery();
  const { data: jobs = [] } = useGetJobsQuery();
  const { openMenu: openContextMenu } = useGlobalContextMenu();
  const [createCustomer, { isLoading: isCreating }] = useCreateCustomerMutation();
  const [updateCustomer, { isLoading: isUpdating }] = useUpdateCustomerMutation();
  const [deleteCustomer, { isLoading: isDeleting }] = useDeleteCustomerMutation();
  const [deleteJob, { isLoading: isDeletingJob }] = useDeleteJobMutation();
  const [syncPartyCustomers, { isLoading: isSyncingParty }] = useSyncCustomersFromPartyApiMutation();

  const isSA = session?.user?.isSuperAdmin ?? false;
  const perms = (session?.user?.permissions ?? []) as string[];
  const canCreate = isSA || perms.includes('customer.create');
  const canEdit = isSA || perms.includes('customer.edit');
  const canDelete = isSA || perms.includes('customer.delete');

  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterActive, setFilterActive] = useState<'all' | 'active' | 'inactive'>('all');
  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState<Customer | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [expandedJobs, setExpandedJobs] = useState<Set<string>>(new Set());
  const [deleteModal, setDeleteModal] = useState<{
    open: boolean;
    customer: Customer | null;
    loading: boolean;
  }>({ open: false, customer: null, loading: false });

  const [deleteJobModal, setDeleteJobModal] = useState<{
    open: boolean;
    job: Job | null;
    loading: boolean;
    linkedCount: number;
    canDelete: boolean;
  }>({ open: false, job: null, loading: false, linkedCount: 0, canDelete: true });

  const [partyForm, setPartyForm] = useState<CustomerPartyFormState>(emptyCustomerPartyFormState());

  // Persist selected customer ID in sessionStorage
  useEffect(() => {
    const saved = sessionStorage.getItem('selectedCustomerId');
    if (saved) {
      setSelectedCustomerId(saved);
      sessionStorage.removeItem('selectedCustomerId');
    }
  }, []);

  useEffect(() => {
    if (selectedCustomerId) {
      sessionStorage.setItem('selectedCustomerId', selectedCustomerId);
    }
  }, [selectedCustomerId]);

  // Filtered customers based on search and active status
  const filteredCustomers = useMemo(() => {
    // If there's a search query, use smart search results instead
    if (searchQuery.trim()) {
      return [];
    }

    return customers.filter(c => {
      const matchesFilter = filterActive === 'all' ? true :
        filterActive === 'active' ? c.isActive : !c.isActive;
      return matchesFilter;
    });
  }, [customers, searchQuery, filterActive]);

  // Smart search with debounce
  useEffect(() => {
    const timer = setTimeout(() => {
      if (searchQuery.trim().length === 0) {
        setSearchResults([]);
        setSearchLoading(false);
        return;
      }

      setSearchLoading(true);
      const query = searchQuery.toLowerCase().trim();
      const results: SearchResult[] = [];

      // Search jobs by job number
      const matchingJobs = jobs.filter(job =>
        job.jobNumber.toLowerCase().includes(query)
      );

      // Search customers by name
      const matchingCustomers = customers.filter(c =>
        c.name.toLowerCase().includes(query)
      );

      // Add job results with company names
      matchingJobs.forEach(job => {
        const customer = customers.find(c => c.id === job.customerId);
        results.push({
          type: 'job',
          job,
          companyName: customer?.name,
        });
      });

      // Add customer results
      matchingCustomers.forEach(customer => {
        results.push({
          type: 'customer',
          customer,
        });
      });

      setSearchResults(results);
      setSearchLoading(false);
    }, 300);

    return () => clearTimeout(timer);
  }, [searchQuery, jobs, customers]);

  const selectedCustomer = selectedCustomerId ? customers.find(c => c.id === selectedCustomerId) : null;
  const customerJobs = selectedCustomer ? jobs.filter(j => j.customerId === selectedCustomer.id && !j.parentJobId) : [];

  // Get job variations for a parent job
  const getJobVariations = (parentJobId: string) => {
    return jobs.filter(j => j.parentJobId === parentJobId);
  };

  const toggleJobVariations = (jobId: string) => {
    const newExpanded = new Set(expandedJobs);
    if (newExpanded.has(jobId)) {
      newExpanded.delete(jobId);
    } else {
      newExpanded.add(jobId);
    }
    setExpandedJobs(newExpanded);
  };

  const openCreate = () => {
    setEditing(null);
    setPartyForm(emptyCustomerPartyFormState());
    setModal(true);
    setMenuOpen(false);
  };

  const handleEditClick = (customer: Customer) => {
    setEditing(customer);
    setPartyForm(customerToPartyFormState(customer));
    setModal(true);
  };

  const updateContactRow = (index: number, patch: Partial<PartyContactRow>) => {
    setPartyForm((prev) => {
      const contacts = [...prev.contacts];
      contacts[index] = { ...contacts[index], ...patch, sort_order: index };
      return { ...prev, contacts };
    });
  };

  const addContactRow = () => {
    setPartyForm((prev) => ({
      ...prev,
      contacts: [
        ...prev.contacts,
        { contact_name: '', email: '', phone: '', sort_order: prev.contacts.length },
      ],
    }));
  };

  const removeContactRow = (index: number) => {
    setPartyForm((prev) => ({
      ...prev,
      contacts: prev.contacts.filter((_, i) => i !== index).map((c, i) => ({ ...c, sort_order: i })),
    }));
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const data = customerPartyFormToApiBody(partyForm);

    try {
      if (editing) {
        await updateCustomer({ id: editing.id, data }).unwrap();
        toast.success('Customer updated');
      } else {
        await createCustomer(data).unwrap();
        toast.success('Customer created');
      }
      setModal(false);
    } catch (err: any) {
      toast.error(err?.data?.error ?? 'Save failed');
    }
  };

  const handleDelete = async () => {
    if (!deleteModal.customer) return;
    setDeleteModal((prev) => ({ ...prev, loading: true }));
    try {
      const res = await deleteCustomer(deleteModal.customer.id).unwrap();
      toast.success(res.message ?? (res.permanent ? 'Customer deleted' : 'Customer deactivated'));
      if (selectedCustomerId === deleteModal.customer.id) {
        setSelectedCustomerId(null);
      }
      setDeleteModal({ open: false, customer: null, loading: false });
    } catch (err: any) {
      toast.error(err?.data?.error ?? 'Failed to delete customer');
      setDeleteModal((prev) => ({ ...prev, loading: false }));
    }
  };

  const handleSyncPartyCustomers = async () => {
    setMenuOpen(false);
    try {
      const r = await syncPartyCustomers().unwrap();
      toast.success(
        `Synced: ${r.created} new, ${r.updated} updated (${r.totalFromApi} from API)`
      );
    } catch (err: any) {
      toast.error(err?.data?.error ?? 'Sync failed — check PARTY_LISTS_API_* env vars');
    }
  };

  const handleCustomerContextMenu = (customer: Customer, e: React.MouseEvent) => {
    e.preventDefault();
    const options: any[] = [];

    if (canEdit) {
      options.push({
        label: 'Edit',
        action: () => handleEditClick(customer),
      });
    }

    options.push({ divider: true });
    options.push({
      label: '+ Add Job',
      action: () => {
        router.push(`/jobs/form?mode=create&customerId=${customer.id}`);
      },
    });

    if (canDelete) {
      options.push({ divider: true });
      if (customer.source === 'PARTY_API_SYNC') {
        options.push({
          label: 'Delete (synced records cannot be removed)',
          action: () =>
            toast.error(
              'Customers from the party lists API cannot be deleted here. Deactivate via Edit if needed.'
            ),
        });
      } else {
        options.push({
          label: 'Delete',
          action: () => setDeleteModal({ open: true, customer, loading: false }),
          danger: true,
        });
      }
    }

    if (options.length > 0) {
      openContextMenu(e.clientX, e.clientY, options);
    }
  };

  const handleJobContextMenu = (job: Job, e: React.MouseEvent) => {
    e.preventDefault();
    const options: any[] = [];

    if (canEdit) {
      options.push({
        label: '✏️ Edit',
        action: () => {
          router.push(`/jobs/form?mode=edit&id=${job.id}`);
        },
      });

      options.push({ divider: true });
    }

    options.push({
      label: '📊 Consumption & Costing',
      action: () => {
        router.push(`/jobs/${job.id}/consumption-costing`);
      },
    });

    options.push({ divider: true });
    options.push({
      label: '+ Create Variation',
      action: () => {
        router.push(`/jobs/form?mode=variation&parentJobId=${job.id}&customerId=${selectedCustomer?.id}`);
      },
    });

    if (canDelete) {
      options.push({ divider: true });
      options.push({
        label: 'Delete',
        action: async () => {
          try {
            const res = await fetch(`/api/jobs/${job.id}/check-delete`);
            const data = await res.json();
            if (data.data) {
              setDeleteJobModal({
                open: true,
                job,
                loading: false,
                linkedCount: data.data.linkedTransactionsCount ?? 0,
                canDelete: data.data.canDelete ?? false,
              });
            }
          } catch {
            toast.error('Failed to check job dependencies');
          }
        },
        danger: true,
      });
    }

    if (options.length > 0) {
      openContextMenu(e.clientX, e.clientY, options);
    }
  };

  const handleDeleteJob = async () => {
    if (!deleteJobModal.job) return;
    setDeleteJobModal((prev) => ({ ...prev, loading: true }));
    try {
      await deleteJob(deleteJobModal.job.id).unwrap();
      toast.success('Job deleted');
      setDeleteJobModal({ open: false, job: null, loading: false, linkedCount: 0, canDelete: true });
    } catch (err: any) {
      toast.error(err?.data?.error ?? 'Failed to delete job');
      setDeleteJobModal((prev) => ({ ...prev, loading: false }));
    }
  };

  const handleJobCardDoubleClick = (job: Job) => {
    router.push(`/jobs/${job.id}/consumption-costing`);
  };

  return (
    <div className="h-screen flex flex-col bg-slate-900">
      {/* Breadcrumb Header */}
      <div className="bg-slate-800/50 border-b border-slate-700 px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm">
          <span className="text-slate-400">Customers</span>
          {filteredCustomers.length > 0 && (
            <>
              <span className="text-slate-500">/</span>
              <span className="text-slate-300">{filteredCustomers.length} items</span>
            </>
          )}
        </div>
        {/* Three-dot Menu */}
        <div className="relative">
          <button
            onClick={() => setMenuOpen(!menuOpen)}
            className="p-1.5 rounded-lg bg-slate-700/50 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors"
          >
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
              <path d="M10 6a2 2 0 11-4 0 2 2 0 014 0zM10 12a2 2 0 11-4 0 2 2 0 014 0zM10 18a2 2 0 11-4 0 2 2 0 014 0z" />
            </svg>
          </button>
          {menuOpen && (
            <div className="absolute right-0 mt-2 w-48 bg-slate-800 border border-slate-700 rounded-lg shadow-lg z-50">
              {canCreate && (
                <button
                  onClick={openCreate}
                  className="w-full px-4 py-2.5 text-left text-sm text-white hover:bg-slate-700 transition-colors flex items-center gap-2 first:rounded-t-lg"
                >
                  <span>+</span> Add Customer
                </button>
              )}
              {canEdit && (
                <button
                  type="button"
                  onClick={handleSyncPartyCustomers}
                  disabled={isSyncingParty}
                  className="w-full px-4 py-2.5 text-left text-sm text-sky-200 hover:bg-slate-700 transition-colors flex items-center gap-2 disabled:opacity-50"
                >
                  {isSyncingParty ? 'Syncing…' : '↻ Sync from party API'}
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Main Content */}
      <div className="flex flex-1 overflow-hidden gap-4 p-4">
        {/* Left Sidebar - Customer/Job List */}
        <div className="w-80 bg-slate-800 border border-slate-700 rounded-lg overflow-hidden flex flex-col">
          {/* Search Bar */}
          <div className="p-4 border-b border-slate-700">
            <div className="relative">
              <input
                type="text"
                placeholder="Search customers or jobs..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg text-white text-sm focus:ring-2 focus:ring-emerald-500 focus:border-transparent pr-9"
              />
              {searchQuery && (
                <button
                  onClick={() => {
                    setSearchQuery('');
                    setSearchResults([]);
                  }}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-white transition-colors"
                >
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                  </svg>
                </button>
              )}
            </div>
            {!searchQuery.trim() && (
              <div className="flex gap-2 mt-3">
                <button
                  onClick={() => setFilterActive('all')}
                  className={`flex-1 px-2 py-1 rounded text-xs font-medium transition-colors ${
                    filterActive === 'all'
                      ? 'bg-emerald-600 text-white'
                      : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                  }`}
                >
                  All
                </button>
                <button
                  onClick={() => setFilterActive('active')}
                  className={`flex-1 px-2 py-1 rounded text-xs font-medium transition-colors ${
                    filterActive === 'active'
                      ? 'bg-emerald-600 text-white'
                      : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                  }`}
                >
                  Active
                </button>
                <button
                  onClick={() => setFilterActive('inactive')}
                  className={`flex-1 px-2 py-1 rounded text-xs font-medium transition-colors ${
                    filterActive === 'inactive'
                      ? 'bg-emerald-600 text-white'
                      : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                  }`}
                >
                  Inactive
                </button>
              </div>
            )}
          </div>

          {/* List Content */}
          <div className="flex-1 overflow-y-auto">
            {searchQuery.trim() ? (
              // Search Results
              <>
                <div className="p-3 sticky top-0 bg-slate-800 border-b border-slate-700">
                  <p className="text-xs text-slate-400">
                    Matching search results ({searchResults.length})
                  </p>
                </div>
                {searchLoading ? (
                  // Loading skeleton
                  <div className="space-y-2 p-2">
                    {[1, 2, 3].map((i) => (
                      <div key={i} className="p-3 rounded-lg bg-slate-700/30 animate-pulse">
                        <div className="h-4 bg-slate-600/50 rounded w-3/4"></div>
                        <div className="h-3 bg-slate-600/50 rounded w-1/2 mt-2"></div>
                      </div>
                    ))}
                  </div>
                ) : searchResults.length === 0 ? (
                  <div className="p-4 text-center text-slate-400 text-sm">No results found</div>
                ) : (
                  <div className="space-y-1 p-2">
                    {searchResults.map((result, idx) => (
                      <div
                        key={`${result.type}-${idx}`}
                        onClick={() => {
                          if (result.type === 'customer' && result.customer) {
                            setSelectedCustomerId(result.customer.id);
                            setSearchQuery('');
                            setSearchResults([]);
                          } else if (result.type === 'job' && result.customer) {
                            // Clicking job result opens the customer profile
                            setSelectedCustomerId(result.customer.id);
                            setSearchQuery('');
                            setSearchResults([]);
                          }
                        }}
                        onContextMenu={(e) => {
                          if (result.type === 'customer' && result.customer) {
                            handleCustomerContextMenu(result.customer, e);
                          }
                        }}
                        className={`p-3 rounded-lg cursor-pointer transition-all ${
                          result.type === 'customer' && result.customer?.id === selectedCustomerId
                            ? 'bg-emerald-600/20 border border-emerald-500'
                            : 'bg-slate-700/50 border border-slate-700 hover:border-slate-600'
                        }`}
                      >
                        {result.type === 'customer' && result.customer ? (
                          <>
                            <p className="font-semibold text-white text-sm">
                              {highlightMatch(result.customer.name, searchQuery)}
                            </p>
                            <p className="text-xs text-slate-400 mt-1">Customer</p>
                          </>
                        ) : (
                          <>
                            <p className="font-semibold text-white text-sm">{result.companyName}</p>
                            <p className="text-xs text-slate-400 mt-1">
                              {highlightMatch(result.job?.jobNumber || '', searchQuery)}
                            </p>
                          </>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </>
            ) : (
              // Regular customer list (simplified - just names)
              <>
                {isFetching && filteredCustomers.length === 0 ? (
                  <div className="p-4 text-center text-slate-400 text-sm">Loading...</div>
                ) : filteredCustomers.length === 0 ? (
                  <div className="p-4 text-center text-slate-400 text-sm">No customers found</div>
                ) : (
                  <div className="space-y-1 p-2">
                    {filteredCustomers.map((customer) => (
                      <div
                        key={customer.id}
                        onClick={() => setSelectedCustomerId(customer.id)}
                        onContextMenu={(e) => handleCustomerContextMenu(customer, e)}
                        className={`p-3 rounded-lg cursor-pointer transition-all ${
                          selectedCustomerId === customer.id
                            ? 'bg-emerald-600/20 border border-emerald-500'
                            : 'bg-slate-700/50 border border-slate-700 hover:border-slate-600'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-1">
                          <p className="font-semibold text-white text-sm truncate">{customer.name}</p>
                          {customer.source === 'PARTY_API_SYNC' && (
                            <Badge label="Synced" variant="blue" />
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        {/* Right Panel - Customer Details */}
        <div className="flex-1 bg-slate-800 border border-slate-700 rounded-lg overflow-hidden flex flex-col">
          {!selectedCustomer ? (
            <div className="flex items-center justify-center h-full text-slate-400">
              <div className="text-center">
                <p className="text-lg mb-2">👋 Select a customer to get started</p>
                <p className="text-sm">Choose from the list on the left or create a new customer</p>
              </div>
            </div>
          ) : (
            <>
              {/* Customer Header */}
              <div className="bg-slate-700/50 border-b border-slate-700 p-6">
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-2xl font-bold text-white">{selectedCustomer.name}</h2>
                      {selectedCustomer.source === 'PARTY_API_SYNC' && (
                        <Badge label="Synced from party API" variant="blue" />
                      )}
                    </div>
                    {selectedCustomer.address && (
                      <p className="text-sm text-slate-400 mt-1">📍 {selectedCustomer.address}</p>
                    )}
                  </div>
                  <div className="flex gap-2">
                    {canEdit && (
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => handleEditClick(selectedCustomer)}
                      >
                        ✏️ Edit
                      </Button>
                    )}
                    {canCreate && (
                      <Button
                        size="sm"
                        onClick={() =>
                          router.push(`/jobs/form?mode=create&customerId=${selectedCustomer.id}`)
                        }
                      >
                        + Job
                      </Button>
                    )}
                  </div>
                </div>

                {/* Party API–aligned fields */}
                <div className="grid grid-cols-2 gap-4">
                  {selectedCustomer.email && (
                    <div>
                      <p className="text-xs text-slate-400">email</p>
                      <p className="text-sm text-white break-all">{selectedCustomer.email}</p>
                    </div>
                  )}
                  <div>
                    <p className="text-xs text-slate-400">Status</p>
                    <Badge
                      label={selectedCustomer.isActive ? 'Active' : 'Inactive'}
                      variant={selectedCustomer.isActive ? 'green' : 'gray'}
                    />
                  </div>
                  {selectedCustomer.tradeLicenseNumber && (
                    <div>
                      <p className="text-xs text-slate-400">trade_license_number</p>
                      <p className="text-sm text-white">{selectedCustomer.tradeLicenseNumber}</p>
                    </div>
                  )}
                  {selectedCustomer.tradeLicenseAuthority && (
                    <div>
                      <p className="text-xs text-slate-400">trade_license_authority</p>
                      <p className="text-sm text-white">{selectedCustomer.tradeLicenseAuthority}</p>
                    </div>
                  )}
                  {selectedCustomer.tradeLicenseExpiry && (
                    <div>
                      <p className="text-xs text-slate-400">trade_license_expiry</p>
                      <p className="text-sm text-white">
                        {new Date(selectedCustomer.tradeLicenseExpiry).toLocaleDateString()}
                      </p>
                    </div>
                  )}
                  {selectedCustomer.trnNumber && (
                    <div>
                      <p className="text-xs text-slate-400">trn_number</p>
                      <p className="text-sm text-white">{selectedCustomer.trnNumber}</p>
                    </div>
                  )}
                  {selectedCustomer.trnExpiry && (
                    <div>
                      <p className="text-xs text-slate-400">trn_expiry</p>
                      <p className="text-sm text-white">
                        {new Date(selectedCustomer.trnExpiry).toLocaleDateString()}
                      </p>
                    </div>
                  )}
                </div>

                {Array.isArray(selectedCustomer.contactsJson) &&
                  selectedCustomer.contactsJson.length > 0 && (
                    <div className="mt-4 border-t border-slate-600 pt-4">
                      <p className="text-xs font-medium text-slate-400 mb-2">contacts</p>
                      <div className="space-y-2">
                        {(selectedCustomer.contactsJson as Record<string, unknown>[]).map(
                          (row, idx) => (
                            <div
                              key={idx}
                              className="rounded-lg bg-slate-900/50 border border-slate-600/50 px-3 py-2 text-sm"
                            >
                              <p className="text-white font-medium">
                                {String(row.contact_name ?? '')}
                                <span className="text-slate-500 font-normal text-xs ml-2">
                                  sort_order {String(row.sort_order ?? idx)}
                                </span>
                              </p>
                              <div className="text-slate-400 text-xs mt-1 flex flex-wrap gap-x-4">
                                {row.email != null && String(row.email) !== '' && (
                                  <span>email: {String(row.email)}</span>
                                )}
                                {row.phone != null && String(row.phone) !== '' && (
                                  <span>phone: {String(row.phone)}</span>
                                )}
                              </div>
                            </div>
                          )
                        )}
                      </div>
                    </div>
                  )}

                {!Array.isArray(selectedCustomer.contactsJson) ||
                (selectedCustomer.contactsJson as unknown[]).length === 0 ? (
                  <div className="grid grid-cols-2 gap-4 mt-2">
                    {selectedCustomer.contactPerson && (
                      <div>
                        <p className="text-xs text-slate-400">Primary contact (legacy)</p>
                        <p className="text-sm text-white">{selectedCustomer.contactPerson}</p>
                      </div>
                    )}
                    {selectedCustomer.phone && (
                      <div>
                        <p className="text-xs text-slate-400">phone</p>
                        <p className="text-sm text-white">{selectedCustomer.phone}</p>
                      </div>
                    )}
                  </div>
                ) : null}
              </div>

              {/* Jobs Section */}
              <div className="flex-1 overflow-y-auto p-6">
                <h3 className="text-lg font-semibold text-white mb-4">Active Jobs ({customerJobs.length})</h3>

                {customerJobs.length === 0 ? (
                  <div className="text-center py-12 text-slate-400">
                    <p className="text-sm">No active jobs for this customer</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {customerJobs.map((job) => {
                      const variations = getJobVariations(job.id);
                      const isExpanded = expandedJobs.has(job.id);

                      return (
                        <div key={job.id}>
                          {/* Parent Job Card */}
                          <div
                            onClick={() => {
                              if (variations.length > 0) {
                                toggleJobVariations(job.id);
                              }
                            }}
                            onDoubleClick={() => handleJobCardDoubleClick(job)}
                            onContextMenu={(e) => handleJobContextMenu(job, e)}
                            className="p-4 bg-slate-700/50 border border-slate-700 rounded-lg hover:border-slate-600 cursor-pointer transition-colors select-none group relative"
                          >
                            {variations.length > 0 && (
                              <div className="absolute left-2 top-1/2 -translate-y-1/2">
                                <svg
                                  className={`w-4 h-4 text-slate-400 transition-transform ${isExpanded ? 'rotate-90' : ''}`}
                                  fill="currentColor"
                                  viewBox="0 0 20 20"
                                >
                                  <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
                                </svg>
                              </div>
                            )}
                            <div className="flex items-start justify-between gap-3 mb-2 pl-6">
                              <div className="flex-1">
                                <p className="font-semibold text-white">{job.jobNumber}</p>
                                <p className="text-xs text-slate-400 mt-1">{job.description}</p>
                              </div>
                              <Badge label={job.status} variant="blue" />
                            </div>
                            {job.site && (
                              <p className="text-xs text-slate-400 pl-6">📍 {job.site}</p>
                            )}
                          </div>

                          {/* Job Variations */}
                          {isExpanded && variations.length > 0 && (
                            <div className="space-y-2 mt-2 ml-4 pl-2 border-l border-slate-700">
                              {variations.map((variation) => (
                                <div
                                  key={variation.id}
                                  onClick={() => {
                                    // Single-click: just show selected effect
                                  }}
                                  onDoubleClick={() => handleJobCardDoubleClick(variation)}
                                  onContextMenu={(e) => handleJobContextMenu(variation, e)}
                                  className="p-3 bg-slate-700/30 border border-slate-700/50 rounded-lg hover:border-slate-600 cursor-pointer transition-colors"
                                >
                                  <div className="flex items-start justify-between gap-3 mb-2">
                                    <div className="flex-1">
                                      <p className="font-semibold text-white text-sm">{variation.jobNumber}</p>
                                      <p className="text-xs text-slate-400 mt-1">{variation.description}</p>
                                    </div>
                                    <Badge label={variation.status} variant="blue" />
                                  </div>
                                  {variation.site && (
                                    <p className="text-xs text-slate-400">📍 {variation.site}</p>
                                  )}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Edit/Create Modal */}
      <Modal
        isOpen={modal}
        onClose={() => setModal(false)}
        title={editing ? 'Edit Customer' : 'Add Customer'}
        actions={
          <div className="flex gap-2">
            <Button type="button" variant="ghost" onClick={() => setModal(false)} size="sm">
              Cancel
            </Button>
            <Button type="submit" form="customer-form" loading={isCreating || isUpdating} size="sm">
              {editing ? 'Update' : 'Create'}
            </Button>
          </div>
        }
      >
        <form id="customer-form" onSubmit={handleSave} className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
          <p className="text-xs text-slate-500">
            Field names match the party lists API (see API-party-lists.md). Primary phone / contact name
            are taken from the first row in <code className="text-slate-400">contacts</code> when present.
          </p>
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1.5">name *</label>
            <input
              required
              value={partyForm.name}
              onChange={(e) => setPartyForm((p) => ({ ...p, name: e.target.value }))}
              className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg text-white text-sm focus:ring-2 focus:ring-emerald-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1.5">email</label>
            <input
              type="email"
              value={partyForm.email}
              onChange={(e) => setPartyForm((p) => ({ ...p, email: e.target.value }))}
              className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg text-white text-sm focus:ring-2 focus:ring-emerald-500"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1.5">trade_license_number</label>
              <input
                value={partyForm.trade_license_number}
                onChange={(e) =>
                  setPartyForm((p) => ({ ...p, trade_license_number: e.target.value }))
                }
                className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg text-white text-sm focus:ring-2 focus:ring-emerald-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1.5">trade_license_authority</label>
              <input
                value={partyForm.trade_license_authority}
                onChange={(e) =>
                  setPartyForm((p) => ({ ...p, trade_license_authority: e.target.value }))
                }
                className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg text-white text-sm focus:ring-2 focus:ring-emerald-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1.5">trade_license_expiry</label>
              <input
                type="date"
                value={partyForm.trade_license_expiry}
                onChange={(e) =>
                  setPartyForm((p) => ({ ...p, trade_license_expiry: e.target.value }))
                }
                className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg text-white text-sm focus:ring-2 focus:ring-emerald-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1.5">trn_number</label>
              <input
                value={partyForm.trn_number}
                onChange={(e) => setPartyForm((p) => ({ ...p, trn_number: e.target.value }))}
                className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg text-white text-sm focus:ring-2 focus:ring-emerald-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1.5">trn_expiry</label>
              <input
                type="date"
                value={partyForm.trn_expiry}
                onChange={(e) => setPartyForm((p) => ({ ...p, trn_expiry: e.target.value }))}
                className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg text-white text-sm focus:ring-2 focus:ring-emerald-500"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1.5">address (AMFGI only)</label>
            <textarea
              value={partyForm.address}
              onChange={(e) => setPartyForm((p) => ({ ...p, address: e.target.value }))}
              rows={2}
              className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg text-white text-sm focus:ring-2 focus:ring-emerald-500 resize-none"
            />
          </div>
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-sm font-medium text-slate-300">contacts</label>
              <button
                type="button"
                onClick={addContactRow}
                className="text-xs text-emerald-400 hover:text-emerald-300"
              >
                + Add contact
              </button>
            </div>
            <div className="space-y-3">
              {partyForm.contacts.map((row, idx) => (
                <div
                  key={idx}
                  className="rounded-lg border border-slate-600 bg-slate-900/40 p-3 space-y-2"
                >
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-slate-500">sort_order {idx}</span>
                    {partyForm.contacts.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeContactRow(idx)}
                        className="text-xs text-red-400 hover:text-red-300"
                      >
                        Remove
                      </button>
                    )}
                  </div>
                  <input
                    placeholder="contact_name"
                    value={row.contact_name}
                    onChange={(e) => updateContactRow(idx, { contact_name: e.target.value })}
                    className="w-full px-2 py-1.5 bg-slate-900 border border-slate-600 rounded text-white text-sm"
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      type="email"
                      placeholder="email"
                      value={row.email}
                      onChange={(e) => updateContactRow(idx, { email: e.target.value })}
                      className="w-full px-2 py-1.5 bg-slate-900 border border-slate-600 rounded text-white text-sm"
                    />
                    <input
                      placeholder="phone"
                      value={row.phone}
                      onChange={(e) => updateContactRow(idx, { phone: e.target.value })}
                      className="w-full px-2 py-1.5 bg-slate-900 border border-slate-600 rounded text-white text-sm"
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </form>
      </Modal>

      {/* Delete Customer Modal */}
      {deleteModal.open && deleteModal.customer && (
        <>
          <div
            className="fixed inset-0 bg-black/50 z-40"
            onClick={() => setDeleteModal({ open: false, customer: null, loading: false })}
          />
          <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 bg-slate-800 border border-slate-700 rounded-xl p-6 max-w-md shadow-2xl">
            <h2 className="text-lg font-semibold text-white mb-2">Delete Customer</h2>
            <p className="text-slate-300 text-sm mb-6">
              Remove <strong>{deleteModal.customer.name}</strong>? If this customer has jobs, they will
              be kept and the customer will only be marked inactive.
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setDeleteModal({ open: false, customer: null, loading: false })}
                disabled={deleteModal.loading}
                className="px-4 py-2 rounded-lg bg-slate-700 text-slate-300 hover:bg-slate-600 text-sm font-medium"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={deleteModal.loading}
                className="px-4 py-2 rounded-lg bg-red-600 text-white hover:bg-red-500 text-sm font-medium"
              >
                Delete
              </button>
            </div>
          </div>
        </>
      )}

      {/* Delete Job Modal */}
      {deleteJobModal.open && deleteJobModal.job && (
        <>
          <div
            className="fixed inset-0 bg-black/50 z-40"
            onClick={() => setDeleteJobModal({ open: false, job: null, loading: false, linkedCount: 0, canDelete: true })}
          />
          <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 bg-slate-800 border border-slate-700 rounded-xl p-6 max-w-md shadow-2xl">
            <h2 className="text-lg font-semibold text-white mb-2">
              Delete {deleteJobModal.job.parentJobId ? 'Job Variation' : 'Job'}?
            </h2>

            {deleteJobModal.canDelete ? (
              <>
                <p className="text-slate-300 text-sm mb-6">
                  Delete <strong>{deleteJobModal.job.jobNumber}</strong>?
                </p>
                <p className="text-slate-400 text-xs mb-4">
                  {deleteJobModal.job.parentJobId ? 'This variation will be permanently removed.' : 'This job and all its variations will be permanently removed.'}
                </p>
              </>
            ) : (
              <>
                <p className="text-slate-300 text-sm mb-4">
                  Cannot delete <strong>{deleteJobModal.job.jobNumber}</strong>
                </p>
                <div className="bg-red-600/15 border border-red-500/30 rounded-lg p-3 mb-6">
                  <p className="text-sm text-red-300 font-medium mb-2">This job has linked data:</p>
                  <p className="text-sm text-red-300">
                    {deleteJobModal.linkedCount} transaction{deleteJobModal.linkedCount !== 1 ? 's' : ''} using this job
                  </p>
                </div>
              </>
            )}

            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setDeleteJobModal({ open: false, job: null, loading: false, linkedCount: 0, canDelete: true })}
                disabled={deleteJobModal.loading}
                className="px-4 py-2 rounded-lg bg-slate-700 text-slate-300 hover:bg-slate-600 text-sm font-medium"
              >
                {deleteJobModal.canDelete ? 'Cancel' : 'Close'}
              </button>
              {deleteJobModal.canDelete && (
                <button
                  onClick={handleDeleteJob}
                  disabled={deleteJobModal.loading}
                  className="px-4 py-2 rounded-lg bg-red-600 text-white hover:bg-red-500 text-sm font-medium"
                >
                  {deleteJobModal.loading ? 'Deleting...' : 'Delete'}
                </button>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
