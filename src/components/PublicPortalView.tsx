import React, { useMemo, useRef, useState } from 'react';
import {
  Shirt,
  Phone,
  MapPin,
  Clock,
  CheckCircle2,
  ArrowRight,
  Search,
  MessageSquare,
  X,
  Mail,
  ExternalLink,
  SlidersHorizontal,
  Check,
  FileText,
} from 'lucide-react';
import { PublicCatalogItem, CompanyProfile, UniformCategory } from '../types/erp';
import { PhoneInputBR } from './FormInputs';
import { DEFAULT_BRAND_LOGO_URL } from '../data/initialData';
import {
  buildOsmDirectionsUrl,
  formatFullAddress,
  isValidCoordinates,
  normalizeWhatsAppDigitsBR,
} from '../utils/addressUtils';
import { AddressLocationMap } from './AddressLocationMap';

import heroAtelierImg from '../assets/images/vitrine_hero_atelier_1795738226069.jpg';
import poloCorpImg from '../assets/images/vitrine_polo_corp_1795738227503.jpg';
import jalecoHospImg from '../assets/images/vitrine_jaleco_hosp_1795738231478.jpg';
import brimOperacionalImg from '../assets/images/vitrine_brim_operacional_1795738227637.jpg';
import camisetaDryfitImg from '../assets/images/vitrine_camiseta_dryfit_1795738231647.jpg';
import aventalGourmetImg from '../assets/images/vitrine_avental_gourmet_1795738231773.jpg';
import macacaoIndustrialImg from '../assets/images/vitrine_macacao_industrial_1795738233134.jpg';

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
  }) => void;
  onOpenSystemLogin?: () => void;
}

const CATEGORY_LABELS: Record<string, string> = {
  all: 'Todos',
  polos: 'Polos Corporativas',
  linha_hospitalar: 'Linha Hospitalar',
  calcas: 'Calças em Brim',
  camisetas: 'Camisetas Dry-Fit',
  aventais_batas: 'Aventais e Batas',
  macacoes: 'Macacões Industriais',
  operacional: 'Operacional Pesado',
  camisas_sociais: 'Camisas Sociais',
  escolar: 'Linha Escolar',
  esportivo: 'Linha Esportiva',
};

const CATEGORY_IMAGES: Record<string, string> = {
  polos: poloCorpImg,
  linha_hospitalar: jalecoHospImg,
  calcas: brimOperacionalImg,
  camisetas: camisetaDryfitImg,
  aventais_batas: aventalGourmetImg,
  macacoes: macacaoIndustrialImg,
  operacional: brimOperacionalImg,
  camisas_sociais: poloCorpImg,
  escolar: camisetaDryfitImg,
  esportivo: camisetaDryfitImg,
};

const QUANTITY_PRESETS = [20, 50, 100, 250, 500];

const PRODUCTION_STEPS = [
  {
    index: '01.',
    title: 'Especificação e Amostragem',
    description:
      'Definimos tecidos homologados, gramatura, cor institucional e grade completa do PP ao EXG conforme o ambiente de trabalho da equipe.',
  },
  {
    index: '02.',
    title: 'Aprovação Formal da Arte',
    description:
      'Antes de liberar qualquer lote para corte, enviamos o layout digital com posição e proporção exatas do bordado, silk-screen ou faixas refletivas.',
  },
  {
    index: '03.',
    title: 'Corte, Costura e Personalização',
    description:
      'Produção controlada por Ordem de Produção com rastreabilidade de tecidos, bordado computadorizado de alta definição e acabamento industrial.',
  },
  {
    index: '04.',
    title: 'Conferência e Entrega Programada',
    description:
      'Cada peça passa por revisão final de costura, medidas e embalagem por tamanho, com entrega agendada para sua sede ou operação.',
  },
];

interface ResilientImageProps {
  src: string;
  alt: string;
  fallbackTitle: string;
  className?: string;
}

