# Operação do núcleo transacional

A branch de auditoria usa PostgreSQL como fonte de verdade. LocalStorage não é backup automático nem persistência de dados operacionais.

## Preparação

- Runtime Node 22 da imagem Docker; PostgreSQL próprio 16.
- `.env` fora do Git e fora da imagem. Definir DATABASE_URL e política SSL. O Compose usa rede interna sem TLS; banco remoto deve usar `DATABASE_SSL_MODE=verify-full` e, quando necessário, `DATABASE_CA_CERT`.
- Definir POSTGRES_PASSWORD ao usar o Compose. Não existem credenciais iniciais de produção.
- A publicação completa exige Express na mesma origem da SPA (container/runtime Node); a configuração estática Vercel não hospeda esta API.

## Instalação em homologação

```bash
npm ci
npm run lint
npm test
npm run build
npm run db:migrate
npm run admin:create
npm start
```

`admin:create` requer ADMIN_EMAIL, ADMIN_NAME e ADMIN_PASSWORD no ambiente. O script não imprime senha, não substitui usuário existente e não cria senha padrão. Remover ADMIN_PASSWORD do ambiente após provisionar. No container, os scripts Node de migração e provisionamento estão disponíveis com os mesmos comandos npm.

Antes de migrar banco existente, gerar backup e ensaiar em cópia. Unicidade/checks novos não corrigem histórico inconsistente automaticamente. Ler o relatório de auditoria para os casos de migração antiga.

## Jornada atual

1. Cadastrar cliente com dados reais.
2. Criar proposta: informar itens, tecido/cor, grades, custos, markup e prazos. O servidor recalcula os preços. Desconto abaixo do sugerido exige admin, conforme matriz já existente.
3. Registrar aprovação comercial e converter. Cada item gera uma OP; sinal/saldo são títulos da proposta. Repetições concorrentes retornam a conversão existente.
4. Confirmar sinal na tela Financeiro com autenticação bancária e comprovante real. A confirmação afeta todas as OPs da proposta; não avança etapas.
5. Aprovar a arte em cada OP com identificação de quem a aprovou; então avançar o gate pela ação própria.
6. Confirmar saldo no financeiro. Estoque e suas remessas/retornos precisam de eventos compensatórios; ajustes requerem motivo e saldo atualizado.

O upload privado completo ainda é pendência de liberação. Não usar URL fictícia para superar o campo de comprovante. Não utilizar o sistema com dados reais antes de concluir os bloqueios do relatório.

## Backup e recuperação

Executar `bash scripts/backup.sh` com acesso ao container ou DATABASE_URL e pg_dump compatível. BACKUP_DIR permite escolher destino; arquivos têm permissão restrita e checksum. Copiar para armazenamento externo controlado conforme política real da empresa.

Para restauração, parar a aplicação e restaurar primeiro em banco isolado: `bash scripts/restore.sh arquivo.sql.gz`. A confirmação interativa informa o banco. O modo `--force` é reservado a execução deliberada/automatizada; não contorna checksum nem ON_ERROR_STOP. Verificar dados e migrações antes de reabrir tráfego.

## Evidências de engenharia

A CI valida instalação, tipagem, 21 testes locais, 10 testes de PostgreSQL, backup/restauração e imagem de produção. Os bancos defardas_test/defardas_restore_test são descartáveis. O teste de concorrência usa um lock transacional global; ajustar somente com medições e testes de integridade.
