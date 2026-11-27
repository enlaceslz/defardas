import React, { useState, useEffect, useRef } from 'react';
import {
  Lock,
  Mail,
  ArrowRight,
  ArrowLeft,
  AlertCircle,
  CheckCircle2,
  Eye,
  EyeOff,
  KeyRound,
  ShieldCheck,
  AlertTriangle,
} from 'lucide-react';
import { useAuth } from '../api/authContext';
import { api } from '../api/client';
import { DEFAULT_BRAND_LOGO_URL } from '../data/initialData';
import { PWAInstallButton } from './PWAInstallButton';

interface LoginViewProps {
  onGoToPortal?: () => void;
  logoUrl?: string;
  companyName?: string;
  locationLabel?: string;
}

type AuthScreenMode = 'login' | 'recover' | 'reset';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const LoginView: React.FC<LoginViewProps> = ({
  onGoToPortal,
  logoUrl,
  companyName = 'DE FARDAS',
  locationLabel = 'São Luís — MA',
}) => {
  const { login } = useAuth();
  const [mode, setMode] = useState<AuthScreenMode>('login');

  // Login state
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [capsLockActive, setCapsLockActive] = useState(false);

  // Recovery & reset state
  const [recoveryEmail, setRecoveryEmail] = useState('');
  const [recoverySent, setRecoverySent] = useState(false);
  const [resetToken, setResetToken] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);

  // Feedback state
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const emailInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (mode === 'login') {
      emailInputRef.current?.focus();
    }
  }, [mode]);

  const switchMode = (nextMode: AuthScreenMode) => {
    setErrorMessage(null);
    if (nextMode !== 'login') {
      setSuccessMessage(null);
    }
    if (nextMode === 'recover') {
      setRecoverySent(false);
      if (email.trim() && !recoveryEmail.trim()) {
        setRecoveryEmail(email.trim());
      }
    }
    setMode(nextMode);
  };

  const handlePasswordKeyEvent = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (typeof e.getModifierState === 'function') {
      setCapsLockActive(e.getModifierState('CapsLock'));
    }
  };

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);

    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail || !EMAIL_PATTERN.test(normalizedEmail)) {
      setErrorMessage('Informe um endereço de e-mail corporativo válido.');
      return;
    }
    if (!password) {
      setErrorMessage('Informe sua senha para continuar.');
      return;
    }

    setIsSubmitting(true);
    try {
      const result = await login(normalizedEmail, password);
      if (!result.success) {
        setErrorMessage(result.error || 'E-mail ou senha incorretos. Verifique seus dados.');
        setPassword('');
      }
    } catch {
      setErrorMessage('Não foi possível conectar ao servidor de autenticação. Tente novamente.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRecoverSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);

    const normalizedEmail = recoveryEmail.trim().toLowerCase();
    if (!normalizedEmail || !EMAIL_PATTERN.test(normalizedEmail)) {
      setErrorMessage('Informe um endereço de e-mail válido para solicitar a recuperação.');
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await api.recoverPassword(normalizedEmail);
      if (res.status >= 200 && res.status < 300) {
        setRecoverySent(true);
      } else {
        setErrorMessage(
          res.error || 'Não foi possível processar sua solicitação no momento. Tente novamente.'
        );
      }
    } catch {
      setErrorMessage('Erro de comunicação ao solicitar recuperação de senha.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const passwordHasMinLength = newPassword.length >= 8;
  const passwordHasLetter = /[a-zA-Z]/.test(newPassword);
  const passwordHasNumber = /[0-9]/.test(newPassword);
  const passwordsMatch = newPassword.length > 0 && newPassword === confirmNewPassword;

  const handleResetSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);

    const trimmedToken = resetToken.trim();
    if (!trimmedToken) {
      setErrorMessage('Informe o código de redefinição recebido.');
      return;
    }
    if (!passwordHasMinLength || !passwordHasLetter || !passwordHasNumber) {
      setErrorMessage('A nova senha deve ter no mínimo 8 caracteres, incluindo letras e números.');
      return;
    }
    if (!passwordsMatch) {
      setErrorMessage('A confirmação da nova senha não confere.');
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await api.resetPassword(trimmedToken, newPassword);
      if (res.status >= 200 && res.status < 300) {
        setResetToken('');
        setNewPassword('');
        setConfirmNewPassword('');
        setPassword('');
        if (recoveryEmail.trim()) {
          setEmail(recoveryEmail.trim().toLowerCase());
        }
        setSuccessMessage('Senha redefinida com sucesso. Entre com sua nova senha.');
        setMode('login');
      } else {
        setErrorMessage(
          res.error || 'Código de redefinição inválido ou expirado. Solicite um novo código.'
        );
      }
    } catch {
      setErrorMessage('Erro de comunicação ao redefinir a senha.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const resolvedLogo = logoUrl || DEFAULT_BRAND_LOGO_URL;

  return (
    <div className="min-h-screen bg-[#0B0B0D] text-zinc-100 flex flex-col relative overflow-hidden">
      {/* Subtle top hairline & ambient glow */}
      <div
        aria-hidden="true"
        className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[#C8102E]/60 to-transparent"
      />
      <div
        aria-hidden="true"
        className="absolute -top-32 left-1/2 -translate-x-1/2 w-[520px] h-[260px] bg-[#C8102E]/10 rounded-full blur-3xl pointer-events-none"
      />

      {/* Top Navigation Return Bar */}
      <header className="relative z-10 w-full max-w-5xl mx-auto px-4 sm:px-6 pt-5 flex items-center justify-between gap-4">
        {onGoToPortal ? (
          <button
            type="button"
            onClick={onGoToPortal}
            className="min-h-[40px] inline-flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-medium text-zinc-300 hover:text-white bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] transition-colors cursor-pointer group"
          >
            <ArrowLeft className="w-3.5 h-3.5 text-[#E3263E] group-hover:-translate-x-0.5 transition-transform" />
            <span>Voltar para a Vitrine</span>
          </button>
        ) : (
          <div />
        )}

        <PWAInstallButton variant="login" />
      </header>

      {/* Main Centered Auth Container */}
      <main className="relative z-10 flex-1 flex flex-col justify-center items-center px-4 py-8 sm:px-6">
        <div className="w-full max-w-[420px] space-y-6">
          {/* Brand Lockup */}
          <div className="text-center space-y-3">
            <div className="inline-flex items-center justify-center bg-white rounded-2xl p-2 shadow-2xl shadow-black/50 ring-1 ring-white/15 overflow-hidden">
              <img
                src={resolvedLogo}
                alt={`Logomarca ${companyName}`}
                className="h-24 sm:h-28 w-auto object-contain"
              />
            </div>

            <div className="space-y-1">
              <h1 className="text-xl font-bold tracking-tight text-white">
                {companyName}
              </h1>
              <p className="text-xs text-zinc-400">
                Gestão Comercial, Produção &amp; Financeiro
              </p>
            </div>
          </div>

          {/* Auth Card */}
          <section
            aria-label={
              mode === 'login'
                ? 'Autenticação corporativa'
                : mode === 'recover'
                  ? 'Recuperação de senha'
                  : 'Redefinição de senha'
            }
            className="bg-[#141418] border border-white/[0.09] rounded-2xl shadow-2xl shadow-black/50 p-6 sm:p-7"
          >
            {/* Header per mode */}
            <div className="mb-5">
              {mode === 'login' && (
                <>
                  <h2 className="text-base font-bold text-white">Acesso ao Sistema</h2>
                  <p className="text-xs text-zinc-400 mt-1 leading-relaxed">
                    Informe seu e-mail corporativo e senha para acessar o painel administrativo.
                  </p>
                </>
              )}

              {mode === 'recover' && (
                <>
                  <h2 className="text-base font-bold text-white">Recuperar Senha</h2>
                  <p className="text-xs text-zinc-400 mt-1 leading-relaxed">
                    Informe o e-mail vinculado à sua conta para gerar um código de redefinição.
                  </p>
                </>
              )}

              {mode === 'reset' && (
                <>
                  <h2 className="text-base font-bold text-white">Redefinir Senha</h2>
                  <p className="text-xs text-zinc-400 mt-1 leading-relaxed">
                    Digite o código de recuperação e defina uma nova senha segura.
                  </p>
                </>
              )}
            </div>

            {/* Success Status Banner */}
            {successMessage && (
              <div
                role="status"
                className="mb-5 p-3 rounded-xl bg-emerald-950/60 border border-emerald-800/70 text-emerald-200 text-xs flex items-start gap-2.5"
              >
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                <span className="leading-relaxed">{successMessage}</span>
              </div>
            )}

            {/* Error Alert Banner */}
            {errorMessage && (
              <div
                role="alert"
                className="mb-5 p-3 rounded-xl bg-rose-950/60 border border-rose-800/70 text-rose-200 text-xs flex items-start gap-2.5"
              >
                <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                <span className="leading-relaxed">{errorMessage}</span>
              </div>
            )}

            {/* ==================== MODE 1: LOGIN ==================== */}
            {mode === 'login' && (
              <form onSubmit={handleLoginSubmit} noValidate className="space-y-4">
                <div>
                  <label
                    htmlFor="login-email"
                    className="block text-xs font-medium text-zinc-300 mb-1.5"
                  >
                    E-mail corporativo
                  </label>
                  <div className="relative">
                    <Mail className="w-4 h-4 text-zinc-500 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      ref={emailInputRef}
                      id="login-email"
                      name="email"
                      type="email"
                      value={email}
                      onChange={(e) => {
                        setEmail(e.target.value);
                        if (errorMessage) setErrorMessage(null);
                      }}
                      placeholder="nome@defardas.com.br"
                      required
                      maxLength={254}
                      autoComplete="username"
                      autoCapitalize="none"
                      spellCheck={false}
                      className="w-full min-h-[44px] bg-[#0B0B0D] border border-white/[0.10] rounded-xl pl-10 pr-4 py-2.5 text-sm text-white placeholder-zinc-600 focus:outline-none focus:ring-2 focus:ring-[#C8102E] focus:border-[#C8102E] transition-colors"
                    />
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between gap-2 mb-1.5">
                    <label
                      htmlFor="login-password"
                      className="block text-xs font-medium text-zinc-300"
                    >
                      Senha
                    </label>
                    <button
                      type="button"
                      onClick={() => switchMode('recover')}
                      className="text-xs font-medium text-zinc-400 hover:text-white transition-colors cursor-pointer"
                    >
                      Esqueci minha senha
                    </button>
                  </div>
                  <div className="relative">
                    <Lock className="w-4 h-4 text-zinc-500 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      id="login-password"
                      name="password"
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => {
                        setPassword(e.target.value);
                        if (errorMessage) setErrorMessage(null);
                      }}
                      onKeyUp={handlePasswordKeyEvent}
                      onKeyDown={handlePasswordKeyEvent}
                      placeholder="Digite sua senha"
                      required
                      maxLength={128}
                      autoComplete="current-password"
                      className="w-full min-h-[44px] bg-[#0B0B0D] border border-white/[0.10] rounded-xl pl-10 pr-11 py-2.5 text-sm text-white placeholder-zinc-600 focus:outline-none focus:ring-2 focus:ring-[#C8102E] focus:border-[#C8102E] transition-colors"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((prev) => !prev)}
                      className="absolute right-1.5 top-1/2 -translate-y-1/2 min-w-[36px] min-h-[36px] flex items-center justify-center text-zinc-500 hover:text-zinc-200 rounded-lg transition-colors cursor-pointer"
                      title={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
                      aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>

                  {capsLockActive && (
                    <p className="mt-1.5 inline-flex items-center gap-1.5 text-[11px] text-amber-400">
                      <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                      <span>Caps Lock ativado</span>
                    </p>
                  )}
                </div>

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full mt-2 min-h-[44px] inline-flex items-center justify-center gap-2 px-4 py-3 bg-[#C8102E] hover:bg-[#AE0D27] text-white rounded-xl font-semibold text-sm shadow-lg shadow-[#C8102E]/20 active:scale-[0.99] transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isSubmitting ? (
                    <>
                      <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      <span>Entrando...</span>
                    </>
                  ) : (
                    <>
                      <span>Entrar no Sistema</span>
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>
              </form>
            )}

            {/* ==================== MODE 2: RECOVER PASSWORD ==================== */}
            {mode === 'recover' && (
              <div className="space-y-4">
                {recoverySent ? (
                  <div className="space-y-4">
                    <div
                      role="status"
                      className="p-3.5 rounded-xl bg-emerald-950/50 border border-emerald-800/60 text-emerald-200 text-xs leading-relaxed flex items-start gap-2.5"
                    >
                      <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                      <span>
                        Se o e-mail informado estiver cadastrado, as instruções de recuperação foram
                        registradas. Caso já possua o código de redefinição, avance abaixo.
                      </span>
                    </div>

                    <button
                      type="button"
                      onClick={() => switchMode('reset')}
                      className="w-full min-h-[44px] inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-[#C8102E] hover:bg-[#AE0D27] text-white rounded-xl font-semibold text-sm transition-colors cursor-pointer"
                    >
                      <KeyRound className="w-4 h-4" />
                      <span>Inserir código de redefinição</span>
                    </button>
                  </div>
                ) : (
                  <form onSubmit={handleRecoverSubmit} noValidate className="space-y-4">
                    <div>
                      <label
                        htmlFor="recover-email"
                        className="block text-xs font-medium text-zinc-300 mb-1.5"
                      >
                        E-mail corporativo
                      </label>
                      <div className="relative">
                        <Mail className="w-4 h-4 text-zinc-500 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                        <input
                          id="recover-email"
                          type="email"
                          value={recoveryEmail}
                          onChange={(e) => {
                            setRecoveryEmail(e.target.value);
                            if (errorMessage) setErrorMessage(null);
                          }}
                          placeholder="nome@defardas.com.br"
                          required
                          maxLength={254}
                          autoComplete="email"
                          autoCapitalize="none"
                          spellCheck={false}
                          className="w-full min-h-[44px] bg-[#0B0B0D] border border-white/[0.10] rounded-xl pl-10 pr-4 py-2.5 text-sm text-white placeholder-zinc-600 focus:outline-none focus:ring-2 focus:ring-[#C8102E] focus:border-[#C8102E] transition-colors"
                        />
                      </div>
                    </div>

                    <button
                      type="submit"
                      disabled={isSubmitting}
                      className="w-full min-h-[44px] inline-flex items-center justify-center gap-2 px-4 py-3 bg-[#C8102E] hover:bg-[#AE0D27] text-white rounded-xl font-semibold text-sm transition-colors cursor-pointer disabled:opacity-50"
                    >
                      {isSubmitting ? (
                        <>
                          <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                          <span>Enviando solicitação...</span>
                        </>
                      ) : (
                        <>
                          <span>Solicitar recuperação</span>
                          <ArrowRight className="w-4 h-4" />
                        </>
                      )}
                    </button>

                    <button
                      type="button"
                      onClick={() => switchMode('reset')}
                      className="w-full py-1.5 text-xs font-medium text-zinc-400 hover:text-zinc-200 transition-colors cursor-pointer"
                    >
                      Já tenho um código de redefinição
                    </button>
                  </form>
                )}

                <div className="pt-3 border-t border-white/[0.07]">
                  <button
                    type="button"
                    onClick={() => switchMode('login')}
                    className="inline-flex items-center gap-1.5 text-xs font-medium text-zinc-400 hover:text-white transition-colors cursor-pointer"
                  >
                    <ArrowLeft className="w-3.5 h-3.5" />
                    <span>Voltar para o login</span>
                  </button>
                </div>
              </div>
            )}

            {/* ==================== MODE 3: RESET PASSWORD ==================== */}
            {mode === 'reset' && (
              <form onSubmit={handleResetSubmit} noValidate className="space-y-4">
                <div>
                  <label
                    htmlFor="reset-token"
                    className="block text-xs font-medium text-zinc-300 mb-1.5"
                  >
                    Código de redefinição
                  </label>
                  <div className="relative">
                    <KeyRound className="w-4 h-4 text-zinc-500 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      id="reset-token"
                      type="text"
                      value={resetToken}
                      onChange={(e) => {
                        setResetToken(e.target.value);
                        if (errorMessage) setErrorMessage(null);
                      }}
                      placeholder="Cole o código de recuperação"
                      required
                      maxLength={256}
                      autoComplete="one-time-code"
                      className="w-full min-h-[44px] bg-[#0B0B0D] border border-white/[0.10] rounded-xl pl-10 pr-4 py-2.5 text-sm text-white placeholder-zinc-600 focus:outline-none focus:ring-2 focus:ring-[#C8102E] focus:border-[#C8102E] transition-colors font-mono"
                    />
                  </div>
                </div>

                <div>
                  <label
                    htmlFor="reset-new-password"
                    className="block text-xs font-medium text-zinc-300 mb-1.5"
                  >
                    Nova senha
                  </label>
                  <div className="relative">
                    <Lock className="w-4 h-4 text-zinc-500 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      id="reset-new-password"
                      type={showNewPassword ? 'text' : 'password'}
                      value={newPassword}
                      onChange={(e) => {
                        setNewPassword(e.target.value);
                        if (errorMessage) setErrorMessage(null);
                      }}
                      placeholder="Mínimo 8 caracteres"
                      required
                      maxLength={128}
                      autoComplete="new-password"
                      className="w-full min-h-[44px] bg-[#0B0B0D] border border-white/[0.10] rounded-xl pl-10 pr-11 py-2.5 text-sm text-white placeholder-zinc-600 focus:outline-none focus:ring-2 focus:ring-[#C8102E] focus:border-[#C8102E] transition-colors"
                    />
                    <button
                      type="button"
                      onClick={() => setShowNewPassword((prev) => !prev)}
                      className="absolute right-1.5 top-1/2 -translate-y-1/2 min-w-[36px] min-h-[36px] flex items-center justify-center text-zinc-500 hover:text-zinc-200 rounded-lg transition-colors cursor-pointer"
                      aria-label={showNewPassword ? 'Ocultar nova senha' : 'Mostrar nova senha'}
                    >
                      {showNewPassword ? (
                        <EyeOff className="w-4 h-4" />
                      ) : (
                        <Eye className="w-4 h-4" />
                      )}
                    </button>
                  </div>

                  {/* Live password requirements matching server PasswordService */}
                  <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px]">
                    <span className={passwordHasMinLength ? 'text-emerald-400' : 'text-zinc-500'}>
                      • 8+ caracteres
                    </span>
                    <span className={passwordHasLetter ? 'text-emerald-400' : 'text-zinc-500'}>
                      • Letras
                    </span>
                    <span className={passwordHasNumber ? 'text-emerald-400' : 'text-zinc-500'}>
                      • Números
                    </span>
                  </div>
                </div>

                <div>
                  <label
                    htmlFor="reset-confirm-password"
                    className="block text-xs font-medium text-zinc-300 mb-1.5"
                  >
                    Confirmar nova senha
                  </label>
                  <div className="relative">
                    <Lock className="w-4 h-4 text-zinc-500 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      id="reset-confirm-password"
                      type={showNewPassword ? 'text' : 'password'}
                      value={confirmNewPassword}
                      onChange={(e) => {
                        setConfirmNewPassword(e.target.value);
                        if (errorMessage) setErrorMessage(null);
                      }}
                      placeholder="Repita a nova senha"
                      required
                      maxLength={128}
                      autoComplete="new-password"
                      className="w-full min-h-[44px] bg-[#0B0B0D] border border-white/[0.10] rounded-xl pl-10 pr-4 py-2.5 text-sm text-white placeholder-zinc-600 focus:outline-none focus:ring-2 focus:ring-[#C8102E] focus:border-[#C8102E] transition-colors"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full min-h-[44px] inline-flex items-center justify-center gap-2 px-4 py-3 bg-[#C8102E] hover:bg-[#AE0D27] text-white rounded-xl font-semibold text-sm transition-colors cursor-pointer disabled:opacity-50"
                >
                  {isSubmitting ? (
                    <>
                      <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      <span>Salvando nova senha...</span>
                    </>
                  ) : (
                    <>
                      <span>Redefinir senha</span>
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>

                <div className="pt-3 border-t border-white/[0.07]">
                  <button
                    type="button"
                    onClick={() => switchMode('login')}
                    className="inline-flex items-center gap-1.5 text-xs font-medium text-zinc-400 hover:text-white transition-colors cursor-pointer"
                  >
                    <ArrowLeft className="w-3.5 h-3.5" />
                    <span>Voltar para o login</span>
                  </button>
                </div>
              </form>
            )}

            {/* Restricted corporate access notice */}
            <div className="mt-5 pt-4 border-t border-white/[0.07] flex items-center gap-2 text-[11px] text-zinc-500">
              <ShieldCheck className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
              <span>Ambiente restrito a colaboradores autorizados.</span>
            </div>
          </section>

          <p className="text-center text-[11px] text-zinc-600">
            {companyName} · {locationLabel}
          </p>
        </div>
      </main>
    </div>
  );
};