const ResilientEditorialImage: React.FC<ResilientImageProps> = ({
  src,
  alt,
  fallbackTitle,
  className = 'w-full h-full object-cover',
}) => {
  const [failed, setFailed] = useState(false);

  if (failed || !src) {
    return (
      <div className="w-full h-full bg-gradient-to-br from-zinc-100 via-zinc-200/70 to-zinc-100 flex flex-col items-center justify-center p-6 text-center select-none">
        <Shirt className="w-8 h-8 text-zinc-400 mb-2" />
        <span className="text-xs font-medium text-zinc-500 max-w-[180px] leading-snug">
          {fallbackTitle}
        </span>
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      className={className}
    />
  );
};

export const PublicPortalView: React.FC<PublicPortalViewProps> = ({
  catalog,
  profile,
  onRequestQuote,
  onOpenSystemLogin,
}) => {
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedItemForDetails, setSelectedItemForDetails] = useState<PublicCatalogItem | null>(
    null
  );
  const [selectedModelName, setSelectedModelName] = useState<string>('');

  // Quote Form State
  const [clientName, setClientName] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [category, setCategory] = useState<UniformCategory>('polos');
  const [estimatedQty, setEstimatedQty] = useState<number>(50);
  const [notes, setNotes] = useState('');
  const [formError, setFormError] = useState('');
  const [submittedSummary, setSubmittedSummary] = useState<{
    companyName: string;
    categoryLabel: string;
    estimatedQty: number;
  } | null>(null);

  const quoteSectionRef = useRef<HTMLElement | null>(null);
  const nameInputRef = useRef<HTMLInputElement | null>(null);

  const filterCategories = useMemo(() => {
    const uniqueCats = Array.from(new Set(catalog.map((c) => c.category)));
    return [
      { id: 'all', label: 'Todos os modelos' },
      ...uniqueCats.map((cat) => ({
        id: cat,
        label: CATEGORY_LABELS[cat] || cat,
      })),
    ];
  }, [catalog]);

  const filteredCatalog = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    return catalog.filter((item) => {
      const matchesCategory = selectedCategory === 'all' || item.category === selectedCategory;
      if (!matchesCategory) return false;
      if (!q) return true;
      const haystack = [
        item.title,
        item.description,
        CATEGORY_LABELS[item.category] || item.category,
        ...item.recommendedFabrics,
        ...item.customizationOptions,
        ...item.features,
      ]
        .join(' ')
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [catalog, selectedCategory, searchTerm]);

  const yearsInOperation = useMemo(() => {
    const currentYear = new Date().getFullYear();
    const founded = Number(profile.foundedYear) || 2015;
    return Math.max(1, currentYear - founded);
  }, [profile.foundedYear]);

  const fullAddress = useMemo(
    () =>
      formatFullAddress({
        address: profile.address,
        street: profile.street,
        number: profile.addressNumber,
        complement: profile.complement,
        neighborhood: profile.neighborhood,
        city: profile.city,
        state: profile.state,
        cep: profile.cep,
      }),
    [profile]
  );

  const waDigits = useMemo(
    () => normalizeWhatsAppDigitsBR(profile.whatsapp || profile.phone || ''),
    [profile.whatsapp, profile.phone]
  );

  const buildWhatsAppHref = (customMessage?: string) => {
    if (waDigits.length < 10) return '';
    const msg =
      customMessage ||
      `Olá! Gostaria de solicitar um orçamento corporativo de uniformes da ${profile.tradeName || 'DE FARDAS'}.`;
    return `https://wa.me/${waDigits}?text=${encodeURIComponent(msg)}`;
  };

  const scrollToQuoteForm = (item?: PublicCatalogItem) => {
    setSubmittedSummary(null);
    setFormError('');
    if (item) {
      setCategory(item.category);
      setSelectedModelName(item.title);
      setNotes(
        `Interesse no modelo "${item.title}". Tecidos de referência: ${item.recommendedFabrics[0] || 'conforme catálogo'}.`
      );
    }
    setSelectedItemForDetails(null);
    quoteSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    setTimeout(() => {
      nameInputRef.current?.focus();
    }, 350);
  };

  const handleSubmitQuote = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');

    const cleanName = clientName.trim();
    const cleanCompany = companyName.trim();
    const cleanEmail = email.trim();
    const phoneDigits = phone.replace(/\D/g, '');
    const qty = Number(estimatedQty) || 0;

    if (cleanName.length < 2) {
      setFormError('Informe seu nome completo para contato.');
      return;
    }
    if (cleanCompany.length < 2) {
      setFormError('Informe o nome da empresa ou instituição.');
      return;
    }
    if (phoneDigits.length < 10) {
      setFormError('Informe um telefone ou WhatsApp válido com DDD.');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      setFormError('Informe um endereço de e-mail corporativo válido.');
      return;
    }
    if (qty < 10) {
      setFormError('O lote mínimo para produção sob encomenda é de 10 peças.');
      return;
    }

    onRequestQuote({
      clientName: cleanName,
      companyName: cleanCompany,
      phone: phone.trim(),
      email: cleanEmail,
      category,
      estimatedQty: qty,
      notes: notes.trim(),
    });

    setSubmittedSummary({
      companyName: cleanCompany,
      categoryLabel: CATEGORY_LABELS[category] || category,
      estimatedQty: qty,
    });
    setClientName('');
    setCompanyName('');
    setPhone('');
    setEmail('');
    setNotes('');
    setSelectedModelName('');
  };

  const hasFactoryMap = isValidCoordinates(profile.latitude, profile.longitude);

  return (
    <div className="space-y-16 lg:space-y-20 pb-16">
      {/* =====================================================================
          SEÇÃO 1: PROPOSIÇÃO — HERO EDITORIAL SPLIT + FAIXA DE PROVA TÉCNICA
      ===================================================================== */}
      <section className="space-y-0">
        <div className="bg-[#111113] text-white rounded-2xl overflow-hidden border border-zinc-800/90">
          <div className="grid grid-cols-1 lg:grid-cols-12 items-stretch">
            {/* Coluna Esquerda: Identidade, Proposta de Valor e Ação Principal */}
            <div className="lg:col-span-7 p-7 sm:p-10 lg:p-14 flex flex-col justify-between gap-8">
              <div className="space-y-6">
                <div className="flex flex-wrap items-center gap-4">
                  <div className="inline-flex items-center justify-center bg-white rounded-xl p-1.5 shadow-md ring-1 ring-white/15 overflow-hidden">
                    <img
                      src={profile.logoUrl || DEFAULT_BRAND_LOGO_URL}
                      alt={`Logomarca ${profile.tradeName}`}
                      referrerPolicy="no-referrer"
                      className="h-14 w-auto object-contain"
                    />
                  </div>
                  <p className="text-xs text-zinc-400 tracking-wide">
                    <span>Confecção Corporativa</span>
                    <span className="mx-2 text-zinc-600" aria-hidden="true">
                      ·
                    </span>
                    <span>
                      {profile.city}, {profile.state}
                    </span>
                    <span className="mx-2 text-zinc-600" aria-hidden="true">
                      ·
                    </span>
                    <span className="tabular-nums">Desde {profile.foundedYear}</span>
                  </p>
                </div>

                <div className="space-y-4">
                  <h1 className="text-[clamp(2rem,3.6vw,3.35rem)] font-extrabold tracking-tight leading-[1.08] text-white text-balance max-w-2xl">
                    Uniformes profissionais sob medida com padrão industrial.
                  </h1>

                  <p className="text-[15px] sm:text-base text-zinc-300 leading-relaxed max-w-xl tracking-[0.01em]">
                    Fabricamos fardamentos completos para operações portuárias, hospitais,
                    escolas e equipes corporativas no Maranhão — tecidos homologados
                    Santanense e Cedro, bordado de alta definição e aprovação formal de arte
                    antes do corte.
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-3 pt-1">
                  <button
                    type="button"
                    onClick={() => scrollToQuoteForm()}
                    className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-[#C8102E] hover:bg-[#A60D26] text-white text-sm font-semibold rounded-lg transition-colors duration-150 cursor-pointer whitespace-nowrap shrink-0"
                  >
                    <span>Solicitar orçamento B2B</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>

                  {waDigits.length >= 10 && (
                    <a
                      href={buildWhatsAppHref()}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center justify-center gap-2 px-5 py-3 text-sm font-medium text-zinc-200 hover:text-white bg-zinc-900/90 hover:bg-zinc-800 border border-zinc-700/80 rounded-lg transition-colors duration-150 whitespace-nowrap shrink-0"
                    >
                      <MessageSquare className="w-4 h-4 text-zinc-300" />
                      <span>Atendimento via WhatsApp</span>
                    </a>
                  )}
                </div>
              </div>

              {/* Linha discreta de endereço e contato da fábrica */}
              <div className="pt-6 border-t border-zinc-800/90 flex flex-wrap items-center gap-x-6 gap-y-2 text-xs text-zinc-400">
                <span className="inline-flex items-center gap-1.5">
                  <MapPin className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
                  <span>{fullAddress}</span>
                </span>
                {(profile.whatsapp || profile.phone) && (
                  <span className="inline-flex items-center gap-1.5 font-mono tabular-nums text-zinc-300">
                    <Phone className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
                    <span>{profile.whatsapp || profile.phone}</span>
                  </span>
                )}
              </div>
            </div>

            {/* Coluna Direita: Fotografia Editorial do Ateliê em Altura Total */}
            <div className="lg:col-span-5 relative min-h-[280px] sm:min-h-[340px] lg:min-h-full bg-zinc-900">
              <ResilientEditorialImage
                src={heroAtelierImg}
                alt="Showroom e ateliê industrial da DE FARDAS com polos corporativas, jalecos hospitalares e uniformes operacionais"
                fallbackTitle="Ateliê DE FARDAS — Uniformes Profissionais"
                className="w-full h-full lg:h-full object-cover object-center"
              />
              <div
                aria-hidden="true"
                className="absolute inset-0 bg-gradient-to-t from-[#111113]/80 via-[#111113]/20 to-transparent lg:bg-gradient-to-r lg:from-[#111113]/55 lg:via-transparent lg:to-transparent pointer-events-none"
              />
              <div className="absolute bottom-5 left-5 right-5 flex items-end justify-between text-white">
                <div className="text-xs leading-snug">
                  <p className="font-semibold text-white">Showroom e Confecção Própria</p>
                  <p className="text-zinc-300 mt-0.5">
                    Grade corporativa PP ao EXG · Reposição padronizada
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Faixa de Indicadores Quantitativos (Linha Full-Width abaixo do Hero Split) */}
          <div className="grid grid-cols-2 lg:grid-cols-4 border-t border-zinc-800/90 divide-y lg:divide-y-0 divide-x divide-zinc-800/90 bg-[#16161A]">
            <div className="px-6 py-5 sm:px-8">
              <p className="text-2xl sm:text-[26px] font-bold font-mono tabular-nums text-white tracking-tight">
                +{yearsInOperation} anos
              </p>
              <p className="text-xs text-zinc-400 mt-1">
                Atuação contínua em fardamentos B2B
              </p>
            </div>
            <div className="px-6 py-5 sm:px-8">
              <p className="text-2xl sm:text-[26px] font-bold font-mono tabular-nums text-white tracking-tight">
                {(profile.productionCapacityPiecesMonth || 12000).toLocaleString('pt-BR')}
              </p>
              <p className="text-xs text-zinc-400 mt-1">
                Peças por mês de capacidade produtiva
              </p>
            </div>
            <div className="px-6 py-5 sm:px-8">
              <p className="text-2xl sm:text-[26px] font-bold font-mono tabular-nums text-white tracking-tight">
                {catalog.length} linhas
              </p>
              <p className="text-xs text-zinc-400 mt-1">
                Modelos corporativos, clínicos e industriais
              </p>
            </div>
            <div className="px-6 py-5 sm:px-8">
              <p className="text-2xl sm:text-[26px] font-bold font-mono tabular-nums text-white tracking-tight">
                100%
              </p>
              <p className="text-xs text-zinc-400 mt-1">
                Layout aprovado antes de iniciar o corte
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* =====================================================================
          SEÇÃO 2: CATÁLOGO DE PRODUTOS SOB ENCOMENDA (INTERATIVO)
      ===================================================================== */}
      <section id="vitrine-catalogo" className="scroll-mt-24 space-y-8">
        <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-6 border-b border-zinc-200 pb-6">
          <div className="space-y-2 max-w-2xl">
            <p className="text-xs font-medium text-zinc-500">
              Portfólio sob encomenda · Lote mínimo de 10 peças por modelo
            </p>
            <h2 className="text-2xl sm:text-3xl font-extrabold text-zinc-950 tracking-tight text-balance">
              Catálogo técnico por segmento de operação
            </h2>
            <p className="text-sm text-zinc-600 leading-relaxed">
              Filtre por linha de fardamento ou busque por tecido e tipo de personalização para
              inspecionar a ficha técnica e solicitar orçamento direto.
            </p>
          </div>

          {/* Campo de busca funcional */}
          <div className="w-full lg:w-72 shrink-0">
            <label htmlFor="vitrine-search" className="sr-only">
              Buscar modelo ou tecido no catálogo
            </label>
            <div className="relative">
              <Search className="w-4 h-4 text-zinc-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                id="vitrine-search"
                type="search"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Buscar por modelo, tecido ou norma..."
                className="w-full pl-10 pr-4 py-2.5 bg-white border border-zinc-300 rounded-lg text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-[#C8102E] focus:outline-none transition-colors"
              />
            </div>
          </div>
        </div>

        {/* Barra de Filtros Segmentada (Controles Interativos) */}
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div
            role="tablist"
            aria-label="Filtrar catálogo por categoria"
            className="flex flex-wrap items-center gap-1.5 p-1 bg-zinc-200/70 rounded-xl"
          >
            {filterCategories.map((cat) => {
              const isActive = selectedCategory === cat.id;
              return (
                <button
                  key={cat.id}
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  onClick={() => setSelectedCategory(cat.id)}
                  className={`px-3.5 py-2 text-xs font-semibold rounded-lg transition-colors duration-150 cursor-pointer whitespace-nowrap shrink-0 ${
                    isActive
                      ? 'bg-[#111113] text-white'
                      : 'text-zinc-700 hover:text-zinc-950 hover:bg-white/70'
                  }`}
                >
                  {cat.label}
                </button>
              );
            })}
          </div>

          <p className="text-xs text-zinc-500 tabular-nums">
            Exibindo <strong className="text-zinc-900">{filteredCatalog.length}</strong> de{' '}
            {catalog.length} modelos
          </p>
        </div>

        {/* Grade Editorial de Produtos */}
        {filteredCatalog.length === 0 ? (
          <div className="bg-white border border-zinc-200 rounded-2xl p-12 text-center space-y-3">
            <SlidersHorizontal className="w-6 h-6 text-zinc-400 mx-auto" />
            <h3 className="text-base font-bold text-zinc-900">
              Nenhum modelo encontrado para esse filtro
            </h3>
            <p className="text-sm text-zinc-600 max-w-md mx-auto">
              Limpe a busca ou consulte nossa equipe para desenvolver uma modelagem exclusiva sob
              encomenda.
            </p>
            <div className="pt-2 flex items-center justify-center gap-3">
              <button
                type="button"
                onClick={() => {
                  setSelectedCategory('all');
                  setSearchTerm('');
                }}
                className="px-4 py-2 text-xs font-semibold text-zinc-800 bg-zinc-100 hover:bg-zinc-200 rounded-lg transition-colors cursor-pointer whitespace-nowrap"
              >
                Limpar filtros
              </button>
              <button
                type="button"
                onClick={() => scrollToQuoteForm()}
                className="px-4 py-2 text-xs font-semibold text-white bg-[#C8102E] hover:bg-[#A60D26] rounded-lg transition-colors cursor-pointer whitespace-nowrap"
              >
                Solicitar modelo sob medida
              </button>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-7">
            {filteredCatalog.map((item) => {
              const photoSrc = item.imageUrl || CATEGORY_IMAGES[item.category] || poloCorpImg;
              const categoryName = CATEGORY_LABELS[item.category] || item.category;

              return (
                <article
                  key={item.id}
                  className="group bg-white rounded-2xl border border-zinc-200 hover:border-zinc-400 transition-colors duration-200 overflow-hidden flex flex-col justify-between"
                >
                  <div>
                    {/* Mídia 4:3 limpa (sem badge sandwich no topo) */}
                    <button
                      type="button"
                      onClick={() => setSelectedItemForDetails(item)}
                      className="block w-full aspect-[4/3] overflow-hidden bg-zinc-100 cursor-pointer text-left"
                      aria-label={`Ver ficha técnica de ${item.title}`}
                    >
                      <ResilientEditorialImage
                        src={photoSrc}
                        alt={`${item.title} — ${categoryName}`}
                        fallbackTitle={item.title}
                        className="w-full h-full object-cover transition-transform duration-300 ease-out group-hover:scale-[1.03]"
                      />
                    </button>

                    <div className="p-6 space-y-4">
                      {/* Metadados limpos sem pílulas */}
                      <div className="flex items-center gap-2 text-xs text-zinc-500">
                        <span className="font-medium text-zinc-700">{categoryName}</span>
                        {item.isPopular && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span className="font-semibold text-[#C8102E]">Mais solicitado</span>
                          </>
                        )}
                      </div>

                      <div className="space-y-2">
                        <h3 className="text-lg font-bold text-zinc-950 leading-snug">
                          {item.title}
                        </h3>
                        <p className="text-sm text-zinc-600 leading-relaxed line-clamp-3">
                          {item.description}
                        </p>
                      </div>

                      <div className="pt-4 border-t border-zinc-100 space-y-2.5 text-xs">
                        <div>
                          <span className="font-semibold text-zinc-800">Tecidos: </span>
                          <span className="text-zinc-600">
                            {item.recommendedFabrics.join(' · ')}
                          </span>
                        </div>
                        <div>
                          <span className="font-semibold text-zinc-800">Personalização: </span>
                          <span className="text-zinc-600">
                            {item.customizationOptions.join(' · ')}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Rodapé do Card com 2 ações reais */}
                  <div className="px-6 py-4 border-t border-zinc-100 flex items-center justify-between gap-3">
                    <button
                      type="button"
                      onClick={() => setSelectedItemForDetails(item)}
                      className="inline-flex items-center gap-1.5 text-xs font-semibold text-zinc-700 hover:text-zinc-950 transition-colors cursor-pointer whitespace-nowrap shrink-0"
                    >
                      <FileText className="w-3.5 h-3.5" />
                      <span>Ficha técnica</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => scrollToQuoteForm(item)}
                      className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-[#111113] hover:bg-[#C8102E] rounded-lg transition-colors duration-150 cursor-pointer whitespace-nowrap shrink-0"
                    >
                      <span>Cotar modelo</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      {/* =====================================================================
          SEÇÃO 3: DIFERENCIAIS TÉCNICOS — BENTO ASSIMÉTRICO (7 + 5 COLUNAS)
      ===================================================================== */}
      <section id="vitrine-diferenciais" className="scroll-mt-24 space-y-8">
        <div className="max-w-2xl space-y-2">
          <p className="text-xs font-medium text-zinc-500">
            Padrão construtivo e conformidade têxtil
          </p>
          <h2 className="text-2xl sm:text-3xl font-extrabold text-zinc-950 tracking-tight text-balance">
            Por que empresas padronizam suas equipes com a DE FARDAS
          </h2>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
          {/* Bloco Principal Assimétrico (7 colunas) */}
          <div className="lg:col-span-7 bg-[#111113] text-white rounded-2xl border border-zinc-800 overflow-hidden flex flex-col justify-between">
            <div className="p-7 sm:p-9 space-y-5">
              <h3 className="text-xl sm:text-2xl font-bold text-white leading-snug text-balance">
                01. Engenharia de tecidos homologados e acabamento de alta resistência
              </h3>
              <p className="text-sm text-zinc-300 leading-relaxed max-w-xl">
                Trabalhamos exclusivamente com bases têxteis de fornecedores industriais
                certificados — Santanense, Cedro Workwear e faixas refletivas 3M em conformidade
                com a norma ABNT NBR 15292 — garantindo estabilidade dimensional, retenção de cor
                após lavagens industriais e proteção térmica em campo.
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-5 pt-4 border-t border-zinc-800 text-xs">
                <div>
                  <p className="font-semibold text-white">Brim 260 g/m²</p>
                  <p className="text-zinc-400 mt-1">
                    Costura tripla e travetes duplos em pontos de tração.
                  </p>
                </div>
                <div>
                  <p className="font-semibold text-white">Bordado HD</p>
                  <p className="text-zinc-400 mt-1">
                    Matriz eletrônica de alta densidade para brasões e marcas.
                  </p>
                </div>
                <div>
                  <p className="font-semibold text-white">Proteção UV50+</p>
                  <p className="text-zinc-400 mt-1">
                    Malhas Dry-Fit respiráveis para equipes externas e escolas.
                  </p>
                </div>
              </div>
            </div>

            <div className="h-56 sm:h-64 relative bg-zinc-900 border-t border-zinc-800">
              <ResilientEditorialImage
                src={brimOperacionalImg}
                alt="Detalhe de calça operacional em brim pesado com costura reforçada e faixa refletiva 3M"
                fallbackTitle="Tecidos Homologados e Acabamento Industrial"
                className="w-full h-full object-cover object-center"
              />
              <div
                aria-hidden="true"
                className="absolute inset-0 bg-gradient-to-t from-[#111113]/65 via-transparent to-transparent pointer-events-none"
              />
            </div>
          </div>

          {/* Pilha Lateral (5 colunas) */}
          <div className="lg:col-span-5 flex flex-col gap-6">
            <div className="flex-1 bg-white rounded-2xl border border-zinc-200 p-7 sm:p-8 flex flex-col justify-between gap-5">
              <div className="space-y-3">
                <h3 className="text-lg font-bold text-zinc-950 leading-snug">
                  02. Modelagem ergonômica e grade corporativa completa
                </h3>
                <p className="text-sm text-zinc-600 leading-relaxed">
                  Produzimos cortes masculino, feminino e unissex do PP ao EXG com tabela de
                  medidas padronizada. Para novos colaboradores, mantemos o histórico de modelagem
                  arquivado para reposições exatas sem variação de caimento ou tonalidade.
                </p>
              </div>
              <p className="text-xs text-zinc-500 pt-4 border-t border-zinc-100">
                Corte masculino e baby-look · Medidas especiais sob consulta
              </p>
            </div>

            <div className="flex-1 bg-white rounded-2xl border border-zinc-200 p-7 sm:p-8 flex flex-col justify-between gap-5">
              <div className="space-y-3">
                <h3 className="text-lg font-bold text-zinc-950 leading-snug">
                  03. Rastreabilidade do pedido e gestão transparente 50/50
                </h3>
                <p className="text-sm text-zinc-600 leading-relaxed">
                  Cada orçamento aprovado gera uma Ordem de Produção com cronograma definido por
                  etapa (corte, bordado/silk, costura, conferência e expedição), garantindo
                  previsibilidade de prazo para o setor de compras e SMS.
                </p>
              </div>
              <p className="text-xs text-zinc-500 pt-4 border-t border-zinc-100">
                Orçamento técnico detalhado · Aprovação de arte documentada
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* =====================================================================
          SEÇÃO 4: PROCESSO DE PRODUÇÃO B2B (4 ETAPAS COM DIVISORES HAIRLINE)
      ===================================================================== */}
      <section
        id="vitrine-processo"
        className="scroll-mt-24 bg-white rounded-2xl border border-zinc-200 p-7 sm:p-10 lg:p-12 space-y-10"
      >
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-zinc-200 pb-6">
          <div className="space-y-2 max-w-2xl">
            <p className="text-xs font-medium text-zinc-500">Fluxo operacional do pedido</p>
            <h2 className="text-2xl sm:text-3xl font-extrabold text-zinc-950 tracking-tight text-balance">
              Da cotação técnica à entrega revisada na sua empresa
            </h2>
          </div>
          <button
            type="button"
            onClick={() => scrollToQuoteForm()}
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-[#C8102E] hover:text-[#A60D26] transition-colors cursor-pointer whitespace-nowrap shrink-0"
          >
            <span>Iniciar cotação agora</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8 lg:gap-6">
          {PRODUCTION_STEPS.map((step) => (
            <div key={step.index} className="space-y-3">
              <p className="text-sm font-mono font-bold tabular-nums text-[#C8102E]">
                {step.index}
              </p>
              <h3 className="text-base font-bold text-zinc-950 leading-snug">{step.title}</h3>
              <p className="text-sm text-zinc-600 leading-relaxed">{step.description}</p>
            </div>
          ))}
        </div>
      </section>

      {/* =====================================================================
          SEÇÃO 5: CONVERSÃO — FORMULÁRIO B2B VALIDADO + CONTATO E MAPA DA SEDE
      ===================================================================== */}
      <section id="vitrine-orcamento" ref={quoteSectionRef} className="scroll-mt-24">
        <div className="grid grid-cols-1 lg:grid-cols-12 rounded-2xl overflow-hidden border border-zinc-200 bg-white">
          {/* Coluna Esquerda: Atendimento Direto e Localização */}
          <div className="lg:col-span-5 bg-[#111113] text-white p-7 sm:p-10 flex flex-col justify-between gap-8">
            <div className="space-y-6">
              <div className="space-y-2">
                <p className="text-xs font-medium text-zinc-400">
                  Atendimento comercial corporativo
                </p>
                <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white text-balance">
                  Solicite uma proposta técnica sob medida
                </h2>
                <p className="text-sm text-zinc-300 leading-relaxed">
                  Envie as quantidades e o tipo de uniforme desejado. Nossa equipe retorna com
                  especificação de tecido, prazo de produção e proposta comercial formal.
                </p>
              </div>

              <div className="space-y-4 pt-2 border-t border-zinc-800 text-sm">
                <div className="flex items-start gap-3">
                  <MapPin className="w-4 h-4 text-[#E3263E] mt-1 shrink-0" />
                  <div>
                    <p className="text-xs text-zinc-400">Endereço comercial</p>
                    <p className="text-zinc-100 leading-snug mt-0.5">{fullAddress}</p>
                  </div>
                </div>

                {(profile.whatsapp || profile.phone) && (
                  <div className="flex items-start gap-3">
                    <Phone className="w-4 h-4 text-[#E3263E] mt-1 shrink-0" />
                    <div>
                      <p className="text-xs text-zinc-400">Telefone e WhatsApp</p>
                      <p className="text-zinc-100 font-mono tabular-nums mt-0.5">
                        {profile.whatsapp || profile.phone}
                      </p>
                    </div>
                  </div>
                )}

                {profile.email && (
                  <div className="flex items-start gap-3">
                    <Mail className="w-4 h-4 text-[#E3263E] mt-1 shrink-0" />
                    <div>
                      <p className="text-xs text-zinc-400">E-mail comercial</p>
                      <p className="text-zinc-100 mt-0.5 break-all">{profile.email}</p>
                    </div>
                  </div>
                )}

                {profile.openingHours && (
                  <div className="flex items-start gap-3">
                    <Clock className="w-4 h-4 text-[#E3263E] mt-1 shrink-0" />
                    <div>
                      <p className="text-xs text-zinc-400">Horário de atendimento</p>
                      <p className="text-zinc-200 text-xs mt-0.5 leading-relaxed">
                        {profile.openingHours}
                      </p>
                    </div>
                  </div>
                )}
              </div>

              {waDigits.length >= 10 && (
                <a
                  href={buildWhatsAppHref()}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full inline-flex items-center justify-center gap-2 px-5 py-3 bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-white text-sm font-semibold rounded-lg transition-colors duration-150 whitespace-nowrap"
                >
                  <MessageSquare className="w-4 h-4 text-emerald-400" />
                  <span>Conversar direto no WhatsApp</span>
                </a>
              )}
            </div>

            {/* Mapa interativo da Matriz / Showroom (OpenStreetMap / Leaflet) */}
            {hasFactoryMap && (
              <div className="space-y-2.5 pt-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-zinc-400">Localização em {profile.city}</span>
                  <a
                    href={buildOsmDirectionsUrl(profile.latitude!, profile.longitude!)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-zinc-200 hover:text-white underline underline-offset-4 whitespace-nowrap"
                  >
                    <span>Abrir no OpenStreetMap</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
                <AddressLocationMap
                  latitude={profile.latitude}
                  longitude={profile.longitude}
                  label={profile.tradeName || 'DE FARDAS'}
                  editable={false}
                  heightClass="h-44"
                  className="border-zinc-800"
                />
              </div>
            )}
          </div>

          {/* Coluna Direita: Formulário de Orçamento B2B */}
          <div className="lg:col-span-7 p-7 sm:p-10 lg:p-12 flex flex-col justify-center">
            {submittedSummary ? (
              <div className="py-10 text-center space-y-5 max-w-md mx-auto">
                <div className="w-14 h-14 rounded-full bg-emerald-50 border border-emerald-200 flex items-center justify-center mx-auto">
                  <CheckCircle2 className="w-7 h-7 text-emerald-600" />
                </div>
                <div className="space-y-2">
                  <h3 className="text-xl font-bold text-zinc-950">
                    Solicitação registrada com sucesso
                  </h3>
                  <p className="text-sm text-zinc-600 leading-relaxed">
                    Recebemos a cotação para{' '}
                    <strong className="text-zinc-900">{submittedSummary.companyName}</strong> (
                    {submittedSummary.categoryLabel} ·{' '}
                    <span className="font-mono tabular-nums">
                      {submittedSummary.estimatedQty} peças
                    </span>
                    ). Nossa equipe comercial já recebeu o lead no CRM e responderá via WhatsApp e
                    e-mail.
                  </p>
                </div>
                <div className="pt-2 flex flex-wrap items-center justify-center gap-3">
                  <button
                    type="button"
                    onClick={() => setSubmittedSummary(null)}
                    className="px-5 py-2.5 bg-[#111113] hover:bg-zinc-800 text-white text-xs font-semibold rounded-lg transition-colors cursor-pointer whitespace-nowrap"
                  >
                    Enviar nova solicitação
                  </button>
                  {waDigits.length >= 10 && (
                    <a
                      href={buildWhatsAppHref(
                        `Olá! Acabei de enviar uma solicitação de orçamento pelo site para ${submittedSummary.companyName} (${submittedSummary.estimatedQty} peças de ${submittedSummary.categoryLabel}).`
                      )}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-5 py-2.5 bg-white hover:bg-zinc-50 border border-zinc-300 text-zinc-800 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap"
                    >
                      Agilizar pelo WhatsApp
                    </a>
                  )}
                </div>
              </div>
            ) : (
              <form onSubmit={handleSubmitQuote} className="space-y-5" noValidate>
                <div className="space-y-1">
                  <h3 className="text-xl font-bold text-zinc-950">
                    Dados para cotação corporativa
                  </h3>
                  <p className="text-xs text-zinc-500">
                    Preencha os campos obrigatórios para receber a proposta comercial completa.
                  </p>
                </div>

                {selectedModelName && (
                  <div className="flex items-center justify-between gap-3 px-4 py-2.5 bg-zinc-50 border border-zinc-200 rounded-lg text-xs">
                    <span className="text-zinc-700">
                      Modelo selecionado:{' '}
                      <strong className="text-zinc-950">{selectedModelName}</strong>
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedModelName('');
                        setNotes('');
                      }}
                      className="text-zinc-500 hover:text-zinc-900 font-medium cursor-pointer whitespace-nowrap"
                    >
                      Remover
                    </button>
                  </div>
                )}

                {formError && (
                  <div
                    role="alert"
                    className="px-4 py-3 rounded-lg bg-rose-50 border border-rose-200 text-xs font-medium text-rose-800"
                  >
                    {formError}
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label
                      htmlFor="quote-client-name"
                      className="block text-xs font-semibold text-zinc-800 mb-1.5"
                    >
                      Seu nome completo *
                    </label>
                    <input
                      ref={nameInputRef}
                      id="quote-client-name"
                      type="text"
                      required
                      value={clientName}
                      onChange={(e) => setClientName(e.target.value)}
                      placeholder="Ex: Carlos Mendes"
                      className="w-full px-3.5 py-2.5 border border-zinc-300 rounded-lg text-sm text-zinc-900 bg-white focus:border-[#C8102E] focus:outline-none"
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="quote-company-name"
                      className="block text-xs font-semibold text-zinc-800 mb-1.5"
                    >
                      Empresa ou instituição *
                    </label>
                    <input
                      id="quote-company-name"
                      type="text"
                      required
                      value={companyName}
                      onChange={(e) => setCompanyName(e.target.value)}
                      placeholder="Ex: Vale Logística Portuária"
                      className="w-full px-3.5 py-2.5 border border-zinc-300 rounded-lg text-sm text-zinc-900 bg-white focus:border-[#C8102E] focus:outline-none"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-zinc-800 mb-1.5">
                      WhatsApp ou telefone *
                    </label>
                    <PhoneInputBR
                      required
                      value={phone}
                      onChange={setPhone}
                      placeholder="(98) 98800-0000"
                      className="!py-2.5 !text-sm !border-zinc-300"
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="quote-email"
                      className="block text-xs font-semibold text-zinc-800 mb-1.5"
                    >
                      E-mail corporativo *
                    </label>
                    <input
                      id="quote-email"
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="compras@empresa.com.br"
                      className="w-full px-3.5 py-2.5 border border-zinc-300 rounded-lg text-sm text-zinc-900 bg-white focus:border-[#C8102E] focus:outline-none"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label
                      htmlFor="quote-category"
                      className="block text-xs font-semibold text-zinc-800 mb-1.5"
                    >
                      Linha de fardamento
                    </label>
                    <select
                      id="quote-category"
                      value={category}
                      onChange={(e) => setCategory(e.target.value as UniformCategory)}
                      className="w-full px-3.5 py-2.5 border border-zinc-300 rounded-lg bg-white text-sm text-zinc-900 focus:border-[#C8102E] focus:outline-none"
                    >
                      <option value="polos">Polos Corporativas</option>
                      <option value="linha_hospitalar">Linha Hospitalar e Jalecos</option>
                      <option value="calcas">Calças Operacionais em Brim</option>
                      <option value="camisetas">Camisetas Dry-Fit e Algodão</option>
                      <option value="aventais_batas">Aventais e Batas</option>
                      <option value="macacoes">Macacões Industriais</option>
                      <option value="operacional">Operacional Pesado</option>
                    </select>
                  </div>

                  <div>
                    <label
                      htmlFor="quote-qty"
                      className="block text-xs font-semibold text-zinc-800 mb-1.5"
                    >
                      Quantidade estimada (peças) *
                    </label>
                    <input
                      id="quote-qty"
                      type="number"
                      min={10}
                      required
                      value={estimatedQty}
                      onChange={(e) =>
                        setEstimatedQty(Math.max(1, parseInt(e.target.value, 10) || 0))
                      }
                      className="w-full px-3.5 py-2.5 border border-zinc-300 rounded-lg font-mono tabular-nums text-sm text-zinc-900 bg-white focus:border-[#C8102E] focus:outline-none"
                    />
                  </div>
                </div>

                {/* Atalhos rápidos de volume de lote */}
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs text-zinc-500">Volume rápido:</span>
                  {QUANTITY_PRESETS.map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setEstimatedQty(preset)}
                      className={`px-3 py-1.5 text-xs font-mono tabular-nums font-medium rounded-md border transition-colors cursor-pointer whitespace-nowrap ${
                        estimatedQty === preset
                          ? 'bg-[#111113] text-white border-[#111113]'
                          : 'bg-white text-zinc-700 border-zinc-200 hover:border-zinc-400'
                      }`}
                    >
                      {preset} peças
                    </button>
                  ))}
                </div>

                <div>
                  <label
                    htmlFor="quote-notes"
                    className="block text-xs font-semibold text-zinc-800 mb-1.5"
                  >
                    Detalhes técnicos e personalizações
                  </label>
                  <textarea
                    id="quote-notes"
                    rows={3}
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Informe cores institucionais, aplicação de bordado ou silk-screen, faixas refletivas e prazo desejado..."
                    className="w-full px-3.5 py-2.5 border border-zinc-300 rounded-lg text-sm text-zinc-900 bg-white focus:border-[#C8102E] focus:outline-none"
                  />
                </div>

                <div className="pt-2 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <p className="text-xs text-zinc-500">
                    Envio direto para a equipe comercial da {profile.tradeName || 'DE FARDAS'}.
                  </p>
                  <button
                    type="submit"
                    className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-[#C8102E] hover:bg-[#A60D26] text-white text-sm font-semibold rounded-lg transition-colors duration-150 cursor-pointer whitespace-nowrap shrink-0"
                  >
                    <span>Enviar solicitação de orçamento</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      </section>

      {/* =====================================================================
          SEÇÃO 6: RODAPÉ INSTITUCIONAL DISCRETO
      ===================================================================== */}
      <footer className="border-t border-zinc-200 pt-10 pb-4 flex flex-col md:flex-row md:items-center justify-between gap-6 text-xs text-zinc-500">
        <div className="space-y-1.5">
          <p className="text-sm font-bold text-zinc-950">
            {profile.tradeName || 'DE FARDAS — Uniformes Profissionais'}
          </p>
          <p>
            {profile.name}
            {profile.cnpj ? ` · CNPJ ${profile.cnpj}` : ''}
          </p>
          <p>{fullAddress}</p>
        </div>

        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 font-medium text-zinc-600">
          <a
            href="#vitrine-catalogo"
            className="hover:text-zinc-950 hover:underline underline-offset-4 whitespace-nowrap"
          >
            Catálogo
          </a>
          <a
            href="#vitrine-diferenciais"
            className="hover:text-zinc-950 hover:underline underline-offset-4 whitespace-nowrap"
          >
            Diferenciais
          </a>
          <a
            href="#vitrine-processo"
            className="hover:text-zinc-950 hover:underline underline-offset-4 whitespace-nowrap"
          >
            Processo
          </a>
          <a
            href="#vitrine-orcamento"
            className="hover:text-zinc-950 hover:underline underline-offset-4 whitespace-nowrap"
          >
            Orçamento
          </a>
          {onOpenSystemLogin && (
            <button
              type="button"
              onClick={onOpenSystemLogin}
              className="font-semibold text-[#C8102E] hover:text-[#A60D26] hover:underline underline-offset-4 whitespace-nowrap cursor-pointer"
            >
              Acesso ao Sistema
            </button>
          )}
        </div>
      </footer>

      {/* =====================================================================
          MODAL DE FICHA TÉCNICA COMPLETA DO MODELO
      ===================================================================== */}
      {selectedItemForDetails && (
        <div
          className="fixed inset-0 z-50 overflow-y-auto bg-black/65 backdrop-blur-xs flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="modal-product-title"
          onClick={() => setSelectedItemForDetails(null)}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl max-w-3xl w-full overflow-hidden border border-zinc-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="grid grid-cols-1 md:grid-cols-12 items-stretch">
              <div className="md:col-span-5 bg-zinc-100 min-h-[240px]">
                <ResilientEditorialImage
                  src={
                    selectedItemForDetails.imageUrl ||
                    CATEGORY_IMAGES[selectedItemForDetails.category] ||
                    poloCorpImg
                  }
                  alt={selectedItemForDetails.title}
                  fallbackTitle={selectedItemForDetails.title}
                  className="w-full h-full object-cover"
                />
              </div>

              <div className="md:col-span-7 p-6 sm:p-8 flex flex-col justify-between gap-6">
                <div className="space-y-5">
                  <div className="flex items-start justify-between gap-4">
                    <div className="space-y-1">
                      <p className="text-xs text-zinc-500">
                        <span>
                          {CATEGORY_LABELS[selectedItemForDetails.category] ||
                            selectedItemForDetails.category}
                        </span>
                        {selectedItemForDetails.isPopular && (
                          <>
                            <span className="mx-1.5" aria-hidden="true">
                              ·
                            </span>
                            <span className="font-semibold text-[#C8102E]">Mais solicitado</span>
                          </>
                        )}
                      </p>
                      <h3
                        id="modal-product-title"
                        className="text-xl font-extrabold text-zinc-950 leading-snug"
                      >
                        {selectedItemForDetails.title}
                      </h3>
                    </div>

                    <button
                      type="button"
                      onClick={() => setSelectedItemForDetails(null)}
                      aria-label="Fechar ficha técnica"
                      className="p-2 text-zinc-500 hover:text-zinc-950 hover:bg-zinc-100 rounded-lg transition-colors cursor-pointer shrink-0"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  </div>

                  <p className="text-sm text-zinc-600 leading-relaxed">
                    {selectedItemForDetails.description}
                  </p>

                  <div className="space-y-4 pt-3 border-t border-zinc-100 text-xs">
                    <div>
                      <p className="font-semibold text-zinc-900 mb-1.5">
                        Diferenciais construtivos
                      </p>
                      <ul className="space-y-1.5 text-zinc-600">
                        {selectedItemForDetails.features.map((feat) => (
                          <li key={feat} className="flex items-center gap-2">
                            <Check className="w-3.5 h-3.5 text-[#C8102E] shrink-0" />
                            <span>{feat}</span>
                          </li>
                        ))}
                      </ul>
                    </div>

                    <div>
                      <p className="font-semibold text-zinc-900 mb-1">Tecidos homologados</p>
                      <p className="text-zinc-600 leading-relaxed">
                        {selectedItemForDetails.recommendedFabrics.join(' · ')}
                      </p>
                    </div>

                    <div>
                      <p className="font-semibold text-zinc-900 mb-1">
                        Personalizações disponíveis
                      </p>
                      <p className="text-zinc-600 leading-relaxed">
                        {selectedItemForDetails.customizationOptions.join(' · ')}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="pt-4 border-t border-zinc-100 flex flex-wrap items-center justify-end gap-3">
                  <button
                    type="button"
                    onClick={() => setSelectedItemForDetails(null)}
                    className="px-4 py-2.5 text-xs font-semibold text-zinc-700 hover:bg-zinc-100 rounded-lg transition-colors cursor-pointer whitespace-nowrap"
                  >
                    Voltar ao catálogo
                  </button>
                  <button
                    type="button"
                    onClick={() => scrollToQuoteForm(selectedItemForDetails)}
                    className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#C8102E] hover:bg-[#A60D26] text-white text-xs font-semibold rounded-lg transition-colors cursor-pointer whitespace-nowrap"
                  >
                    <span>Solicitar orçamento deste modelo</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
