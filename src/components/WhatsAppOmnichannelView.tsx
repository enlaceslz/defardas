import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  MessageSquare,
  Send,
  Search,
  QrCode,
  Check,
  CheckCheck,
  Clock,
  Phone,
  RefreshCw,
  ShieldCheck,
  ShieldAlert,
  AlertCircle,
  CheckCircle2,
  Scissors,
  DollarSign,
  Plus,
  X,
  Loader2,
  UserCheck,
  FileText,
  Paperclip,
  Image as ImageIcon,
  ExternalLink,
  RotateCw,
  Factory,
  Handshake,
  Truck,
  Wifi,
  WifiOff,
  Radio,
} from 'lucide-react';
import { api } from '../api/client';
import { useAuth } from '../api/authContext';
import {
  Client,
  CompanyProfile,
  FinancialTransaction,
  Partner,
  ProductionOrder,
  Quote,
  Supplier,
} from '../types/erp';
import { PhoneInputBR } from './FormInputs';
import { maskPhoneBR } from '../utils/masks';
import { formatCurrencyBRL, formatDateBR, getStageLabel } from '../utils/formatters';

interface ChannelDiagnostics {
  configured: boolean;
  deliveryMode: 'live' | 'sandbox';
  webhookPath: string;
  missingEnvVars: string[];
  hasWebhookSecret: boolean;
}

interface Channel {
  id: string;
  provider: 'meta_cloud' | 'wa_akg';
  channelName: string;
  phoneNumber: string;
  status: 'connected' | 'connecting' | 'disconnected' | 'qr_ready' | 'error';
  qrCode?: string;
  isActive: boolean;
  diagnostics?: ChannelDiagnostics;
}

type ConversationStatus = 'open' | 'pending' | 'resolved' | 'closed';

interface Conversation {
  id: string;
  channelId: string;
  clientId?: string;
  leadId?: string;
  remoteJid: string;
  customerName: string;
  customerPhone: string;
  status: ConversationStatus;
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
  mediaUrl?: string;
  mediaMimeType?: string;
  status: 'pending' | 'sent' | 'delivered' | 'read' | 'failed';
  errorMessage?: string;
  createdAt: string;
}

interface QrPayload {
  channelId: string;
  status: Channel['status'];
  mode: 'live' | 'simulated';
  qrCode: string;
  diagnostics?: ChannelDiagnostics;
}

interface WhatsAppOmnichannelViewProps {
  clients?: Client[];
  partners?: Partner[];
  suppliers?: Supplier[];
  quotes?: Quote[];
  orders?: ProductionOrder[];
  finance?: FinancialTransaction[];
  profile?: CompanyProfile;
  initialConversationId?: string | null;
  initialDraftMessage?: string | null;
  onClearInitialHandoff?: () => void;
  onUnreadCountChange?: (totalUnread: number) => void;
}

const ALLOWED_VIEW_ROLES = new Set(['admin', 'gerente_comercial', 'vendedor', 'financeiro']);
const MANAGE_CHANNELS_ROLES = new Set(['admin', 'gerente_comercial']);

const STATUS_META: Record<
  ConversationStatus,
  { label: string; badgeClass: string; dotClass: string }
> = {
  open: {
    label: 'Aberta',
    badgeClass: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    dotClass: 'bg-emerald-500',
  },
  pending: {
    label: 'Aguardando',
    badgeClass: 'bg-amber-50 text-amber-700 border-amber-200',
    dotClass: 'bg-amber-500',
  },
  resolved: {
    label: 'Resolvida',
    badgeClass: 'bg-blue-50 text-blue-700 border-blue-200',
    dotClass: 'bg-blue-500',
  },
  closed: {
    label: 'Encerrada',
    badgeClass: 'bg-slate-100 text-slate-600 border-slate-200',
    dotClass: 'bg-slate-400',
  },
};

function normalizeDigits(phone?: string): string {
  const digits = String(phone || '').replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('55') && digits.length >= 12) return digits;
  if (digits.length >= 10 && digits.length <= 11) return `55${digits}`;
  return digits;
}

function getContactBadge(conv: Conversation): {
  label: string;
  className: string;
  kind: 'client' | 'lead' | 'partner' | 'supplier' | 'other';
} | null {
  const tags = conv.tags || [];
  if (conv.clientId || tags.includes('cliente_crm')) {
    return {
      label: 'Cliente CRM',
      className: 'bg-emerald-50 text-emerald-700 border-emerald-200',
      kind: 'client',
    };
  }
  if (tags.includes('parceiro_faccao')) {
    return {
      label: 'Parceiro / Facção',
      className: 'bg-indigo-50 text-indigo-700 border-indigo-200',
      kind: 'partner',
    };
  }
  if (tags.includes('fornecedor_insumos')) {
    return {
      label: 'Fornecedor',
      className: 'bg-cyan-50 text-cyan-700 border-cyan-200',
      kind: 'supplier',
    };
  }
  if (conv.leadId || tags.includes('lead_site')) {
    return {
      label: 'Lead Site',
      className: 'bg-amber-50 text-amber-700 border-amber-200',
      kind: 'lead',
    };
  }
  return null;
}

function isRenderableImage(mediaUrl?: string, messageType?: string, mediaMimeType?: string): boolean {
  if (!mediaUrl) return false;
  if (!mediaUrl.startsWith('https://') && !mediaUrl.startsWith('http://') && !mediaUrl.startsWith('/uploads/')) {
    return false;
  }
  if (messageType === 'image' || mediaMimeType?.startsWith('image/')) return true;
  return /\.(png|jpe?g|webp|gif)(\?.*)?$/i.test(mediaUrl);
}

