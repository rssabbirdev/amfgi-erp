import { configureStore } from '@reduxjs/toolkit';
import uiReducer        from './slices/uiSlice';
import companyReducer   from './slices/companySlice';
import { appApi }       from './api/appApi';
import { adminApi }     from './api/adminApi';

export const store = configureStore({
  reducer: {
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
