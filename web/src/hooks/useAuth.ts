import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';

import { api } from '../lib/api';
import { useAuthStore } from '../stores/auth.store';

import type { AuthResponse } from '../stores/auth.store';
import type { LoginInput } from '@unithor/shared';

export const useLoginMutation = () => {
  const queryClient = useQueryClient();
  const setUser = useAuthStore((state) => state.setUser);

  return useMutation({
    mutationFn: async (credentials: LoginInput) => {
      const response = await api.post<AuthResponse>('/auth/login', credentials);
      return response.data.user;
    },
    onSuccess: (user) => {
      queryClient.removeQueries();
      setUser(user);
    },
  });
};

export const useLogoutMutation = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const setUser = useAuthStore((state) => state.setUser);

  return useMutation({
    mutationFn: async () => {
      await api.post('/auth/logout');
    },
    onSuccess: () => {
      queryClient.clear();
      setUser(null);
      navigate('/login', { replace: true });
    },
  });
};
