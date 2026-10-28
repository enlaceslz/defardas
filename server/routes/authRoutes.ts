/**
 * DE FARDAS ERP — Authentication & Session Routes
 * Autenticação real com senhas bcrypt, sessões seguras com cookies HttpOnly,
 * logout auditável, recuperação de senha e proteção contra simulações em produção.
 */
import { Router, Response } from 'express';
import { RequestWithUser, requireAuth } from '../auth/rbac';
import { sessionStore } from '../auth/sessionStore';
import { userRepository, DEV_DEFAULT_PASSWORD } from '../db/userRepository';
import { PasswordService } from '../auth/passwordService';
import { passwordResetService } from '../auth/passwordResetService';
import { unitOfWork } from '../db/unitOfWork';
import { auditService } from '../services/auditService';
import { authRateLimiter, passwordRecoveryRateLimiter } from '../middleware/rateLimiter';
import { CSRF_COOKIE_NAME, generateCsrfToken } from '../middleware/csrf';
import { isLocalDemoEnvironment } from '../auth/demoEnvironment';

export const authRouter = Router();

const isProd = process.env.NODE_ENV === 'production';

/**
 * GET /api/auth/csrf-token
 * Fornece e sincroniza o token CSRF para a camada de cliente
 */
authRouter.get('/csrf-token', (req, res) => {
  let token = req.cookies?.[CSRF_COOKIE_NAME];
  if (!token) {
    token = generateCsrfToken();
    res.cookie(CSRF_COOKIE_NAME, token, {
      httpOnly: false,
      secure: isProd,
      sameSite: 'lax',
      path: '/',
      maxAge: 8 * 60 * 60 * 1000,
    });
  }
  res.json({ csrfToken: token });
});

/**
 * POST /api/auth/login
 * Realiza autenticação com credenciais reais protegida por rate limiting
 */
authRouter.post('/login', authRateLimiter, async (req: RequestWithUser, res: Response) => {
  const { email, password } = req.body;
  const ip = req.ip || req.socket.remoteAddress || 'unknown';
  const userAgent = req.headers['user-agent'] || 'unknown';

  if (typeof email !== 'string' || typeof password !== 'string' || !email || !password) {
    return res.status(400).json({ error: 'E-mail e senha são obrigatórios.' });
  }

  const user = await userRepository.findByEmail(email);
  if (!user) {
    await auditService.log({
      actorName: email,
      actorRole: 'unauthenticated',
      entityName: 'auth',
      entityId: email,
      action: 'AUTH_LOGIN_FAILURE',
      notes: `Tentativa de login com e-mail inexistente a partir de IP ${ip}.`,
      ipAddress: ip,
    });
    return res.status(401).json({ error: 'Credenciais inválidas. Verifique seu e-mail e senha.' });
  }

  if (!user.isActive) {
    await auditService.log({
      actorId: user.id,
      actorName: user.fullName,
      actorRole: user.role,
      entityName: 'auth',
      entityId: user.id,
      action: 'AUTH_LOGIN_BLOCKED',
      notes: `Tentativa de login em conta desativada (${user.email}).`,
      ipAddress: ip,
    });
    return res.status(403).json({ error: 'Esta conta de usuário está desativada. Contate o administrador.' });
  }

  const verifiedPasswordHash = user.passwordHash;
  const isPasswordValid = await PasswordService.comparePassword(password, verifiedPasswordHash);
  if (!isPasswordValid) {
    await auditService.log({
      actorId: user.id,
      actorName: user.fullName,
      actorRole: user.role,
      entityName: 'auth',
      entityId: user.id,
      action: 'AUTH_LOGIN_FAILURE',
      notes: `Falha na senha para o usuário ${user.email} a partir de IP ${ip}.`,
      ipAddress: ip,
    });
    return res.status(401).json({ error: 'Credenciais inválidas. Verifique seu e-mail e senha.' });
  }

  // Criação de sessão segura
  const session = await unitOfWork(async () => {
    // Uma troca de senha entre a comparação bcrypt e o INSERT não pode criar
    // uma sessão nova usando a credencial antiga.
    const current = await userRepository.findById(user.id);
    if (!current?.isActive || current.passwordHash !== verifiedPasswordHash) return null;
    const created = await sessionStore.createSession({ id: current.id, fullName: current.fullName,
      email: current.email, role: current.role }, ip, userAgent);
    await auditService.log({ actorId: current.id, actorName: current.fullName, actorRole: current.role,
      entityName: 'auth', entityId: created.token.substring(0, 8), action: 'AUTH_LOGIN_SUCCESS',
      notes: `Usuário '${current.fullName}' (${current.role}) autenticado com sucesso.`, ipAddress: ip });
    return created;
  });
  if (!session) return res.status(401).json({ error: 'Credenciais inválidas. Verifique seu e-mail e senha.' });

  // Configuração do cookie HttpOnly
  res.cookie('defardas_session', session.token, {
    httpOnly: true,
    secure: isProd,
    sameSite: 'lax',
    path: '/',
    maxAge: 8 * 60 * 60 * 1000, // 8 horas
  });

  let csrfToken = req.cookies?.[CSRF_COOKIE_NAME];
  if (!csrfToken) {
    csrfToken = generateCsrfToken();
    res.cookie(CSRF_COOKIE_NAME, csrfToken, {
      httpOnly: false,
      secure: isProd,
      sameSite: 'lax',
      path: '/',
      maxAge: 8 * 60 * 60 * 1000,
    });
  }

  res.json({
    success: true,
    user: session.user,
    token: session.token,
    csrfToken,
  });
});

