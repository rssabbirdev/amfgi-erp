import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

interface CompanyState {
  activeCompanyId:     string | null;
  activeCompanySlug:   string | null;
  activeCompanyName:   string | null;
  allowedCompanyIds:   string[];
  permissions:         string[];
  isSuperAdmin:        boolean;
}

const initialState: CompanyState = {
  activeCompanyId:   null,
  activeCompanySlug: null,
  activeCompanyName: null,
  allowedCompanyIds: [],
  permissions:       [],
  isSuperAdmin:      false,
};

const companySlice = createSlice({
  name: 'company',
  initialState,
  reducers: {
    setCompanyState(state, action: PayloadAction<Partial<CompanyState>>) {
      return { ...state, ...action.payload };
    },
    switchActiveCompany(
      state,
      action: PayloadAction<{
        activeCompanyId:     string | null;
        activeCompanySlug:   string | null;
        activeCompanyName:   string | null;
        permissions:         string[];
      }>
    ) {
      state.activeCompanyId   = action.payload.activeCompanyId;
      state.activeCompanySlug = action.payload.activeCompanySlug;
      state.activeCompanyName = action.payload.activeCompanyName;
      state.permissions       = action.payload.permissions;
    },
  },
});

export const { setCompanyState, switchActiveCompany } = companySlice.actions;
export default companySlice.reducer;
