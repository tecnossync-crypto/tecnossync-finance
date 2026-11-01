import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api, getToken, setToken } from './api';
import { LEVEL } from './constants';

const Ctx = createContext(null);
export const useAuth = () => useContext(Ctx);

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [ready, setReady] = useState(false);

  const refresh = useCallback(async () => {
    if (!getToken()) { setSession(null); setReady(true); return; }
    try { setSession(await api.get('/auth/me')); }
    catch { setSession(null); }
    setReady(true);
  }, []);

  useEffect(() => {
    refresh();
    const out = () => setSession(null);
    window.addEventListener('cuadre:logout', out);
    return () => window.removeEventListener('cuadre:logout', out);
  }, [refresh]);

  const applyToken = async (token) => { setToken(token); await refresh(); };
  const logout = () => { setToken(null); setSession(null); };
  const can = (min) => !!session && LEVEL[session.role] >= LEVEL[min];

  return (
    <Ctx.Provider value={{ ...session, session, ready, refresh, applyToken, logout, can }}>
      {children}
    </Ctx.Provider>
  );
}
