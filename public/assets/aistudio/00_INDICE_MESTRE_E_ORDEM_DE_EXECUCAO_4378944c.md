# DE FARDAS — Índice mestre do PRD modular v1.0

**Objetivo:** decompor o PRD v1.6 em documentos menores, ordenados pela dependência técnica e prioridade de desenvolvimento no Google AI Studio.

## Decisões técnicas já aprovadas

- Desenvolvedor: Google Gemini no Google AI Studio.
- Banco: PostgreSQL próprio.
- Hospedagem: infraestrutura contratada para a cliente DE FARDAS.
- Arquivos: armazenamento privado compatível com S3.
- Escopo: MVP do fluxo principal, implementado incrementalmente.
- Essas escolhas não definem fornecedor, framework, ORM, autenticação, domínio, SLA, RPO/RTO ou regras comerciais ainda não transcritas.

## Ordem recomendada para o Gemini

| Ordem | Arquivo | Objetivo | Gate para avançar |
|---:|---|---|---|
| 0 | `00_INDICE_MESTRE_E_ORDEM_DE_EXECUCAO.md` | Regras do pacote e sequência | Entender prioridades e bloqueios |
| 1 | `01_FUNDACAO_ARQUITETURA_BANCO_E_SEGURANCA.md` | Auditoria, arquitetura, modelo de dados, segurança | Proposta técnica revisada; migrações ainda não aplicadas em produção |
| 2 | `02_REGRAS_DE_NEGOCIO_E_PENDENCIAS.md` | Separar confirmado, proposto e pendente | Registro de conflitos e decisões em aberto |
| 3 | `03_AUDITORIA_CORRECOES_E_CONFLITOS.md` | Corrigir conflitos e evitar implementação incoerente | Conflitos críticos registrados |
| 4 | `04_ORCAMENTOS_E_MOTOR_DE_PRECOS.md` | Orçamento versionado e cálculo transparente | Fórmula e casos esperados aprovados; sem valores inventados |
| 5 | `05_CRM_CLIENTES_E_FLUXO_COMERCIAL.md` | Clientes, leads, atividades, orçamento e pedido | Testes do ciclo comercial e idempotência |
| 6 | `06_CATALOGO_MATERIAIS_COMPRAS_E_PRODUCAO.md` | Catálogo, compras, estoque e produção/terceiros | Rastreabilidade de materiais, quantidades e qualidade |
| 7 | `07_FINANCEIRO_ENTREGAS_E_CANCELAMENTOS.md` | Títulos, pagamentos, entrega, cancelamento | Estados separados, estornos auditáveis e regras confirmadas |
| 8 | `08_PORTAL_PUBLICO_E_PORTFOLIO.md` | Site, catálogo público, captação de leads | Conteúdo e dados públicos confirmados pela cliente |
| 9 | `09_RELATORIOS_IA_FISCAL_E_INTEGRACOES_FUTURAS.md` | Recursos posteriores e integrações | Escopo fiscal e integrações formalmente validados |
| 10 | `10_TESTES_CRITERIOS_DE_ACEITE_E_LIBERACAO.md` | Qualidade e critérios transversais | Evidências de teste e checklist de liberação |
| — | `11_EXECUCAO_GEMINI_AI_STUDIO.md` | Instruções de execução e prompt mestre | Usar em conjunto com o índice e partes relevantes |
| — | `99_PRD_COMPLETO_ORIGINAL_v1.6.md` | Referência integral da versão de origem | Preservação e rastreabilidade |

## Regras obrigatórias para o Gemini

1. Começar pela Fase 0: auditar o estado real do projeto, os arquivos, dependências e infraestrutura. Se não houver repositório ou código disponível, declarar isso e propor a fundação; não fingir ter auditado.
2. Antes de programar, apresentar arquitetura, modelo entidade-relacionamento, decisões tecnológicas ainda abertas, riscos e plano de testes.
3. Não fazer todas as partes de uma só vez. Executar uma fase por vez, entregar resumo de alterações, testes executados, evidências, riscos e próximos passos.
4. Não inventar valores de markup, entrada, comissão, desconto, prazo, reembolso, impostos, alçadas ou outras regras comerciais. Marcar como bloqueio, solicitar decisão ou manter a funcionalidade desativada.
5. Não ativar emissão fiscal real, WhatsApp automatizado, integrações bancárias ou produção sem homologação e autorização explícita.
6. Não colocar segredos no código ou no repositório. Não expor PostgreSQL nem arquivos privados publicamente.
7. Não aplicar migrações destrutivas, apagar dados ou publicar em produção sem autorização explícita.
8. Distinguir claramente: **confirmado**, **proposto**, **pendente**, **implementado**, **testado** e **não testado**.
9. Não declarar testes, integrações, auditorias ou implantação como concluídos sem evidência observável.
10. Manter documentação e testes atualizados junto ao código.

## Contradições conhecidas a não reproduzir

- **Markup vs. margem:** a regra respondida é markup percentual sobre custo. A fórmula de margem existente na seção original 5.6 não deve ser implementada como se fosse a regra aprovada. O percentual e a composição exata continuam precisando de registro explícito.
- **Permissões:** existem trechos com alçadas inconsistentes para gerente/administrador. Não fixar permissões comerciais finais sem a matriz aprovada. Aplicar negação por padrão e deixar ações sensíveis restritas até resolução.
- **Checklist concluído:** a declaração de que as pendências foram resolvidas não contém por si só os valores das respostas; a transcrição explícita ainda é necessária.

## Regra de precedência documental

1. Decisão explícita e registrada pelo responsável, com data e escopo.
2. Correções normativas mais recentes dos adendos do PRD v1.6, quando resolvem conflito identificado.
3. Requisitos centrais do PRD v1.6.
4. Propostas técnicas do Gemini, que não são requisitos aprovados até serem aceitas.

Quando duas fontes conflitam e nenhuma corrige claramente a outra, parar o requisito afetado, registrar a divergência e pedir decisão.
