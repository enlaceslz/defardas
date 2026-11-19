/**
 * DE FARDAS ERP — CLI de Provisionamento de Administrador / Usuário de Produção
 * Cria ou atualiza com segurança um usuário corporativo na tabela core.users
 * do PostgreSQL utilizando bcrypt (12 rounds) e UUID canônico.
 *
 * Uso interativo:
 *   DATABASE_URL="postgresql://..." npm run db:create-admin
 *
 * Uso não-interativo (CI / Automação):
 *   DATABASE_URL="postgresql://..." npm run db:create-admin -- \
 *     --name "Administrador DE FARDAS" \
 *     --email "admin@defardas.com.br" \
 *     --password "SuaSenhaForte2026!" \
 *     --role admin
 *
 * Flags opcionais:
 *   --reset   Atualiza senha/perfil caso o e-mail já exista e invalida sessões antigas.
 *   --help    Exibe instruções de uso.
 */
import 'dotenv/config';
import crypto from 'crypto';
import readline from 'readline';
import { pool } from '../server/db/index';
import { PasswordService } from '../server/auth/passwordService';
import type { UserRole } from '../server/types/db';

const ALLOWED_ROLES: UserRole[] = [
  'admin',
  'gerente_comercial',
  'vendedor',
  'pcp_producao',
  'financeiro',
  'expedicao_qualidade',
];

interface CliOptions {
  name?: string;
  email?: string;
  password?: string;
  role?: string;
  reset: boolean;
  help: boolean;
}

function parseArgs(argv: string[]): CliOptions {
  const opts: CliOptions = {
    name: process.env.ADMIN_NAME,
    email: process.env.ADMIN_EMAIL,
    password: process.env.ADMIN_PASSWORD,
    role: process.env.ADMIN_ROLE || 'admin',
    reset: false,
    help: false,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') {
      opts.help = true;
    } else if (arg === '--reset') {
      opts.reset = true;
    } else if (arg === '--name' && argv[i + 1]) {
      opts.name = argv[++i];
    } else if (arg === '--email' && argv[i + 1]) {
      opts.email = argv[++i];
    } else if (arg === '--password' && argv[i + 1]) {
      opts.password = argv[++i];
    } else if (arg === '--role' && argv[i + 1]) {
      opts.role = argv[++i];
    }
  }

  return opts;
}

function printHelp() {
  console.log(`
DE FARDAS ERP — Provisionamento de Usuário Corporativo (PostgreSQL)

Uso:
  npm run db:create-admin
  npm run db:create-admin -- --name "Nome" --email "admin@defardas.com.br" --password "SenhaForte123!" [--role admin] [--reset]

Variáveis de ambiente suportadas:
  DATABASE_URL     (obrigatória) String de conexão PostgreSQL
  ADMIN_NAME       Nome completo do usuário
  ADMIN_EMAIL      E-mail corporativo de login
  ADMIN_PASSWORD   Senha (mínimo 8 caracteres, letras e números)
  ADMIN_ROLE       Perfil RBAC (${ALLOWED_ROLES.join(' | ')}) — padrão: admin

Opções:
  --reset          Atualiza senha/perfil de um e-mail existente e revoga sessões ativas
  --help, -h       Exibe esta ajuda
`);
}

function askQuestion(rl: readline.Interface, prompt: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(prompt, (answer) => resolve(answer.trim()));
  });
}