/**
 * POST /api/auth/logout
 * Encerra a sessão e remove o cookie HttpOnly
 */
authRouter.post('/logout', requireAuth, async (req: RequestWithUser, res: Response) => {
  const token = req.sessionToken;
  if (token) {
    await sessionStore.destroySession(token);
  }

  res.clearCookie('defardas_session', { path: '/' });

  if (req.user) {
    await auditService.log({
      actorId: req.user.id,
      actorName: req.user.fullName,
      actorRole: req.user.role,
      entityName: 'auth',
      entityId: req.user.id,
      action: 'AUTH_LOGOUT',
      notes: `Sessão encerrada voluntariamente pelo usuário.`,
      ipAddress: req.ip,
    });
  }

  res.json({ success: true, message: 'Sessão encerrada com sucesso.' });
});

/**
 * GET /api/auth/me
 * Retorna dados do usuário atualmente autenticado
 */
authRouter.get('/me', (req: RequestWithUser, res: Response) => {
  if (!req.user) {
    return res.status(401).json({
      error: 'Não autenticado.',
      code: 'UNAUTHENTICATED',
    });
  }

  res.json({
    authenticated: true,
    user: req.user,
  });
});

/**
 * GET /api/auth/dev-credentials
 * Disponibiliza credenciais demonstrativas para facilidade de testes em desenvolvimento
 * NUNCA acessível em produção
 */
authRouter.get('/dev-credentials', (_req: RequestWithUser, res: Response) => {
  if (!isLocalDemoEnvironment()) {
    return res.status(404).json({ error: 'Não encontrado.' });
  }

  res.json({
    environment: 'development',
    notice: 'Credenciais de teste locais geradas para validação da matriz de governança PRD v1.6.',
    defaultPassword: DEV_DEFAULT_PASSWORD,
    accounts: [
      { role: 'admin', email: 'admin@defardas.com.br', name: 'Carlos Eduardo Silva', description: 'Diretoria & Alçada Total' },
      { role: 'vendedor', email: 'vendas@defardas.com.br', name: 'Mariana Alencar', description: 'Comercial & Propostas' },
      { role: 'pcp_producao', email: 'pcp@defardas.com.br', name: 'Raimundo Nonato', description: 'PCP & Mestre de Corte' },
      { role: 'financeiro', email: 'financeiro@defardas.com.br', name: 'Juliana Rocha', description: 'Controladoria & Finanças' },
      { role: 'gerente_comercial', email: 'gerente@defardas.com.br', name: 'Roberto Mendes', description: 'Gerência Comercial' },
      { role: 'expedicao_qualidade', email: 'qualidade@defardas.com.br', name: 'Patrícia Soares', description: 'Controle de Qualidade' },
    ],
  });
});

/**
 * POST /api/auth/recover-password
 * Gera token seguro para recuperação de senha sem enumerar contas
 */
