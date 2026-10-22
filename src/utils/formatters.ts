import { OperationalStage, SizeGrid, FinancialOrderStatus, CommercialStatus } from '../types/erp';

export function formatCurrencyBRL(value: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(value);
}

export function formatDateBR(dateString?: string): string {
  if (!dateString) return '-';
  const parts = dateString.split('-');
  if (parts.length === 3) {
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  }
  return dateString;
}

export function getTotalFromSizeGrid(sizes?: SizeGrid): number {
  if (!sizes) return 0;
  return (
    (Number(sizes.pp) || 0) +
    (Number(sizes.p) || 0) +
    (Number(sizes.m) || 0) +
    (Number(sizes.g) || 0) +
    (Number(sizes.gg) || 0) +
    (Number(sizes.xg) || 0) +
    (Number(sizes.exg) || 0) +
    (Number(sizes.sobMedida) || 0)
  );
}

export function getStageLabel(stage: OperationalStage): string {
  switch (stage) {
    case 'aguardando_liberacao':
      return 'Bloqueado (Aguardando Sinal/Arte)';
    case 'corte':
      return '1. Corte & Enfesto';
    case 'bordado_silk':
      return '2. Bordado & Silk (Parceiro)';
    case 'costura':
      return '3. Costura & Montagem';
    case 'conferencia_qualidade':
      return '4. Inspeção de Qualidade';
    case 'retrabalho':
      return '4b. Retrabalho / Ocorrência';
    case 'expedicao':
      return '5. Embalagem & Expedição';
    case 'entregue':
      return 'Concluído / Entregue';
    default:
      return stage;
  }
}

export function getStageColor(stage: OperationalStage): { text: string; bg: string; border: string } {
  switch (stage) {
    case 'aguardando_liberacao':
      return { text: 'text-rose-700', bg: 'bg-rose-50', border: 'border-rose-200' };
    case 'corte':
      return { text: 'text-amber-700', bg: 'bg-amber-50', border: 'border-amber-200' };
    case 'bordado_silk':
      return { text: 'text-indigo-700', bg: 'bg-indigo-50', border: 'border-indigo-200' };
    case 'costura':
      return { text: 'text-blue-700', bg: 'bg-blue-50', border: 'border-blue-200' };
    case 'conferencia_qualidade':
      return { text: 'text-purple-700', bg: 'bg-purple-50', border: 'border-purple-200' };
    case 'retrabalho':
      return { text: 'text-amber-800', bg: 'bg-amber-100', border: 'border-amber-300' };
    case 'expedicao':
      return { text: 'text-emerald-700', bg: 'bg-emerald-50', border: 'border-emerald-200' };
    case 'entregue':
      return { text: 'text-slate-700', bg: 'bg-slate-100', border: 'border-slate-300' };
    default:
      return { text: 'text-slate-700', bg: 'bg-slate-50', border: 'border-slate-200' };
  }
}

export function getCommercialStatusBadge(status: CommercialStatus): { label: string; text: string; bg: string } {
  switch (status) {
    case 'aprovado':
      return { label: 'Comercialmente Aprovado', text: 'text-emerald-700', bg: 'bg-emerald-50 border-emerald-200' };
    case 'convertido_em_pedido':
      return { label: 'Convertido em OP (Idempotente)', text: 'text-blue-700', bg: 'bg-blue-50 border-blue-200' };
    case 'enviado':
      return { label: 'Enviado / Em Negociação', text: 'text-amber-700', bg: 'bg-amber-50 border-amber-200' };
    case 'recusado':
      return { label: 'Recusado', text: 'text-rose-700', bg: 'bg-rose-50 border-rose-200' };
    case 'cancelado':
      return { label: 'Cancelado (Auditado)', text: 'text-slate-600', bg: 'bg-slate-100 border-slate-200' };
    default:
      return { label: 'Rascunho', text: 'text-slate-600', bg: 'bg-slate-50 border-slate-200' };
  }
}

export function getFinancialStatusBadge(status: FinancialOrderStatus): { label: string; text: string; bg: string } {
  switch (status) {
    case 'entrada_confirmada':
      return { label: 'Sinal 50% Confirmado (Comprovante)', text: 'text-emerald-700', bg: 'bg-emerald-50 border-emerald-200' };
    case 'entrada_pendente':
      return { label: 'Entrada Pendente (Produção Bloqueada)', text: 'text-rose-700', bg: 'bg-rose-50 border-rose-200' };
    case 'saldo_em_aberto':
      return { label: 'Saldo Vencimento Entrega', text: 'text-amber-700', bg: 'bg-amber-50 border-amber-200' };
    case 'quitado':
      return { label: 'Totalmente Quitado', text: 'text-blue-700', bg: 'bg-blue-50 border-blue-200' };
    default:
      return { label: status, text: 'text-slate-700', bg: 'bg-slate-50 border-slate-200' };
  }
}

export function getPriorityBadge(priority: string): { label: string; text: string; bg: string } {
  switch (priority) {
    case 'urgente':
      return { label: 'Urgente', text: 'text-rose-700', bg: 'bg-rose-50 border-rose-200' };
    case 'alta':
      return { label: 'Alta Prioridade', text: 'text-amber-700', bg: 'bg-amber-50 border-amber-200' };
    default:
      return { label: 'Normal', text: 'text-slate-600', bg: 'bg-slate-100 border-slate-200' };
  }
}
