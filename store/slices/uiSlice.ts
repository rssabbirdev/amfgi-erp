import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

interface UIState {
  activeModal: string | null;
  modalData:   unknown;
}

const initialState: UIState = {
  activeModal: null,
  modalData:   null,
};

const uiSlice = createSlice({
  name: 'ui',
  initialState,
  reducers: {
    openModal(state, action: PayloadAction<{ name: string; data?: unknown }>) {
      state.activeModal = action.payload.name;
      state.modalData   = action.payload.data ?? null;
    },
    closeModal(state) {
      state.activeModal = null;
      state.modalData   = null;
    },
  },
});

export const { openModal, closeModal } = uiSlice.actions;
export default uiSlice.reducer;
