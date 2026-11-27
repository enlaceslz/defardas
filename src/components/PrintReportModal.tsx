import React, { useMemo, useState } from 'react';
import {
  X,
  Printer,
  BarChart3,
  Wallet,
  Share2,
  Download,
  FileSpreadsheet,
} from 'lucide-react';
import {
  Client,
  CompanyProfile,
  FinancialTransaction,
  InventoryItem,
  Partner,
  ProductionOrder,
  Quote,
  ReportSnapshot,
  Supplier,
} from '../types/erp';
import { DEFAULT_BRAND_LOGO_URL } from '../data/initialData';
import {
  buildReportSnapshot,
  createDefaultReportFilters,
  downloadSnapshotAsCsv,
} from '../utils/reportBuilder';
import { useAuth } from '../api/authContext';
import { WhatsAppReportShareModal } from './WhatsAppReportShareModal';

interface PrintReportModalProps {
  /** Snapshot completo gerado pelo módulo de Relatórios */
  snapshot?: ReportSnapshot;
  /** Modo simplificado legado (Painel Executivo / Financeiro) */
  mode?: 'executive' | 'financial';
  profile: CompanyProfile;
  orders?: ProductionOrder[];
  quotes?: Quote[];
  inventory?: InventoryItem[];
  transactions?: FinancialTransaction[];
  clients?: Client[];
  partners?: Partner[];
  suppliers?: Supplier[];
  filterSummary?: string;
  generatedBy?: string;
  onSendViaCentralWhatsApp?: (
    phone: string,
    recipientName: string,
    message: string
  ) => Promise<void> | void;
  onClose: () => void;
}

const KPI_TONE_STYLES: Record<string, string> = {
  neutral: 'text-zinc-900',
  crimson: 'text-[#C8102E]',
  emerald: 'text-emerald-700',
  amber: 'text-amber-700',
  rose: 'text-rose-700',
};

