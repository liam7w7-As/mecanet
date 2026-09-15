import { create } from 'zustand';

import { api, setSessionExpiredHandler } from '../lib/api';

import type { LoginInput, Role } from '@unithor/shared';

export interface UserPublic {
  id: number;
  nombre: string;
  email: string;
  role: Role;
}

interface AuthResponse {
  user: UserPublic;
}

interface AuthState {
  user: UserPublic | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  setUser: (user: UserPublic | null) => void;
  checkAuth: () => Promise<void>;
  login: (credentials: LoginInput) => Promise<void>;
  logout: () => Promise<void>;
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

  login: async (credentials) => {
    const response = await api.post<AuthResponse>('/auth/login', credentials);
    set({
      user: response.data.user,
      isAuthenticated: true,
      isLoading: false,
    });
  },

  logout: async () => {
    try {
      await api.post('/auth/logout');
    } finally {
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
