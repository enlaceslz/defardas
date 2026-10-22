import React, { createContext, useContext, useState, useEffect } from 'react';
import { api } from './client';

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
  user: UserSession;
  availableRoles: { role: UserRole; label: string; name: string }[];
  isServerOnline: boolean;
  switchRole: (role: UserRole) => Promise<void>;
  refreshHealth: () => Promise<void>;
}

const DEFAULT_SESSION: UserSession = {
  id: '11111111-1111-1111-1111-111111111111',
  fullName: 'Carlos Eduardo Silva',
  email: 'admin@defardas.com.br',
  role: 'admin',
};

const AVAILABLE_ROLES: { role: UserRole; label: string; name: string }[] = [
  { role: 'admin', label: 'Administrador (Alçada Total)', name: 'Carlos Eduardo Silva' },
  { role: 'gerente_comercial', label: 'Gerente Comercial', name: 'Roberto Mendes' },
  { role: 'vendedor', label: 'Vendedora Comercial', name: 'Mariana Alencar' },
  { role: 'pcp_producao', label: 'PCP & Chão de Fábrica', name: 'Raimundo Nonato' },
  { role: 'financeiro', label: 'Controladoria & Finanças', name: 'Juliana Rocha' },
  { role: 'expedicao_qualidade', label: 'Qualidade & Expedição', name: 'Patrícia Soares' },
];

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<UserSession>(DEFAULT_SESSION);
  const [isServerOnline, setIsServerOnline] = useState<boolean>(true);

  const refreshHealth = async () => {
    const health = await api.getHealth();
    setIsServerOnline(health.status === 200);
  };

  useEffect(() => {
    refreshHealth();
    api.getMe().then((res) => {
      if (res.data?.user) {
        setUser(res.data.user);
      }
    });
  }, []);

  const switchRole = async (targetRole: UserRole) => {
    const res = await api.switchRole(targetRole);
    if (res.data?.user) {
      setUser(res.data.user);
    } else {
      const fallback = AVAILABLE_ROLES.find((r) => r.role === targetRole);
      if (fallback) {
        setUser({
          id: `usr-${targetRole}`,
          fullName: fallback.name,
          email: `${targetRole}@defardas.com.br`,
          role: targetRole,
        });
        api.setRole(targetRole);
      }
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        availableRoles: AVAILABLE_ROLES,
        isServerOnline,
        switchRole,
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
