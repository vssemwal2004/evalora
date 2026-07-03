import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, clearCsrfToken, setCsrfToken } from '../../lib/api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [token, setToken] = useState(() => localStorage.getItem('evalora_token'));
  const [user, setUser] = useState(() => {
    const stored = localStorage.getItem('evalora_user');
    return stored ? JSON.parse(stored) : null;
  });
  const [isBootstrapping, setIsBootstrapping] = useState(Boolean(token));

  useEffect(() => {
    function handleAuthExpired() {
      localStorage.removeItem('evalora_token');
      localStorage.removeItem('evalora_user');
      clearCsrfToken();
      setToken(null);
      setUser(null);
    }

    window.addEventListener('evalora:auth-expired', handleAuthExpired);
    return () => window.removeEventListener('evalora:auth-expired', handleAuthExpired);
  }, []);

  useEffect(() => {
    let ignore = false;

    async function loadSession() {
      if (!token) {
        setIsBootstrapping(false);
        return;
      }

      try {
        const response = await api.get('/auth/me');
        if (!ignore) {
          setUser(response.data.user);
          localStorage.setItem('evalora_user', JSON.stringify(response.data.user));
        }
      } catch {
        if (!ignore) {
          localStorage.removeItem('evalora_token');
          localStorage.removeItem('evalora_user');
          clearCsrfToken();
          setToken(null);
          setUser(null);
        }
      } finally {
        if (!ignore) {
          setIsBootstrapping(false);
        }
      }
    }

    loadSession();

    return () => {
      ignore = true;
    };
  }, [token]);

  async function login(payload) {
    const response = await api.post('/auth/login', payload);
    localStorage.setItem('evalora_token', response.data.token);
    localStorage.setItem('evalora_user', JSON.stringify(response.data.user));
    setCsrfToken(response.data.csrfToken);
    setToken(response.data.token);
    setUser(response.data.user);
    return response.data.user;
  }

  function logout() {
    api.post('/auth/logout').catch(() => null);
    localStorage.removeItem('evalora_token');
    localStorage.removeItem('evalora_user');
    clearCsrfToken();
    setToken(null);
    setUser(null);
  }

  const updateUser = useCallback((nextUser, nextToken, nextCsrfToken) => {
    if (nextToken) {
      localStorage.setItem('evalora_token', nextToken);
      setToken(nextToken);
    }

    if (nextCsrfToken) {
      setCsrfToken(nextCsrfToken);
    }

    localStorage.setItem('evalora_user', JSON.stringify(nextUser));
    setUser(nextUser);
  }, []);

  const value = useMemo(
    () => ({
      token,
      user,
      isAuthenticated: Boolean(token && user),
      isBootstrapping,
      login,
      logout,
      updateUser,
    }),
    [token, user, isBootstrapping, updateUser]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error('useAuth must be used inside AuthProvider.');
  }

  return context;
}
