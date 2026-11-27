import React, { useEffect, useState } from 'react';
import {
  Printer,
  ShieldCheck,
  AlertTriangle,
  Clock,
  LogIn,
  FileSpreadsheet,
  Eye,
} from 'lucide-react';
import { api } from '../api/client';
import { SharedReportPublicPayload } from '../types/erp';
import { DEFAULT_BRAND_LOGO_URL } from '../data/initialData';
import { downloadSnapshotAsCsv } from '../utils/reportBuilder';

interface SharedReportViewerProps {
  token: string;
  onExitToLogin: () => void;
}

const KPI_TONE_STYLES: Record<string, string> = {
  neutral: 'text-zinc-900',
  crimson: 'text-[#C8102E]',
  emerald: 'text-emerald-700',
  amber: 'text-amber-700',
  rose: 'text-rose-700',
};

export const SharedReportViewer: React.FC<SharedReportViewerProps> = ({
  token,
  onExitToLogin,
}) => {
  const [loading, setLoading] = useState(true);
  const [errorState, setErrorState] = useState<{ code?: string; message: string } | null>(null);
  const [payload, setPayload] = useState<SharedReportPublicPayload | null>(null);

  useEffect(() => {
    let active = true;
    const load = async () => {
      setLoading(true);
      setErrorState(null);
      const res = await api.getSharedReportByToken(token);
      if (!active) return;
      setLoading(false);

      if (res.status !== 200 || !res.data?.snapshot) {
        setErrorState({
          code: res.code,
          message:
            res.error ||
            'Não foi possível localizar este relatório compartilhado. Ele pode ter expirado ou sido revogado.',
        });
        return;
      }
      setPayload(res.data);
    };
    load();
    return () => {
      active = false;
    };
  }, [token]);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0C0C0E] flex flex-col items-center justify-center text-white p-6">
        <div className="w-8 h-8 border-[3px] border-zinc-800 border-t-[#C8102E] rounded-full animate-spin mb-3" />
        <p className="text-xs text-zinc-400 font-medium">
          Validando link seguro do relatório DE FARDAS...
        </p>
      </div>
    );
  }

  if (errorState || !payload) {
    return (
      <div className="min-h-screen bg-[#F6F6F7] flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-2xl border border-zinc-200 shadow-lg p-8 text-center space-y-4">
          <div className="w-12 h-12 rounded-2xl bg-rose-50 border border-rose-200 text-[#C8102E] flex items-center justify-center mx-auto">
            <AlertTriangle className="w-6 h-6" />
          </div>
          <h1 className="text-lg font-extrabold text-zinc-950">
            {errorState?.code === 'REPORT_SHARE_EXPIRED'
              ? 'Link de Relatório Expirado'
              : errorState?.code === 'REPORT_SHARE_REVOKED'
                ? 'Link Revogado pelo Emissor'
                : 'Relatório Indisponível'}
          </h1>
          <p className="text-xs text-zinc-600 leading-relaxed">{errorState?.message}</p>
          <button
            type="button"
            onClick={onExitToLogin}
            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-[#111113] hover:bg-[#1E1E22] text-white text-xs font-semibold rounded-xl transition-colors cursor-pointer"
          >
            <LogIn className="w-4 h-4" />
            <span>Ir para o Portal DE FARDAS</span>
          </button>
        </div>
      </div>
    );
  }

  const { snapshot } = payload;
  const generatedDateObj = new Date(snapshot.generatedAt);
  const generatedDate = generatedDateObj.toLocaleDateString('pt-BR');
  const generatedTime = generatedDateObj.toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <div className="min-h-screen bg-[#F4F4F6] text-zinc-900">
      {/* Top Action Bar (hidden when printing PDF) */}
      <header className="sticky top-0 z-30 bg-[#111113] text-white border-b border-zinc-800 px-4 sm:px-8 py-3 no-print">
        <div className="max-w-5xl mx-auto flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-11 h-11 rounded-xl bg-white p-0.5 flex items-center justify-center shrink-0 overflow-hidden">
              <img
                src={snapshot.company.logoUrl || DEFAULT_BRAND_LOGO_URL}
                alt="DE FARDAS"
                className="w-full h-full object-contain"
              />
            </div>
            <div className="min-w-0">
              <div className="text-xs font-bold truncate flex items-center gap-2">
                <span>{snapshot.title}</span>
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                  {snapshot.reportCode}
                </span>
              </div>
              <div className="text-[11px] text-zinc-400 flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-0.5">
                <span className="inline-flex items-center gap-1">
                  <ShieldCheck className="w-3 h-3 text-emerald-400" />
                  <span>Documento somente leitura</span>
                </span>
                <span className="inline-flex items-center gap-1 font-mono">
                  <Clock className="w-3 h-3" />
                  <span>Válido até {new Date(payload.expiresAt).toLocaleString('pt-BR')}</span>
                </span>
                <span className="inline-flex items-center gap-1 font-mono">
                  <Eye className="w-3 h-3" />
                  <span>{payload.accessCount} visualização(ões)</span>
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0 flex-wrap">
            <button
              type="button"
              onClick={() => downloadSnapshotAsCsv(snapshot)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-100 text-xs font-semibold rounded-lg cursor-pointer whitespace-nowrap"
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              <span>Exportar CSV</span>
            </button>
            <button
              type="button"
              onClick={() => window.print()}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-[#C8102E] hover:bg-[#A60D26] text-white text-xs font-semibold rounded-lg shadow-xs cursor-pointer whitespace-nowrap"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Imprimir / Salvar PDF (Ctrl+P)</span>
            </button>
            <button
              type="button"
              onClick={onExitToLogin}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white/10 hover:bg-white/20 text-white text-xs font-semibold rounded-lg cursor-pointer whitespace-nowrap"
            >
              <LogIn className="w-3.5 h-3.5" />
              <span>ERP</span>
            </button>
          </div>
        </div>
      </header>

      {/* Printable A4 Sheet */}
      <main className="max-w-5xl mx-auto p-3 sm:p-6">
        <div className="bg-white rounded-2xl border border-zinc-200 shadow-sm p-6 sm:p-10 space-y-6 text-xs print-page">
          {/* Letterhead */}
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
                Relatório Compartilhado via Link Oficial
              </div>
              <div className="text-base sm:text-lg font-black text-[#C8102E] mt-1 leading-tight">
                {snapshot.title}
              </div>
              <div className="text-[11px] text-zinc-600 font-mono mt-1 tabular-nums">
                Código: {snapshot.reportCode} · {generatedDate} às {generatedTime}
              </div>
              <div className="text-[11px] text-zinc-500 mt-0.5">
                Emitido por: <span className="font-semibold text-zinc-800">{snapshot.generatedBy}</span>
              </div>
            </div>
          </div>

          <div className="px-3.5 py-2.5 bg-zinc-50 border border-zinc-200 rounded-xl text-[11px] text-zinc-600 print-avoid-break">
            <strong className="text-zinc-900">Escopo &amp; Filtros Aplicados:</strong>{' '}
            {snapshot.filterSummary}
          </div>

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
                    <div className="text-[10px] text-zinc-500 mt-0.5">{kpi.sublabel}</div>
                  )}
                </div>
              ))}
            </div>
          )}

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
                        <td colSpan={section.columns.length} className="py-6 text-center text-zinc-400">
                          {section.emptyMessage || 'Nenhum registro neste escopo.'}
                        </td>
                      </tr>
                    ) : (
                      section.rows.map((row, rowIdx) => (
                        <tr key={rowIdx}>
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

          <div className="pt-4 border-t border-zinc-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-[11px] text-zinc-500 print-avoid-break">
            <span>
              Snapshot auditável {snapshot.company.tradeName} · {snapshot.company.city}/{snapshot.company.state}
            </span>
            <span className="font-mono tabular-nums">
              {snapshot.reportCode} · Expira em {new Date(payload.expiresAt).toLocaleDateString('pt-BR')}
            </span>
          </div>
        </div>
      </main>
    </div>
  );
};
