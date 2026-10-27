import { create } from 'zustand';
import { applyTheme, loadTheme, saveTheme } from '../auth/accounts';
import {
  ACCESS_TOKEN_KEY,
  ApiError,
  CSRF_TOKEN_KEY,
  secureBaseApi,
  type RegisterResponse,
  type UserProfile,
} from '../auth/api';
import type { ThemeName } from '../auth/themes';

const ENTERED_KEY = 'securebase-entered';

interface SessionState {
  user: UserProfile | null;
  theme: ThemeName;
  entered: boolean;
  loading: boolean;
  error: string | null;
  initialize: () => () => void;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, name: string) => Promise<RegisterResponse>;
  signOut: () => Promise<void>;
  setTheme: (theme: ThemeName) => void;
  enter: () => void;
}

export const useSession = create<SessionState>((set) => ({
  user: null,
  theme: loadTheme(),
  entered: sessionStorage.getItem(ENTERED_KEY) === '1',
  loading: true,
  error: null,
  initialize: () => {
    let active = true;
    const syncUser = async () => {
      if (!active) return;
      try {
        const user = await secureBaseApi.currentUser();
        if (active) set({ user, error: null, loading: false });
      } catch (error) {
        const isUnauthorized = error instanceof ApiError && error.status === 401;
        if (isUnauthorized) {
          sessionStorage.removeItem(ACCESS_TOKEN_KEY);
          sessionStorage.removeItem(ENTERED_KEY);
        }
        if (active) {
          const failedState = {
            user: null,
            error: error instanceof Error ? error.message : 'Não foi possível carregar o perfil.',
            loading: false,
          };
          set(isUnauthorized ? { ...failedState, entered: false } : failedState);
        }
      }
    };

    void syncUser();
    return () => {
      active = false;
    };
  },
  signIn: async (email, password) => {
    set({ error: null });
    const session = await secureBaseApi.login(email, password);
    sessionStorage.setItem(ACCESS_TOKEN_KEY, session.access_token);
    localStorage.setItem(CSRF_TOKEN_KEY, session.csrf_token);
    set({ user: session.user, error: null });
  },
  signUp: async (email, password, name) => {
    set({ error: null });
    return await secureBaseApi.register(email, password, name);
  },
  signOut: async () => {
    let logoutError: string | null = null;
    try {
      await secureBaseApi.logout();
    } catch (error) {
      logoutError = error instanceof Error
        ? error.message
        : 'Não foi possível encerrar a sessão no servidor.';
    }
    sessionStorage.removeItem(ACCESS_TOKEN_KEY);
    sessionStorage.removeItem(ENTERED_KEY);
    localStorage.removeItem(CSRF_TOKEN_KEY);
    set({ user: null, entered: false, error: logoutError });
  },
  setTheme: (theme) => {
    saveTheme(theme);
    applyTheme(theme);
    set({ theme });
  },
  enter: () => {
    sessionStorage.setItem(ENTERED_KEY, '1');
    set({ entered: true });
  },
}));
