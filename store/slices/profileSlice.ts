import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

interface ProfileState {
  activeProfileId:   string | null;
  allowedProfileIds: string[];
  role:              string | null;
}

const initialState: ProfileState = {
  activeProfileId:   null,
  allowedProfileIds: [],
  role:              null,
};

const profileSlice = createSlice({
  name: 'profile',
  initialState,
  reducers: {
    setProfile(
      state,
      action: PayloadAction<{
        activeProfileId:   string | null;
        allowedProfileIds: string[];
        role:              string;
      }>
    ) {
      state.activeProfileId   = action.payload.activeProfileId;
      state.allowedProfileIds = action.payload.allowedProfileIds;
      state.role              = action.payload.role;
    },
    switchActiveProfile(state, action: PayloadAction<string | null>) {
      state.activeProfileId = action.payload;
    },
  },
});

export const { setProfile, switchActiveProfile } = profileSlice.actions;
export default profileSlice.reducer;
