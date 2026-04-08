import { configureStore } from '@reduxjs/toolkit';
import materialsReducer from './slices/materialsSlice';
import jobsReducer      from './slices/jobsSlice';
import customersReducer from './slices/customersSlice';
import uiReducer        from './slices/uiSlice';
import companyReducer   from './slices/companySlice';
import { appApi }       from './api/appApi';
import { adminApi }     from './api/adminApi';

export const store = configureStore({
  reducer: {
    materials: materialsReducer,
    jobs:      jobsReducer,
    customers: customersReducer,
    ui:        uiReducer,
    company:   companyReducer,
    [appApi.reducerPath]: appApi.reducer,
    [adminApi.reducerPath]: adminApi.reducer,
  },
  middleware: (gDM) =>
    gDM()
      .concat(appApi.middleware)
      .concat(adminApi.middleware),
});

export type RootState   = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
