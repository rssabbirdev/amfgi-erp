import { configureStore } from '@reduxjs/toolkit';
import materialsReducer from './slices/materialsSlice';
import jobsReducer      from './slices/jobsSlice';
import customersReducer from './slices/customersSlice';
import uiReducer        from './slices/uiSlice';
import companyReducer   from './slices/companySlice';

export const store = configureStore({
  reducer: {
    materials: materialsReducer,
    jobs:      jobsReducer,
    customers: customersReducer,
    ui:        uiReducer,
    company:   companyReducer,
  },
});

export type RootState   = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
