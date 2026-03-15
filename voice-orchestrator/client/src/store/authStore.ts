import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface User {
  userId: string;
  email: string;
  tenantId: string;
  tenantSlug: string;
  tenantName: string;
  isSuperAdmin: boolean;
  enabledModules: string[];
  permissions: Record<string, unknown>;
}

interface AuthState {
  token: string | null;
  refreshToken: string | null;
  user: User | null;
  isAuthenticated: boolean;
  setAuth: (token: string, refreshToken: string, user: User) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      token: null,
      refreshToken: null,
      user: null,
      isAuthenticated: false,
      setAuth: (token, refreshToken, user) =>
        set({ token, refreshToken, user, isAuthenticated: true }),
      logout: () => {
        set({ token: null, refreshToken: null, user: null, isAuthenticated: false });
        window.location.href = '/login';
      },
    }),
    {
      name: 'celiyo-auth',
      partialize: (state) => ({
        token: state.token,
        refreshToken: state.refreshToken,
        user: state.user,
        isAuthenticated: state.isAuthenticated,
      }),
    },
  ),
);
