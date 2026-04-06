import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';

export interface Job {
  _id:         string;
  jobNumber:   string;
  customerId:  string | { _id: string; name: string };
  description: string;
  site?:       string;
  status:      'ACTIVE' | 'COMPLETED' | 'ON_HOLD' | 'CANCELLED';
  startDate?:  string;
  endDate?:    string;
  createdBy:   string;
  createdAt:   string;
}

interface JobsState {
  items:   Job[];
  loading: boolean;
  error:   string | null;
}

const initialState: JobsState = { items: [], loading: false, error: null };

export const fetchJobs = createAsyncThunk(
  'jobs/fetchAll',
  async (_, { rejectWithValue }) => {
    const res = await fetch('/api/jobs');
    if (!res.ok) return rejectWithValue('Failed to fetch jobs');
    return (await res.json()).data as Job[];
  }
);

export const createJob = createAsyncThunk(
  'jobs/create',
  async (data: Partial<Job>, { rejectWithValue }) => {
    const res = await fetch('/api/jobs', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(data),
    });
    if (!res.ok) {
      const err = await res.json();
      return rejectWithValue(err.error ?? 'Failed to create job');
    }
    return (await res.json()).data as Job;
  }
);

export const updateJob = createAsyncThunk(
  'jobs/update',
  async ({ id, data }: { id: string; data: Partial<Job> }, { rejectWithValue }) => {
    const res = await fetch(`/api/jobs/${id}`, {
      method:  'PUT',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(data),
    });
    if (!res.ok) {
      const err = await res.json();
      return rejectWithValue(err.error ?? 'Failed to update job');
    }
    return (await res.json()).data as Job;
  }
);

export const deleteJob = createAsyncThunk(
  'jobs/delete',
  async ({ id, hardDelete = false }: { id: string; hardDelete?: boolean }, { rejectWithValue }) => {
    const res = await fetch(`/api/jobs/${id}`, {
      method:  'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ hardDelete }),
    });
    if (!res.ok) {
      const err = await res.json();
      return rejectWithValue(err.error ?? 'Failed to delete job');
    }
    return id;
  }
);

const jobsSlice = createSlice({
  name: 'jobs',
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(fetchJobs.pending,   (s) => { s.loading = true;  s.error = null; })
      .addCase(fetchJobs.fulfilled, (s, a) => { s.loading = false; s.items = a.payload; })
      .addCase(fetchJobs.rejected,  (s, a) => { s.loading = false; s.error = a.payload as string; })
      .addCase(createJob.fulfilled, (s, a) => { s.items.unshift(a.payload); })
      .addCase(updateJob.fulfilled, (s, a) => {
        const idx = s.items.findIndex((i) => i._id === a.payload._id);
        if (idx !== -1) s.items[idx] = a.payload;
      })
      .addCase(deleteJob.fulfilled, (s, a) => {
        s.items = s.items.filter((i) => i._id !== a.payload);
      });
  },
});

export default jobsSlice.reducer;
