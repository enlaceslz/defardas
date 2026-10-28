import React, { useState, useEffect } from 'react';
import { 
  MessageSquare, 
  Send, 
  Search, 
  QrCode, 
  CheckCheck, 
  Clock, 
  Building2, 
  Phone, 
  RefreshCw, 
  ExternalLink,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  FileText,
  Scissors,
  DollarSign
} from 'lucide-react';
import { api } from '../api/client';

interface Channel {
  id: string;
  provider: 'meta_cloud' | 'wa_akg';
  channelName: string;
  phoneNumber: string;
  status: 'connected' | 'connecting' | 'disconnected' | 'qr_ready' | 'error';
  qrCode?: string;
  isActive: boolean;
}

interface Conversation {
  id: string;
  channelId: string;
  clientId?: string;
  leadId?: string;
  remoteJid: string;
  customerName: string;
  customerPhone: string;
  status: 'open' | 'pending' | 'resolved' | 'closed';
  unreadCount: number;
  lastMessageText?: string;
  lastMessageAt?: string;
  tags?: string[];
}

interface Message {
  id: string;
  conversationId: string;
  direction: 'inbound' | 'outbound';
  senderName?: string;
  messageType: 'text' | 'image' | 'document' | 'audio' | 'template';
  body: string;
  status: 'pending' | 'sent' | 'delivered' | 'read' | 'failed';
  createdAt: string;
}

