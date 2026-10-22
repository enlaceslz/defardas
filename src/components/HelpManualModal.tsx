import React, { useState } from 'react';
import { 
  X, 
  BookOpen, 
  HelpCircle, 
  Calculator, 
  ShieldCheck, 
  Factory, 
  Boxes, 
  DollarSign, 
  CheckCircle2, 
  Search,
  AlertTriangle,
  FileText,
  ChevronRight
} from 'lucide-react';

interface HelpManualModalProps {
  onClose: () => void;
  initialTopic?: string;
}

export const HelpManualModal: React.FC<HelpManualModalProps> = ({
  onClose,
  initialTopic = 'geral',
}) => {
  const [activeTopic, setActiveTopic] = useState<string>(initialTopic);
  const [searchQuery, setSearchQuery] = useState('');

  const topics = [
    {
      id: 'geral',
      title: '1. Visão Geral & Ambientes',
      icon: BookOpen,
      content: (
        <div className="space-y-4">
          <h4 className="text-sm font-bold text-slate-900">Visão Geral da Plataforma DE FARDAS</h4>
          <p className="text-xs text-slate-600 leading-relaxed">
            O sistema DE FARDAS foi estruturado conforme o <strong>PRD v1.6</strong> para apoiar o ciclo fabril e comercial de uniformes em São Luís — MA, desde a atração do cliente até a expedição das peças e quitação financeira.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
            <div className="p-3 bg-blue-50/70 border border-blue-200 rounded-lg">
              <span className="font-bold text-blue-900 block text-xs">1. Portal Público</span>
              <p className="text-[11px] text-blue-800 mt-1">
                Vitrine digital sob encomenda para captação de orçamentos e contato direto via WhatsApp (98) 98135-4130.
              </p>
            </div>
            <div className="p-3 bg-slate-100 border border-slate-200 rounded-lg">
              <span className="font-bold text-slate-900 block text-xs">2. ERP & PCP Interno</span>
              <p className="text-[11px] text-slate-600 mt-1">
                Motor de precificação por markup, Kanban de produção de 7 etapas, estoque de tecidos e contas a receber.
              </p>
            </div>
            <div className="p-3 bg-emerald-50/70 border border-emerald-200 rounded-lg">
              <span className="font-bold text-emerald-900 block text-xs">3. Inteligência Gerencial</span>
              <p className="text-[11px] text-emerald-800 mt-1">
                Indicadores de peças ativas, custos de facções, perdas técnicas e faturamento previsto.
              </p>
            </div>
          </div>
        </div>
      ),
    },
    {
      id: 'precificacao',
      title: '2. Motor de Preços & Markup',
      icon: Calculator,
      content: (
        <div className="space-y-4">
          <h4 className="text-sm font-bold text-slate-900">Regra Normativa de Formação de Preço (Adendo B.2.1)</h4>
          <p className="text-xs text-slate-600 leading-relaxed">
            A formação de preços da DE FARDAS utiliza estritamente o método de <strong>Markup sobre o Custo-Base</strong>. O sistema não utiliza a fórmula de margem sobre receita no cálculo inicial para evitar dupla contagem de encargos.
          </p>

          <div className="p-3 bg-slate-900 text-slate-100 rounded-lg font-mono text-xs space-y-2">
            <div>
              <span className="text-blue-400 font-bold">1. Custo-base Direto</span> = (Tecido + Costura Facção + Bordado/Silk + Frete) × (1 + Perdas Técnicas%)
            </div>
            <div>
              <span className="text-emerald-400 font-bold">2. Preço Sugerido</span> = Custo-base × (1 + Markup% / 100)
            </div>
            <div>
              <span className="text-amber-400 font-bold">3. Margem Estimada</span> = ((Preço Negociado - Custo-base) / Preço Negociado) × 100
            </div>
          </div>

          <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-900 space-y-1">
            <span className="font-bold flex items-center gap-1.5 text-amber-800">
              <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
              Alçada para Preço Abaixo do Sugerido (Regra A.3.1)
            </span>
            <p className="text-[11px] leading-relaxed">
              Caso o vendedor negocie um valor unitário menor que o preço sugerido pelo sistema, o formulário exigirá a marcação de autorização e o registro nominal do responsável (Gerente Comercial ou Administrador).
            </p>
          </div>
        </div>
      ),
    },
    {
      id: 'portoes',
      title: '3. Portões de Liberação Fabril (Gates)',
      icon: ShieldCheck,
      content: (
        <div className="space-y-4">
          <h4 className="text-sm font-bold text-slate-900">Por que uma OP Fica no Estágio "Bloqueado"?</h4>
          <p className="text-xs text-slate-600 leading-relaxed">
            Conforme a seção <strong>A.3.2 do PRD v1.6</strong>, a produção no chão de fábrica e a remessa de tecidos não podem iniciar sem o cumprimento de duas condições obrigatórias de segurança:
          </p>

          <div className="space-y-3">
            <div className="flex items-start gap-3 p-3 bg-white border border-slate-200 rounded-lg text-xs">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
              <div>
                <strong className="text-slate-900">Gate 1: Confirmação do Sinal de Entrada (50%)</strong>
                <p className="text-slate-500 text-[11px] mt-0.5">
                  Garante o fluxo de caixa para a compra de matérias-primas e pagamento inicial de corte. A confirmação é registrada pelo financeiro com o comprovante bancário (PIX/TED).
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3 p-3 bg-white border border-slate-200 rounded-lg text-xs">
              <CheckCircle2 className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
              <div>
                <strong className="text-slate-900">Gate 2: Aprovação Formal da Arte / Layout</strong>
                <p className="text-slate-500 text-[11px] mt-0.5">
                  Evita perdas irreversíveis em peças personalizadas. A aprovação da posição e das cores do bordado ou serigrafia deve ser confirmada pelo cliente antes da mesa de corte.
                </p>
              </div>
            </div>
          </div>

          <p className="text-[11px] text-slate-500 italic">
            * No quadro Kanban de Produção, basta clicar em "Confirmar Sinal" ou "Aprovar Arte" no card da OP para liberar o avanço para a etapa 1 (Corte & Enfesto).
          </p>
        </div>
      ),
    },
    {
      id: 'terceirizacao',
      title: '4. Terceirização & Qualidade',
      icon: Factory,
      content: (
        <div className="space-y-4">
          <h4 className="text-sm font-bold text-slate-900">Facções Externas e Conferência Final (PRD 5.8 e B.2.3)</h4>
          <p className="text-xs text-slate-600 leading-relaxed">
            A DE FARDAS opera com facções e parceiros homologados para costura completa, bordados em máquinas Tajima e silk-screen.
          </p>

          <div className="space-y-2 text-xs">
            <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
              <strong className="text-slate-800">1. Cobrança por Peça:</strong>
              <p className="text-slate-600 text-[11px] mt-0.5">
                O custo acordado com a facção é fixado por peça concluída. O material enviado permanece registrado em estoque sob a condição "Em poder de terceiros".
              </p>
            </div>

            <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
              <strong className="text-slate-800">2. Inspeção de Qualidade Obrigatória:</strong>
              <p className="text-slate-600 text-[11px] mt-0.5">
                Antes de empacotar e despachar as peças, a equipe técnica da DE FARDAS realiza a conferência física do lote. Peças com defeito geram ordem de retrabalho ou registro de perda técnica.
              </p>
            </div>

            <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
              <strong className="text-slate-800">3. Liberação de Pagamento ao Parceiro:</strong>
              <p className="text-slate-600 text-[11px] mt-0.5">
                O pagamento da mão de obra da facção só é autorizado no financeiro após a aprovação formal da qualidade.
              </p>
            </div>
          </div>
        </div>
      ),
    },
    {
      id: 'estoque',
      title: '5. Almoxarifado & Tecidos',
      icon: Boxes,
      content: (
        <div className="space-y-4">
          <h4 className="text-sm font-bold text-slate-900">Gestão de Rolos Têxteis & Ponto de Pedido</h4>
          <p className="text-xs text-slate-600 leading-relaxed">
            O almoxarifado monitora Brim Pesado Santanense, Cedro Workwear, Gabardine Microfibra, Piquet PA, faixas refletivas 3M e aviamentos.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            <div className="p-3 bg-white border border-slate-200 rounded-lg">
              <strong className="text-slate-800 block">Ponto de Pedido (Estoque Mínimo)</strong>
              <p className="text-slate-500 text-[11px] mt-1">
                Quando o saldo em metros ou quilos atinge o estoque mínimo de segurança, o sistema aciona um alerta visual âmbar no menu lateral e no topo da tela.
              </p>
            </div>

            <div className="p-3 bg-white border border-slate-200 rounded-lg">
              <strong className="text-slate-800 block">Ajustes Rápidos (+50 / -10)</strong>
              <p className="text-slate-500 text-[11px] mt-1">
                Na tabela de estoque, use os botões rápidos para registrar a entrada de rolos novos (+50m) ou a baixa avulsa de tecido (-10m) com atualização imediata da valoração.
              </p>
            </div>
          </div>
        </div>
      ),
    },
    {
      id: 'financeiro',
      title: '6. Finanças & Recebimentos',
      icon: DollarSign,
      content: (
        <div className="space-y-4">
          <h4 className="text-sm font-bold text-slate-900">Fluxo de Caixa & Divisão das Parcelas</h4>
          <p className="text-xs text-slate-600 leading-relaxed">
            As vendas de uniformes geram automaticamente dois lançamentos no Contas a Receber:
          </p>

          <div className="space-y-2 text-xs">
            <div className="p-3 bg-emerald-50/60 border border-emerald-200 rounded-lg">
              <strong className="text-emerald-900">Parcela 1: Sinal de Entrada (50%)</strong>
              <p className="text-emerald-800 text-[11px] mt-0.5">
                Vence no momento da emissão da proposta e sua quitação é a chave para o destravamento da ordem de produção no chão de fábrica.
              </p>
            </div>

            <div className="p-3 bg-blue-50/60 border border-blue-200 rounded-lg">
              <strong className="text-blue-900">Parcela 2: Saldo Residual (50%)</strong>
              <p className="text-blue-800 text-[11px] mt-0.5">
                Vence na data programada de entrega física dos fardamentos ao cliente, via boleto bancário ou PIX.
              </p>
            </div>
          </div>
        </div>
      ),
    },
  ];

  const filteredTopics = topics.filter((t) =>
    t.title.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const currentTopicData = topics.find((t) => t.id === activeTopic) || topics[0];

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/60 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-4xl w-full overflow-hidden border border-slate-200 flex flex-col max-h-[85vh]">
        
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 bg-slate-900 text-white shrink-0">
          <div className="flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-blue-400" />
            <div>
              <h3 className="text-base font-bold">Manual de Operações & Guia do Usuário</h3>
              <p className="text-[11px] text-slate-400">DE FARDAS — Conforme Diretrizes do PRD v1.6</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Search Bar */}
        <div className="p-3 bg-slate-50 border-b border-slate-200 px-6">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
            <input
              type="text"
              placeholder="Pesquisar por assunto (markup, portões de bloqueio, facções, estoque, sinal 50%)..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 border border-slate-300 rounded-lg text-xs text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        {/* Body Split */}
        <div className="flex flex-1 overflow-hidden">
          
          {/* Left Navigation Topics */}
          <div className="w-64 border-r border-slate-200 p-3 space-y-1 bg-slate-50/50 overflow-y-auto shrink-0">
            {filteredTopics.map((topic) => {
              const Icon = topic.icon;
              const isActive = activeTopic === topic.id;

              return (
                <button
                  key={topic.id}
                  onClick={() => setActiveTopic(topic.id)}
                  className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-xs font-medium text-left transition-colors cursor-pointer ${
                    isActive
                      ? 'bg-blue-600 text-white font-semibold shadow-xs'
                      : 'text-slate-700 hover:bg-slate-100 hover:text-slate-900'
                  }`}
                >
                  <div className="flex items-center gap-2.5 truncate">
                    <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-white' : 'text-slate-400'}`} />
                    <span className="truncate">{topic.title}</span>
                  </div>
                  <ChevronRight className={`w-3.5 h-3.5 shrink-0 ${isActive ? 'text-white' : 'text-slate-400'}`} />
                </button>
              );
            })}
          </div>

          {/* Right Topic Content */}
          <div className="flex-1 p-6 overflow-y-auto bg-white">
            {currentTopicData.content}
          </div>

        </div>

        {/* Footer */}
        <div className="px-6 py-3 bg-slate-50 border-t border-slate-200 flex items-center justify-between text-xs text-slate-500 shrink-0">
          <span>DE FARDAS INDÚSTRIA E CONFECÇÃO LTDA — São Luís, MA</span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-slate-900 text-white font-semibold rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
          >
            Fechar Manual
          </button>
        </div>

      </div>
    </div>
  );
};