function askPasswordHidden(prompt: string): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!process.stdin.isTTY) {
      reject(new Error('Terminal não interativo: informe a senha via --password ou ADMIN_PASSWORD.'));
      return;
    }

    process.stdout.write(prompt);
    const stdin = process.stdin;
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding('utf8');

    let password = '';
    const onData = (char: string) => {
      if (char === '\r' || char === '\n' || char === '\u0004') {
        stdin.setRawMode(false);
        stdin.pause();
        stdin.removeListener('data', onData);
        process.stdout.write('\n');
        resolve(password);
      } else if (char === '\u0003') {
        stdin.setRawMode(false);
        process.stdout.write('\n');
        process.exit(130);
      } else if (char === '\u007f' || char === '\b') {
        if (password.length > 0) {
          password = password.slice(0, -1);
          process.stdout.write('\b \b');
        }
      } else {
        password += char;
        process.stdout.write('*');
      }
    };

    stdin.on('data', onData);
  });
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));

  if (opts.help) {
    printHelp();
    process.exit(0);
  }

  if (!process.env.DATABASE_URL) {
    console.error('❌ Erro: variável DATABASE_URL não definida.');
    console.error('   Configure DATABASE_URL no .env ou passe no comando:');
    console.error('   DATABASE_URL="postgresql://..." npm run db:create-admin');
    process.exit(1);
  }

  let fullName = opts.name?.trim() || '';
  let email = opts.email?.trim().toLowerCase() || '';
  let password = opts.password || '';
  let role = (opts.role?.trim() || 'admin') as UserRole;

  if (!fullName || !email) {
    if (!process.stdin.isTTY) {
      console.error('❌ Erro: informe --name e --email (ou ADMIN_NAME e ADMIN_EMAIL) em ambiente não interativo.');
      process.exit(1);
    }
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    try {
      if (!fullName) {
        fullName = await askQuestion(rl, 'Nome completo do administrador: ');
      }
      if (!email) {
        email = (await askQuestion(rl, 'E-mail corporativo (ex: admin@defardas.com.br): ')).toLowerCase();
      }
      if (!opts.role && !process.env.ADMIN_ROLE) {
        const inputRole = await askQuestion(rl, `Perfil RBAC [${ALLOWED_ROLES.join('/')} ] (padrão: admin): `);
        if (inputRole) role = inputRole as UserRole;
      }
    } finally {
      rl.close();
    }
  }

  if (!password) {
    password = await askPasswordHidden('Senha corporativa (mín. 8 chars, letras e números): ');
    const confirm = await askPasswordHidden('Confirme a senha: ');
    if (password !== confirm) {
      console.error('❌ Erro: as senhas digitadas não coincidem.');
      process.exit(1);
    }
  }

  if (!fullName || fullName.length < 3) {
    console.error('❌ Erro: informe um nome completo válido (mínimo 3 caracteres).');
    process.exit(1);
  }

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    console.error('❌ Erro: informe um e-mail corporativo válido.');
    process.exit(1);
  }

  if (!ALLOWED_ROLES.includes(role)) {
    console.error(`❌ Erro: perfil '${role}' inválido. Permitidos: ${ALLOWED_ROLES.join(', ')}.`);
    process.exit(1);
  }

  const strength = PasswordService.validatePasswordStrength(password);
  if (!strength.valid) {
    console.error(`❌ Erro na política de senha: ${strength.reason}`);
    process.exit(1);
  }

  const client = await pool.connect();
  try {
    const existingRes = await client.query<{ id: string; full_name: string; role: string }>(
      'SELECT id, full_name, role FROM core.users WHERE LOWER(email) = $1 LIMIT 1',
      [email]
    );

    const passwordHash = await PasswordService.hashPassword(password);
    const now = new Date();

    if (existingRes.rows.length > 0) {
      const existing = existingRes.rows[0];
      if (!opts.reset) {
        console.error(`⚠️ Usuário '${email}' já existe em core.users (perfil: ${existing.role}).`);
        console.error('   Para atualizar a senha/perfil deste usuário, execute novamente com --reset.');
        process.exit(1);
      }

      await client.query(
        `UPDATE core.users
         SET full_name = $1, password_hash = $2, role = $3, is_active = true, updated_at = $4
         WHERE id = $5`,
        [fullName, passwordHash, role, now, existing.id]
      );

      // Revoga sessões anteriores para forçar novo login com a nova senha
      await client.query('DELETE FROM core.sessions WHERE user_id = $1', [existing.id]).catch(() => {});

      await client
        .query(
          `INSERT INTO core.audit_logs (id, actor_name, actor_role, entity_name, entity_id, action, notes, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [
            crypto.randomUUID(),
            'CLI db:create-admin',
            'system',
            'users',
            existing.id,
            'CLI_USER_RESET',
            `Credenciais do usuário '${email}' (${role}) atualizadas via CLI administrativo.`,
            now,
          ]
        )
        .catch(() => {});

      console.log(`✅ Usuário '${email}' atualizado com sucesso (perfil: ${role}). Sessões antigas foram revogadas.`);
    } else {
      const userId = crypto.randomUUID();
      await client.query(
        `INSERT INTO core.users (id, full_name, email, password_hash, role, is_active, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, true, $6, $6)`,
        [userId, fullName, email, passwordHash, role, now]
      );

      await client
        .query(
          `INSERT INTO core.audit_logs (id, actor_name, actor_role, entity_name, entity_id, action, notes, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [
            crypto.randomUUID(),
            'CLI db:create-admin',
            'system',
            'users',
            userId,
            'CLI_USER_CREATED',
            `Usuário corporativo '${email}' (${role}) provisionado via CLI administrativo.`,
            now,
          ]
        )
        .catch(() => {});

      console.log(`✅ Usuário corporativo criado com sucesso no PostgreSQL!`);
      console.log(`   ID:     ${userId}`);
      console.log(`   Nome:   ${fullName}`);
      console.log(`   E-mail: ${email}`);
      console.log(`   Perfil: ${role}`);
    }
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(async (err: any) => {
  console.error('❌ Falha ao provisionar usuário no PostgreSQL:', err?.message || err);
  if (err?.code === '42P01') {
    console.error('   Dica: a tabela core.users não existe ainda. Execute primeiro: npm run db:migrate');
  }
  await pool.end().catch(() => {});
  process.exit(1);
});
