# DE FARDAS — Documento de Execução para Google AI Studio

**Versão:** 1.0  
**Data:** outubro de 2026  
**Documento de referência:** `PRD_DE_FARDAS_v1.6.md`  
**Ambiente de desenvolvimento:** Google AI Studio, com Google Gemini  
**Cliente:** DE FARDAS  
**Responsável pelo projeto e validação técnica:** Enlace  
**Estado:** plano de execução; não representa implementação já realizada ou testes já aprovados.

---

## 1. Objetivo

Este documento orienta o Gemini no Google AI Studio a desenvolver o MVP da DE FARDAS por etapas pequenas, verificáveis e documentadas. O objetivo é evitar que a IA gere uma interface aparentemente pronta sem regras consistentes, persistência real, segurança, testes ou condições de implantação.

O PRD v1.6 é a especificação funcional e técnica de referência. Este documento explica **como executar o trabalho**, sem substituir o PRD nem preencher lacunas comerciais.

## 2. Decisões aprovadas e limites

| Tema | Decisão registrada | Instrução de execução |
|---|---|---|
| Ambiente de desenvolvimento | Google AI Studio com Gemini | Usar o ambiente para desenvolver e revisar o código. Confirmar quais recursos de edição, execução, terminal e integração com repositório estão disponíveis na sessão; não alegar uso de recursos indisponíveis. |
| Banco de dados | PostgreSQL próprio | Não trocar por Firebase, Supabase gerenciado ou outro banco sem autorização explícita. |
| Produção | Infraestrutura contratada para a DE FARDAS | Não presumir Google Cloud, hospedagem específica, domínio ou serviços já contratados. |
| Arquivos | Armazenamento privado compatível com S3 | Proteger credenciais e manter objetos privados por padrão. O fornecedor ainda não está definido. |
| Escopo | MVP do fluxo principal | Implementar por fases. Integrações fiscais, automações avançadas e funcionalidades não essenciais ficam fora do MVP até aprovação expressa. |
| Regras comerciais | Somente as explicitamente documentadas e aprovadas | Não inventar markup, entrada, comissões, descontos, prazos, permissões, regras de reembolso ou critérios fiscais. |
| Arquitetura de aplicação | Ainda não totalmente congelada | Recomendar stack com justificativa e consequências antes de torná-la uma decisão obrigatória. |

**Separação obrigatória:** Google AI Studio é o ambiente de desenvolvimento assistido; não é, por esta decisão, o ambiente de produção da aplicação.

## 3. Regras obrigatórias para o Gemini

1. Leia o PRD inteiro antes de propor arquitetura ou escrever código. Se o documento não estiver anexado ou acessível na sessão, solicite que seja fornecido; não finja tê-lo lido.
2. Não presuma acesso ao repositório, aos arquivos operacionais, a planilhas, a credenciais ou à infraestrutura. Confirme o que está realmente disponível.
3. Antes de editar um projeto existente, inspecione sua estrutura, documentação, dependências, scripts, migrações, testes e configuração. Não sobrescreva uma base funcional sem explicar o motivo e o plano de recuperação.
4. Classifique requisitos como: **aprovado**, **proposta técnica**, **pendente de decisão** ou **fora do MVP**. Não transforme uma proposta em requisito aprovado.
5. Não invente dados reais, regras comerciais, taxas, percentuais, prazos, perfis de autorização, integrações, resultados de testes ou status de implantação.
6. Se houver conflito entre documentos, registre a referência e a divergência. Não escolha silenciosamente uma regra comercial. Peça decisão quando o conflito impedir implementação segura.
7. Use dados fictícios para desenvolvimento e demonstrações. Não inclua dados pessoais, documentos de clientes, tokens ou credenciais em prompts, logs, exemplos ou repositórios.
8. Não exponha segredos no frontend, no código versionado, nos logs ou nos arquivos de exemplo. O `.env.example` deve conter somente nomes de variáveis e valores ilustrativos não secretos.
9. Não execute nem recomende como já executadas migrações destrutivas, exclusão de dados, publicação, contratação de serviço pago ou implantação em produção sem autorização explícita.
10. Não declare um teste, auditoria, integração ou implantação como concluído sem evidência observável. Diferencie **não executado**, **executado com sucesso**, **falhou** e **bloqueado pelo ambiente**.
11. Prefira uma aplicação modular bem delimitada a microserviços prematuros. Acrescente filas, workers, cache ou serviços adicionais somente se houver necessidade justificada.
12. Ao terminar cada etapa, atualize documentação, liste arquivos alterados, apresente os testes executados e identifique riscos e pendências.