export const WhatsAppOmnichannelView: React.FC = () => {
  const [channels, setChannels] = useState<Channel[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputMessage, setInputMessage] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'unread' | 'clients'>('all');
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [isQrModalOpen, setIsQrModalOpen] = useState(false);
  const [qrChannel, setQrChannel] = useState<Channel | null>(null);

  // Carregar canais e conversas
  const loadData = async () => {
    try {
      const [channelsRes, convsRes] = await Promise.all([
        api.getChannels(),
        api.getConversations(),
      ]);

      if (channelsRes.data) {
        setChannels(channelsRes.data);
      }
      if (convsRes.data) {
        setConversations(convsRes.data);
        if (!activeConversationId && convsRes.data.length > 0) {
          setActiveConversationId(convsRes.data[0].id);
        }
      }
    } catch (err) {
      console.warn('Erro ao carregar dados do WhatsApp:', err);
    }
  };

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 10000); // Polling a cada 10s
    return () => clearInterval(interval);
  }, []);

  // Carregar mensagens da conversa ativa
  useEffect(() => {
    if (!activeConversationId) return;

    const fetchMessages = async () => {
      setIsLoadingMessages(true);
      try {
        const res = await api.getConversationMessages(activeConversationId);
        if (res.data) {
          setMessages(res.data);
        }
      } catch (err) {
        console.warn('Erro ao carregar mensagens:', err);
      } finally {
        setIsLoadingMessages(false);
      }
    };

    fetchMessages();
  }, [activeConversationId]);

  // Enviar mensagem
  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputMessage.trim() || !activeConversationId) return;

    const textToSend = inputMessage.trim();
    setInputMessage('');

    try {
      const res = await api.sendConversationMessage(activeConversationId, textToSend);
      if (res.data) {
        setMessages((prev) => [...prev, res.data]);
        // Atualizar lista de conversas
        setConversations((prev) =>
          prev.map((c) =>
            c.id === activeConversationId
              ? { ...c, lastMessageText: textToSend, lastMessageAt: new Date().toISOString() }
              : c
          )
        );
      }
    } catch (err) {
      console.warn('Erro ao enviar mensagem:', err);
    }
  };

  // Disparo rápido de template de aprovação de arte
  const handleSendArtTemplate = async () => {
    if (!activeConversation) return;
    const body = `🎨 *Aprovação de Layout / Arte — DE FARDAS*\n\nOlá, ${activeConversation.customerName}! O layout personalizado dos seus uniformes está pronto para conferência.\n\nPor favor, responda com *APROVADO* para liberarmos a ordem na mesa de corte, ou envie as alterações necessárias.`;
    await api.sendConversationMessage(activeConversation.id, body);
    const res = await api.getConversationMessages(activeConversation.id);
    if (res.data) setMessages(res.data);
  };

  // Disparo rápido de cobrança/lembrete de sinal 50%
  const handleSendDownpaymentReminder = async () => {
    if (!activeConversation) return;
    const body = `💳 *Lembrete de Sinal 50% (Liberação Fabril) — DE FARDAS*\n\nOlá, ${activeConversation.customerName}! Para iniciarmos o corte e a produção do seu pedido, é necessária a confirmação do sinal de 50%.\n\nNossa chave PIX oficial é o CNPJ da empresa. Assim que realizar, favor nos enviar o comprovante por aqui!`;
    await api.sendConversationMessage(activeConversation.id, body);
    const res = await api.getConversationMessages(activeConversation.id);
    if (res.data) setMessages(res.data);
  };

  const activeConversation = conversations.find((c) => c.id === activeConversationId);

  const filteredConversations = conversations.filter((c) => {
    const matchesSearch =
      c.customerName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.customerPhone.includes(searchQuery);

    if (!matchesSearch) return false;
    if (filterType === 'unread') return c.unreadCount > 0;
    if (filterType === 'clients') return Boolean(c.clientId);
    return true;
  });

  return (
    <div className="space-y-6">
      {/* Header com Status dos Provedores */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-bold text-slate-900 tracking-tight">Central WhatsApp Omnichannel</h2>
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              Multiprovedor Ativo
            </span>
          </div>
          <p className="text-sm text-slate-500 mt-1">
            Atendimento unificado, rastreabilidade de orçamentos e formalização de arte e pagamentos via WhatsApp.
          </p>
        </div>

        {/* Indicadores de Conexão */}
        <div className="flex flex-wrap items-center gap-2.5">
          {channels.map((ch) => (
            <div
              key={ch.id}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-slate-200 bg-slate-50 text-xs font-medium text-slate-700 shadow-2xs"
            >
              <div
                className={`w-2 h-2 rounded-full ${
                  ch.status === 'connected'
                    ? 'bg-emerald-500'
                    : ch.status === 'connecting'
                    ? 'bg-amber-500 animate-spin'
                    : 'bg-rose-500'
                }`}
              />
              <span className="font-semibold">
                {ch.provider === 'meta_cloud' ? 'Meta Cloud (Oficial)' : 'WA-AKG (QR Code)'}:
              </span>
              <span className="text-slate-500">{ch.phoneNumber}</span>
              {ch.provider === 'wa_akg' && (
                <button
                  type="button"
                  onClick={() => {
                    setQrChannel(ch);
                    setIsQrModalOpen(true);
                  }}
                  className="ml-1 text-blue-600 hover:text-blue-800 p-0.5"
                  title="Ver QR Code de Conexão"
                >
                  <QrCode className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          ))}

          <button
            type="button"
            onClick={loadData}
            className="p-2 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors border border-slate-200"
            title="Atualizar conversas"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Grid Omnichannel: Lista de Conversas (Esquerda) e Chat Ativo (Direita) */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden flex flex-col md:flex-row h-[680px]">
        
        {/* Painel Esquerdo: Lista de Contatos */}
        <div className="w-full md:w-80 lg:w-96 border-r border-slate-200 flex flex-col h-full bg-slate-50/50">
          {/* Busca */}
          <div className="p-3 border-b border-slate-200 bg-white">
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
              <input
                type="text"
                placeholder="Buscar cliente ou telefone..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-100 border border-transparent rounded-lg focus:bg-white focus:border-blue-500 focus:outline-hidden transition-colors"
              />
            </div>

            {/* Filtros */}
            <div className="flex gap-1.5 mt-2.5">
              <button
                type="button"
                onClick={() => setFilterType('all')}
                className={`px-2.5 py-1 text-2xs font-semibold rounded-md transition-colors ${
                  filterType === 'all'
                    ? 'bg-blue-600 text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                Todas ({conversations.length})
              </button>
              <button
                type="button"
                onClick={() => setFilterType('clients')}
                className={`px-2.5 py-1 text-2xs font-semibold rounded-md transition-colors ${
                  filterType === 'clients'
                    ? 'bg-blue-600 text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                Clientes Carteira
              </button>
              <button
                type="button"
                onClick={() => setFilterType('unread')}
                className={`px-2.5 py-1 text-2xs font-semibold rounded-md transition-colors ${
                  filterType === 'unread'
                    ? 'bg-blue-600 text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                Não Lidas
              </button>
            </div>
          </div>

          {/* Lista Scrollável */}
          <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
            {filteredConversations.length === 0 ? (
              <div className="p-8 text-center text-slate-400 text-xs">
                Nenhuma conversa encontrada.
              </div>
            ) : (
              filteredConversations.map((c) => {
                const isActive = c.id === activeConversationId;
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setActiveConversationId(c.id)}
                    className={`w-full text-left p-3.5 transition-colors flex items-start gap-3 ${
                      isActive ? 'bg-blue-50/70 border-l-4 border-l-blue-600' : 'hover:bg-slate-100/70'
                    }`}
                  >
                    <div className="w-9 h-9 rounded-full bg-slate-200 text-slate-700 flex items-center justify-center font-bold text-xs shrink-0">
                      {c.customerName.substring(0, 2).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-1 mb-1">
                        <span className="font-semibold text-xs text-slate-900 truncate">
                          {c.customerName}
                        </span>
                        {c.lastMessageAt && (
                          <span className="text-3xs text-slate-400 shrink-0">
                            {new Date(c.lastMessageAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        )}
                      </div>
                      <p className="text-2xs text-slate-500 truncate mb-1.5">
                        {c.lastMessageText || 'Inicie a conversa...'}
                      </p>
                      <div className="flex items-center gap-1.5">
                        <span className="text-3xs text-slate-400">{c.customerPhone}</span>
                        {c.unreadCount > 0 && (
                          <span className="ml-auto px-1.5 py-0.2 rounded-full text-3xs font-bold bg-blue-600 text-white">
                            {c.unreadCount}
                          </span>
                        )}
                      </div>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* Painel Direito: Chat Ativo */}
        {activeConversation ? (
          <div className="flex-1 flex flex-col h-full bg-slate-100/30">
            {/* Topbar da Conversa */}
            <div className="px-5 py-3.5 bg-white border-b border-slate-200 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-blue-600 text-white flex items-center justify-center font-bold text-sm shadow-xs">
                  {activeConversation.customerName.substring(0, 2).toUpperCase()}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-bold text-sm text-slate-900">{activeConversation.customerName}</h3>
                    {activeConversation.clientId && (
                      <span className="text-3xs font-semibold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                        Cliente Cadastrado
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 text-xs text-slate-500 mt-0.5">
                    <Phone className="w-3 h-3 text-slate-400" />
                    <span>{activeConversation.customerPhone}</span>
                  </div>
                </div>
              </div>

              {/* Botões Rápidos de Ação Comercial / Fabril */}
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleSendArtTemplate}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-indigo-50 text-indigo-700 hover:bg-indigo-100 border border-indigo-200 rounded-lg transition-colors"
                  title="Enviar solicitação de aprovação formal de arte"
                >
                  <Scissors className="w-3.5 h-3.5" />
                  Cobrar Aprovação Arte
                </button>
                <button
                  type="button"
                  onClick={handleSendDownpaymentReminder}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200 rounded-lg transition-colors"
                  title="Enviar dados e lembrete de sinal de 50%"
                >
                  <DollarSign className="w-3.5 h-3.5" />
                  Lembrar Sinal 50%
                </button>
              </div>
            </div>

            {/* Linha do Tempo das Mensagens */}
            <div className="flex-1 overflow-y-auto p-5 space-y-3.5">
              {isLoadingMessages ? (
                <div className="flex items-center justify-center h-full text-slate-400 text-xs">
                  Carregando histórico seguro...
                </div>
              ) : messages.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-slate-400 text-xs">
                  <MessageSquare className="w-8 h-8 text-slate-300 mb-2" />
                  Nenhuma mensagem trocada ainda com este contato.
                </div>
              ) : (
                messages.map((m) => {
                  const isOutbound = m.direction === 'outbound';
                  return (
                    <div
                      key={m.id}
                      className={`flex flex-col ${isOutbound ? 'items-end' : 'items-start'}`}
                    >
                      <div
                        className={`max-w-[75%] rounded-2xl p-3.5 text-xs shadow-2xs whitespace-pre-wrap leading-relaxed ${
                          isOutbound
                            ? 'bg-blue-600 text-white rounded-br-xs'
                            : 'bg-white text-slate-800 border border-slate-200 rounded-bl-xs'
                        }`}
                      >
                        {!isOutbound && m.senderName && (
                          <p className="text-3xs font-bold text-blue-600 mb-1">{m.senderName}</p>
                        )}
                        <p>{m.body}</p>
                        <div
                          className={`flex items-center justify-end gap-1 text-3xs mt-1.5 ${
                            isOutbound ? 'text-blue-100' : 'text-slate-400'
                          }`}
                        >
                          <span>
                            {new Date(m.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                          {isOutbound && (
                            <CheckCheck
                              className={`w-3.5 h-3.5 ${
                                m.status === 'read' ? 'text-sky-200' : 'text-blue-300'
                              }`}
                            />
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Formulário de Envio */}
            <form onSubmit={handleSendMessage} className="p-3.5 bg-white border-t border-slate-200 flex gap-2">
              <input
                type="text"
                placeholder="Escreva uma mensagem no WhatsApp do cliente..."
                value={inputMessage}
                onChange={(e) => setInputMessage(e.target.value)}
                className="flex-1 px-4 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:border-blue-500 focus:outline-hidden transition-colors"
              />
              <button
                type="submit"
                disabled={!inputMessage.trim()}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-semibold rounded-xl inline-flex items-center gap-1.5 transition-colors shadow-xs"
              >
                <Send className="w-3.5 h-3.5" />
                Enviar
              </button>
            </form>
          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-slate-400 text-sm">
            <MessageSquare className="w-12 h-12 text-slate-300 mb-3" />
            Selecione uma conversa ao lado para visualizar e responder no WhatsApp.
          </div>
        )}
      </div>

      {/* Modal de Conexão QR Code (WA-AKG) */}
      {isQrModalOpen && qrChannel && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl border border-slate-200 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <QrCode className="w-5 h-5 text-blue-600" />
                <h3 className="font-bold text-sm text-slate-900">Conexão WhatsApp QR Code (WA-AKG)</h3>
              </div>
              <button
                type="button"
                onClick={() => setIsQrModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 text-sm font-bold"
              >
                ✕
              </button>
            </div>

            <div className="py-6 flex flex-col items-center text-center">
              <div className="p-3 bg-white border border-slate-200 rounded-xl shadow-xs mb-4">
                <img
                  src={
                    qrChannel.qrCode ||
                    `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=defardas_whatsapp_${qrChannel.id}`
                  }
                  alt="QR Code WhatsApp"
                  className="w-48 h-48 rounded-lg"
                />
              </div>

              <p className="text-xs font-semibold text-slate-800">
                1. Abra o WhatsApp no celular da DE FARDAS
              </p>
              <p className="text-2xs text-slate-500 mt-0.5">
                Toque em Aparelhos Conectados &gt; Conectar um aparelho e aponte para a tela.
              </p>

              <div className="mt-4 flex items-center gap-2 text-2xs text-emerald-700 bg-emerald-50 px-3 py-1.5 rounded-lg border border-emerald-200">
                <ShieldCheck className="w-4 h-4 text-emerald-600" />
                <span>Container isolado com persistência segura de sessão Baileys.</span>
              </div>
            </div>

            <div className="flex gap-2 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={async () => {
                  await api.reconnectChannel(qrChannel.id);
                  loadData();
                }}
                className="flex-1 py-2 bg-blue-600 text-white rounded-xl text-xs font-semibold hover:bg-blue-700 transition-colors"
              >
                Reconectar Canal
              </button>
              <button
                type="button"
                onClick={() => setIsQrModalOpen(false)}
                className="px-4 py-2 bg-slate-100 text-slate-700 rounded-xl text-xs font-semibold hover:bg-slate-200 transition-colors"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
