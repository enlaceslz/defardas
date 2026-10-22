# Guia de Deploy na Vercel via GitHub — DE FARDAS ERP

Este documento fornece o passo a passo direto para conectar o repositório GitHub do projeto **DE FARDAS ERP** à **Vercel** e obter deploy contínuo (CI/CD) automático com alta disponibilidade.

---

## 1. Configuração Automática Pronta no Repositório

O repositório já está 100% preparado para a Vercel com os seguintes arquivos:
- `vercel.json`: Define o framework como **Vite**, o diretório de saída como `dist`, reescritas de URL de Single Page Application (`/(.*) -> /index.html`) para evitar erros 404 em rotas e recarregamentos de página, e políticas de cache imutável para assets.
- `package.json`: Scripts `"build": "vite build"`, `"lint": "tsc --noEmit"`.
- `.gitignore`: Protege pastas `.vercel/`, `dist/`, `node_modules/` e arquivos de ambiente sensíveis.

---

## 2. Passo a Passo para Deploy na Vercel

### Passo 1: Subir o Código para o seu GitHub
Se você ainda não enviou o código para o seu repositório GitHub:
```bash
git init
git add .
git commit -m "feat: DE FARDAS ERP com suporte a deploy Vercel"
git branch -M main
git remote add origin https://github.com/SEU_USUARIO/SEU_REPOSITORIO.git
git push -u origin main
```

---

### Passo 2: Importar o Projeto na Vercel
1. Acesse [vercel.com](https://vercel.com) e faça login (recomendado conectar com a sua conta GitHub).
2. No Dashboard da Vercel, clique no botão **"Add New..."** e selecione **"Project"**.
3. Na lista de repositórios do GitHub, localize o repositório **DE FARDAS** e clique em **"Import"**.

---

### Passo 3: Conferir as Configurações de Build
A Vercel lerá automaticamente o arquivo `vercel.json` e o `package.json`. Verifique se os campos estão configurados como:

| Campo | Valor Detectado / Esperado |
|---|---|
| **Framework Preset** | `Vite` |
| **Root Directory** | `./` |
| **Build Command** | `npm run build` |
| **Output Directory** | `dist` |
| **Install Command** | `npm install` |

*Normalmente não é necessário alterar nenhum desses valores, pois a Vercel detecta tudo perfeitamente.*

---

### Passo 4: Variáveis de Ambiente (Opcional)
Se desejar habilitar a integração com o Google Gemini ou especificar URL customizada, adicione na seção **Environment Variables**:
- `GEMINI_API_KEY`: *(Sua chave da API Google Gemini, se for utilizar chamadas server-side/edge)*
- `VITE_APP_URL`: *(Opcional, preenchido automaticamente com o domínio da Vercel)*

*Nota: O sistema DE FARDAS armazena estado inicial, catálogo e simulações com persistência resiliente em LocalStorage, permitindo que a demonstração e o uso completo funcionem imediatamente mesmo sem backend externo configurado.*

---

### Passo 5: Concluir o Deploy
1. Clique no botão azul **"Deploy"**.
2. A Vercel executará o processo de build em cerca de 30 a 60 segundos.
3. Ao finalizar, você receberá um domínio gratuito no padrão `https://seu-projeto.vercel.app` com certificado HTTPS/SSL automático.

---

## 3. Benefícios do Deploy Contínuo no GitHub
- **Deploy Automático a cada `git push`:** Qualquer alteração enviada para a branch `main` gera uma nova versão em produção imediatamente.
- **Preview Deployments:** Ao abrir um Pull Request (PR), a Vercel gera um link temporário exclusivo para testar as mudanças antes de mesclar.
- **Rollback Instantâneo:** Se precisar reverter para qualquer versão anterior, basta um clique na aba *Deployments* no painel da Vercel.

---

## 4. Testes e Validação Pós-Deploy

Após o deploy concluir, teste os seguintes fluxos no link gerado pela Vercel:
1. **Navegação SPA:** Navegue entre *Portal Público*, *Ordens de Produção (PCP)*, *Orçamentos*, *Estoque* e *Financeiro*. Recarregue a página (F5) em qualquer tela para confirmar que a reescrita do `vercel.json` impede telas 404.
2. **Portões do PCP:** Abra uma Ordem de Produção e teste a confirmação do sinal de 50% e a aprovação de layout para desbloquear o status de corte.
3. **Motor de Precificação (Markup):** Acesse a emissão de orçamento e confirme o cálculo de custo-base e markup percentual.
4. **Impressão:** Clique em emitir Ficha Fabril ou Proposta Comercial e teste o preview para impressão/PDF.
5. **Ajuda & Manual:** Clique no botão superior *Ajuda & Manual* para abrir o manual de regras de negócio PRD v1.6.