authRouter.post('/recover-password', passwordRecoveryRateLimiter, async (req: RequestWithUser, res: Response) => {
  const { email } = req.body;
  if (typeof email !== 'string' || !email) {
    return res.status(400).json({ error: 'Informe o e-mail cadastrado.' });
  }

  // Sem canal de e-mail homologado, não confirmar uma entrega inexistente.
  if (!isLocalDemoEnvironment()) return res.status(503).json({ error: 'Recuperação por e-mail indisponível. Contate o administrador.', code: 'PASSWORD_RECOVERY_UNAVAILABLE' });
  const user = await userRepository.findByEmail(email);
  if (user?.isActive) {
    const resetToken = await passwordResetService.issue(user.id);
    await auditService.log({
      actorId: user.id,
      actorName: user.fullName,
      actorRole: user.role,
      entityName: 'auth',
      entityId: user.id,
      action: 'PASSWORD_RESET_REQUESTED',
      notes: `Solicitação de redefinição de senha gerada com token seguro de 60 minutos.`,
      ipAddress: req.ip,
    });

    // Em ambiente de desenvolvimento, podemos retornar o token para testes
    if (!isProd) {
      return res.json({
        success: true,
        message: 'Se o e-mail estiver cadastrado, as instruções de recuperação foram geradas.',
        devResetToken: resetToken,
      });
    }
  }

  // Resposta genérica; em produção o fluxo permanece indisponível até integrar entrega.
  res.json({
    success: true,
    message: 'Se o e-mail estiver cadastrado, as instruções de recuperação foram geradas.',
  });
});

/**
 * POST /api/auth/reset-password
 * Redefine a senha utilizando token válido
 */
authRouter.post('/reset-password', passwordRecoveryRateLimiter, async (req: RequestWithUser, res: Response) => {
  const { token, newPassword } = req.body;
  if (typeof token !== 'string' || typeof newPassword !== 'string' || !token || !newPassword) {
    return res.status(400).json({ error: 'Token e nova senha são obrigatórios.' });
  }

  const strength = PasswordService.validatePasswordStrength(newPassword);
  if (!strength.valid) {
    return res.status(400).json({ error: strength.reason });
  }

  const completed = await passwordResetService.reset(token, newPassword, req.ip);
  if (!completed) {
    return res.status(400).json({ error: 'Token de recuperação inválido ou expirado.' });
  }

  res.json({ success: true, message: 'Senha redefinida com sucesso. Faça login com a nova senha.' });
});

/**
 * POST /api/auth/switch-role
 * Simulador de perfis estritamente restrito a desenvolvimento e exigindo sessão admin
 */
authRouter.post('/switch-role', requireAuth, async (req: RequestWithUser, res: Response) => {
  if (!isLocalDemoEnvironment()) {
    return res.status(403).json({
      error: 'Simulador de perfis disponível apenas na demonstração local sem banco configurado.',
      code: 'DEV_ONLY',
    });
  }

  // Apenas administrador autenticado pode alternar perfil para fins de teste no frontend
  if (req.user?.role !== 'admin') {
    return res.status(403).json({
      error: 'Apenas administradores autenticados podem simular perfis em ambiente de teste.',
      code: 'FORBIDDEN',
    });
  }

  const { targetEmail, targetRole } = req.body;
  const targetUser = targetEmail 
    ? await userRepository.findByEmail(targetEmail)
    : (await userRepository.listAll()).find((u) => u.role === targetRole);

  if (!targetUser) {
    return res.status(404).json({ error: 'Perfil de teste não encontrado.' });
  }

  // Atualiza sessão atual
  if (req.sessionToken) {
    await sessionStore.destroySession(req.sessionToken);
  }

  const newSession = await sessionStore.createSession(
    {
      id: targetUser.id,
      fullName: targetUser.fullName,
      email: targetUser.email,
      role: targetUser.role,
    },
    req.ip,
    req.headers['user-agent']
  );

  res.cookie('defardas_session', newSession.token, {
    httpOnly: true,
    secure: false,
    sameSite: 'lax',
    path: '/',
    maxAge: 8 * 60 * 60 * 1000,
  });

  await auditService.log({
    actorId: req.user.id,
    actorName: req.user.fullName,
    actorRole: req.user.role,
    entityName: 'auth',
    entityId: targetUser.id,
    action: 'DEV_SWITCH_ROLE',
    notes: `[DEV] Administrador alternou sessão para testar perfil [${targetUser.role}] (${targetUser.fullName}).`,
    ipAddress: req.ip,
  });

  res.json({
    success: true,
    user: {
      id: targetUser.id,
      fullName: targetUser.fullName,
      email: targetUser.email,
      role: targetUser.role,
    },
    token: newSession.token,
  });
});