export const WhatsAppOmnichannelView: React.FC<WhatsAppOmnichannelViewProps> = ({
  clients = [],
  partners = [],
  suppliers = [],
  quotes = [],
  orders = [],
  finance = [],
  profile,
  initialConversationId,
  initialDraftMessage,
  onClearInitialHandoff,
  onUnreadCountChange,
}) => {
  const { user } = useAuth();
  const userRole = user?.role || '';
  const canViewModule = ALLOWED_VIEW_ROLES.has(userRole);
  const canManageChannels = MANAGE_CHANNELS_ROLES.has(userRole);

  const [channels, setChannels] = useState<Channel[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(
    initialConversationId || null
  );
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputMessage, setInputMessage] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<
    'all' | 'unread' | 'clients' | 'network' | 'resolved'
  >('all');

  // Anexo opcional no composer
  const [showAttachmentBar, setShowAttachmentBar] = useState(false);
  const [attachmentUrl, setAttachmentUrl] = useState('');
  const [attachmentType, setAttachmentType] = useState<'image' | 'document'>('document');

  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);

  const [feedback, setFeedback] = useState<{ type: 'error' | 'success'; text: string } | null>(null);

  // Modal Diagnóstico & Conexão do Canal (Meta Cloud & WA-AKG)
  const [isChannelModalOpen, setIsChannelModalOpen] = useState(false);
  const [selectedChannel, setSelectedChannel] = useState<Channel | null>(null);
  const [qrPayload, setQrPayload] = useState<QrPayload | null>(null);
  const [isLoadingQr, setIsLoadingQr] = useState(false);
  const [isReconnecting, setIsReconnecting] = useState(false);

  // Modal Nova Conversa (Cliente, Parceiro, Fornecedor ou Manual)
  const [isNewChatModalOpen, setIsNewChatModalOpen] = useState(false);
  const [newChatEntityType, setNewChatEntityType] = useState<
    'client' | 'partner' | 'supplier' | 'manual'
  >('client');
  const [newChatClientId, setNewChatClientId] = useState('');
  const [newChatName, setNewChatName] = useState('');
  const [newChatPhone, setNewChatPhone] = useState('');
  const [newChatChannelId, setNewChatChannelId] = useState('');
  const [isCreatingChat, setIsCreatingChat] = useState(false);

  // Refs para evitar stale closure no polling e auto-scroll
  const activeConvIdRef = useRef<string | null>(initialConversationId || null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const feedbackTimerRef = useRef<number | null>(null);

  useEffect(() => {
    activeConvIdRef.current = activeConversationId;
  }, [activeConversationId]);

  const showFeedback = useCallback((type: 'error' | 'success', text: string) => {
    setFeedback({ type, text });
    if (feedbackTimerRef.current) {
      window.clearTimeout(feedbackTimerRef.current);
    }
    feedbackTimerRef.current = window.setTimeout(() => {
      setFeedback(null);
    }, 6000);
  }, []);

  useEffect(() => {
    return () => {
      if (feedbackTimerRef.current) {
        window.clearTimeout(feedbackTimerRef.current);
      }
    };
  }, []);

  // Aplicar handoff vindo de outros módulos (Clientes, Parceiros, Fornecedores, PCs, OPs)
  useEffect(() => {
    if (!initialConversationId) return;
    setActiveConversationId(initialConversationId);
    activeConvIdRef.current = initialConversationId;
    if (initialDraftMessage) {
      setInputMessage(initialDraftMessage);
    }
    onClearInitialHandoff?.();
  }, [initialConversationId, initialDraftMessage, onClearInitialHandoff]);

  // Carregar canais, conversas e mensagens da conversa ativa
  const loadData = useCallback(
    async (silent = true) => {
      if (!canViewModule) return;
      if (!silent) setIsRefreshing(true);

      try {
        const currentActiveId = activeConvIdRef.current;
        const [channelsRes, convsRes, msgsRes] = await Promise.all([
          api.getChannels(),
          api.getConversations(),
          currentActiveId ? api.getConversationMessages(currentActiveId) : Promise.resolve(null),
        ]);

        if (channelsRes.error && !silent) {
          showFeedback('error', channelsRes.error);
        } else if (channelsRes.data) {
          setChannels(channelsRes.data);
          setSelectedChannel((prev) =>
            prev ? channelsRes.data!.find((c: Channel) => c.id === prev.id) || prev : null
          );
        }

        if (convsRes.error && !silent) {
          showFeedback('error', convsRes.error);
        } else if (convsRes.data) {
          setConversations(convsRes.data);
          if (!currentActiveId && convsRes.data.length > 0) {
            setActiveConversationId(convsRes.data[0].id);
          }
        }

        if (msgsRes && msgsRes.data && activeConvIdRef.current === currentActiveId) {
          setMessages(msgsRes.data);
        }
      } catch (err: any) {
        if (!silent) {
          showFeedback('error', err?.message || 'Falha ao sincronizar a Central WhatsApp.');
        }
      } finally {
        if (!silent) setIsRefreshing(false);
      }
    },
    [canViewModule, showFeedback]
  );

  useEffect(() => {
    if (!canViewModule) return;
    loadData(false);
    const interval = window.setInterval(() => {
      loadData(true);
    }, 8000);
    return () => window.clearInterval(interval);
  }, [canViewModule, loadData]);

  // Sincronizar total de não lidas com a Sidebar do ERP
  const totalUnread = useMemo(
    () => conversations.reduce((acc, c) => acc + (c.unreadCount || 0), 0),
    [conversations]
  );

  useEffect(() => {
    onUnreadCountChange?.(totalUnread);
  }, [totalUnread, onUnreadCountChange]);

  // Carregar mensagens e zerar unreadCount ao abrir conversa
  useEffect(() => {
    if (!canViewModule || !activeConversationId) return;

    let cancelled = false;
    const fetchMessagesAndMarkRead = async () => {
      setIsLoadingMessages(true);
      try {
        const res = await api.getConversationMessages(activeConversationId);
        if (cancelled) return;
        if (res.error) {
          showFeedback('error', res.error);
        } else if (res.data) {
          setMessages(res.data);
        }

        const readRes = await api.markConversationRead(activeConversationId);
        if (!cancelled && !readRes.error) {
          setConversations((prev) =>
            prev.map((c) => (c.id === activeConversationId ? { ...c, unreadCount: 0 } : c))
          );
        }
      } catch (err: any) {
        if (!cancelled) {
          showFeedback('error', err?.message || 'Erro ao carregar histórico de mensagens.');
        }
      } finally {
        if (!cancelled) setIsLoadingMessages(false);
      }
    };

    fetchMessagesAndMarkRead();
    return () => {
      cancelled = true;
    };
  }, [activeConversationId, canViewModule, showFeedback]);

  // Auto-scroll para última mensagem
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages.length, activeConversationId]);

  const activeConversation = conversations.find((c) => c.id === activeConversationId) || null;
  const activeChannel = activeConversation
    ? channels.find((ch) => ch.id === activeConversation.channelId) || null
    : null;

  // Contexto ERP da conversa ativa (Cliente, Orçamentos, OPs e Títulos Financeiros em aberto)
  const erpContext = useMemo(() => {
    if (!activeConversation) return null;
    const convDigits = normalizeDigits(activeConversation.customerPhone);
    const matchedClient =
      (activeConversation.clientId
        ? clients.find((c) => c.id === activeConversation.clientId)
        : undefined) ||
      clients.find((c) => normalizeDigits(c.phone) === convDigits);

    if (!matchedClient) return null;

    const clientOrders = orders.filter((o) => o.clientId === matchedClient.id);
    const activeOrder =
      clientOrders.find((o) => o.stage !== 'entregue') || clientOrders[0] || null;
    const artPendingOrder = clientOrders.find((o) => !o.artApproved) || null;

    const clientQuotes = quotes.filter((q) => q.clientId === matchedClient.id);
    const latestQuote = clientQuotes[0] || null;

    const orderIds = new Set(clientOrders.map((o) => o.id));
    const orderNumbers = new Set(clientOrders.map((o) => o.orderNumber));
    const openReceivable =
      finance.find(
        (f) =>
          f.type === 'receber' &&
          (f.status === 'pendente' || f.status === 'atrasado') &&
          (f.clientId === matchedClient.id ||
            (f.productionOrderId && orderIds.has(f.productionOrderId)) ||
            (f.referenceId && orderNumbers.has(f.referenceId)))
      ) || null;

    return {
      client: matchedClient,
      activeOrder,
      artPendingOrder,
      latestQuote,
      openReceivable,
      activeOrdersCount: clientOrders.filter((o) => o.stage !== 'entregue').length,
    };
  }, [activeConversation, clients, orders, quotes, finance]);

  // Diagnóstico consolidado dos canais (honesto — sem fake "Multiprovedor Ativo")
  const providerSummary = useMemo(() => {
    const liveConfigured = channels.filter((ch) => ch.diagnostics?.configured);
    const liveConnected = liveConfigured.filter((ch) => ch.status === 'connected');
    if (liveConnected.length > 0) {
      return {
        label:
          liveConnected.length > 1
            ? `${liveConnected.length} Provedores Live Conectados`
            : 'Provedor Live Conectado',
        className: 'bg-emerald-50 text-emerald-700 border-emerald-200',
        dotClass: 'bg-emerald-500 animate-pulse',
      };
    }
    if (liveConfigured.length > 0) {
      return {
        label: 'Provedor Configurado — Reconexão Pendente',
        className: 'bg-amber-50 text-amber-700 border-amber-200',
        dotClass: 'bg-amber-500',
      };
    }
    return {
      label: 'Modo Sandbox Local (Configure Meta Cloud ou WA-AKG)',
      className: 'bg-amber-50 text-amber-800 border-amber-200',
      dotClass: 'bg-amber-500',
    };
  }, [channels]);

  // Enviar mensagem de texto, mídia ou template
  const dispatchMessage = async (
    textToSend: string,
    messageType: 'text' | 'image' | 'document' | 'template' = 'text',
    restoreInputOnFail = false,
    mediaUrl?: string
  ) => {
    if (!activeConversationId || !textToSend.trim() || isSending) return;

    setIsSending(true);
    try {
      const cleanMedia = mediaUrl?.trim() || undefined;
      const resolvedType = cleanMedia && messageType === 'text' ? attachmentType : messageType;
      const res = await api.sendConversationMessage(
        activeConversationId,
        textToSend.trim(),
        cleanMedia,
        resolvedType
      );

      if (res.error || !res.data) {
        if (restoreInputOnFail) setInputMessage(textToSend);
        showFeedback('error', res.error || 'Não foi possível enviar a mensagem pelo WhatsApp.');
        return;
      }

      const sent: Message = res.data;
      setMessages((prev) => [...prev, sent]);
      setConversations((prev) =>
        prev
          .map((c) =>
            c.id === activeConversationId
              ? {
                  ...c,
                  lastMessageText: sent.body,
                  lastMessageAt: sent.createdAt || new Date().toISOString(),
                  unreadCount: 0,
                  status: c.status === 'resolved' || c.status === 'closed' ? 'open' : c.status,
                }
              : c
          )
          .sort(
            (a, b) =>
              new Date(b.lastMessageAt || 0).getTime() - new Date(a.lastMessageAt || 0).getTime()
          )
      );

      if (cleanMedia) {
        setAttachmentUrl('');
        setShowAttachmentBar(false);
      }

      if (sent.status === 'failed') {
        showFeedback(
          'error',
          `Mensagem registrada com falha no provedor: ${sent.errorMessage || 'verifique o canal.'}`
        );
      }
    } catch (err: any) {
      if (restoreInputOnFail) setInputMessage(textToSend);
      showFeedback('error', err?.message || 'Erro de rede ao enviar mensagem.');
    } finally {
      setIsSending(false);
    }
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = inputMessage.trim();
    if (!trimmed || !activeConversationId || isSending) return;
    const cleanMedia = showAttachmentBar ? attachmentUrl.trim() : '';
    setInputMessage('');
    await dispatchMessage(
      trimmed,
      cleanMedia ? attachmentType : 'text',
      true,
      cleanMedia || undefined
    );
  };

  // Templates rápidos alimentados por dados reais do ERP
  const handleSendArtTemplate = async () => {
    if (!activeConversation) return;
    const companyName = profile?.tradeName || 'DE FARDAS';
    const targetOrder = erpContext?.artPendingOrder || erpContext?.activeOrder;
    const refLabel = targetOrder
      ? `da Ordem de Produção *${targetOrder.orderNumber}* (${targetOrder.itemTitle})`
      : erpContext?.latestQuote
        ? `da Proposta *${erpContext.latestQuote.quoteNumber}*`
        : 'dos seus uniformes';
    const verLabel = targetOrder?.artVersionNumber ? ` (Arte v${targetOrder.artVersionNumber})` : '';
    const linkLine = targetOrder?.artFileUrl ? `\nArquivo da arte: ${targetOrder.artFileUrl}\n` : '\n';
    const body = `*Aprovação de Layout / Arte${verLabel} — ${companyName}*\n\nOlá, ${activeConversation.customerName}! O layout personalizado ${refLabel} está pronto para conferência.${linkLine}\nPor favor, responda com *APROVADO* para liberarmos a ordem na mesa de corte (Portão de Produção), ou envie os ajustes desejados.`;
    await dispatchMessage(body, 'template', false, targetOrder?.artFileUrl);
  };

  const handleSendOrderStageTemplate = async () => {
    if (!activeConversation || !erpContext?.activeOrder) return;
    const order = erpContext.activeOrder;
    const companyName = profile?.tradeName || 'DE FARDAS';
    const stageName = getStageLabel(order.stage);
    const deliveryLine = order.targetDeliveryDate
      ? `\n*Previsão de entrega:* ${formatDateBR(order.targetDeliveryDate)}`
      : '';
    const body = `*Atualização de Produção — ${companyName}*\n\nOlá, ${activeConversation.customerName}! Sua Ordem de Produção *${order.orderNumber}* (${order.itemTitle} — ${order.totalPieces} pçs) está na etapa: *${stageName}*.${deliveryLine}\n\nQualquer dúvida, nossa equipe está à disposição por aqui!`;
    await dispatchMessage(body, 'template', false);
  };

  const handleSendDownpaymentReminder = async () => {
    if (!activeConversation) return;
    const companyName = profile?.tradeName || 'DE FARDAS';
    const openRec = erpContext?.openReceivable;
    const pixInfo = profile?.cnpj
      ? `Nossa chave PIX oficial (CNPJ) é *${profile.cnpj}*.`
      : 'Nossa chave PIX oficial é o CNPJ da empresa.';

    const body = openRec
      ? `*Lembrete Financeiro — ${companyName}*\n\nOlá, ${activeConversation.customerName}! Lembramos que está em aberto o título *${openRec.transactionNumber}* (${openRec.description}) no valor de *${formatCurrencyBRL(openRec.amount)}* com vencimento em *${formatDateBR(openRec.dueDate)}*.\n\n${pixInfo} Assim que efetuar o pagamento, envie o comprovante por aqui para registro e liberação imediata!`
      : `*Lembrete de Sinal 50% (Liberação Fabril) — ${companyName}*\n\nOlá, ${activeConversation.customerName}! Para iniciarmos o corte e a produção do seu pedido, é necessária a confirmação do sinal de 50%.\n\n${pixInfo} Assim que realizar o pagamento, favor nos enviar o comprovante por aqui para registro financeiro!`;

    await dispatchMessage(body, 'template', false);
  };

  const handleUpdateStatus = async (nextStatus: ConversationStatus) => {
    if (!activeConversation || activeConversation.status === nextStatus || isUpdatingStatus) return;
    setIsUpdatingStatus(true);
    try {
      const res = await api.updateConversationStatus(activeConversation.id, nextStatus);
      if (res.error || !res.data) {
        showFeedback('error', res.error || 'Falha ao atualizar status da conversa.');
        return;
      }
      setConversations((prev) =>
        prev.map((c) => (c.id === activeConversation.id ? { ...c, status: res.data.status } : c))
      );
      showFeedback('success', `Conversa marcada como "${STATUS_META[nextStatus].label}".`);
    } catch (err: any) {
      showFeedback('error', err?.message || 'Erro ao alterar status da conversa.');
    } finally {
      setIsUpdatingStatus(false);
    }
  };

  // Abrir Modal Diagnóstico / QR Code (funciona tanto para Meta Cloud quanto para WA-AKG)
  const handleOpenChannelModal = async (channel: Channel) => {
    setSelectedChannel(channel);
    setQrPayload(null);
    setIsChannelModalOpen(true);

    if (channel.provider === 'wa_akg') {
      setIsLoadingQr(true);
      try {
        const res = await api.getChannelQr(channel.id);
        if (res.error || !res.data) {
          showFeedback('error', res.error || 'Não foi possível carregar o QR Code do canal.');
        } else {
          setQrPayload(res.data);
        }
      } catch (err: any) {
        showFeedback('error', err?.message || 'Erro ao buscar QR Code.');
      } finally {
        setIsLoadingQr(false);
      }
    }
  };

  const handleReconnectChannel = async () => {
    if (!selectedChannel || !canManageChannels || isReconnecting) return;
    setIsReconnecting(true);
    try {
      const res = await api.reconnectChannel(selectedChannel.id);
      if (res.error || !res.data) {
        showFeedback('error', res.error || 'Falha ao verificar canal.');
        return;
      }

      const updatedChannel: Channel | undefined = res.data.channel;
      if (updatedChannel) {
        setChannels((prev) => prev.map((c) => (c.id === updatedChannel.id ? updatedChannel : c)));
        setSelectedChannel(updatedChannel);
      }

      showFeedback(
        updatedChannel?.status === 'connected' ? 'success' : 'error',
        res.data.message || 'Verificação de conectividade concluída.'
      );

      if (selectedChannel.provider === 'wa_akg') {
        setIsLoadingQr(true);
        const qrRes = await api.getChannelQr(selectedChannel.id);
        if (qrRes.data) setQrPayload(qrRes.data);
        setIsLoadingQr(false);
      }
    } catch (err: any) {
      showFeedback('error', err?.message || 'Falha ao verificar/reconectar canal.');
    } finally {
      setIsReconnecting(false);
    }
  };

  // Nova Conversa (Cliente CRM, Parceiro, Fornecedor ou Número Manual)
  const handleOpenNewChatModal = () => {
    setNewChatEntityType('client');
    setNewChatClientId('');
    setNewChatName('');
    setNewChatPhone('');
    const defaultChannel =
      channels.find((ch) => ch.isActive && ch.status === 'connected') || channels[0];
    setNewChatChannelId(defaultChannel?.id || '');
    setIsNewChatModalOpen(true);
  };

  const handleSelectEntityForNewChat = (entityId: string) => {
    setNewChatClientId(entityId);
    if (!entityId) return;

    if (newChatEntityType === 'client') {
      const found = clients.find((c) => c.id === entityId);
      if (found) {
        setNewChatName(found.companyName || found.tradeName || found.contactName);
        setNewChatPhone(maskPhoneBR(found.phone || ''));
      }
    } else if (newChatEntityType === 'partner') {
      const found = partners.find((p) => p.id === entityId);
      if (found) {
        setNewChatName(`${found.tradeName} (${found.code})`);
        setNewChatPhone(maskPhoneBR(found.phone || ''));
      }
    } else if (newChatEntityType === 'supplier') {
      const found = suppliers.find((s) => s.id === entityId);
      if (found) {
        setNewChatName(`${found.tradeName} (${found.code})`);
        setNewChatPhone(maskPhoneBR(found.phone || ''));
      }
    }
  };

  const handleCreateConversation = async (e: React.FormEvent) => {
    e.preventDefault();
    const digits = newChatPhone.replace(/\D/g, '');
    if (digits.length < 10) {
      showFeedback('error', 'Informe um número de WhatsApp válido com DDD (10 ou 11 dígitos).');
      return;
    }

    setIsCreatingChat(true);
    try {
      const res = await api.startConversation({
        phone: newChatPhone,
        customerName: newChatName.trim() || undefined,
        clientId: newChatEntityType === 'client' && newChatClientId ? newChatClientId : undefined,
        channelId: newChatChannelId || undefined,
      });

      if (res.error || !res.data) {
        showFeedback('error', res.error || 'Falha ao iniciar conversa no WhatsApp.');
        return;
      }

      const conv: Conversation = res.data;
      setConversations((prev) => {
        const exists = prev.some((c) => c.id === conv.id);
        const next = exists ? prev.map((c) => (c.id === conv.id ? conv : c)) : [conv, ...prev];
        return next.sort(
          (a, b) =>
            new Date(b.lastMessageAt || 0).getTime() - new Date(a.lastMessageAt || 0).getTime()
        );
      });
      setActiveConversationId(conv.id);
      setIsNewChatModalOpen(false);
      showFeedback('success', `Conversa com ${conv.customerName} pronta para atendimento.`);
    } catch (err: any) {
      showFeedback('error', err?.message || 'Erro ao criar conversa.');
    } finally {
      setIsCreatingChat(false);
    }
  };

  const filteredConversations = conversations.filter((c) => {
    const q = searchQuery.trim().toLowerCase();
    const qDigits = q.replace(/\D/g, '');
    const matchesSearch =
      !q ||
      c.customerName.toLowerCase().includes(q) ||
      c.customerPhone.toLowerCase().includes(q) ||
      (qDigits.length > 0 && c.customerPhone.replace(/\D/g, '').includes(qDigits));

    if (!matchesSearch) return false;
    if (filterType === 'unread') return c.unreadCount > 0;
    if (filterType === 'clients') return Boolean(c.clientId) || Boolean(c.tags?.includes('cliente_crm'));
    if (filterType === 'network') {
      return Boolean(
        c.tags?.includes('parceiro_faccao') || c.tags?.includes('fornecedor_insumos')
      );
    }
    if (filterType === 'resolved') return c.status === 'resolved' || c.status === 'closed';
    return true;
  });

  // Guard RBAC em profundidade (espelha requirePermission('communication:view') no backend)
  if (!canViewModule) {
    return (
      <div className="bg-white rounded-xl border border-slate-200 p-10 text-center max-w-xl mx-auto mt-10 shadow-xs">
        <div className="w-12 h-12 rounded-full bg-rose-50 text-rose-600 flex items-center justify-center mx-auto mb-3 border border-rose-200">
          <ShieldAlert className="w-6 h-6" />
        </div>
        <h2 className="text-base font-bold text-slate-900">Acesso Restrito à Central WhatsApp</h2>
        <p className="text-xs text-slate-500 mt-1.5 leading-relaxed">
          Seu perfil atual (<span className="font-semibold text-slate-700">{userRole || 'não identificado'}</span>)
          não possui permissão para acessar conversas comerciais e financeiras de clientes.
          Solicite liberação ao Administrador se precisar operar este módulo.
        </p>
      </div>
    );
  }

  const activeBadge = activeConversation ? getContactBadge(activeConversation) : null;

  return (
    <div className="space-y-4">
      {/* Banner de Feedback (erros / confirmações reais da API) */}
      {feedback && (
        <div
          role="alert"
          className={`flex items-center justify-between gap-3 px-4 py-2.5 rounded-xl border text-xs font-medium ${
            feedback.type === 'error'
              ? 'bg-rose-50 border-rose-200 text-rose-800'
              : 'bg-emerald-50 border-emerald-200 text-emerald-800'
          }`}
        >
          <div className="flex items-center gap-2">
            {feedback.type === 'error' ? (
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
            ) : (
              <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
            )}
            <span>{feedback.text}</span>
          </div>
          <button
            type="button"
            onClick={() => setFeedback(null)}
            className="p-0.5 rounded hover:bg-black/5 transition-colors cursor-pointer"
            aria-label="Fechar aviso"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Header com Status Real dos Provedores */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs flex flex-col xl:flex-row xl:items-center justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-xl font-bold text-slate-900 tracking-tight">
              Central WhatsApp Omnichannel
            </h2>
            <span
              className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold border ${providerSummary.className}`}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${providerSummary.dotClass}`} />
              {providerSummary.label}
            </span>
            {totalUnread > 0 && (
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold bg-blue-600 text-white">
                {totalUnread} não {totalUnread === 1 ? 'lida' : 'lidas'}
              </span>
            )}
          </div>
          <p className="text-sm text-slate-500 mt-1">
            Atendimento unificado com Clientes, Parceiros e Fornecedores, aprovação de arte, cobrança de sinal e status de OPs.
          </p>
        </div>

        {/* Indicadores de Conexão Clicáveis + Ações */}
        <div className="flex flex-wrap items-center gap-2.5">
          {channels.map((ch) => {
            const isLive = ch.diagnostics?.configured;
            return (
              <button
                key={ch.id}
                type="button"
                onClick={() => handleOpenChannelModal(ch)}
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-slate-200 bg-slate-50 hover:bg-blue-50/60 hover:border-blue-300 text-xs font-medium text-slate-700 shadow-2xs transition-colors cursor-pointer"
                title="Abrir diagnóstico, webhook e reconexão do canal"
              >
                <span
                  className={`w-2 h-2 rounded-full ${
                    ch.status === 'connected' && isLive
                      ? 'bg-emerald-500'
                      : ch.status === 'connecting' || ch.status === 'qr_ready'
                      ? 'bg-amber-500 animate-pulse'
                      : isLive
                      ? 'bg-rose-500'
                      : 'bg-slate-400'
                  }`}
                />
                <span className="font-semibold">
                  {ch.provider === 'meta_cloud' ? 'Meta Cloud' : 'WA-AKG'}:
                </span>
                <span className="text-slate-500 font-mono text-[11px]">
                  {isLive ? ch.phoneNumber : 'Sandbox'}
                </span>
                {ch.provider === 'wa_akg' ? (
                  <QrCode className="w-3.5 h-3.5 text-blue-600" />
                ) : (
                  <Radio className="w-3.5 h-3.5 text-blue-600" />
                )}
              </button>
            );
          })}

          <button
            type="button"
            onClick={handleOpenNewChatModal}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-lg transition-colors shadow-xs cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            Nova Conversa
          </button>

          <button
            type="button"
            onClick={() => loadData(false)}
            disabled={isRefreshing}
            className="p-2 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors border border-slate-200 disabled:opacity-50 cursor-pointer"
            title="Sincronizar conversas e mensagens"
          >
            <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Grid Omnichannel: Lista de Conversas (Esquerda) e Chat Ativo (Direita) */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden flex flex-col md:flex-row h-[700px]">
        {/* Painel Esquerdo: Lista de Contatos */}
        <div className="w-full md:w-80 lg:w-96 border-r border-slate-200 flex flex-col h-full bg-slate-50/50">
          {/* Busca e Filtros */}
          <div className="p-3 border-b border-slate-200 bg-white">
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-2 text-slate-400" />
              <input
                type="text"
                placeholder="Buscar contato ou telefone..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-100 border border-transparent rounded-lg focus:bg-white focus:border-blue-500 focus:outline-hidden transition-colors"
              />
            </div>

            <div className="flex flex-wrap gap-1.5 mt-2.5">
              <button
                type="button"
                onClick={() => setFilterType('all')}
                className={`px-2 py-1 text-[11px] font-semibold rounded-md transition-colors cursor-pointer ${
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
                className={`px-2 py-1 text-[11px] font-semibold rounded-md transition-colors cursor-pointer ${
                  filterType === 'clients'
                    ? 'bg-blue-600 text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                Carteira
              </button>
              <button
                type="button"
                onClick={() => setFilterType('network')}
                className={`px-2 py-1 text-[11px] font-semibold rounded-md transition-colors cursor-pointer ${
                  filterType === 'network'
                    ? 'bg-blue-600 text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                Parceiros/Forn.
              </button>
              <button
                type="button"
                onClick={() => setFilterType('unread')}
                className={`px-2 py-1 text-[11px] font-semibold rounded-md transition-colors cursor-pointer ${
                  filterType === 'unread'
                    ? 'bg-blue-600 text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                Não Lidas {totalUnread > 0 ? `(${totalUnread})` : ''}
              </button>
              <button
                type="button"
                onClick={() => setFilterType('resolved')}
                className={`px-2 py-1 text-[11px] font-semibold rounded-md transition-colors cursor-pointer ${
                  filterType === 'resolved'
                    ? 'bg-blue-600 text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                Resolvidas
              </button>
            </div>
          </div>

          {/* Lista Scrollável */}
          <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
            {filteredConversations.length === 0 ? (
              <div className="p-8 text-center text-slate-400 text-xs space-y-2">
                <p>Nenhuma conversa encontrada neste filtro.</p>
                <button
                  type="button"
                  onClick={handleOpenNewChatModal}
                  className="text-blue-600 font-semibold hover:underline cursor-pointer"
                >
                  + Iniciar nova conversa
                </button>
              </div>
            ) : (
              filteredConversations.map((c) => {
                const isActive = c.id === activeConversationId;
                const stMeta = STATUS_META[c.status] || STATUS_META.open;
                const cBadge = getContactBadge(c);
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setActiveConversationId(c.id)}
                    className={`w-full text-left p-3.5 transition-colors flex items-start gap-3 cursor-pointer ${
                      isActive
                        ? 'bg-blue-50/70 border-l-4 border-l-blue-600'
                        : 'hover:bg-slate-100/70 border-l-4 border-l-transparent'
                    }`}
                  >
                    <div className="relative w-9 h-9 rounded-full bg-slate-200 text-slate-700 flex items-center justify-center font-bold text-xs shrink-0">
                      {c.customerName.substring(0, 2).toUpperCase()}
                      <span
                        className={`w-2.5 h-2.5 rounded-full border-2 border-white absolute -bottom-0.5 -right-0.5 ${stMeta.dotClass}`}
                        title={stMeta.label}
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-1 mb-0.5">
                        <span className="font-semibold text-xs text-slate-900 truncate">
                          {c.customerName}
                        </span>
                        {c.lastMessageAt && (
                          <span className="text-[10px] text-slate-400 shrink-0 font-mono">
                            {new Date(c.lastMessageAt).toLocaleTimeString('pt-BR', {
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-slate-500 truncate mb-1.5">
                        {c.lastMessageText || 'Inicie a conversa...'}
                      </p>
                      <div className="flex items-center gap-1.5">
                        <span className="text-[10px] text-slate-400 font-mono truncate">
                          {c.customerPhone}
                        </span>
                        {cBadge && (
                          <span
                            className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border shrink-0 ${cBadge.className}`}
                          >
                            {cBadge.kind === 'client'
                              ? 'CRM'
                              : cBadge.kind === 'partner'
                                ? 'Facção'
                                : cBadge.kind === 'supplier'
                                  ? 'Forn.'
                                  : 'Lead'}
                          </span>
                        )}
                        {c.unreadCount > 0 && (
                          <span className="ml-auto px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-blue-600 text-white shrink-0">
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
          <div className="flex-1 flex flex-col h-full bg-slate-100/40 min-w-0">
            {/* Topbar da Conversa */}
            <div className="px-5 py-3.5 bg-white border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-10 h-10 rounded-full bg-blue-600 text-white flex items-center justify-center font-bold text-sm shadow-xs shrink-0">
                  {activeConversation.customerName.substring(0, 2).toUpperCase()}
                </div>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-bold text-sm text-slate-900 truncate">
                      {activeConversation.customerName}
                    </h3>
                    {activeBadge && (
                      <span
                        className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full border ${activeBadge.className}`}
                      >
                        {activeBadge.kind === 'client' && <UserCheck className="w-3 h-3" />}
                        {activeBadge.kind === 'partner' && <Handshake className="w-3 h-3" />}
                        {activeBadge.kind === 'supplier' && <Truck className="w-3 h-3" />}
                        {activeBadge.label}
                      </span>
                    )}
                    {activeChannel && (
                      <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200">
                        {activeChannel.provider === 'meta_cloud' ? 'Meta Cloud' : 'WA-AKG'}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 text-xs text-slate-500 mt-0.5 font-mono">
                    <Phone className="w-3 h-3 text-slate-400" />
                    <span>{activeConversation.customerPhone}</span>
                  </div>
                </div>
              </div>

              {/* Status da Conversa + Botões Rápidos Comerciais / Fabris */}
              <div className="flex flex-wrap items-center gap-2">
                <select
                  value={activeConversation.status}
                  disabled={isUpdatingStatus}
                  onChange={(e) => handleUpdateStatus(e.target.value as ConversationStatus)}
                  aria-label="Status da conversa"
                  className={`px-2.5 py-1.5 text-xs font-semibold rounded-lg border focus:outline-hidden focus:ring-2 focus:ring-blue-500 cursor-pointer disabled:opacity-50 ${
                    (STATUS_META[activeConversation.status] || STATUS_META.open).badgeClass
                  }`}
                >
                  <option value="open">Aberta</option>
                  <option value="pending">Aguardando Cliente</option>
                  <option value="resolved">Resolvida</option>
                  <option value="closed">Encerrada</option>
                </select>

                <button
                  type="button"
                  disabled={isSending}
                  onClick={handleSendArtTemplate}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold bg-indigo-50 text-indigo-700 hover:bg-indigo-100 border border-indigo-200 rounded-lg transition-colors disabled:opacity-50 cursor-pointer"
                  title="Enviar solicitação formal de aprovação de arte (com dados reais da OP/Proposta)"
                >
                  <Scissors className="w-3.5 h-3.5" />
                  Cobrar Arte
                </button>

                {erpContext?.activeOrder && (
                  <button
                    type="button"
                    disabled={isSending}
                    onClick={handleSendOrderStageTemplate}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200 rounded-lg transition-colors disabled:opacity-50 cursor-pointer"
                    title={`Notificar cliente sobre etapa atual da ${erpContext.activeOrder.orderNumber}`}
                  >
                    <Factory className="w-3.5 h-3.5" />
                    Avisar OP
                  </button>
                )}

                <button
                  type="button"
                  disabled={isSending}
                  onClick={handleSendDownpaymentReminder}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200 rounded-lg transition-colors disabled:opacity-50 cursor-pointer"
                  title="Enviar dados PIX e lembrete de sinal ou título em aberto"
                >
                  <DollarSign className="w-3.5 h-3.5" />
                  {erpContext?.openReceivable ? 'Cobrar Título' : 'Lembrar Sinal 50%'}
                </button>
              </div>
            </div>

            {/* Faixa de Contexto ERP (quando contato pertence à Carteira CRM) */}
            {erpContext && (
              <div className="px-5 py-2 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-slate-600">
                {erpContext.activeOrder && (
                  <span className="inline-flex items-center gap-1.5">
                    <Factory className="w-3.5 h-3.5 text-blue-600" />
                    <strong className="text-slate-800">{erpContext.activeOrder.orderNumber}</strong>
                    <span>· {getStageLabel(erpContext.activeOrder.stage)}</span>
                    <span className="text-slate-400 font-mono">
                      (Entrega {formatDateBR(erpContext.activeOrder.targetDeliveryDate)})
                    </span>
                  </span>
                )}
                {erpContext.latestQuote && (
                  <span className="inline-flex items-center gap-1.5">
                    <FileText className="w-3.5 h-3.5 text-indigo-600" />
                    <span>
                      Última Proposta: <strong className="text-slate-800">{erpContext.latestQuote.quoteNumber}</strong>{' '}
                      ({formatCurrencyBRL(erpContext.latestQuote.totalAmount)})
                    </span>
                  </span>
                )}
                {erpContext.openReceivable && (
                  <span className="inline-flex items-center gap-1.5 text-amber-800">
                    <DollarSign className="w-3.5 h-3.5 text-amber-600" />
                    <span>
                      Em aberto: <strong>{formatCurrencyBRL(erpContext.openReceivable.amount)}</strong>{' '}
                      (venc. {formatDateBR(erpContext.openReceivable.dueDate)})
                    </span>
                  </span>
                )}
              </div>
            )}

            {/* Linha do Tempo das Mensagens */}
            <div className="flex-1 overflow-y-auto p-5 space-y-3.5">
              {isLoadingMessages ? (
                <div className="flex items-center justify-center gap-2 h-full text-slate-400 text-xs">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Carregando histórico seguro...
                </div>
              ) : messages.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-slate-400 text-xs">
                  <MessageSquare className="w-8 h-8 text-slate-300 mb-2" />
                  Nenhuma mensagem trocada ainda com este contato.
                </div>
              ) : (
                <>
                  {messages.map((m) => {
                    const isOutbound = m.direction === 'outbound';
                    const isFailed = m.status === 'failed';
                    const showImg = isRenderableImage(m.mediaUrl, m.messageType, m.mediaMimeType);
                    return (
                      <div
                        key={m.id}
                        className={`flex flex-col ${isOutbound ? 'items-end' : 'items-start'}`}
                      >
                        <div
                          className={`max-w-[78%] rounded-2xl p-3.5 text-xs shadow-2xs whitespace-pre-wrap leading-relaxed ${
                            isOutbound
                              ? isFailed
                                ? 'bg-rose-600 text-white rounded-br-sm'
                                : 'bg-blue-600 text-white rounded-br-sm'
                              : 'bg-white text-slate-800 border border-slate-200 rounded-bl-sm'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2 mb-1">
                            {!isOutbound && m.senderName && (
                              <p className="text-[10px] font-bold text-blue-600">{m.senderName}</p>
                            )}
                            {isOutbound && m.senderName && (
                              <p className="text-[10px] font-medium text-blue-100/90">{m.senderName}</p>
                            )}
                            {m.messageType === 'template' && (
                              <span
                                className={`inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded ${
                                  isOutbound
                                    ? 'bg-white/15 text-white'
                                    : 'bg-slate-100 text-slate-600'
                                }`}
                              >
                                <FileText className="w-2.5 h-2.5" />
                                Template
                              </span>
                            )}
                          </div>

                          {/* Renderização Segura de Mídia (Imagem ou Documento) */}
                          {m.mediaUrl && (
                            <div className="mb-2">
                              {showImg ? (
                                <a
                                  href={m.mediaUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="block overflow-hidden rounded-lg border border-black/10"
                                >
                                  <img
                                    src={m.mediaUrl}
                                    alt="Anexo enviado no WhatsApp"
                                    className="max-h-52 w-auto object-cover"
                                  />
                                </a>
                              ) : (
                                <div
                                  className={`flex items-center justify-between gap-2 px-2.5 py-2 rounded-lg text-[11px] ${
                                    isOutbound
                                      ? 'bg-white/15 text-white'
                                      : 'bg-slate-100 text-slate-700'
                                  }`}
                                >
                                  <span className="inline-flex items-center gap-1.5 truncate">
                                    <Paperclip className="w-3.5 h-3.5 shrink-0" />
                                    <span className="truncate font-mono">{m.mediaUrl}</span>
                                  </span>
                                  {(m.mediaUrl.startsWith('https://') ||
                                    m.mediaUrl.startsWith('http://') ||
                                    m.mediaUrl.startsWith('/uploads/')) && (
                                    <a
                                      href={m.mediaUrl}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="shrink-0 underline font-semibold inline-flex items-center gap-0.5"
                                    >
                                      Abrir
                                      <ExternalLink className="w-3 h-3" />
                                    </a>
                                  )}
                                </div>
                              )}
                            </div>
                          )}

                          <p className="break-words">{m.body}</p>

                          {isFailed && (
                            <div className="mt-2 pt-1.5 border-t border-rose-400/40 flex items-center justify-between gap-2 text-[10px] text-rose-100">
                              <span className="flex items-center gap-1">
                                <AlertCircle className="w-3 h-3 shrink-0" />
                                <span>Falha no envio: {m.errorMessage || 'erro no provedor'}</span>
                              </span>
                              <button
                                type="button"
                                disabled={isSending}
                                onClick={() =>
                                  dispatchMessage(
                                    m.body,
                                    m.messageType === 'audio' ? 'text' : m.messageType,
                                    false,
                                    m.mediaUrl
                                  )
                                }
                                className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-white/20 hover:bg-white/30 text-white font-semibold shrink-0 cursor-pointer"
                              >
                                <RotateCw className="w-2.5 h-2.5" />
                                Reenviar
                              </button>
                            </div>
                          )}

                          <div
                            className={`flex items-center justify-end gap-1 text-[10px] mt-1.5 ${
                              isOutbound
                                ? isFailed
                                  ? 'text-rose-100'
                                  : 'text-blue-100'
                                : 'text-slate-400'
                            }`}
                          >
                            <span className="font-mono">
                              {new Date(m.createdAt).toLocaleTimeString('pt-BR', {
                                hour: '2-digit',
                                minute: '2-digit',
                              })}
                            </span>
                            {isOutbound && (
                              <>
                                {m.status === 'failed' && (
                                  <span title="Falha no envio">
                                    <AlertCircle className="w-3.5 h-3.5 text-amber-200" />
                                  </span>
                                )}
                                {m.status === 'pending' && (
                                  <span title="Aguardando envio">
                                    <Clock className="w-3 h-3 text-blue-200" />
                                  </span>
                                )}
                                {m.status === 'sent' && (
                                  <span title="Enviada">
                                    <Check className="w-3.5 h-3.5 text-blue-200" />
                                  </span>
                                )}
                                {m.status === 'delivered' && (
                                  <span title="Entregue">
                                    <CheckCheck className="w-3.5 h-3.5 text-blue-200" />
                                  </span>
                                )}
                                {m.status === 'read' && (
                                  <span title="Lida pelo cliente">
                                    <CheckCheck className="w-3.5 h-3.5 text-sky-200" />
                                  </span>
                                )}
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  <div ref={messagesEndRef} />
                </>
              )}
            </div>

            {/* Barra Opcional de Anexo (Arte / Proposta / Comprovante) */}
            {showAttachmentBar && (
              <div className="px-4 py-2.5 bg-slate-50 border-t border-slate-200 flex flex-wrap items-center gap-2 text-xs">
                <select
                  value={attachmentType}
                  onChange={(e) => setAttachmentType(e.target.value as 'image' | 'document')}
                  className="px-2.5 py-1.5 border border-slate-300 rounded-lg bg-white text-slate-700 font-medium"
                  aria-label="Tipo de anexo"
                >
                  <option value="document">Documento / PDF</option>
                  <option value="image">Imagem / Layout</option>
                </select>
                <input
                  type="text"
                  value={attachmentUrl}
                  onChange={(e) => setAttachmentUrl(e.target.value)}
                  placeholder="URL pública https://..., /uploads/... ou s3://..."
                  className="flex-1 min-w-[220px] px-3 py-1.5 border border-slate-300 rounded-lg bg-white text-slate-800 font-mono text-[11px]"
                />
                <button
                  type="button"
                  onClick={() => {
                    setAttachmentUrl('');
                    setShowAttachmentBar(false);
                  }}
                  className="p-1 text-slate-400 hover:text-slate-700 cursor-pointer"
                  title="Remover anexo"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}

            {/* Formulário de Envio */}
            <form
              onSubmit={handleSendMessage}
              className="p-3.5 bg-white border-t border-slate-200 flex items-center gap-2"
            >
              <button
                type="button"
                onClick={() => setShowAttachmentBar((prev) => !prev)}
                className={`p-2 rounded-xl border transition-colors cursor-pointer ${
                  showAttachmentBar
                    ? 'bg-blue-50 border-blue-300 text-blue-600'
                    : 'bg-slate-50 border-slate-200 text-slate-500 hover:text-slate-800'
                }`}
                title="Anexar link de arte, proposta PDF ou comprovante"
              >
                {attachmentType === 'image' && showAttachmentBar ? (
                  <ImageIcon className="w-4 h-4" />
                ) : (
                  <Paperclip className="w-4 h-4" />
                )}
              </button>
              <input
                type="text"
                maxLength={4096}
                disabled={isSending}
                placeholder="Escreva uma mensagem no WhatsApp do contato..."
                value={inputMessage}
                onChange={(e) => setInputMessage(e.target.value)}
                className="flex-1 px-4 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:border-blue-500 focus:outline-hidden transition-colors disabled:opacity-60"
              />
              <button
                type="submit"
                disabled={!inputMessage.trim() || isSending}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-semibold rounded-xl inline-flex items-center gap-1.5 transition-colors shadow-xs cursor-pointer"
              >
                {isSending ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Send className="w-3.5 h-3.5" />
                )}
                Enviar
              </button>
            </form>
          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-slate-400 text-sm gap-3">
            <MessageSquare className="w-12 h-12 text-slate-300" />
            <p>Selecione uma conversa ao lado para visualizar e responder no WhatsApp.</p>
            <button
              type="button"
              onClick={handleOpenNewChatModal}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-lg transition-colors cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              Iniciar Nova Conversa
            </button>
          </div>
        )}
      </div>

      {/* Modal Diagnóstico, Webhook & Conexão do Canal (Meta Cloud & WA-AKG) */}
      {isChannelModalOpen && selectedChannel && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-xl border border-slate-200 max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                {selectedChannel.provider === 'wa_akg' ? (
                  <QrCode className="w-5 h-5 text-blue-600" />
                ) : (
                  <Radio className="w-5 h-5 text-blue-600" />
                )}
                <div>
                  <h3 className="font-bold text-sm text-slate-900">
                    {selectedChannel.provider === 'meta_cloud'
                      ? 'Meta WhatsApp Business Cloud API'
                      : 'Conexão WhatsApp QR Code (WA-AKG)'}
                  </h3>
                  <p className="text-[11px] text-slate-500 font-mono">{selectedChannel.phoneNumber}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsChannelModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded cursor-pointer"
                aria-label="Fechar diagnóstico do canal"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="py-4 space-y-4">
              {/* Status e Diagnóstico Técnico */}
              <div className="grid grid-cols-2 gap-2.5 text-xs">
                <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                  <div className="text-[10px] font-bold uppercase text-slate-500">Modo de Disparo</div>
                  <div className="mt-1 font-bold flex items-center gap-1.5">
                    {selectedChannel.diagnostics?.configured ? (
                      <>
                        <Wifi className="w-3.5 h-3.5 text-emerald-600" />
                        <span className="text-emerald-700">Live (Produção)</span>
                      </>
                    ) : (
                      <>
                        <WifiOff className="w-3.5 h-3.5 text-amber-600" />
                        <span className="text-amber-700">Sandbox Local</span>
                      </>
                    )}
                  </div>
                </div>

                <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                  <div className="text-[10px] font-bold uppercase text-slate-500">Assinatura Webhook</div>
                  <div className="mt-1 font-bold flex items-center gap-1.5">
                    {selectedChannel.diagnostics?.hasWebhookSecret ? (
                      <>
                        <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                        <span className="text-emerald-700">
                          {selectedChannel.provider === 'meta_cloud' ? 'HMAC-SHA256 Ativo' : 'API Key Ativa'}
                        </span>
                      </>
                    ) : (
                      <>
                        <ShieldAlert className="w-3.5 h-3.5 text-amber-600" />
                        <span className="text-amber-700">Chave Pendente</span>
                      </>
                    )}
                  </div>
                </div>
              </div>

              {selectedChannel.diagnostics?.webhookPath && (
                <div className="p-3 rounded-xl bg-slate-900 text-slate-100 text-[11px] font-mono">
                  <div className="text-[10px] uppercase text-slate-400 font-sans font-bold mb-1">
                    Endpoint Webhook Assinado
                  </div>
                  <div className="break-all">{selectedChannel.diagnostics.webhookPath}</div>
                </div>
              )}

              {selectedChannel.diagnostics && selectedChannel.diagnostics.missingEnvVars.length > 0 && (
                <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-900">
                  <div className="font-bold mb-1">Variáveis de ambiente ausentes para modo Live:</div>
                  <div className="flex flex-wrap gap-1.5 mt-1">
                    {selectedChannel.diagnostics.missingEnvVars.map((envVar) => (
                      <code
                        key={envVar}
                        className="px-2 py-0.5 rounded bg-amber-100 border border-amber-300 text-[11px] font-mono text-amber-950"
                      >
                        {envVar}
                      </code>
                    ))}
                  </div>
                </div>
              )}

              {/* Área QR Code (apenas para WA-AKG) */}
              {selectedChannel.provider === 'wa_akg' && (
                <div className="pt-2 flex flex-col items-center text-center">
                  <div className="p-3 bg-white border border-slate-200 rounded-xl shadow-xs mb-3 w-52 h-52 flex items-center justify-center">
                    {isLoadingQr ? (
                      <div className="flex flex-col items-center gap-2 text-slate-400 text-xs">
                        <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
                        <span>Gerando QR seguro...</span>
                      </div>
                    ) : qrPayload?.qrCode ? (
                      <img
                        src={qrPayload.qrCode}
                        alt="QR Code WhatsApp WA-AKG"
                        className="w-44 h-44 rounded-lg object-contain"
                      />
                    ) : (
                      <div className="text-xs text-rose-500">QR Code indisponível no momento.</div>
                    )}
                  </div>

                  {qrPayload && (
                    <span
                      className={`mb-2 text-[11px] font-semibold px-2.5 py-0.5 rounded-full border ${
                        qrPayload.mode === 'live'
                          ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                          : 'bg-amber-50 text-amber-700 border-amber-200'
                      }`}
                    >
                      {qrPayload.mode === 'live'
                        ? 'QR Code em Tempo Real (Container WA-AKG)'
                        : 'Preview Local — Configure WA_AKG_ENDPOINT para pareamento real'}
                    </span>
                  )}

                  <p className="text-[11px] text-slate-500">
                    No celular corporativo da DE FARDAS: Aparelhos Conectados &gt; Conectar um aparelho.
                  </p>
                </div>
              )}

              <div className="flex items-center gap-2 text-[11px] text-emerald-700 bg-emerald-50 px-3 py-2 rounded-lg border border-emerald-200">
                <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>
                  Credenciais e tokens residem exclusivamente no servidor (env vars); nunca são expostos no navegador.
                </span>
              </div>
            </div>

            <div className="flex gap-2 pt-3 border-t border-slate-100">
              {canManageChannels ? (
                <button
                  type="button"
                  disabled={isReconnecting}
                  onClick={handleReconnectChannel}
                  className="flex-1 py-2 bg-blue-600 text-white rounded-xl text-xs font-semibold hover:bg-blue-700 disabled:opacity-50 transition-colors inline-flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  {isReconnecting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  Testar & Reconectar Canal
                </button>
              ) : (
                <div className="flex-1 py-2 px-3 bg-slate-50 border border-slate-200 rounded-xl text-[11px] text-slate-500 text-center">
                  Reconexão restrita a Admin / Gerência Comercial
                </div>
              )}
              <button
                type="button"
                onClick={() => setIsChannelModalOpen(false)}
                className="px-4 py-2 bg-slate-100 text-slate-700 rounded-xl text-xs font-semibold hover:bg-slate-200 transition-colors cursor-pointer"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Nova Conversa WhatsApp (Cliente, Parceiro, Fornecedor ou Manual) */}
      {isNewChatModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4">
          <form
            onSubmit={handleCreateConversation}
            className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl border border-slate-200 space-y-4"
          >
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <MessageSquare className="w-5 h-5 text-blue-600" />
                <h3 className="font-bold text-sm text-slate-900">Iniciar Nova Conversa WhatsApp</h3>
              </div>
              <button
                type="button"
                onClick={() => setIsNewChatModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded cursor-pointer"
                aria-label="Fechar modal"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Tipo de Contato */}
            <div className="grid grid-cols-4 gap-1.5">
              {(
                [
                  { id: 'client', label: 'Cliente' },
                  { id: 'partner', label: 'Parceiro' },
                  { id: 'supplier', label: 'Fornecedor' },
                  { id: 'manual', label: 'Avulso' },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => {
                    setNewChatEntityType(tab.id);
                    setNewChatClientId('');
                  }}
                  className={`py-1.5 text-[11px] font-semibold rounded-lg border transition-colors cursor-pointer ${
                    newChatEntityType === tab.id
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {newChatEntityType === 'client' && clients.length > 0 && (
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Selecionar Cliente da Carteira
                </label>
                <select
                  value={newChatClientId}
                  onChange={(e) => handleSelectEntityForNewChat(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs text-slate-900 bg-white focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
                >
                  <option value="">-- Selecione um cliente --</option>
                  {clients.map((cl) => (
                    <option key={cl.id} value={cl.id}>
                      {cl.companyName || cl.tradeName} ({cl.phone || 'sem telefone'})
                    </option>
                  ))}
                </select>
              </div>
            )}

            {newChatEntityType === 'partner' && partners.length > 0 && (
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Selecionar Parceiro / Facção
                </label>
                <select
                  value={newChatClientId}
                  onChange={(e) => handleSelectEntityForNewChat(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs text-slate-900 bg-white focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
                >
                  <option value="">-- Selecione um parceiro --</option>
                  {partners.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.tradeName} ({p.code}) — {p.phone || 'sem telefone'}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {newChatEntityType === 'supplier' && suppliers.length > 0 && (
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Selecionar Fornecedor de Insumos
                </label>
                <select
                  value={newChatClientId}
                  onChange={(e) => handleSelectEntityForNewChat(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs text-slate-900 bg-white focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
                >
                  <option value="">-- Selecione um fornecedor --</option>
                  {suppliers.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.tradeName} ({s.code}) — {s.phone || 'sem telefone'}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Nome do Contato / Empresa
              </label>
              <input
                type="text"
                value={newChatName}
                onChange={(e) => setNewChatName(e.target.value)}
                placeholder="Ex.: Construtora Maranhão Ltda"
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs text-slate-900 focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Número WhatsApp (com DDD) *
              </label>
              <PhoneInputBR
                value={newChatPhone}
                onChange={setNewChatPhone}
                required
                placeholder="(98) 98800-0000"
              />
              <p className="text-[11px] text-slate-400 mt-1">
                O DDI +55 é normalizado automaticamente para evitar conversas duplicadas.
              </p>
            </div>

            {channels.length > 0 && (
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Canal de Disparo
                </label>
                <select
                  value={newChatChannelId}
                  onChange={(e) => setNewChatChannelId(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs text-slate-900 bg-white focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
                >
                  {channels.map((ch) => (
                    <option key={ch.id} value={ch.id}>
                      {ch.provider === 'meta_cloud' ? 'Meta Cloud (Oficial)' : 'WA-AKG (QR Code)'} —{' '}
                      {ch.phoneNumber}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className="flex gap-2 pt-3 border-t border-slate-100">
              <button
                type="submit"
                disabled={isCreatingChat}
                className="flex-1 py-2 bg-blue-600 text-white rounded-xl text-xs font-semibold hover:bg-blue-700 disabled:opacity-50 transition-colors inline-flex items-center justify-center gap-1.5 cursor-pointer"
              >
                {isCreatingChat && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                Abrir Conversa
              </button>
              <button
                type="button"
                onClick={() => setIsNewChatModalOpen(false)}
                className="px-4 py-2 bg-slate-100 text-slate-700 rounded-xl text-xs font-semibold hover:bg-slate-200 transition-colors cursor-pointer"
              >
                Cancelar
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
