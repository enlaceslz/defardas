import React, { createContext, useContext, useState, useEffect } from 'react';
import { api, UserSessionData } from './client';

export type UserRole = 
  | 'admin' 
  | 'gerente_comercial' 
  | 'vendedor' 
  | 'pcp_producao' 
  | 'financeiro' 
  | 'expedicao_qualidade';

export interface UserSession {
  id: string;
  fullName: string;
  email: string;
  role: UserRole;
}

interface AuthContextType {
  user: UserSession | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  availableRoles: { role: UserRole; label: string; name: string }[];
  isServerOnline: boolean;
  login: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => Promise<void>;
  switchRoleDev: (role: UserRole) => Promise<boolean>;
  refreshAuth: () => Promise<void>;
  refreshHealth: () => Promise<void>;
}

export const AVAILABLE_ROLES: { role: UserRole; label: string; name: string }[] = [
  { role: 'admin', label: 'Administrador (Alçada Total)', name: 'Carlos Eduardo Silva' },
  { role: 'gerente_comercial', label: 'Gerente Comercial', name: 'Roberto Mendes' },
  { role: 'vendedor', label: 'Vendedora Comercial', name: 'Mariana Alencar' },
  { role: 'pcp_producao', label: 'PCP & Chão de Fábrica', name: 'Raimundo Nonato' },
  { role: 'financeiro', label: 'Controladoria & Finanças', name: 'Juliana Rocha' },
  { role: 'expedicao_qualidade', label: 'Qualidade & Expedição', name: 'Patrícia Soares' },
];

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<UserSession | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isServerOnline, setIsServerOnline] = useState<boolean>(true);

  const refreshHealth = async () => {
    const health = await api.getHealth();
    setIsServerOnline(health.status === 200);
  };

  const refreshAuth = async () => {
    setIsLoading(true);
    try {
      const res = await api.getMe();
      if (res.status === 200 && res.data?.user) {
        setUser(res.data.user as UserSession);
      } else {
        setUser(null);
      }
    } catch {
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    refreshHealth();
    refreshAuth();
  }, []);

  const login = async (email: string, password: string) => {
    setIsLoading(true);
    try {
      const res = await api.login(email, password);
      if (res.status === 200 && res.data?.user) {
        setUser(res.data.user as UserSession);
        return { success: true };
      }
      return { success: false, error: res.error || 'Credenciais inválidas.' };
    } catch (err: any) {
      return { success: false, error: err.message || 'Falha de comunicação com o servidor.' };
    } finally {
      setIsLoading(false);
    }
  };

  const logout = async () => {
    setIsLoading(true);
    try {
      await api.logout();
    } finally {
      setUser(null);
      setIsLoading(false);
    }
  };

  // Alternador de perfil seguro para desenvolvimento (exige admin)
  const switchRoleDev = async (targetRole: UserRole): Promise<boolean> => {
    try {
      const res = await api.switchRoleDev(targetRole);
      if (res.status === 200 && res.data?.user) {
        setUser(res.data.user as UserSession);
        return true;
      }
      return false;
    } catch {
      return false;
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated: !!user,
        isLoading,
        availableRoles: AVAILABLE_ROLES,
        isServerOnline,
        login,
        logout,
        switchRoleDev,
        refreshAuth,
        refreshHealth,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
