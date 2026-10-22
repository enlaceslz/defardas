import React, { useState } from 'react';
import { 
  Lock, 
  Mail, 
  ShieldCheck, 
  ArrowRight, 
  AlertCircle, 
  Building2, 
  Sparkles, 
  Eye, 
  EyeOff,
  ExternalLink,
  CheckCircle2,
  Users
} from 'lucide-react';
import { useAuth, UserRole, AVAILABLE_ROLES } from '../api/authContext';

interface LoginViewProps {
  onGoToPortal?: () => void;
}

export const LoginView: React.FC<LoginViewProps> = ({ onGoToPortal }) => {
  const { login, isServerOnline } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showDevCredentials, setShowDevCredentials] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    if (!email || !password) {
      setErrorMessage('Por favor, informe o e-mail e a senha.');
      return;
    }

    setIsSubmitting(true);
    try {
      const result = await login(email, password);
      if (!result.success) {
        setErrorMessage(result.error || 'Credenciais inválidas.');
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Falha ao conectar ao servidor de autenticação.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleQuickFill = (demoEmail: string) => {
    setEmail(demoEmail);
    setPassword('DeFardas@2026!');
    setErrorMessage(null);
  };

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col justify-center items-center p-4 sm:p-6 lg:p-8 text-slate-100 relative overflow-hidden select-none">
      
      {/* Decorative background glow */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[350px] bg-blue-600/15 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-10 right-10 w-[300px] h-[300px] bg-indigo-600/10 rounded-full blur-3xl pointer-events-none" />

      {/* Main Container */}
      <div className="w-full max-w-md z-10">
        
        {/* Brand Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-br from-blue-600 via-blue-700 to-indigo-800 text-white shadow-xl shadow-blue-900/50 mb-4 border border-blue-400/30">
            <ShieldCheck className="w-8 h-8 text-blue-200" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-white flex items-center justify-center gap-2">
            <span>DE FARDAS</span>
            <span className="text-xs px-2 py-0.5 rounded-md bg-blue-950 text-blue-400 border border-blue-800/80 font-mono font-semibold">
              ERP v1.6
            </span>
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Plataforma Integrada de Gestão Industrial & Confecção
          </p>
          <div className="flex items-center justify-center gap-2 text-xs text-slate-500 mt-2 font-mono">
            <Building2 className="w-3.5 h-3.5 text-blue-500" />
            <span>São Luís, Maranhão</span>
            <span>·</span>
            <span className={isServerOnline ? 'text-emerald-400 flex items-center gap-1' : 'text-amber-400'}>
              <span className={`w-1.5 h-1.5 rounded-full ${isServerOnline ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'}`} />
              {isServerOnline ? 'Servidor Conectado' : 'Aguardando Servidor'}
            </span>
          </div>
        </div>

        {/* Login Card */}
        <div className="bg-slate-900/90 backdrop-blur-xl border border-slate-800 rounded-2xl shadow-2xl p-6 sm:p-8">
          <div className="mb-6">
            <h2 className="text-lg font-semibold text-white">Acesso Restrito</h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Identifique-se para acessar o chão de fábrica, orçamentos e financeiro.
            </p>
          </div>

          {errorMessage && (
            <div className="mb-5 p-3 rounded-xl bg-red-950/60 border border-red-800/70 text-red-200 text-xs flex items-start gap-2.5 animate-fadeIn">
              <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
              <div className="flex-1">
                <span className="font-semibold">Erro de autenticação:</span> {errorMessage}
              </div>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Field: Email */}
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">
                E-mail Corporativo
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="seu.email@defardas.com.br"
                  required
                  autoComplete="username"
                  className="w-full bg-slate-950/80 border border-slate-700 rounded-xl pl-10 pr-4 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
                />
              </div>
            </div>

            {/* Field: Password */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-xs font-medium text-slate-300">
                  Senha
                </label>
                <span className="text-[11px] text-slate-500 font-mono">
                  Bcrypt com Salt R12
                </span>
              </div>
              <div className="relative">
                <Lock className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••••••"
                  required
                  autoComplete="current-password"
                  className="w-full bg-slate-950/80 border border-slate-700 rounded-xl pl-10 pr-10 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all font-mono"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors cursor-pointer"
                  title={showPassword ? 'Ocultar senha' : 'Exibir senha'}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full mt-2 inline-flex items-center justify-center gap-2 px-4 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white rounded-xl font-semibold text-sm shadow-lg shadow-blue-900/40 hover:shadow-blue-800/60 active:scale-[0.99] transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSubmitting ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span>Autenticando sessão...</span>
                </>
              ) : (
                <>
                  <span>Entrar no Sistema</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>

          {/* Quick Credential Helper (Dev & Test Mode) */}
          <div className="mt-6 pt-5 border-t border-slate-800">
            <button
              type="button"
              onClick={() => setShowDevCredentials(!showDevCredentials)}
              className="w-full flex items-center justify-between text-xs text-slate-400 hover:text-blue-400 transition-colors cursor-pointer py-1"
            >
              <span className="flex items-center gap-1.5 font-medium">
                <Users className="w-3.5 h-3.5 text-blue-400" />
                Perfis Pré-Cadastrados para Teste (Seed RBAC)
              </span>
              <span className="text-[11px] font-mono text-slate-500">
                {showDevCredentials ? '▲ Ocultar' : '▼ Ver'}
              </span>
            </button>

            {showDevCredentials && (
              <div className="mt-3 space-y-2 animate-fadeIn">
                <div className="p-2.5 rounded-lg bg-slate-950/70 border border-slate-800 text-[11px] text-slate-400">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-slate-300 font-semibold">Credenciais de Teste Homologadas:</span>
                    <span className="font-mono text-emerald-400 bg-emerald-950/80 px-1.5 py-0.5 rounded border border-emerald-800/60">
                      Senha: DeFardas@2026!
                    </span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 mt-2">
                    {AVAILABLE_ROLES.map((r) => {
                      const emailMap: Record<UserRole, string> = {
                        admin: 'admin@defardas.com.br',
                        vendedor: 'vendas@defardas.com.br',
                        pcp_producao: 'pcp@defardas.com.br',
                        financeiro: 'financeiro@defardas.com.br',
                        gerente_comercial: 'gerente@defardas.com.br',
                        expedicao_qualidade: 'qualidade@defardas.com.br',
                      };
                      const userEmail = emailMap[r.role];
                      return (
                        <button
                          key={r.role}
                          type="button"
                          onClick={() => handleQuickFill(userEmail)}
                          className="text-left p-2 rounded-lg bg-slate-900 hover:bg-slate-800/80 border border-slate-800 hover:border-blue-700/60 transition-all cursor-pointer group"
                        >
                          <div className="font-medium text-slate-200 group-hover:text-blue-300 truncate text-[11px]">
                            {r.label}
                          </div>
                          <div className="text-[10px] font-mono text-slate-500 truncate">
                            {userEmail}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Switch to Public Catalog View */}
        {onGoToPortal && (
          <div className="mt-6 text-center">
            <button
              onClick={onGoToPortal}
              className="inline-flex items-center gap-2 text-xs text-slate-400 hover:text-white transition-colors cursor-pointer group"
            >
              <span>Acessar Vitrine & Catálogo Digital Público</span>
              <ExternalLink className="w-3.5 h-3.5 text-blue-400 group-hover:translate-x-0.5 transition-transform" />
            </button>
          </div>
        )}

        {/* Footer Security Notice */}
        <div className="mt-6 text-center text-[11px] text-slate-600 font-mono">
          <span>DE FARDAS INDUSTRIAL · SÃO LUÍS - MA</span>
          <br />
          <span>Sessões protegidas com HttpOnly e SameSite Strict</span>
        </div>

      </div>
    </div>
  );
};
