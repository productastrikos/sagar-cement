import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { get, post, TOKEN_KEY } from './api';

const AuthContext = createContext(null);
const read = () => { try { return localStorage.getItem(TOKEN_KEY); } catch { return null; } };
const write = (v) => { try { if (v) localStorage.setItem(TOKEN_KEY, v); else localStorage.removeItem(TOKEN_KEY); } catch {} };

export function AuthProvider({ children }) {
  const [token, setToken] = useState(read);
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) { setLoading(false); return; }
    get('/auth/me').then((r) => setUser(r.user)).catch(() => { write(null); setToken(null); setUser(null); }).finally(() => setLoading(false));
  }, [token]);

  useEffect(() => {
    const onUnauth = () => { write(null); setToken(null); setUser(null); };
    window.addEventListener('clinkeriq:unauthorised', onUnauth);
    return () => window.removeEventListener('clinkeriq:unauthorised', onUnauth);
  }, []);

  const login = useCallback(async (username, password) => {
    const r = await post('/auth/login', { username, password });
    write(r.token); setToken(r.token); setUser(r.user);
    return r.user;
  }, []);

  const logout = useCallback(() => { write(null); setToken(null); setUser(null); }, []);

  return <AuthContext.Provider value={{ user, token, loading, login, logout }}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
