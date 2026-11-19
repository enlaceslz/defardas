import React, { useMemo, useState } from 'react';
import {
  Users,
  Search,
  Plus,
  Building2,
  Phone,
  Mail,
  MapPin,
  Edit3,
  Trash2,
  X,
  FileText,
  Eye,
  MessageSquare,
  Factory,
  Wallet,
  AlertTriangle,
  Sparkles,
  Loader2,
  CheckCircle2,
  Clock,
  Inbox,
} from 'lucide-react';
import { Client, ClientProfileResponse, LeadItem } from '../types/erp';
import { formatCurrencyBRL, formatDateBR, getStageLabel } from '../utils/formatters';
import { CepLookupInput, CnpjLookupInput, PhoneInputBR } from './FormInputs';
import { isValidCNPJ, maskCNPJ, maskPhoneBR, onlyDigits } from '../utils/masks';
import { useAuth } from '../api/authContext';
import { api } from '../api/client';

interface ClientsViewProps {
  clients: Client[];
  leads: LeadItem[];
  onSaveClient: (client: Client) => Promise<boolean>;
  onDeleteClient: (clientId: string) => void;
  onSelectClientForQuote: (client: Client) => void;
  onOpenWhatsApp: (client: { id?: string; name: string; phone: string }) => Promise<void>;
  onUpdateLeadStatus: (leadId: string, status: LeadItem['status']) => Promise<boolean>;
  onNavigateTab: (tab: string) => void;
}

const LEAD_STATUS_META: Record<
  LeadItem['status'],
  { label: string; badgeClass: string }
