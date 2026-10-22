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
import { auditService } from '../services/auditService';

export const authRouter = Router();

const isProd = process.env.NODE_ENV === 'production';

/**
 * POST /api/auth/login
 * Realiza autenticação com credenciais reais
 */
authRouter.post('/login', async (req: RequestWithUser, res: Response) => {
  const { email, password } = req.body;
  const ip = req.ip || req.socket.remoteAddress || 'unknown';
  const userAgent = req.headers['user-agent'] || 'unknown';

  if (!email || !password) {
    return res.status(400).json({ error: 'E-mail e senha são obrigatórios.' });
  }

  const user = await userRepository.findByEmail(email);
  if (!user) {
    auditService.log({
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
    auditService.log({
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

  const isPasswordValid = await PasswordService.comparePassword(password, user.passwordHash);
  if (!isPasswordValid) {
    auditService.log({
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
  const session = sessionStore.createSession(
    {
      id: user.id,
      fullName: user.fullName,
      email: user.email,
      role: user.role,
    },
    ip,
    userAgent
  );

  // Configuração do cookie HttpOnly
  res.cookie('defardas_session', session.token, {
    httpOnly: true,
    secure: isProd,
    sameSite: 'lax',
    path: '/',
    maxAge: 8 * 60 * 60 * 1000, // 8 horas
  });

  auditService.log({
    actorId: user.id,
    actorName: user.fullName,
    actorRole: user.role,
    entityName: 'auth',
    entityId: session.token.substring(0, 8),
    action: 'AUTH_LOGIN_SUCCESS',
    notes: `Usuário '${user.fullName}' (${user.role}) autenticado com sucesso.`,
    ipAddress: ip,
  });

  res.json({
    success: true,
    user: {
      id: user.id,
      fullName: user.fullName,
      email: user.email,
      role: user.role,
    },
    token: session.token,
  });
});

/**
 * POST /api/auth/logout
 * Encerra a sessão e remove o cookie HttpOnly
 */
authRouter.post('/logout', requireAuth, (req: RequestWithUser, res: Response) => {
  const token = req.sessionToken;
  if (token) {
    sessionStore.destroySession(token);
  }

  res.clearCookie('defardas_session', { path: '/' });

  if (req.user) {
    auditService.log({
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
  if (isProd) {
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
authRouter.post('/recover-password', async (req: RequestWithUser, res: Response) => {
  const { email } = req.body;
  if (!email) {
    return res.status(400).json({ error: 'Informe o e-mail cadastrado.' });
  }

  const user = await userRepository.findByEmail(email);
  if (user) {
    const resetToken = userRepository.createPasswordResetToken(user.id, user.email);
    auditService.log({
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

  // Resposta segura (tempo constante / sem vazamento de existência de conta)
  res.json({
    success: true,
    message: 'Se o e-mail estiver cadastrado, as instruções de recuperação foram geradas.',
  });
});

/**
 * POST /api/auth/reset-password
 * Redefine a senha utilizando token válido
 */
authRouter.post('/reset-password', async (req: RequestWithUser, res: Response) => {
  const { token, newPassword } = req.body;
  if (!token || !newPassword) {
    return res.status(400).json({ error: 'Token e nova senha são obrigatórios.' });
  }

  const strength = PasswordService.validatePasswordStrength(newPassword);
  if (!strength.valid) {
    return res.status(400).json({ error: strength.reason });
  }

  const tokenRecord = userRepository.consumePasswordResetToken(token);
  if (!tokenRecord) {
    return res.status(400).json({ error: 'Token de recuperação inválido ou expirado.' });
  }

  await userRepository.updatePassword(tokenRecord.userId, newPassword);
  sessionStore.destroyAllUserSessions(tokenRecord.userId);

  auditService.log({
    actorId: tokenRecord.userId,
    actorName: tokenRecord.email,
    actorRole: 'usuario',
    entityName: 'auth',
    entityId: tokenRecord.userId,
    action: 'PASSWORD_RESET_COMPLETED',
    notes: 'Senha redefinida com sucesso. Todas as sessões anteriores foram invalidadas.',
    ipAddress: req.ip,
  });

  res.json({ success: true, message: 'Senha redefinida com sucesso. Faça login com a nova senha.' });
});

/**
 * POST /api/auth/switch-role
 * Simulador de perfis estritamente restrito a desenvolvimento e exigindo sessão admin
 */
authRouter.post('/switch-role', requireAuth, async (req: RequestWithUser, res: Response) => {
  if (isProd) {
    return res.status(403).json({
      error: 'Simulador de perfis estritamente bloqueado em ambiente de produção.',
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
    sessionStore.destroySession(req.sessionToken);
  }

  const newSession = sessionStore.createSession(
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

  auditService.log({
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
