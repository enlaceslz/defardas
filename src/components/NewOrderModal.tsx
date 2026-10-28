import React, { useState } from 'react';
import { X } from 'lucide-react';
import type { ProductionOrder, Client } from '../types/erp';
import { useSubmission } from '../api/useSubmission';
interface Props {
  clients: Client[];
  existingOrder?: ProductionOrder | null;
  onClose: () => void;
  onSaveOrder: (order: ProductionOrder) => Promise<boolean>;
}
export const NewOrderModal: React.FC<Props> = ({ existingOrder: order, onClose, onSaveOrder }) => {
  const [priority, setPriority] = useState(order?.priority || 'normal');
  const [delivery, setDelivery] = useState(order?.targetDeliveryDate || '');
  const [notes, setNotes] = useState(order?.technicalNotes || '');
  const [team, setTeam] = useState(order?.assignedTeam || '');
  const [partner, setPartner] = useState(order?.outsourcedPartner || '');
  const [partnerCost, setPartnerCost] = useState(order?.partnerCostPerPiece ?? 0);
  const { submit, isSaving } = useSubmission();
  if (!order) return null;
  const field = 'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm';
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
    <div role="dialog" aria-modal="true" aria-label="Editar ficha de produção" className="w-full max-w-2xl rounded-xl bg-white shadow-xl">
      <div className="flex items-center justify-between rounded-t-xl bg-slate-900 p-5 text-white">
        <h2 className="font-bold">Editar ficha {order.id}</h2>
        <button type="button" onClick={onClose} aria-label="Fechar"><X className="h-5 w-5" /></button>
      </div>
      <form className="space-y-4 p-6" onSubmit={async (event) => {
        event.preventDefault();
        if (await submit(() => onSaveOrder({ ...order, priority, targetDeliveryDate: delivery, technicalNotes: notes,
          assignedTeam: team, outsourcedPartner: partner, partnerCostPerPiece: partnerCost }))) onClose();
      }}>
        <p className="text-sm text-slate-600">{order.clientName} · {order.itemTitle} · {order.totalPieces} peças</p>
        <p className="text-xs text-slate-500">Grade e modelo seguem a proposta aprovada. Sinal, aprovação de arte e etapa possuem ações próprias.</p>
        <div className="grid grid-cols-2 gap-4">
          <label className="space-y-1 text-sm">Prioridade<select className={field} value={priority} onChange={(e) => setPriority(e.target.value as typeof priority)}>
            <option value="normal">Normal</option><option value="alta">Alta</option><option value="urgente">Urgente</option>
          </select></label>
          <label className="space-y-1 text-sm">Data de entrega<input required type="date" className={field} value={delivery} onChange={(e) => setDelivery(e.target.value)} /></label>
        </div>
        <label className="block space-y-1 text-sm">Equipe<input className={field} maxLength={100} value={team} onChange={(e) => setTeam(e.target.value)} /></label>
        <label className="block space-y-1 text-sm">Facção<input className={field} maxLength={100} value={partner} onChange={(e) => setPartner(e.target.value)} /></label>
        <label className="block space-y-1 text-sm">Custo da facção por peça<input type="number" min="0" step="0.01" className={field} value={partnerCost} onChange={(e) => setPartnerCost(Number(e.target.value))} /></label>
        <label className="block space-y-1 text-sm">Orientações técnicas<textarea className={field} rows={3} maxLength={10000} value={notes} onChange={(e) => setNotes(e.target.value)} /></label>
        <div className="flex justify-end gap-3"><button type="button" onClick={onClose} className="rounded-lg border px-4 py-2">Cancelar</button>
          <button disabled={isSaving} type="submit" className="rounded-lg bg-blue-600 px-4 py-2 text-white disabled:opacity-50">{isSaving ? 'Salvando...' : 'Salvar alterações'}</button></div>
      </form>
    </div>
  </div>;
};