export const PrintReportModal: React.FC<PrintReportModalProps> = ({
  snapshot: externalSnapshot,
  mode = 'executive',
  profile,
  orders = [],
  quotes = [],
  inventory = [],
  transactions = [],
  clients = [],
  partners = [],
  suppliers = [],
  filterSummary,
  generatedBy,
  onSendViaCentralWhatsApp,
  onClose,
}) => {
  const { user } = useAuth();
  const role = user?.role || '';
  const canViewFinance = ['admin', 'financeiro', 'gerente_comercial'].includes(role);
  const canViewQuotes = ['admin', 'gerente_comercial', 'vendedor', 'financeiro'].includes(role);
  const canViewWhatsApp = ['admin', 'gerente_comercial', 'vendedor', 'financeiro'].includes(role);

  const [isShareOpen, setIsShareOpen] = useState(false);

  const snapshot = useMemo<ReportSnapshot>(() => {
    if (externalSnapshot) return externalSnapshot;

    const filters = createDefaultReportFilters(mode === 'financial' ? 'financeiro' : 'executivo');
    const built = buildReportSnapshot(
      filters,
      {
        profile,
        orders,
        quotes,
        inventory,
        movements: [],
        transactions,
        clients,
        leads: [],
        partners,
        partnerCustody: [],
        partnerForecast: null,
        suppliers,
        purchaseOrders: [],
      },
      {
        canViewFinance,
        canViewQuotes,
        canViewLeads: false,
        canViewPartners: false,
        canViewSuppliers: false,
        canViewWhatsApp,
      },
      generatedBy || user?.fullName || 'Usuário ERP'
    );

    if (filterSummary) {
      built.filterSummary = filterSummary;
    }
    return built;
  }, [
    externalSnapshot,
    mode,
    profile,
    orders,
    quotes,
    inventory,
    transactions,
    clients,
    partners,
    suppliers,
    filterSummary,
    generatedBy,
    user?.fullName,
    canViewFinance,
    canViewQuotes,
    canViewWhatsApp,
  ]);

  const generatedDateObj = new Date(snapshot.generatedAt);
  const generatedDate = generatedDateObj.toLocaleDateString('pt-BR');
  const generatedTime = generatedDateObj.toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/65 backdrop-blur-xs flex items-start justify-center p-2 sm:p-4 print-modal-root">
      <div className="bg-white rounded-2xl shadow-2xl max-w-5xl w-full overflow-hidden border border-zinc-200 my-2 sm:my-4 print-modal-card">
        {/* Toolbar (hidden when printing) */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-5 py-3.5 bg-[#111113] text-white no-print">
          <div className="flex items-center gap-2.5 min-w-0">
            {snapshot.reportType === 'financeiro' ? (
              <Wallet className="w-4 h-4 text-emerald-400 shrink-0" />
            ) : (
              <BarChart3 className="w-4 h-4 text-[#E3263E] shrink-0" />
            )}
            <span className="text-xs sm:text-sm font-bold truncate">{snapshot.title}</span>
            <span className="hidden md:inline text-[11px] text-zinc-400 font-mono shrink-0">
              [{snapshot.reportCode}]
            </span>
          </div>

          <div className="flex items-center gap-2 flex-wrap justify-end shrink-0">
            <button
              type="button"
              onClick={() => downloadSnapshotAsCsv(snapshot)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-zinc-200 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 rounded-lg transition-colors cursor-pointer whitespace-nowrap"
              title="Baixar planilha CSV compatível com Excel"
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">CSV</span>
            </button>

            <button
              type="button"
              onClick={() => setIsShareOpen(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-500 rounded-lg shadow-xs transition-colors cursor-pointer whitespace-nowrap"
            >
              <Share2 className="w-3.5 h-3.5" />
              <span>Link WhatsApp</span>
            </button>

            <button
              type="button"
              onClick={() => window.print()}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-zinc-900 bg-white hover:bg-zinc-100 rounded-lg shadow-sm transition-colors cursor-pointer whitespace-nowrap"
            >
              <Printer className="w-3.5 h-3.5 text-[#C8102E]" />
              <span>Imprimir / PDF (Ctrl+P)</span>
            </button>

            <button
              type="button"
              onClick={onClose}
              className="p-1.5 text-zinc-400 hover:text-white rounded-lg transition-colors cursor-pointer"
              aria-label="Fechar pré-visualização do relatório"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Printable A4 Report Page */}
        <div className="p-6 sm:p-10 space-y-6 text-zinc-900 bg-white print-page text-xs">
          {/* Institutional Letterhead with Official DE FARDAS Logo */}
          <div className="flex flex-col sm:flex-row sm:items-start justify-between border-b-2 border-[#111113] pb-5 gap-4 print-avoid-break">
            <div className="flex items-start gap-4">
              <div className="shrink-0 flex items-center justify-center bg-white border border-zinc-200 rounded-xl p-2 max-w-[140px] max-h-[76px]">
                <img
                  src={snapshot.company.logoUrl || DEFAULT_BRAND_LOGO_URL}
                  alt={`Logomarca ${snapshot.company.tradeName}`}
                  className="max-h-14 max-w-[124px] w-auto object-contain"
                />
              </div>
              <div>
                <div className="text-xl font-black tracking-tight text-zinc-950">
                  {snapshot.company.tradeName}
                </div>
                <div className="text-[11px] text-zinc-600 font-mono mt-0.5">
                  {snapshot.company.name} · CNPJ: {snapshot.company.cnpj}
                  {snapshot.company.ie ? ` · I.E.: ${snapshot.company.ie}` : ''}
                </div>
                <div className="text-[11px] text-zinc-500 mt-0.5">
                  {snapshot.company.address}
                  {snapshot.company.neighborhood ? ` - ${snapshot.company.neighborhood}` : ''},{' '}
                  {snapshot.company.city}/{snapshot.company.state} · CEP: {snapshot.company.cep}
                </div>
                <div className="text-[11px] text-zinc-500 mt-0.5">
                  Tel/WhatsApp: {snapshot.company.phone} · E-mail: {snapshot.company.email}
                </div>
              </div>
            </div>

            <div className="text-left sm:text-right shrink-0 sm:max-w-[320px]">
              <div className="inline-block px-2 py-0.5 rounded bg-[#111113] text-white text-[10px] font-bold uppercase tracking-wider">
                Relatório Oficial Auditável
              </div>
              <div className="text-base sm:text-lg font-black text-[#C8102E] mt-1 leading-tight">
                {snapshot.title}
              </div>
              <div className="text-[11px] text-zinc-600 font-mono mt-1 tabular-nums">
                Código: {snapshot.reportCode} · {generatedDate} às {generatedTime}
              </div>
              {snapshot.generatedBy && (
                <div className="text-[11px] text-zinc-500 mt-0.5">
                  Emitido por: <span className="font-semibold text-zinc-800">{snapshot.generatedBy}</span>
                </div>
              )}
            </div>
          </div>

          {/* Filter Scope Banner */}
          <div className="px-3.5 py-2.5 bg-zinc-50 border border-zinc-200 rounded-xl text-[11px] text-zinc-600 print-avoid-break">
            <strong className="text-zinc-900">Escopo &amp; Filtros Aplicados:</strong>{' '}
            {snapshot.filterSummary || 'Todos os registros'}
          </div>

          {/* KPI Cards */}
          {snapshot.kpis.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 print-avoid-break">
              {snapshot.kpis.map((kpi, idx) => (
                <div key={idx} className="p-3.5 bg-zinc-50/90 border border-zinc-200 rounded-xl">
                  <div className="text-[11px] text-zinc-500 font-semibold">{kpi.label}</div>
                  <div
                    className={`text-base font-black font-mono tabular-nums mt-1 ${
                      KPI_TONE_STYLES[kpi.tone || 'neutral'] || 'text-zinc-900'
                    }`}
                  >
                    {kpi.value}
                  </div>
                  {kpi.sublabel && (
                    <div className="text-[10px] text-zinc-500 mt-0.5 leading-snug">{kpi.sublabel}</div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Sections & Tables */}
          {snapshot.sections.map((section) => (
            <div key={section.id} className="border border-zinc-200 rounded-xl overflow-hidden">
              <div className="bg-zinc-100 px-4 py-2.5 font-bold uppercase tracking-wider text-[11px] text-zinc-800 border-b border-zinc-200 flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                <span>{section.title}</span>
                {section.summaryRight && (
                  <span className="font-mono text-zinc-700 normal-case">{section.summaryRight}</span>
                )}
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-[11px]">
                  <thead>
                    <tr className="bg-zinc-50 border-b border-zinc-200 text-zinc-600 font-bold">
                      {section.columns.map((col) => (
                        <th
                          key={col.key}
                          className={`py-2 px-3 ${
                            col.align === 'right'
                              ? 'text-right'
                              : col.align === 'center'
                                ? 'text-center'
                                : 'text-left'
                          }`}
                        >
                          {col.label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-200">
                    {section.rows.length === 0 ? (
                      <tr>
                        <td
                          colSpan={section.columns.length}
                          className="py-6 text-center text-zinc-400"
                        >
                          {section.emptyMessage || 'Nenhum registro neste escopo.'}
                        </td>
                      </tr>
                    ) : (
                      section.rows.map((row, rowIdx) => (
                        <tr key={rowIdx} className="hover:bg-zinc-50/70">
                          {section.columns.map((col) => (
                            <td
                              key={col.key}
                              className={`py-2 px-3 align-top ${
                                col.align === 'right'
                                  ? 'text-right'
                                  : col.align === 'center'
                                    ? 'text-center'
                                    : 'text-left'
                              } ${col.mono ? 'font-mono tabular-nums' : ''}`}
                            >
                              {row[col.key] ?? '-'}
                            </td>
                          ))}
                        </tr>
                      ))
                    )}
                    {section.totalsRow && section.rows.length > 0 && (
                      <tr className="bg-zinc-100/90 border-t-2 border-zinc-300 font-bold text-zinc-950">
                        {section.columns.map((col) => (
                          <td
                            key={col.key}
                            className={`py-2.5 px-3 ${
                              col.align === 'right'
                                ? 'text-right'
                                : col.align === 'center'
                                  ? 'text-center'
                                  : 'text-left'
                            } ${col.mono ? 'font-mono tabular-nums' : ''}`}
                          >
                            {section.totalsRow?.[col.key] ?? ''}
                          </td>
                        ))}
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          ))}

          {/* Institutional Footer */}
          <div className="pt-4 border-t border-zinc-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-[11px] text-zinc-500 print-avoid-break">
            <span>
              Documento gerado pelo sistema ERP {snapshot.company.tradeName} · {snapshot.company.city}/
              {snapshot.company.state}
            </span>
            <span className="font-mono tabular-nums">
              {snapshot.reportCode} · {generatedDate} {generatedTime}
            </span>
          </div>
        </div>
      </div>

      {isShareOpen && (
        <WhatsAppReportShareModal
          snapshot={snapshot}
          clients={clients}
          partners={partners}
          suppliers={suppliers}
          canSendViaCentral={canViewWhatsApp}
          onSendViaCentralWhatsApp={onSendViaCentralWhatsApp}
          onClose={() => setIsShareOpen(false)}
        />
      )}
    </div>
  );
};
