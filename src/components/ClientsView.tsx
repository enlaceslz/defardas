import { useSubmission } from '../api/useSubmission';
import React, { useState } from 'react';
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
  FileText
} from 'lucide-react';
import { Client } from '../types/erp';
import { formatCurrencyBRL, formatDateBR } from '../utils/formatters';

interface ClientsViewProps {
  clients: Client[];
  onSaveClient: (client: Client) => Promise<boolean>;
  onDeleteClient: (clientId: string) => void;
  onSelectClientForQuote?: (client: Client) => void;
}

export const ClientsView: React.FC<ClientsViewProps> = ({
  clients,
  onSaveClient,
  onDeleteClient,
  onSelectClientForQuote,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingClient, setEditingClient] = useState<Client | null>(null);

  // Form states
  const [companyName, setCompanyName] = useState('');
  const [tradeName, setTradeName] = useState('');
  const [cnpj, setCnpj] = useState('');
  const [stateRegistration, setStateRegistration] = useState('');
  const [contactName, setContactName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [segment, setSegment] = useState('');
  const [standardUniformNotes, setStandardUniformNotes] = useState('');

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
    setCity('');
    setState('');
    setSegment('');
    setStandardUniformNotes('');
    setIsModalOpen(true);
  };

  const openEditModal = (client: Client) => {
    setEditingClient(client);
    setCompanyName(client.companyName);
    setTradeName(client.tradeName);
    setCnpj(client.cnpj);
    setStateRegistration(client.stateRegistration || '');
    setContactName(client.contactName);
    setPhone(client.phone);
    setEmail(client.email);
    setAddress(client.address);
    setCity(client.city);
    setState(client.state);
    setSegment(client.segment);
    setStandardUniformNotes(client.standardUniformNotes);
    setIsModalOpen(true);
  };

  const { submit, isSaving } = useSubmission();
  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const clientToSave: Client = {
      id: editingClient?.id || `cli-${Date.now()}`,
      companyName,
      tradeName: tradeName || companyName,
      cnpj,
      stateRegistration,
      contactName,
      phone,
      email,
      address,
      city,
      state,
      segment,
      standardUniformNotes,
      totalOrdersCount: editingClient?.totalOrdersCount || 0,
      totalSpent: editingClient?.totalSpent || 0,
      createdAt: editingClient?.createdAt || new Date().toISOString().split('T')[0],
    };
    if (!(await submit(() => onSaveClient(clientToSave)))) return;
    setIsModalOpen(false);
  };

  const filteredClients = clients.filter((c) => {
    const q = searchQuery.toLowerCase();
    return (
      c.companyName.toLowerCase().includes(q) ||
      c.tradeName.toLowerCase().includes(q) ||
      c.cnpj.toLowerCase().includes(q) ||
      c.segment.toLowerCase().includes(q) ||
      c.contactName.toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-200">
        <div>
          <div className="text-xs font-medium text-slate-500 flex items-center gap-2">
            <span>DE FARDAS</span>
            <span aria-hidden="true">/</span>
            <span>Comercial</span>
            <span aria-hidden="true">/</span>
            <span className="text-slate-800 font-semibold">Carteira de Clientes B2B</span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 mt-1">
            Clientes & Empresas Parceiras
          </h1>
        </div>

        <button
          onClick={openNewModal}
          className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-500 shadow-sm transition-colors cursor-pointer self-start sm:self-auto"
        >
          <Plus className="w-4 h-4" />
          <span>+ Cadastrar Novo Cliente</span>
        </button>
      </div>

      {/* Search Toolbar */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex items-center justify-between gap-4 text-xs">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
          <input
            type="text"
            placeholder="Buscar por Razão Social, CNPJ, contato ou segmento..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-2 border border-slate-300 rounded-lg text-slate-900 focus:ring-2 focus:ring-blue-500 focus:outline-none"
          />
        </div>

        <div className="text-slate-500 font-medium">
          Total de <span className="font-mono font-bold text-slate-900">{filteredClients.length}</span> empresas parceiras
        </div>
      </div>

      {/* Clients Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {filteredClients.map((client) => (
          <div
            key={client.id}
            className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs hover:border-blue-300 transition-colors space-y-3 text-xs"
          >
            <div className="flex items-start justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-semibold text-blue-700 bg-blue-50 px-2 py-0.5 rounded">
                    {client.segment}
                  </span>
                  {client.isDemo !== false && (
                    <span className="text-[10px] font-bold text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200">
                      Demonstração
                    </span>
                  )}
                  {client.code && (
                    <span className="text-[10px] font-mono text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">
                      {client.code}
                    </span>
                  )}
                </div>
                <h3 className="text-base font-bold text-slate-900 mt-1.5">
                  {client.tradeName}
                </h3>
                <div className="text-[11px] text-slate-400 font-mono">
                  {client.companyName} · CNPJ: {client.cnpj}
                </div>
              </div>

              <div className="flex items-center gap-1">
                <button
                  onClick={() => openEditModal(client)}
                  className="p-1.5 text-slate-400 hover:text-blue-600 rounded cursor-pointer"
                  title="Editar dados"
                >
                  <Edit3 className="w-4 h-4" />
                </button>
                <button
                  onClick={() => onDeleteClient(client.id)}
                  className="p-1.5 text-slate-400 hover:text-rose-600 rounded cursor-pointer"
                  title="Excluir cliente"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Contact details */}
            <div className="grid grid-cols-2 gap-2 text-slate-600 pt-2 border-t border-slate-100">
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
                <span className="truncate">{client.email}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                <span className="truncate">{client.city}/{client.state}</span>
              </div>
            </div>

            {/* Standard Uniform Notes */}
            {client.standardUniformNotes && (
              <div className="p-2.5 bg-slate-50 rounded-lg border border-slate-100 text-[11px] space-y-0.5">
                <span className="font-semibold text-slate-700">Fardamento Padronizado da Empresa:</span>
                <p className="text-slate-600 leading-relaxed">{client.standardUniformNotes}</p>
              </div>
            )}

            {/* History Footer */}
            <div className="flex items-center justify-between pt-2 border-t border-slate-100 text-[11px]">
              <div className="text-slate-500 font-mono">
                Pedidos faturados: <strong className="text-slate-800">{client.totalOrdersCount}</strong>
              </div>
              <div className="font-mono">
                Histórico: <strong className="text-emerald-700 font-bold">{formatCurrencyBRL(client.totalSpent)}</strong>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Modal New/Edit Client */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black/60 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full overflow-hidden border border-slate-200">
            <div className="flex items-center justify-between px-6 py-4 bg-slate-900 text-white">
              <h3 className="text-base font-bold">
                {editingClient ? 'Editar Dados do Cliente' : 'Cadastrar Novo Cliente B2B'}
              </h3>
              <button
                onClick={() => setIsModalOpen(false)}
                className="p-1 text-slate-400 hover:text-white rounded cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleFormSubmit} className="p-6 space-y-4 text-xs">
              <div>
                <label htmlFor="client-companyName" className="block font-semibold text-slate-700 mb-1">Razão Social Completa *</label>
                <input
                  type="text"
                  required
                  id="client-companyName" maxLength={150} value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-900"
                  placeholder="Ex: METALÚRGICA VALE DO AÇO S/A"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="client-tradeName" className="block font-semibold text-slate-700 mb-1">Nome Fantasia</label>
                  <input
                    type="text"
                    id="client-tradeName" maxLength={150} value={tradeName}
                    onChange={(e) => setTradeName(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-900"
                    placeholder="Ex: Vale do Aço"
                  />
                </div>
                <div>
                  <label htmlFor="client-segment" className="block font-semibold text-slate-700 mb-1">Segmento</label>
                  <input
                    type="text"
                    id="client-segment" maxLength={60} value={segment}
                    onChange={(e) => setSegment(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-900"
                    placeholder="Ex: Indústria, Hospital, Logística"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="client-cnpj" className="block font-semibold text-slate-700 mb-1">CNPJ *</label>
                  <input
                    type="text"
                    required
                    id="client-cnpj" maxLength={20} value={cnpj}
                    onChange={(e) => setCnpj(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono text-slate-900"
                    placeholder="00.000.000/0000-00"
                  />
                </div>
                <div>
                  <label htmlFor="client-stateRegistration" className="block font-semibold text-slate-700 mb-1">Inscrição Estadual</label>
                  <input
                    type="text"
                    id="client-stateRegistration" maxLength={30} value={stateRegistration}
                    onChange={(e) => setStateRegistration(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono text-slate-900"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="client-contactName" className="block font-semibold text-slate-700 mb-1">Nome do Contato / Cargo</label>
                  <input
                    type="text"
                    id="client-contactName" maxLength={100} required value={contactName}
                    onChange={(e) => setContactName(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-900"
                    placeholder="Ex: Carlos (Gerente de RH)"
                  />
                </div>
                <div>
                  <label htmlFor="client-phone" className="block font-semibold text-slate-700 mb-1">Telefone / WhatsApp</label>
                  <input
                    type="text"
                    id="client-phone" maxLength={30} required value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono text-slate-900"
                    placeholder="(11) 98765-4321"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="client-email" className="block font-semibold text-slate-700 mb-1">E-mail para Orçamentos e Faturamento</label>
                <input
                  type="email"
                  id="client-email" maxLength={150} value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-900"
                  placeholder="compras@empresa.com.br"
                />
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-2">
                  <label htmlFor="client-address" className="block font-semibold text-slate-700 mb-1">Endereço</label>
                  <input
                    type="text"
                    id="client-address" maxLength={200} value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-900"
                  />
                </div>
                <div>
                  <label htmlFor="client-city" className="block font-semibold text-slate-700 mb-1">Cidade</label>
                  <input id="client-city" type="text" maxLength={80} value={city} onChange={(e) => setCity(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-900" />
                </div>
                <div>
                  <label htmlFor="client-state" className="block font-semibold text-slate-700 mb-1">UF</label>
                  <input id="client-state" type="text" maxLength={2} value={state} onChange={(e) => setState(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-900" />
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Especificação do Fardamento Padrão da Empresa
                </label>
                <textarea
                  rows={2}
                  maxLength={10000} value={standardUniformNotes}
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
                  disabled={isSaving}
                  className="px-5 py-2 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-500 cursor-pointer"
                >
                  Salvar Cliente
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
};