> = {
  novo: { label: 'Novo Lead', badgeClass: 'bg-blue-50 text-blue-700 border-blue-200' },
  em_atendimento: { label: 'Em Atendimento', badgeClass: 'bg-amber-50 text-amber-800 border-amber-200' },
  orcamento_enviado: { label: 'Proposta Enviada', badgeClass: 'bg-indigo-50 text-indigo-700 border-indigo-200' },
  convertido: { label: 'Convertido', badgeClass: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  perdido: { label: 'Perdido', badgeClass: 'bg-slate-100 text-slate-600 border-slate-200' },
};

export const ClientsView: React.FC<ClientsViewProps> = ({
  clients,
  leads,
  onSaveClient,
  onDeleteClient,
  onSelectClientForQuote,
  onOpenWhatsApp,
  onUpdateLeadStatus,
  onNavigateTab,
}) => {
  const { user } = useAuth();
  const role = user?.role || '';

  // RBAC alinhado com server/auth/rbac.ts
  const canManageClients = ['admin', 'gerente_comercial', 'vendedor'].includes(role);
  const canDeleteClients = ['admin', 'gerente_comercial'].includes(role);
  const canCreateQuote = ['admin', 'gerente_comercial', 'vendedor'].includes(role);
  const canWhatsApp = ['admin', 'gerente_comercial', 'vendedor', 'financeiro'].includes(role);
  const canViewLeads = ['admin', 'gerente_comercial', 'vendedor'].includes(role);

  const [activeSection, setActiveSection] = useState<'clients' | 'leads'>('clients');
  const [searchQuery, setSearchQuery] = useState('');
  const [segmentFilter, setSegmentFilter] = useState<string>('all');
  const [onlyPreliminaryCnpj, setOnlyPreliminaryCnpj] = useState(false);

  // Create / Edit Modal
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const [formSaving, setFormSaving] = useState(false);
  const [formError, setFormError] = useState('');

  // Form states
  const [companyName, setCompanyName] = useState('');
  const [tradeName, setTradeName] = useState('');
  const [cnpj, setCnpj] = useState('');
  const [stateRegistration, setStateRegistration] = useState('');
  const [contactName, setContactName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [address, setAddress] = useState('');
  const [cep, setCep] = useState('');
  const [city, setCity] = useState('São Luís');
  const [state, setState] = useState('MA');
  const [segment, setSegment] = useState('Indústria');
  const [standardUniformNotes, setStandardUniformNotes] = useState('');

  // 360° Client Profile Modal
  const [profileData, setProfileData] = useState<ClientProfileResponse | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileTab, setProfileTab] = useState<'quotes' | 'orders' | 'finance'>('quotes');

  // KPIs consolidados
  const kpis = useMemo(() => {
    const preliminaryCount = clients.filter((c) => c.isPreliminaryCnpj).length;
    const totalRevenue = clients.reduce((sum, c) => sum + Number(c.totalSpent || 0), 0);
    const totalPendingReceivables = clients.reduce(
      (sum, c) => sum + Number(c.metrics?.pendingReceivablesAmount || 0),
      0
    );
    const totalActiveOrders = clients.reduce(
      (sum, c) => sum + Number(c.metrics?.activeOrdersCount || 0),
      0
    );
    const totalOpenQuotes = clients.reduce(
      (sum, c) => sum + Number(c.metrics?.openQuotesCount || 0),
      0
    );
    const newLeadsCount = leads.filter((l) => l.status === 'novo').length;

    return {
      totalClients: clients.length,
      preliminaryCount,
      totalRevenue,
      totalPendingReceivables,
      totalActiveOrders,
      totalOpenQuotes,
      newLeadsCount,
      totalLeads: leads.length,
    };
  }, [clients, leads]);

  // Lista dinâmica de segmentos existentes
  const segments = useMemo(() => {
    const set = new Set<string>();
    clients.forEach((c) => {
      if (c.segment) set.add(c.segment);
    });
    return Array.from(set).sort();
  }, [clients]);

  const openNewModal = () => {
    setEditingClient(null);
    setCompanyName('');
    setTradeName('');
    setCnpj('');
    setStateRegistration('');
    setContactName('');
    setPhone('');
    setEmail('');
    setAddress('');
    setCep('');
    setCity('São Luís');
    setState('MA');
    setSegment('Indústria');
    setStandardUniformNotes('');
    setFormError('');
    setIsModalOpen(true);
  };

  const openEditModal = (client: Client) => {
    setEditingClient(client);
    setCompanyName(client.companyName);
    setTradeName(client.tradeName);
    setCnpj(client.isPreliminaryCnpj ? '' : maskCNPJ(client.cnpj));
    setStateRegistration(client.stateRegistration || '');
    setContactName(client.contactName);
    setPhone(maskPhoneBR(client.phone));
    setEmail(client.email);
    setAddress(client.address);
    setCep('');
    setCity(client.city);
    setState(client.state);
    setSegment(client.segment);
    setStandardUniformNotes(client.standardUniformNotes);
    setFormError('');
    setIsModalOpen(true);
  };

  const loadClientProfile = async (clientId: string) => {
    setProfileLoading(true);
    setProfileTab('quotes');
    const res = await api.getClientProfile(clientId);
    setProfileLoading(false);
    if (res.status === 200 && res.data) {
      setProfileData(res.data);
    }
  };

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');

    if (!companyName.trim() || companyName.trim().length < 2) {
      setFormError('Informe a Razão Social completa do cliente.');
      return;
    }

    const cnpjDigits = onlyDigits(cnpj);
    const keepPreliminary = Boolean(editingClient?.isPreliminaryCnpj && cnpjDigits.length === 0);

    if (!keepPreliminary) {
      if (cnpjDigits.length !== 14 || !isValidCNPJ(cnpjDigits)) {
        setFormError('CNPJ inválido. Informe os 14 dígitos corretos (validação de dígitos verificadores).');
        return;
      }
    }

    if (phone && onlyDigits(phone).length < 10) {
      setFormError('Informe um telefone/WhatsApp válido com DDD.');
      return;
    }

    const clientToSave: Client = {
      id: editingClient?.id || `cli-${Date.now()}`,
      companyName: companyName.trim(),
      tradeName: tradeName.trim() || companyName.trim(),
      cnpj: keepPreliminary ? editingClient!.cnpj : maskCNPJ(cnpjDigits),
      stateRegistration: stateRegistration.trim() || 'ISENTO',
      contactName: contactName.trim() || 'Contato Principal',
      phone: phone.trim(),
      email: email.trim(),
      address: address.trim(),
      city: city.trim() || 'São Luís',
      state: state.trim().toUpperCase().slice(0, 2) || 'MA',
      segment: segment.trim() || 'Corporativo',
      standardUniformNotes: standardUniformNotes.trim(),
      totalOrdersCount: editingClient?.totalOrdersCount || 0,
      totalSpent: editingClient?.totalSpent || 0,
      createdAt: editingClient?.createdAt || new Date().toISOString().split('T')[0],
    };

    setFormSaving(true);
    const ok = await onSaveClient(clientToSave);
    setFormSaving(false);

    if (ok) {
      setIsModalOpen(false);
      if (profileData && editingClient && profileData.client.id === editingClient.id) {
        loadClientProfile(editingClient.id);
      }
    }
  };

  const filteredClients = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return clients.filter((c) => {
      if (segmentFilter !== 'all' && c.segment !== segmentFilter) return false;
      if (onlyPreliminaryCnpj && !c.isPreliminaryCnpj) return false;
      if (!q) return true;
      return (
        c.companyName.toLowerCase().includes(q) ||
        c.tradeName.toLowerCase().includes(q) ||
        (c.code || '').toLowerCase().includes(q) ||
        c.cnpj.toLowerCase().includes(q) ||
        c.segment.toLowerCase().includes(q) ||
        c.contactName.toLowerCase().includes(q) ||
        (c.city || '').toLowerCase().includes(q)
      );
    });
  }, [clients, searchQuery, segmentFilter, onlyPreliminaryCnpj]);

  const filteredLeads = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return leads.filter((l) => {
      if (!q) return true;
      return (
        l.companyName.toLowerCase().includes(q) ||
        l.clientName.toLowerCase().includes(q) ||
        l.leadNumber.toLowerCase().includes(q) ||
        l.phone.toLowerCase().includes(q) ||
        l.category.toLowerCase().includes(q)
      );
    });
  }, [leads, searchQuery]);

  const findClientForLead = (lead: LeadItem): Client | undefined => {
    const leadPhoneDigits = onlyDigits(lead.phone);
    return clients.find(
      (c) =>
        (leadPhoneDigits.length >= 10 && onlyDigits(c.phone) === leadPhoneDigits) ||
        c.tradeName.trim().toLowerCase() === lead.companyName.trim().toLowerCase() ||
        c.companyName.trim().toLowerCase() === lead.companyName.trim().toLowerCase()
    );
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-200">
        <div>
          <div className="text-xs font-medium text-slate-500 flex items-center gap-2">
            <span>DE FARDAS</span>
            <span aria-hidden="true">/</span>
            <span>Comercial &amp; CRM</span>
            <span aria-hidden="true">/</span>
            <span className="text-slate-800 font-semibold">Carteira de Clientes B2B</span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 mt-1">
            Clientes B2B &amp; Funil de Leads
          </h1>
        </div>

        <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto">
          {canViewLeads && (
            <div className="inline-flex bg-slate-200/70 p-1 rounded-lg text-xs font-semibold">
              <button
                type="button"
                onClick={() => setActiveSection('clients')}
                className={`px-3 py-1.5 rounded-md transition-all cursor-pointer ${
                  activeSection === 'clients'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Carteira B2B ({clients.length})
              </button>
              <button
                type="button"
                onClick={() => setActiveSection('leads')}
                className={`px-3 py-1.5 rounded-md transition-all cursor-pointer flex items-center gap-1.5 ${
                  activeSection === 'leads'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <span>Leads do Portal</span>
                {kpis.newLeadsCount > 0 && (
                  <span className="px-1.5 py-0.5 text-[10px] font-mono rounded bg-amber-500 text-white">
                    {kpis.newLeadsCount}
                  </span>
                )}
              </button>
            </div>
          )}

          {canManageClients && (
            <button
              type="button"
              onClick={openNewModal}
              className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-500 shadow-sm transition-colors cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Novo Cliente B2B</span>
            </button>
          )}
        </div>
      </div>

      {/* KPI Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-2xs">
          <div className="flex items-center justify-between text-xs text-slate-500 font-medium">
            <span>Empresas na Carteira</span>
            <Building2 className="w-4 h-4 text-blue-600" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-slate-900 font-mono">{kpis.totalClients}</span>
            <span className="text-xs text-slate-400">clientes B2B</span>
          </div>
          <div className="mt-1.5 text-[11px] text-slate-500">
            {kpis.preliminaryCount > 0 ? (
              <span className="text-amber-700 font-semibold">
                {kpis.preliminaryCount} aguardando validação de CNPJ
              </span>
            ) : (
              <span className="text-emerald-700 font-medium">100% com CNPJ validado</span>
            )}
          </div>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-2xs">
          <div className="flex items-center justify-between text-xs text-slate-500 font-medium">
            <span>Volume Histórico Real</span>
            <Wallet className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="mt-2">
            <span className="text-2xl font-bold text-slate-900 font-mono">
              {formatCurrencyBRL(kpis.totalRevenue)}
            </span>
          </div>
          <div className="mt-1.5 text-[11px] text-slate-500">
            A receber em aberto:{' '}
            <strong className="font-mono text-amber-700">
              {formatCurrencyBRL(kpis.totalPendingReceivables)}
            </strong>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-2xs">
          <div className="flex items-center justify-between text-xs text-slate-500 font-medium">
            <span>Movimento Ativo</span>
            <Factory className="w-4 h-4 text-indigo-600" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-slate-900 font-mono">
              {kpis.totalActiveOrders}
            </span>
            <span className="text-xs text-slate-400">OPs em fábrica</span>
          </div>
          <div className="mt-1.5 text-[11px] text-slate-500">
            Propostas em aberto:{' '}
            <strong className="font-mono text-blue-700">{kpis.totalOpenQuotes}</strong>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-2xs">
          <div className="flex items-center justify-between text-xs text-slate-500 font-medium">
            <span>Leads do Portal Público</span>
            <Inbox className="w-4 h-4 text-amber-600" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-slate-900 font-mono">
              {kpis.newLeadsCount}
            </span>
            <span className="text-xs text-slate-400">novos de {kpis.totalLeads}</span>
          </div>
          <div className="mt-1.5 text-[11px] text-slate-500">
            {canViewLeads ? (
              <button
                type="button"
                onClick={() => setActiveSection('leads')}
                className="text-blue-600 hover:text-blue-700 font-semibold cursor-pointer"
              >
                Abrir fila de atendimento &rarr;
              </button>
            ) : (
              <span>Restrito à equipe comercial</span>
            )}
          </div>
        </div>
      </div>

      {/* Search & Segment Filters Toolbar */}
      <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs flex flex-col lg:flex-row lg:items-center justify-between gap-3 text-xs">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder={
              activeSection === 'clients'
                ? 'Buscar por Razão Social, Fantasia, código CLI, CNPJ, contato ou cidade...'
                : 'Buscar lead por empresa, solicitante, número ou telefone...'
            }
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-2 border border-slate-300 rounded-lg text-slate-900 focus:ring-2 focus:ring-blue-500 focus:outline-none"
          />
        </div>

        {activeSection === 'clients' && (
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={segmentFilter}
              onChange={(e) => setSegmentFilter(e.target.value)}
              className="px-2.5 py-1.5 border border-slate-300 rounded-lg bg-white text-slate-700 font-medium"
            >
              <option value="all">Todos os segmentos ({clients.length})</option>
              {segments.map((seg) => (
                <option key={seg} value={seg}>
                  {seg}
                </option>
              ))}
            </select>

            {kpis.preliminaryCount > 0 && (
              <button
                type="button"
                onClick={() => setOnlyPreliminaryCnpj((v) => !v)}
                className={`px-2.5 py-1.5 rounded-lg border font-semibold transition-colors cursor-pointer ${
                  onlyPreliminaryCnpj
                    ? 'bg-amber-600 text-white border-amber-600'
                    : 'bg-amber-50 text-amber-800 border-amber-200 hover:bg-amber-100'
                }`}
              >
                CNPJ Pendente ({kpis.preliminaryCount})
              </button>
            )}

            <span className="text-slate-500 font-medium pl-1">
              <strong className="font-mono text-slate-900">{filteredClients.length}</strong> exibidos
            </span>
          </div>
        )}
      </div>

      {/* SECTION 1: CLIENTS CARDS GRID */}
      {activeSection === 'clients' && (
        <>
          {filteredClients.length === 0 ? (
            <div className="bg-white p-10 rounded-xl border border-slate-200 text-center">
              <Building2 className="w-10 h-10 text-slate-300 mx-auto mb-2" />
              <p className="text-sm font-semibold text-slate-700">
                Nenhum cliente encontrado para os filtros aplicados.
              </p>
              <p className="text-xs text-slate-500 mt-1">
                Ajuste a busca ou cadastre um novo cliente B2B com preenchimento automático por CNPJ.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {filteredClients.map((client) => {
                const m = client.metrics;
                return (
                  <div
                    key={client.id}
                    className="bg-white rounded-xl border border-slate-200 shadow-2xs hover:border-blue-300 transition-all overflow-hidden text-xs flex flex-col justify-between"
                  >
                    <div className="p-4 space-y-3">
                      {/* Header */}
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-1.5">
                            {client.code && (
                              <span className="text-[10px] font-mono font-bold text-slate-700 bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200">
                                {client.code}
                              </span>
                            )}
                            <span className="text-[10px] font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                              {client.segment}
                            </span>
                            {client.isPreliminaryCnpj && (
                              <span className="text-[10px] font-bold text-amber-800 bg-amber-50 px-2 py-0.5 rounded border border-amber-300">
                                CNPJ Preliminar
                              </span>
                            )}
                            {client.isDemo === true && (
                              <span className="text-[10px] font-bold text-slate-500 bg-slate-50 px-1.5 py-0.5 rounded border border-slate-200">
                                Demo
                              </span>
                            )}
                          </div>
                          <h3 className="text-base font-bold text-slate-900 mt-1.5 truncate">
                            {client.tradeName}
                          </h3>
                          <div className="text-[11px] text-slate-500 font-mono truncate">
                            {client.companyName} ·{' '}
                            {client.isPreliminaryCnpj ? 'Aguardando CNPJ' : `CNPJ ${client.cnpj}`}
                          </div>
                        </div>

                        <div className="flex items-center gap-1 shrink-0">
                          {canManageClients && (
                            <button
                              type="button"
                              onClick={() => openEditModal(client)}
                              className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg cursor-pointer"
                              title="Editar dados cadastrais"
                            >
                              <Edit3 className="w-4 h-4" />
                            </button>
                          )}
                          {canDeleteClients && (
                            <button
                              type="button"
                              onClick={() => onDeleteClient(client.id)}
                              className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg cursor-pointer"
                              title="Excluir cliente (bloqueado se possuir OPs, propostas ou títulos)"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Contact details */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 text-slate-600 pt-2 border-t border-slate-100 text-[11px]">
                        <div className="flex items-center gap-1.5">
                          <Users className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          <span className="truncate">{client.contactName}</span>
                        </div>
                        <div className="flex items-center gap-1.5 font-mono">
                          <Phone className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          <span className="truncate">{client.phone}</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <Mail className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          <span className="truncate">{client.email || '—'}</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          <span className="truncate">
                            {client.city}/{client.state}
                          </span>
                        </div>
                      </div>

                      {/* Standard Uniform Notes */}
                      {client.standardUniformNotes && (
                        <div className="p-2.5 bg-slate-50 rounded-lg border border-slate-100 text-[11px] space-y-0.5">
                          <span className="font-semibold text-slate-700">
                            Fardamento Padronizado:
                          </span>
                          <p className="text-slate-600 leading-relaxed line-clamp-2">
                            {client.standardUniformNotes}
                          </p>
                        </div>
                      )}

                      {/* Live Cross-Module Counters */}
                      <div className="grid grid-cols-3 gap-2 pt-2 border-t border-slate-100 text-[11px]">
                        <div className="p-2 rounded-lg bg-blue-50/50 border border-blue-100">
                          <span className="text-[10px] text-blue-700 font-semibold block">
                            Comercial
                          </span>
                          <strong className="font-mono text-slate-900">
                            {m?.quotesCount ?? 0} propostas
                          </strong>
                          <span className="text-[10px] text-slate-500 block">
                            {m?.openQuotesCount ?? 0} em aberto
                          </span>
                        </div>

                        <div className="p-2 rounded-lg bg-indigo-50/50 border border-indigo-100">
                          <span className="text-[10px] text-indigo-700 font-semibold block">
                            Produção (PCP)
                          </span>
                          <strong className="font-mono text-slate-900">
                            {client.totalOrdersCount} pedidos
                          </strong>
                          <span className="text-[10px] text-slate-500 block">
                            {m?.activeOrdersCount ?? 0} OPs ativas
                          </span>
                        </div>

                        <div className="p-2 rounded-lg bg-emerald-50/50 border border-emerald-100">
                          <span className="text-[10px] text-emerald-700 font-semibold block">
                            Financeiro
                          </span>
                          <strong className="font-mono text-emerald-800">
                            {formatCurrencyBRL(client.totalSpent)}
                          </strong>
                          <span className="text-[10px] text-slate-500 block">
                            {m && m.pendingReceivablesAmount > 0
                              ? `aberto ${formatCurrencyBRL(m.pendingReceivablesAmount)}`
                              : 'sem pendências'}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Action Bar */}
                    <div className="px-4 py-2.5 bg-slate-50 border-t border-slate-200 flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => loadClientProfile(client.id)}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-slate-900 hover:bg-slate-800 text-white font-semibold rounded-lg text-[11px] transition-colors cursor-pointer"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          <span>Visão 360°</span>
                        </button>

                        {canCreateQuote && (
                          <button
                            type="button"
                            onClick={() => onSelectClientForQuote(client)}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 font-semibold rounded-lg text-[11px] transition-colors cursor-pointer"
                          >
                            <FileText className="w-3.5 h-3.5" />
                            <span>Novo Orçamento</span>
                          </button>
                        )}

                        {canWhatsApp && client.phone && (
                          <button
                            type="button"
                            onClick={() =>
                              onOpenWhatsApp({
                                id: client.id,
                                name: client.tradeName,
                                phone: client.phone,
                              })
                            }
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-white hover:bg-emerald-50 text-emerald-700 border border-slate-200 hover:border-emerald-300 font-semibold rounded-lg text-[11px] transition-colors cursor-pointer"
                          >
                            <MessageSquare className="w-3.5 h-3.5" />
                            <span>WhatsApp</span>
                          </button>
                        )}
                      </div>

                      {m?.lastOrderDate && (
                        <span className="text-[10px] font-mono text-slate-400">
                          Últ. OP: {formatDateBR(m.lastOrderDate)}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* SECTION 2: PORTAL PUBLIC LEADS QUEUE */}
      {activeSection === 'leads' && canViewLeads && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
          <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-xs font-bold text-slate-900 uppercase tracking-wide">
                Leads Captados no Portal Público &amp; Vitrine Digital (crm.leads)
              </h2>
              <p className="text-[11px] text-slate-500">
                Cada solicitação no site gera automaticamente um lead e vincula ou cria um pré-cadastro na carteira B2B.
              </p>
            </div>
          </div>

          {filteredLeads.length === 0 ? (
            <div className="p-10 text-center text-xs text-slate-500">
              Nenhum lead recebido do Portal Público encontrado.
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {filteredLeads.map((lead) => {
                const st = LEAD_STATUS_META[lead.status] || LEAD_STATUS_META.novo;
                const linkedClient = findClientForLead(lead);

                return (
                  <div
                    key={lead.id}
                    className="p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-4 hover:bg-slate-50/70 text-xs"
                  >
                    <div className="space-y-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono font-bold text-slate-800 bg-slate-100 px-2 py-0.5 rounded border border-slate-200 text-[10px]">
                          {lead.leadNumber}
                        </span>
                        <span
                          className={`text-[10px] font-bold px-2 py-0.5 rounded border ${st.badgeClass}`}
                        >
                          {st.label}
                        </span>
                        <span className="text-[10px] text-slate-400 font-mono">
                          {formatDateBR(lead.createdAt.split('T')[0])}
                        </span>
                      </div>

                      <div className="font-bold text-slate-900 text-sm">
                        {lead.companyName}{' '}
                        <span className="font-normal text-slate-500 text-xs">
                          · Contato: {lead.clientName}
                        </span>
                      </div>

                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-slate-600">
                        <span className="font-mono">{lead.phone}</span>
                        {lead.email && <span>{lead.email}</span>}
                        <span className="font-semibold text-blue-700 capitalize">
                          Linha: {lead.category.replace('_', ' ')} ({lead.estimatedQuantity} pçs)
                        </span>
                      </div>

                      {lead.notes && (
                        <p className="text-[11px] text-slate-500">{lead.notes}</p>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-2 shrink-0">
                      <select
                        value={lead.status}
                        onChange={(e) =>
                          onUpdateLeadStatus(lead.id, e.target.value as LeadItem['status'])
                        }
                        className="px-2.5 py-1.5 border border-slate-300 rounded-lg bg-white text-slate-800 font-semibold text-[11px]"
                      >
                        <option value="novo">Novo</option>
                        <option value="em_atendimento">Em Atendimento</option>
                        <option value="orcamento_enviado">Proposta Enviada</option>
                        <option value="convertido">Convertido</option>
                        <option value="perdido">Perdido</option>
                      </select>

                      {canWhatsApp && lead.phone && (
                        <button
                          type="button"
                          onClick={() =>
                            onOpenWhatsApp({
                              id: linkedClient?.id,
                              name: `${lead.companyName} (${lead.clientName})`,
                              phone: lead.phone,
                            })
                          }
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 font-semibold rounded-lg text-[11px] cursor-pointer"
                        >
                          <MessageSquare className="w-3.5 h-3.5" />
                          <span>WhatsApp</span>
                        </button>
                      )}

                      {canCreateQuote && linkedClient && (
                        <button
                          type="button"
                          onClick={() => onSelectClientForQuote(linkedClient)}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-blue-600 hover:bg-blue-500 text-white font-semibold rounded-lg text-[11px] cursor-pointer"
                        >
                          <FileText className="w-3.5 h-3.5" />
                          <span>Gerar Orçamento</span>
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* MODAL 1: 360° CLIENT PROFILE */}
      {(profileLoading || profileData) && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black/60 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-4xl w-full overflow-hidden border border-slate-200">
            {profileLoading && !profileData ? (
              <div className="p-12 text-center">
                <Loader2 className="w-7 h-7 text-blue-600 animate-spin mx-auto mb-2" />
                <p className="text-xs text-slate-500">Carregando histórico 360° do cliente...</p>
              </div>
            ) : (
              profileData && (
                <>
                  <div className="px-6 py-4 bg-slate-900 text-white flex items-start justify-between gap-4">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        {profileData.client.code && (
                          <span className="font-mono text-[10px] font-bold px-2 py-0.5 rounded bg-blue-500/20 text-blue-300 border border-blue-500/30">
                            {profileData.client.code}
                          </span>
                        )}
                        <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-slate-800 text-slate-200 border border-slate-700">
                          {profileData.client.segment}
                        </span>
                        {profileData.client.isPreliminaryCnpj && (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">
                            CNPJ pendente de validação
                          </span>
                        )}
                      </div>
                      <h2 className="text-base font-bold mt-1">{profileData.client.tradeName}</h2>
                      <p className="text-[11px] text-slate-400">
                        {profileData.client.companyName} ·{' '}
                        {profileData.client.isPreliminaryCnpj
                          ? 'Cadastro Preliminar'
                          : `CNPJ ${profileData.client.cnpj}`}{' '}
                        · {profileData.client.phone}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setProfileData(null)}
                      className="p-1.5 text-slate-400 hover:text-white rounded-lg cursor-pointer"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  </div>

                  {/* Quick Tabs & Actions */}
                  <div className="px-6 py-3 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2 text-xs">
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => setProfileTab('quotes')}
                        className={`px-3 py-1.5 rounded-lg font-semibold cursor-pointer ${
                          profileTab === 'quotes'
                            ? 'bg-blue-600 text-white'
                            : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'
                        }`}
                      >
                        Orçamentos ({profileData.quotes.length})
                      </button>
                      <button
                        type="button"
                        onClick={() => setProfileTab('orders')}
                        className={`px-3 py-1.5 rounded-lg font-semibold cursor-pointer ${
                          profileTab === 'orders'
                            ? 'bg-indigo-600 text-white'
                            : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'
                        }`}
                      >
                        Ordens de Produção ({profileData.orders.length})
                      </button>
                      <button
                        type="button"
                        onClick={() => setProfileTab('finance')}
                        className={`px-3 py-1.5 rounded-lg font-semibold cursor-pointer ${
                          profileTab === 'finance'
                            ? 'bg-emerald-600 text-white'
                            : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'
                        }`}
                      >
                        Financeiro ({profileData.transactions.length})
                      </button>
                    </div>

                    <div className="flex items-center gap-1.5">
                      {canCreateQuote && (
                        <button
                          type="button"
                          onClick={() => {
                            const c = profileData.client;
                            setProfileData(null);
                            onSelectClientForQuote(c);
                          }}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-blue-600 hover:bg-blue-500 text-white font-semibold rounded-lg cursor-pointer"
                        >
                          <FileText className="w-3.5 h-3.5" />
                          <span>Novo Orçamento</span>
                        </button>
                      )}
                      {canWhatsApp && profileData.client.phone && (
                        <button
                          type="button"
                          onClick={() => {
                            const c = profileData.client;
                            setProfileData(null);
                            onOpenWhatsApp({ id: c.id, name: c.tradeName, phone: c.phone });
                          }}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-white hover:bg-emerald-50 text-emerald-700 border border-slate-300 font-semibold rounded-lg cursor-pointer"
                        >
                          <MessageSquare className="w-3.5 h-3.5" />
                          <span>WhatsApp</span>
                        </button>
                      )}
                      {canManageClients && (
                        <button
                          type="button"
                          onClick={() => openEditModal(profileData.client)}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 font-semibold rounded-lg cursor-pointer"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                          <span>Editar</span>
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Body */}
                  <div className="p-6 max-h-[60vh] overflow-y-auto text-xs space-y-4">
                    {/* Summary strip */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
                        <span className="text-[10px] text-slate-400 block">Peças em OPs</span>
                        <strong className="font-mono text-slate-900 text-sm">
                          {profileData.metrics.totalPiecesOrdered.toLocaleString('pt-BR')} pçs
                        </strong>
                      </div>
                      <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200">
                        <span className="text-[10px] text-emerald-700 block">Recebido (Pago)</span>
                        <strong className="font-mono text-emerald-800 text-sm">
                          {formatCurrencyBRL(profileData.metrics.paidReceivablesAmount)}
                        </strong>
                      </div>
                      <div className="p-3 rounded-lg bg-amber-50 border border-amber-200">
                        <span className="text-[10px] text-amber-800 block">A Receber</span>
                        <strong className="font-mono text-amber-900 text-sm">
                          {formatCurrencyBRL(profileData.metrics.pendingReceivablesAmount)}
                        </strong>
                      </div>
                      <div className="p-3 rounded-lg bg-blue-50 border border-blue-200">
                        <span className="text-[10px] text-blue-700 block">Propostas Abertas</span>
                        <strong className="font-mono text-blue-900 text-sm">
                          {profileData.metrics.openQuotesCount}
                        </strong>
                      </div>
                    </div>

                    {profileData.client.standardUniformNotes && (
                      <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 text-slate-600">
                        <strong className="text-slate-800">Padrão de Fardamento: </strong>
                        {profileData.client.standardUniformNotes}
                      </div>
                    )}

                    {/* TAB: QUOTES */}
                    {profileTab === 'quotes' && (
                      <div className="space-y-2.5">
                        {profileData.quotes.length === 0 ? (
                          <p className="text-center py-8 text-slate-500">
                            Nenhuma proposta comercial registrada para este cliente.
                          </p>
                        ) : (
                          profileData.quotes.map((q: any) => (
                            <div
                              key={q.id}
                              className="p-3.5 rounded-xl border border-slate-200 flex items-center justify-between gap-3"
                            >
                              <div>
                                <div className="flex items-center gap-2">
                                  <span className="font-mono font-bold text-blue-700">
                                    {q.quoteNumber || q.id}
                                  </span>
                                  <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-slate-100 text-slate-700 uppercase">
                                    {q.commercialStatus}
                                  </span>
                                  <span className="text-[10px] text-slate-400 font-mono">
                                    v{q.version || 1}
                                  </span>
                                </div>
                                <div className="text-[11px] text-slate-500 mt-1">
                                  Emissão: {formatDateBR(q.date)} · Validade: {formatDateBR(q.validUntil)} · Vendedor: {q.sellerName}
                                </div>
                              </div>
                              <div className="text-right shrink-0">
                                <strong className="font-mono text-sm text-slate-900 block">
                                  {formatCurrencyBRL(Number(q.negotiatedTotalAmount || 0))}
                                </strong>
                                <span className="text-[10px] text-slate-500">
                                  Sinal 50%: {formatCurrencyBRL(Number(q.entryAmount || 0))}
                                </span>
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    )}

                    {/* TAB: ORDERS */}
                    {profileTab === 'orders' && (
                      <div className="space-y-2.5">
                        {profileData.orders.length === 0 ? (
                          <p className="text-center py-8 text-slate-500">
                            Nenhuma Ordem de Produção emitida para este cliente.
                          </p>
                        ) : (
                          profileData.orders.map((op) => (
                            <div
                              key={op.id}
                              className="p-3.5 rounded-xl border border-slate-200 flex items-center justify-between gap-3"
                            >
                              <div>
                                <div className="flex items-center gap-2">
                                  <span className="font-mono font-bold text-indigo-700">
                                    {op.orderNumber || op.id}
                                  </span>
                                  <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-indigo-50 text-indigo-700 border border-indigo-200">
                                    {getStageLabel(op.stage)}
                                  </span>
                                </div>
                                <div className="font-semibold text-slate-900 mt-1">{op.itemTitle}</div>
                                <div className="text-[11px] text-slate-500">
                                  {op.totalPieces} peças · Tecido: {op.fabricName} · Entrega: {formatDateBR(op.targetDeliveryDate)}
                                </div>
                              </div>
                              <div className="text-right shrink-0 text-[11px]">
                                <span
                                  className={`inline-block font-semibold px-2 py-0.5 rounded ${
                                    op.entryPaymentConfirmed
                                      ? 'bg-emerald-50 text-emerald-700'
                                      : 'bg-amber-50 text-amber-800'
                                  }`}
                                >
                                  {op.entryPaymentConfirmed ? 'Sinal 50% OK' : 'Sinal Pendente'}
                                </span>
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    )}

                    {/* TAB: FINANCE */}
                    {profileTab === 'finance' && (
                      <div className="space-y-2.5">
                        {profileData.transactions.length === 0 ? (
                          <p className="text-center py-8 text-slate-500">
                            Nenhum título financeiro vinculado a pedidos deste cliente.
                          </p>
                        ) : (
                          <>
                            {profileData.transactions.map((trx) => (
                              <div
                                key={trx.id}
                                className="p-3.5 rounded-xl border border-slate-200 flex items-center justify-between gap-3"
                              >
                                <div>
                                  <div className="flex items-center gap-2">
                                    <span className="font-mono font-bold text-slate-700">
                                      {trx.transactionNumber || trx.id}
                                    </span>
                                    <span
                                      className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase ${
                                        trx.status === 'pago'
                                          ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                          : trx.status === 'atrasado'
                                            ? 'bg-rose-50 text-rose-700 border border-rose-200'
                                            : 'bg-amber-50 text-amber-800 border border-amber-200'
                                      }`}
                                    >
                                      {trx.status}
                                    </span>
                                  </div>
                                  <div className="font-semibold text-slate-900 mt-1">
                                    {trx.description}
                                  </div>
                                  <div className="text-[11px] text-slate-500">
                                    Vencimento: {formatDateBR(trx.dueDate)} · Meio:{' '}
                                    {trx.paymentMethod.toUpperCase()}
                                    {trx.paidDate ? ` · Pago em ${formatDateBR(trx.paidDate)}` : ''}
                                  </div>
                                </div>
                                <strong className="font-mono text-sm text-slate-900 shrink-0">
                                  {formatCurrencyBRL(trx.amount)}
                                </strong>
                              </div>
                            ))}
                            <div className="pt-2 text-right">
                              <button
                                type="button"
                                onClick={() => {
                                  setProfileData(null);
                                  onNavigateTab('finance');
                                }}
                                className="text-blue-600 hover:text-blue-700 font-semibold cursor-pointer"
                              >
                                Ir para Fluxo Financeiro &rarr;
                              </button>
                            </div>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                </>
              )
            )}
          </div>
        </div>
      )}

      {/* MODAL 2: NEW / EDIT CLIENT */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black/60 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full overflow-hidden border border-slate-200">
            <div className="flex items-center justify-between px-6 py-4 bg-slate-900 text-white">
              <h3 className="text-base font-bold">
                {editingClient
                  ? `Editar Cliente [${editingClient.code || editingClient.tradeName}]`
                  : 'Cadastrar Novo Cliente B2B'}
              </h3>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="p-1 text-slate-400 hover:text-white rounded cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form
              onSubmit={handleFormSubmit}
              className="p-6 space-y-4 text-xs max-h-[82vh] overflow-y-auto"
            >
              {formError && (
                <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 rounded-lg font-medium flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                  <span>{formError}</span>
                </div>
              )}

              {editingClient?.isPreliminaryCnpj && (
                <div className="p-3 bg-amber-50 border border-amber-200 text-amber-900 rounded-lg text-[11px]">
                  <strong>Cadastro preliminar vindo do Portal Público:</strong> informe o CNPJ real para validar na Receita Federal e completar os dados fiscais.
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="sm:col-span-2">
                  <label className="block font-semibold text-slate-700 mb-1">
                    CNPJ {editingClient?.isPreliminaryCnpj ? '(regularizar)' : '*'}{' '}
                    <span className="font-normal text-slate-400">(auto-preenchimento)</span>
                  </label>
                  <CnpjLookupInput
                    required={!editingClient?.isPreliminaryCnpj}
                    value={cnpj}
                    onChange={setCnpj}
                    onCnpjFound={(data) => {
                      setCnpj(data.cnpj);
                      if (data.companyName) setCompanyName(data.companyName);
                      if (data.tradeName) setTradeName(data.tradeName);
                      if (data.segment) setSegment(data.segment);
                      if (data.phone) setPhone(data.phone);
                      if (data.email) setEmail(data.email);
                      if (data.cep) setCep(data.cep);
                      const fullAddr = [data.addressLine, data.neighborhood]
                        .filter(Boolean)
                        .join(' - ');
                      if (fullAddr) setAddress(fullAddr);
                      if (data.city) setCity(data.city);
                      if (data.state) setState(data.state);
                    }}
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Inscrição Estadual
                  </label>
                  <input
                    type="text"
                    value={stateRegistration}
                    onChange={(e) => setStateRegistration(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono text-slate-900"
                    placeholder="Isento ou nº I.E."
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Razão Social Completa *
                </label>
                <input
                  type="text"
                  required
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-900"
                  placeholder="Ex: METALÚRGICA VALE DO AÇO S/A"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Nome Fantasia</label>
                  <input
                    type="text"
                    value={tradeName}
                    onChange={(e) => setTradeName(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-900"
                    placeholder="Ex: Vale do Aço"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Segmento</label>
                  <input
                    type="text"
                    value={segment}
                    onChange={(e) => setSegment(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-900"
                    placeholder="Ex: Indústria, Hospital, Logística"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Nome do Contato / Cargo
                  </label>
                  <input
                    type="text"
                    value={contactName}
                    onChange={(e) => setContactName(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-900"
                    placeholder="Ex: Carlos (Gerente de RH)"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Telefone / WhatsApp *
                  </label>
                  <PhoneInputBR
                    required
                    value={phone}
                    onChange={setPhone}
                    placeholder="(98) 98765-4321"
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  E-mail para Orçamentos e Faturamento
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-900"
                  placeholder="compras@empresa.com.br"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-6 gap-3">
                <div className="sm:col-span-2">
                  <label className="block font-semibold text-slate-700 mb-1">
                    CEP <span className="font-normal text-slate-400">(busca auto)</span>
                  </label>
                  <CepLookupInput
                    value={cep}
                    onChange={setCep}
                    onCepFound={(data) => {
                      const composed = [data.street, data.neighborhood]
                        .filter(Boolean)
                        .join(' - ');
                      if (composed) setAddress(composed);
                      if (data.city) setCity(data.city);
                      if (data.state) setState(data.state);
                    }}
                  />
                </div>
                <div className="sm:col-span-4">
                  <label className="block font-semibold text-slate-700 mb-1">
                    Endereço Completo
                  </label>
                  <input
                    type="text"
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-900"
                    placeholder="Logradouro, número, bairro"
                  />
                </div>
                <div className="sm:col-span-4">
                  <label className="block font-semibold text-slate-700 mb-1">Cidade</label>
                  <input
                    type="text"
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-900"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block font-semibold text-slate-700 mb-1">UF</label>
                  <input
                    type="text"
                    maxLength={2}
                    value={state}
                    onChange={(e) => setState(e.target.value.toUpperCase())}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono uppercase text-slate-900"
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Especificação do Fardamento Padrão da Empresa
                </label>
                <textarea
                  rows={2}
                  value={standardUniformNotes}
                  onChange={(e) => setStandardUniformNotes(e.target.value)}
                  className="w-full px-3 py-1.5 border border-slate-300 rounded-lg text-slate-900"
                  placeholder="Cores institucionais, modelo padrão, local do bordado do logo, tecido homologado"
                />
              </div>

              <div className="pt-4 border-t border-slate-200 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 border border-slate-300 rounded-lg text-slate-700 hover:bg-slate-50 cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={formSaving}
                  className="px-5 py-2 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-500 disabled:opacity-60 cursor-pointer inline-flex items-center gap-1.5"
                >
                  {formSaving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  <span>Salvar Cliente</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
