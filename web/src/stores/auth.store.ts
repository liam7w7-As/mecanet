import { create } from 'zustand';

import { api, setSessionExpiredHandler } from '../lib/api';

import type { PermissionDefinition, Role } from '@unithor/shared';

export interface UserPublic {
  id: number;
  nombre: string;
  email: string;
  role: Role;
  permissions?: PermissionDefinition[];
}

export interface AuthResponse {
  user: UserPublic;
}

interface AuthState {
  user: UserPublic | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  setUser: (user: UserPublic | null) => void;
  checkAuth: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isAuthenticated: false,
  isLoading: true,

  setUser: (user) => {
    set({
      user,
      isAuthenticated: user !== null,
      isLoading: false,
    });
  },

  checkAuth: async () => {
    set({ isLoading: true });
    try {
      const response = await api.get<AuthResponse>('/auth/me');
      set({
        user: response.data.user,
        isAuthenticated: true,
        isLoading: false,
      });
    } catch {
      set({
        user: null,
        isAuthenticated: false,
        isLoading: false,
      });
    }
  },

}));

setSessionExpiredHandler(() => {
  useAuthStore.getState().setUser(null);
});