## 4. Método de trabalho e gates

O trabalho é dividido em fases. Cada fase tem um resultado esperado e uma condição para avançar. O Gemini não deve implementar todas as fases de uma vez.

### Fase 0 — Auditoria e plano técnico

**Objetivo:** entender o material disponível e apresentar uma proposta antes de alterar código.

Tarefas:
- Confirmar que `PRD_DE_FARDAS_v1.6.md` foi lido integralmente.
- Confirmar se existe repositório e identificar o estado real do projeto. Se não houver repositório conectado ou arquivos de código, registrar isso como bloqueio e pedir o material necessário.
- Inspecionar o código e a documentação existentes, se fornecidos.
- Verificar se o DeskcommCRM é uma referência ou uma base que será realmente incorporada. O PRD não o aprova automaticamente para produção.
- Listar stack existente, dependências, scripts, estado de testes, modelo de autenticação e migrações.
- Identificar riscos de segurança, acoplamento, duplicação de CRM, manutenção e licenciamento, conforme aplicável.
- Recomendar arquitetura mínima do MVP, incluindo framework, backend, ORM ou acesso SQL, autenticação, migrações, testes e integração S3. Explicar alternativas e custo operacional.
- Criar matriz de decisões: aprovado, proposto, pendente e fora do MVP.

**Entregáveis:** relatório de auditoria; proposta arquitetural; mapa de módulos; lista de bloqueios; plano de fases; decisões que precisam de aprovação.

**Gate 0:** não iniciar implementação ampla até que a arquitetura proposta e as decisões técnicas ainda abertas sejam revisadas. A auditoria pode avançar sem inventar regras comerciais.

### Fase 1 — Fundação técnica e modelo de dados

**Objetivo:** criar base segura e reproduzível.

Tarefas:
- Organizar configuração por ambiente sem inserir segredos no código.
- Definir migrações versionadas para PostgreSQL e estratégia de reversão quando viável.
- Desenhar entidades e relacionamentos necessários apenas ao escopo aprovado do MVP.
- Definir chaves, foreign keys, constraints, índices, nulabilidade, precisão monetária, datas e política de exclusão/histórico.
- Usar transações para operações que precisam ser atômicas.
- Definir autenticação e autorização no backend. A interface não pode ser a única barreira de segurança.
- Criar trilha de auditoria para ações críticas, sem registrar segredos.
- Preparar testes automatizados iniciais e instruções para executar localmente.
- Definir configuração de conexão com PostgreSQL próprio sem presumir fornecedor ou endereço.
- Criar interface de armazenamento de arquivos com implementação S3-compatible configurável; não habilitar acesso público por padrão.

**Entregáveis:** diagrama de dados; migrações; configuração de ambiente de exemplo; testes de fundação; documentação de execução; registro de decisões.

**Gate 1:** migrações aplicam-se em ambiente de teste limpo; constraints e testes básicos passam; segredos não aparecem no repositório; limitações ainda não testadas são declaradas.

### Fase 2 — Fluxo comercial principal

**Objetivo:** permitir o caminho comercial essencial sem simular regras não aprovadas.

Implementar em incrementos pequenos, de acordo com o PRD e decisões comerciais disponíveis:
- Cadastros essenciais de clientes e contatos.
- Catálogo básico e variantes necessárias ao orçamento.
- Lead e atividade comercial, se confirmados no escopo funcional do MVP.
- Orçamento com itens, quantidades, variantes, personalizações, versão e estado.
- Registro de premissas de custo e preço, mantendo separados valores estimados e realizados.
- Registro da aprovação do orçamento e da arte, quando aplicável.
- Conversão idempotente de orçamento aprovado em pedido, sem duplicar pedido em repetição de requisição.
- Histórico de alterações relevantes.

**Regra de bloqueio:** se um cálculo depender de percentuais, limites, arredondamento, base de comissão ou política ainda não transcrita e aprovada, não invente um valor padrão. Modele o parâmetro como configuração pendente, bloqueie o uso produtivo da regra ou peça a decisão necessária.

**Gate 2:** testes dos cenários de orçamento aprovados, versionamento, permissões e prevenção de duplicidade passam. Casos com regra pendente ficam explicitamente bloqueados ou marcados como não implementados.

