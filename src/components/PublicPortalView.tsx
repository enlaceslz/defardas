import { useSubmission } from '../api/useSubmission';
import React, { useState } from 'react';
import { 
  Shirt, 
  Send, 
  Phone, 
  MapPin, 
  Clock, 
  CheckCircle2, 
  Sparkles, 
  ArrowRight, 
  ShieldCheck, 
  Filter,
  MessageSquare
} from 'lucide-react';
import { PublicCatalogItem, CompanyProfile, UniformCategory } from '../types/erp';

interface PublicPortalViewProps {
  catalog: PublicCatalogItem[];
  profile: CompanyProfile;
  onRequestQuote: (quoteRequest: {
    clientName: string;
    companyName: string;
    phone: string;
    email: string;
    category: UniformCategory;
    estimatedQty: number;
    notes: string;
  }) => Promise<boolean>;
}

export const PublicPortalView: React.FC<PublicPortalViewProps> = ({
  catalog,
  profile,
  onRequestQuote,
}) => {
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedItemForQuote, setSelectedItemForQuote] = useState<PublicCatalogItem | null>(null);

  // Form State
  const [clientName, setClientName] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [category, setCategory] = useState<UniformCategory>('polos');
  const [estimatedQty, setEstimatedQty] = useState(50);
  const [notes, setNotes] = useState('');
  const [successSubmitted, setSuccessSubmitted] = useState(false);

  const categories = [
    { id: 'all', label: 'Todos os Fardamentos' },
    { id: 'polos', label: 'Polos Corporativas' },
    { id: 'linha_hospitalar', label: 'Linha Hospitalar & Jalecos' },
    { id: 'calcas', label: 'Calças Operacionais & Brim' },
    { id: 'camisetas', label: 'Camisetas Dry-Fit & Algodão' },
    { id: 'aventais_batas', label: 'Aventais & Batas' },
    { id: 'macacoes', label: 'Macacões Industriais' },
  ];

  const filteredCatalog = catalog.filter(
    (item) => selectedCategory === 'all' || item.category === selectedCategory
  );

  const handleOpenQuoteModal = (item?: PublicCatalogItem) => {
    if (item) {
      setSelectedItemForQuote(item);
      setCategory(item.category);
      setNotes(`Interesse no modelo: ${item.title}`);
    } else {
      setSelectedItemForQuote(null);
    }
    setModalOpen(true);
  };

  const { submit, isSaving } = useSubmission();
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!(await submit(() => onRequestQuote({
      clientName,
      companyName,
      phone,
      email,
      category,
      estimatedQty,
      notes,
    })))) return;
    setSuccessSubmitted(true);
    setTimeout(() => {
      setSuccessSubmitted(false);
      setModalOpen(false);
      setClientName('');
      setCompanyName('');
      setPhone('');
      setEmail('');
      setNotes('');
    }, 2500);
  };

  return (
    <div className="space-y-12 pb-16">
      
      {/* Hero Institutional Banner */}
      <section className="bg-slate-900 text-white rounded-2xl p-8 sm:p-12 border border-slate-800 shadow-md relative overflow-hidden">
        <div className="relative z-10 max-w-3xl space-y-4">
          <div className="inline-flex items-center gap-2 px-3 py-1 bg-blue-600/20 border border-blue-500/30 rounded-full text-blue-300 text-xs font-semibold">
            <ShieldCheck className="w-4 h-4 text-blue-400" />
            <span>Fundada em {profile.foundedYear} em São Luís — Maranhão</span>
          </div>

          <h1 className="text-3xl sm:text-4xl lg:text-5xl font-black tracking-tight leading-tight">
            Uniformes Profissionais com Padrão de Alta Resistência
          </h1>

          <p className="text-slate-300 text-sm sm:text-base leading-relaxed">
            Atendemos operações portuárias, redes hospitalares, colégios e corporações em todo o Maranhão.
            Modelagem ergonômica, tecidos tecnológicos homologados (Santanense, Cedro, 3M) e personalização em bordado automatizado e serigrafia.
          </p>

          <div className="pt-2 flex flex-wrap items-center gap-4 text-xs font-medium text-slate-300">
            <div className="flex items-center gap-1.5">
              <MapPin className="w-4 h-4 text-blue-400" />
              <span>{profile.address}, {profile.neighborhood} — {profile.city}/{profile.state}</span>
            </div>
            <div className="flex items-center gap-1.5 font-mono">
              <Phone className="w-4 h-4 text-blue-400" />
              <span>{profile.phone}</span>
            </div>
          </div>

          <div className="pt-4 flex flex-wrap gap-3">
            <button
              onClick={() => handleOpenQuoteModal()}
              className="inline-flex items-center gap-2 px-6 py-3 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded-lg shadow-md transition-colors cursor-pointer"
            >
              <span>Solicitar Orçamento B2B</span>
              <ArrowRight className="w-4 h-4" />
            </button>
            <a
              href={`https://wa.me/5598981354130?text=Olá,%20gostaria%20de%20solicitar%20um%20orçamento%20de%20uniformes%20da%20DE%20FARDAS`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 px-6 py-3 bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold rounded-lg border border-slate-700 transition-colors"
            >
              <MessageSquare className="w-4 h-4 text-emerald-400" />
              <span>Falar no WhatsApp ({profile.phone})</span>
            </a>
          </div>
        </div>
      </section>

      {/* Catalog Filter Tabs */}
      <section className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-4">
          <div>
            <h2 className="text-xl font-bold text-slate-900">
              Portfólio de Produtos Sob Encomenda
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Conforme o PRD v1.6, os produtos são confeccionados sob demanda e customizados por lote
            </p>
          </div>

          {/* Categories */}
          <div className="flex flex-wrap gap-1.5">
            {categories.map((c) => (
              <button
                key={c.id}
                onClick={() => setSelectedCategory(c.id)}
                className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors cursor-pointer whitespace-nowrap ${
                  selectedCategory === c.id
                    ? 'bg-blue-600 text-white font-semibold shadow-xs'
                    : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
                }`}
              >
                {c.label}
              </button>
            ))}
          </div>
        </div>

        {/* Catalog Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredCatalog.map((item) => (
            <div
              key={item.id}
              className="bg-white rounded-xl border border-slate-200 shadow-xs hover:border-blue-300 transition-all overflow-hidden flex flex-col justify-between"
            >
              <div className="p-6 space-y-4">
                <div className="flex items-start justify-between">
                  <div className="w-10 h-10 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
                    <Shirt className="w-5 h-5" />
                  </div>
                  {item.isPopular && (
                    <span className="text-[10px] font-bold uppercase tracking-wider text-blue-700 bg-blue-50 px-2.5 py-0.5 rounded border border-blue-200">
                      Mais Solicitado
                    </span>
                  )}
                </div>

                <div>
                  <h3 className="text-base font-bold text-slate-900 leading-tight">
                    {item.title}
                  </h3>
                  <p className="text-xs text-slate-600 mt-2 leading-relaxed">
                    {item.description}
                  </p>
                </div>

                <div className="space-y-2 pt-2 border-t border-slate-100 text-xs">
                  <div>
                    <span className="font-semibold text-slate-700 block">Tecidos Recomendados:</span>
                    <span className="text-slate-500 text-[11px] block mt-0.5">
                      {item.recommendedFabrics.join(' · ')}
                    </span>
                  </div>

                  <div>
                    <span className="font-semibold text-slate-700 block">Personalizações Homologadas:</span>
                    <span className="text-slate-500 text-[11px] block mt-0.5">
                      {item.customizationOptions.join(' · ')}
                    </span>
                  </div>
                </div>
              </div>

              {/* Card Footer Action */}
              <div className="p-4 bg-slate-50 border-t border-slate-100 flex items-center justify-between">
                <span className="text-[11px] font-medium text-slate-500">
                  Sob medida e grade corporativa
                </span>
                <button
                  onClick={() => handleOpenQuoteModal(item)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-blue-700 bg-white hover:bg-blue-50 border border-blue-200 rounded-lg transition-colors cursor-pointer"
                >
                  <span>Solicitar Orçamento</span>
                  <ArrowRight className="w-3 h-3" />
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Quote Request Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black/60 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full overflow-hidden border border-slate-200">
            <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold">Solicitar Orçamento de Fardamentos</h3>
                <p className="text-xs text-slate-400 mt-0.5">DE FARDAS — São Luís / MA</p>
              </div>
              <button
                onClick={() => setModalOpen(false)}
                className="text-slate-400 hover:text-white p-1 rounded cursor-pointer"
              >
                ✕
              </button>
            </div>

            {successSubmitted ? (
              <div className="p-8 text-center space-y-3">
                <CheckCircle2 className="w-12 h-12 text-emerald-600 mx-auto" />
                <h4 className="text-base font-bold text-slate-900">Solicitação Enviada com Sucesso!</h4>
                <p className="text-xs text-slate-600 leading-relaxed max-w-sm mx-auto">
                  Seu pedido foi registrado diretamente em nossa equipe comercial. Entraremos em contato via WhatsApp e e-mail com a proposta formal e tabela técnica.
                </p>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="p-6 space-y-4 text-xs">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Seu Nome *</label>
                    <input
                      type="text"
                      required
                      value={clientName}
                      onChange={(e) => setClientName(e.target.value)}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-900"
                      placeholder="Ex: Carlos Mendes"
                    />
                  </div>
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Empresa / Instituição *</label>
                    <input
                      type="text"
                      required
                      value={companyName}
                      onChange={(e) => setCompanyName(e.target.value)}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-900"
                      placeholder="Ex: Vale Logística"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">WhatsApp / Telefone *</label>
                    <input
                      type="text"
                      required
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-900 font-mono"
                      placeholder="(98) 98800-0000"
                    />
                  </div>
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">E-mail Comercial *</label>
                    <input
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-900"
                      placeholder="compras@empresa.com.br"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Categoria de Fardamento</label>
                    <select
                      value={category}
                      onChange={(e) => setCategory(e.target.value as UniformCategory)}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white text-slate-900 capitalize"
                    >
                      <option value="polos">Polos Corporativas</option>
                      <option value="linha_hospitalar">Linha Hospitalar / Jalecos</option>
                      <option value="calcas">Calças Operacionais Brim</option>
                      <option value="camisetas">Camisetas Dry-Fit / Algodão</option>
                      <option value="aventais_batas">Aventais / Cozinha</option>
                      <option value="macacoes">Macacões Industriais</option>
                      <option value="operacional">Operacional Pesado</option>
                    </select>
                  </div>
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Quantidade Estimada (Peças)</label>
                    <input
                      type="number"
                      min="10"
                      value={estimatedQty}
                      onChange={(e) => setEstimatedQty(parseInt(e.target.value) || 10)}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono text-slate-900"
                    />
                  </div>
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Detalhes e Personalizações Desejadas</label>
                  <textarea
                    rows={3}
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-900"
                    placeholder="Especifique se precisa de bordado com logo, faixas refletivas, cores institucionais..."
                  />
                </div>

                <div className="pt-2 flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setModalOpen(false)}
                    className="px-4 py-2 border border-slate-300 rounded-lg text-slate-700 hover:bg-slate-50 cursor-pointer"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit" disabled={isSaving}
                    className="px-5 py-2 bg-blue-600 hover:bg-blue-500 text-white font-semibold rounded-lg shadow-sm cursor-pointer"
                  >
                    Enviar Solicitação
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

    </div>
  );
};
