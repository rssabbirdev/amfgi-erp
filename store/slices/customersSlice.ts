import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';

export interface Customer {
  _id:           string;
  name:          string;
  contactPerson?: string;
  phone?:        string;
  email?:        string;
  address?:      string;
  isActive:      boolean;
  createdAt:     string;
}

interface CustomersState {
  items:   Customer[];
  loading: boolean;
  error:   string | null;
}

const initialState: CustomersState = { items: [], loading: false, error: null };

export const fetchCustomers = createAsyncThunk(
  'customers/fetchAll',
  async (_, { rejectWithValue }) => {
    const res = await fetch('/api/customers');
    if (!res.ok) return rejectWithValue('Failed to fetch customers');
    const json = await res.json();
    return json.data as Customer[];
  }
);

export const createCustomer = createAsyncThunk(
  'customers/create',
  async (data: Partial<Customer>, { rejectWithValue }) => {
    const res = await fetch('/api/customers', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(data),
    });
    if (!res.ok) {
      const err = await res.json();
      return rejectWithValue(err.error ?? 'Failed to create customer');
    }
    return (await res.json()).data as Customer;
  }
);

export const updateCustomer = createAsyncThunk(
  'customers/update',
  async ({ id, data }: { id: string; data: Partial<Customer> }, { rejectWithValue }) => {
    const res = await fetch(`/api/customers/${id}`, {
      method:  'PUT',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(data),
    });
    if (!res.ok) {
      const err = await res.json();
      return rejectWithValue(err.error ?? 'Failed to update customer');
    }
    return (await res.json()).data as Customer;
  }
);

export const deleteCustomer = createAsyncThunk(
  'customers/delete',
  async ({ id, hardDelete = false }: { id: string; hardDelete?: boolean }, { rejectWithValue }) => {
    const res = await fetch(`/api/customers/${id}`, {
      method:  'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ hardDelete }),
    });
    if (!res.ok) {
      const err = await res.json();
      return rejectWithValue(err.error ?? 'Failed to delete customer');
    }
    return id;
  }
);

const customersSlice = createSlice({
  name: 'customers',
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(fetchCustomers.pending,   (s) => { s.loading = true;  s.error = null; })
      .addCase(fetchCustomers.fulfilled, (s, a) => { s.loading = false; s.items = a.payload; })
      .addCase(fetchCustomers.rejected,  (s, a) => { s.loading = false; s.error = a.payload as string; })
      .addCase(createCustomer.fulfilled, (s, a) => { s.items.unshift(a.payload); })
      .addCase(updateCustomer.fulfilled, (s, a) => {
        const idx = s.items.findIndex((i) => i._id === a.payload._id);
        if (idx !== -1) s.items[idx] = a.payload;
      })
      .addCase(deleteCustomer.fulfilled, (s, a) => {
        s.items = s.items.filter((i) => i._id !== a.payload);
      });
  },
});

export default customersSlice.reducer;