### Fase 3 — Pedido e operação mínima

**Objetivo:** rastrear execução do pedido com integridade.

Priorizar apenas os componentes essenciais confirmados para o MVP:
- Pedido e estados de fluxo com transições validadas no backend.
- Planejamento básico da produção, se confirmado.
- Registro de materiais necessários, reservados, enviados ou devolvidos conforme o escopo aprovado.
- Registro de etapas terceirizadas e conferência, se fizerem parte da primeira entrega.
- Controle de qualidade, defeitos e retrabalho quando aplicável.
- Entrega integral e estrutura capaz de representar entrega parcial se essa necessidade estiver no escopo validado.
- Eventos de auditoria para alterações críticas.

Não criar saldos de estoque editáveis sem movimentações rastreáveis. Não concluir automaticamente que um serviço terceirizado foi aceito ou que deve ser pago sem regra de aceite aprovada.

**Gate 3:** transições inválidas são rejeitadas; movimentos relacionados são consistentes; concorrência e repetição de operações críticas são testadas.

### Fase 4 — Financeiro operacional mínimo

**Objetivo:** representar obrigações e recebimentos incluídos no escopo aprovado sem alegar que o MVP substitui contabilidade ou sistema fiscal.

- Definir títulos, pagamentos, baixas e saldos de acordo com as regras aprovadas.
- Manter valores monetários em tipos decimais adequados; não usar ponto flutuante binário para cálculos financeiros.
- Impedir baixas duplicadas e preservar histórico de ajustes e cancelamentos.
- Distinguir valor previsto, valor recebido/pago e resultado gerencial estimado/realizado.
- Aplicar permissões no backend e registrar autor, data e motivo para operações sensíveis conforme a política aprovada.

**Fora do escopo automático:** emissão fiscal, cálculo tributário oficial, integração bancária, conciliação automática e obrigações contábeis sem definição, validação e aprovação específicas.

**Gate 4:** cenários financeiros aprovados passam; duplicidades e transições inválidas são bloqueadas; as limitações são documentadas.

### Fase 5 — Preparação para homologação e produção

Tarefas:
- Revisar autenticação, autorização, exposição de dados e gestão de segredos.
- Executar testes automatizados e revisão de dependências conforme recursos disponíveis.
- Validar configuração do PostgreSQL e acesso restrito.
- Validar autorização de acesso a objetos no armazenamento S3-compatible.
- Documentar backups de banco e arquivos, restauração e responsáveis operacionais.
- Definir variáveis de ambiente, configuração de implantação, migrações e rollback.
- Produzir manual operacional e instruções de suporte.
- Registrar o que depende da contratada de infraestrutura ou de aprovações do cliente.

**Gate 5:** não publicar em produção até haver aprovação explícita do responsável, ambiente disponível, configuração segura, plano de recuperação e testes de aceitação concluídos com evidências.

## 5. Prompt mestre para iniciar no Google AI Studio

Copie o texto abaixo para uma conversa/projeto no Google AI Studio e anexe o `PRD_DE_FARDAS_v1.6.md` e este documento de execução. Se o projeto já tiver código, disponibilize os arquivos ou o repositório pelo recurso realmente disponível no ambiente.

> Você é o engenheiro de software responsável por implementar o MVP da DE FARDAS com apoio do Google Gemini no Google AI Studio. Leia integralmente os arquivos `PRD_DE_FARDAS_v1.6.md` e `EXECUCAO_GEMINI_AI_STUDIO_DE_FARDAS_v1.0.md` antes de propor mudanças.
>
> Siga os dois documentos como referências normativas. O PRD define requisitos e decisões; o documento de execução define o processo por fases e os gates de qualidade. Não invente requisitos comerciais, percentuais, regras fiscais, prazos, permissões ou dados. Não presuma que um repositório, arquivo, credencial, serviço ou recurso esteja disponível sem verificar.
>
> Decisões aprovadas: Google AI Studio é o ambiente de desenvolvimento assistido; PostgreSQL próprio é o banco; a aplicação será hospedada na infraestrutura contratada para a DE FARDAS; arquivos serão guardados em armazenamento privado compatível com S3; o escopo é o MVP do fluxo principal. Não substitua essas decisões sem autorização explícita. A stack de aplicação e fornecedores ainda não definidos devem ser propostos com justificativa, sem tratá-los como decisões já aprovadas.
>
> **Sua primeira tarefa é executar somente a Fase 0 — Auditoria e plano técnico. Não comece a gerar a aplicação completa e não faça alterações destrutivas.** Primeiro confirme quais documentos, arquivos, ferramentas e repositórios realmente consegue acessar. Se o código não estiver disponível, declare a limitação e peça o material necessário. Depois entregue: (1) resumo fiel dos requisitos; (2) matriz aprovado/proposto/pendente/fora do MVP; (3) auditoria da base existente, se acessível; (4) arquitetura mínima recomendada; (5) desenho conceitual inicial do PostgreSQL, sem executar migrações; (6) riscos e dependências; (7) plano de implementação faseado; (8) decisões que precisam de aprovação.
>
> Para cada afirmação sobre o código, cite o arquivo ou evidência que a sustenta. Separe fatos observados de hipóteses e recomendações. Não afirme que executou testes se não os executou. Ao final, pare e aguarde revisão/aprovação do plano antes de iniciar a Fase 1.

