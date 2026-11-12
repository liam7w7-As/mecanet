import { isAxiosError } from 'axios';
import { create } from 'zustand';

import { api, getCookie, setSessionExpiredHandler } from '../lib/api';

import type { PermissionDefinition, Role } from '@unithor/shared';

export interface UserPublic {
  id: number;
  nombre: string;
  username?: string;
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

export const useAuthStore = create<AuthState>((set, get) => {
  let revision = 0;
  return {
    user: null,
    isAuthenticated: false,
    isLoading: true,

    setUser: (user) => {
      revision += 1;
      set({
        user,
        isAuthenticated: user !== null,
        isLoading: false,
      });
    },

    checkAuth: async () => {
      const requestRevision = ++revision;
      if (!getCookie('csrf_token')) {
        set({ user: null, isAuthenticated: false, isLoading: false });
        return;
      }

      // A background permission refresh must not unmount the current form.
      const restoringSession = !get().isAuthenticated || !get().user;
      set({ isLoading: restoringSession });
      try {
        const response = await api.get<AuthResponse>('/auth/me');
        if (requestRevision !== revision) return;
        set({
          user: response.data.user,
          isAuthenticated: true,
          isLoading: false,
        });
      } catch (error) {
        if (requestRevision !== revision) return;
        const sessionRejected =
          isAxiosError(error) && [401, 403].includes(error.response?.status ?? 0);
        if (!restoringSession && !sessionRejected) {
          set({ isLoading: false });
          return;
        }
        set({
          user: null,
          isAuthenticated: false,
          isLoading: false,
        });
      }
    },
  };
});

setSessionExpiredHandler(() => {
  useAuthStore.getState().setUser(null);
});
