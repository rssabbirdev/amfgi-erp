import { createSlice, createAsyncThunk, type PayloadAction } from '@reduxjs/toolkit';

export interface Material {
  _id:          string;
  name:         string;
  unit:         string;
  category?:    string;
  currentStock: number;
  reorderLevel?: number;
  unitCost?:    number;
  isActive:     boolean;
  createdAt:    string;
}

interface MaterialsState {
  items:   Material[];
  loading: boolean;
  error:   string | null;
}

const initialState: MaterialsState = { items: [], loading: false, error: null };

export const fetchMaterials = createAsyncThunk(
  'materials/fetchAll',
  async (_, { rejectWithValue }) => {
    const res = await fetch('/api/materials');
    if (!res.ok) return rejectWithValue('Failed to fetch materials');
    const json = await res.json();
    return json.data as Material[];
  }
);

export const createMaterial = createAsyncThunk(
  'materials/create',
  async (data: Partial<Material>, { rejectWithValue }) => {
    const res = await fetch('/api/materials', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(data),
    });
    if (!res.ok) {
      const err = await res.json();
      return rejectWithValue(err.error ?? 'Failed to create material');
    }
    const json = await res.json();
    return json.data as Material;
  }
);

export const updateMaterial = createAsyncThunk(
  'materials/update',
  async ({ id, data }: { id: string; data: Partial<Material> }, { rejectWithValue }) => {
    const res = await fetch(`/api/materials/${id}`, {
      method:  'PUT',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(data),
    });
    if (!res.ok) {
      const err = await res.json();
      return rejectWithValue(err.error ?? 'Failed to update material');
    }
    const json = await res.json();
    return json.data as Material;
  }
);

export const deleteMaterial = createAsyncThunk(
  'materials/delete',
  async ({ id, hardDelete = false }: { id: string; hardDelete?: boolean }, { rejectWithValue }) => {
    const res = await fetch(`/api/materials/${id}`, {
      method:  'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ hardDelete }),
    });
    if (!res.ok) {
      const err = await res.json();
      return rejectWithValue(err.error ?? 'Failed to delete material');
    }
    return id;
  }
);

const materialsSlice = createSlice({
  name: 'materials',
  initialState,
  reducers: {
    adjustStock(state, action: PayloadAction<{ id: string; delta: number }>) {
      const m = state.items.find((i) => i._id === action.payload.id);
      if (m) m.currentStock += action.payload.delta;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchMaterials.pending,   (s) => { s.loading = true;  s.error = null; })
      .addCase(fetchMaterials.fulfilled, (s, a) => { s.loading = false; s.items = a.payload; })
      .addCase(fetchMaterials.rejected,  (s, a) => { s.loading = false; s.error = a.payload as string; })
      .addCase(createMaterial.fulfilled, (s, a) => { s.items.unshift(a.payload); })
      .addCase(updateMaterial.fulfilled, (s, a) => {
        const idx = s.items.findIndex((i) => i._id === a.payload._id);
        if (idx !== -1) s.items[idx] = a.payload;
      })
      .addCase(deleteMaterial.fulfilled, (s, a) => {
        s.items = s.items.filter((i) => i._id !== a.payload);
      });
  },
});

export const { adjustStock } = materialsSlice.actions;
export default materialsSlice.reducer;