## 6. Formato obrigatório de resposta ao final de cada etapa

O Gemini deve encerrar cada etapa com este relatório:

1. **Etapa e objetivo** — o que esta etapa pretendia entregar.
2. **Arquivos criados/alterados** — caminho e finalidade de cada arquivo.
3. **Decisões tomadas** — separar decisões aprovadas de recomendações ainda pendentes.
4. **Implementação concluída** — funcionalidades reais, não apenas planejadas.
5. **Testes executados** — comando, ambiente e resultado observado; se não executado, dizer por quê.
6. **Segurança e dados** — riscos encontrados, controles aplicados e limitações.
7. **Pendências e bloqueios** — responsável ou decisão necessária, sem inventar resposta.
8. **Como validar** — instruções reproduzíveis para outra pessoa verificar o resultado.
9. **Próximo passo proposto** — não avançar para a fase seguinte se o gate atual não foi satisfeito.

## 7. Critérios gerais de qualidade

- Regras de domínio no backend; validação no frontend serve à experiência, não à segurança.
- Autorização testada por perfil e por operação.
- Migrações versionadas, repetíveis e verificadas em banco de teste.
- Chaves estrangeiras e constraints para proteger integridade.
- Operações críticas transacionais e idempotentes quando houver risco de repetição.
- Valores monetários representados com precisão decimal apropriada.
- Estados e transições explícitos; sem exclusão física de histórico crítico para “corrigir” um registro.
- Arquivos privados por padrão e autorização validada pelo backend.
- Logs úteis para operação, sem segredos nem dados pessoais desnecessários.
- Testes cobrindo sucesso, erro, permissões, duplicidade, concorrência e reprocessamento conforme aplicável.
- Documentação atualizada junto com o código.
- Nenhuma declaração de prontidão para produção sem evidência e aprovação explícita.

## 8. Decisões que continuam fora deste documento

Este documento não define nem inventa:
- percentual de markup, entrada, comissão ou desconto;
- bases de cálculo, arredondamento, preço mínimo ou alçadas comerciais;
- política final de aceite e pagamento a parceiros;
- prazos comerciais ou de produção por produto;
- política completa de cancelamento e reembolso;
- regime fiscal, documentos fiscais aplicáveis ou integração com contador;
- fornecedor de hospedagem, região, domínio, SLA, orçamento ou RPO/RTO;
- fornecedor S3, limites de armazenamento ou política contratual de retenção;
- stack definitiva, ORM, provedor de autenticação ou ferramenta de filas;
- repositório definitivo, caso ainda não tenha sido informado/conectado.

Quando algum desses pontos for necessário para implementar ou testar uma funcionalidade, o Gemini deve registrar a dependência e pedir decisão. Pode avançar em componentes independentes que não dependam dela.

## 9. Condição de sucesso do MVP

O MVP estará pronto para avaliação — não automaticamente autorizado para produção — quando:
- o fluxo principal acordado estiver implementado e demonstrável;
- as regras utilizadas tiverem origem identificável no PRD ou em decisão aprovada;
- os testes relevantes forem executados e seus resultados estiverem documentados;
- permissões, integridade e prevenção de duplicidade tiverem evidências;
- configuração, migrações, backups/restauração e implantação estiverem documentados;
- pendências e limitações estiverem explícitas;
- o responsável da Enlace e a DE FARDAS tiverem validado os critérios de aceite aplicáveis.

**Regra final:** construir menos, mas corretamente e verificavelmente, é preferível a gerar uma plataforma extensa baseada em suposições.
