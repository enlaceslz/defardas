import React, { useState, useEffect } from 'react';
import { 
  ShieldCheck, 
  X, 
  Play, 
  CheckCircle2, 
  AlertTriangle, 
  Database, 
  FileCheck, 
  Users, 
  Lock, 
  Activity,
  Layers,
  RefreshCw,
  Clock
} from 'lucide-react';
import { useAuth, UserRole } from '../api/authContext';
import { FoundationTestSuite, TestResultItem } from '../tests/foundationTests';
import { api } from '../api/client';

interface FoundationAuditModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const FoundationAuditModal: React.FC<FoundationAuditModalProps> = ({ isOpen, onClose }) => {
  const { user, availableRoles, switchRoleDev } = useAuth();
  const [activeTab, setActiveTab] = useState<'tests' | 'architecture' | 'audit_logs'>('tests');
  const [testResults, setTestResults] = useState<TestResultItem[]>([]);
  const [isRunningTests, setIsRunningTests] = useState(false);
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [healthData, setHealthData] = useState<any>(null);

  useEffect(() => {
    if (isOpen) {
      loadHealthAndLogs();
      if (testResults.length === 0) {
        handleRunTests();
      }
    }
  }, [isOpen]);

  const loadHealthAndLogs = async () => {
    const health = await api.getHealth();
    if (health.data) setHealthData(health.data);
    const logs = await api.getAuditLogs(30);
    if (logs.data) setAuditLogs(logs.data);
  };

  const handleRunTests = async () => {
    setIsRunningTests(true);
    try {
      const results = await FoundationTestSuite.runAllTests((updated) => {
        setTestResults(updated);
      });
      setTestResults(results);
      loadHealthAndLogs();
    } finally {
      setIsRunningTests(false);
    }
  };

  if (!isOpen) return null;

  const passedCount = testResults.filter((t) => t.status === 'passed').length;
  const totalCount = testResults.length;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/60 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full overflow-hidden border border-slate-200 flex flex-col max-h-[90vh]">
        
        {/* Top Header */}
        <div className="flex items-center justify-between px-6 py-4 bg-slate-900 text-white">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-600/30 border border-blue-400/40 flex items-center justify-center text-blue-400">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold">Painel de Auditoria da Fundação P0</h2>
                <span className="px-2 py-0.5 text-[10px] font-bold tracking-wider uppercase rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                  PRD v1.6 Homologado
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Verificação de Integridade Transacional, PostgreSQL, Gate A.3.2 e RBAC
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Role & Session Toolbar */}
        <div className="bg-slate-800 px-6 py-3 border-b border-slate-700 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-white">
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-blue-400" />
            <span className="text-slate-400">Sessão Autenticada:</span>
            {user ? (
              <span className="font-bold text-white bg-slate-700 px-2.5 py-1 rounded-md border border-slate-600 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-400 inline-block" />
                {user.fullName} ({user.role})
              </span>
            ) : (
              <span className="font-bold text-amber-300 bg-amber-950/60 px-2.5 py-1 rounded-md border border-amber-800/60">
                Sessão Anônima / Não Autenticada
              </span>
            )}
          </div>

          {user && (
            <div className="flex items-center gap-2">
              <span className="text-slate-400">[DEV] Simular Perfil:</span>
              <select
                value={user.role}
                onChange={(e) => switchRoleDev(e.target.value as UserRole)}
                className="bg-slate-900 border border-slate-600 rounded-lg px-2.5 py-1 text-slate-200 text-xs focus:ring-2 focus:ring-blue-500 focus:outline-none cursor-pointer"
              >
                {availableRoles.map((r) => (
                  <option key={r.role} value={r.role}>
                    {r.label}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        {/* Navigation Tabs */}
        <div className="flex border-b border-slate-200 bg-slate-50 px-6 pt-2">
          <button
            onClick={() => setActiveTab('tests')}
            className={`px-4 py-2.5 text-xs font-semibold border-b-2 transition-colors cursor-pointer flex items-center gap-2 ${
              activeTab === 'tests'
                ? 'border-blue-600 text-blue-600 bg-white rounded-t-lg'
                : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            <Play className="w-3.5 h-3.5" />
            <span>Evidências de Teste ({passedCount}/{totalCount})</span>
          </button>
          <button
            onClick={() => setActiveTab('architecture')}
            className={`px-4 py-2.5 text-xs font-semibold border-b-2 transition-colors cursor-pointer flex items-center gap-2 ${
              activeTab === 'architecture'
                ? 'border-blue-600 text-blue-600 bg-white rounded-t-lg'
                : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            <Database className="w-3.5 h-3.5" />
            <span>Arquitetura & Schemas</span>
          </button>
          <button
            onClick={() => {
              setActiveTab('audit_logs');
              loadHealthAndLogs();
            }}
            className={`px-4 py-2.5 text-xs font-semibold border-b-2 transition-colors cursor-pointer flex items-center gap-2 ${
              activeTab === 'audit_logs'
                ? 'border-blue-600 text-blue-600 bg-white rounded-t-lg'
                : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            <Activity className="w-3.5 h-3.5" />
            <span>Trilha de Auditoria ({auditLogs.length})</span>
          </button>
        </div>

        {/* Body Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          
          {/* TAB 1: EVIDÊNCIAS DE TESTE */}
          {activeTab === 'tests' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between bg-blue-50 border border-blue-200 p-4 rounded-xl">
                <div>
                  <h3 className="text-xs font-bold text-blue-900">
                    Bateria de Testes Automatizados da Fundação (13 Requisitos)
                  </h3>
                  <p className="text-[11px] text-blue-700 mt-0.5">
                    Comprova conformidade matemática de markup, bloqueio de portões fabris, integridade transacional e controle de acesso RBAC.
                  </p>
                </div>
                <button
                  onClick={handleRunTests}
                  disabled={isRunningTests}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-semibold hover:bg-blue-500 disabled:opacity-50 transition-colors shadow-xs cursor-pointer"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isRunningTests ? 'animate-spin' : ''}`} />
                  <span>{isRunningTests ? 'Executando...' : 'Reexecutar Testes'}</span>
                </button>
              </div>

              <div className="space-y-3">
                {testResults.map((t) => (
                  <div
                    key={t.id}
                    className="p-4 rounded-xl border border-slate-200 bg-white shadow-xs space-y-2"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-2">
                        {t.status === 'passed' ? (
                          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                        ) : (
                          <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                        )}
                        <h4 className="text-xs font-bold text-slate-900">{t.name}</h4>
                      </div>
                      <span className="text-[10px] font-mono text-slate-400">{t.durationMs}ms</span>
                    </div>

                    <div className="bg-slate-50 border border-slate-100 p-2.5 rounded-lg text-[11px] font-mono text-slate-700 leading-relaxed">
                      {t.evidence}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TAB 2: ARQUITETURA & SCHEMAS */}
          {activeTab === 'architecture' && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
                <div className="p-3.5 rounded-xl border border-slate-200 bg-slate-50">
                  <div className="text-slate-500 font-medium">Topologia do Backend</div>
                  <div className="text-sm font-bold text-slate-900 mt-1">Node.js Express Modular</div>
                  <div className="text-[11px] text-emerald-700 font-medium mt-1">
                    ● Vite Middlewares em Dev / Dist em Prod
                  </div>
                </div>

                <div className="p-3.5 rounded-xl border border-slate-200 bg-slate-50">
                  <div className="text-slate-500 font-medium">Motor de Banco de Dados</div>
                  <div className="text-sm font-bold text-slate-900 mt-1">PostgreSQL Próprio</div>
                  <div className="text-[11px] text-blue-700 font-medium mt-1">
                    {healthData?.database?.mode || 'Transacional Ativo'}
                  </div>
                </div>

                <div className="p-3.5 rounded-xl border border-slate-200 bg-slate-50">
                  <div className="text-slate-500 font-medium">Controle de Identificadores</div>
                  <div className="text-sm font-bold text-slate-900 mt-1">Sequências Atômicas</div>
                  <div className="text-[11px] text-slate-600 mt-1 font-mono">
                    ORC-2026-X / OP-2026-X
                  </div>
                </div>
              </div>

              <div className="border border-slate-200 rounded-xl overflow-hidden">
                <div className="bg-slate-100 px-4 py-2.5 text-xs font-bold text-slate-800 border-b border-slate-200 flex items-center justify-between">
                  <span>Schemas e Invariantes Ativas no Banco</span>
                  <span className="text-[10px] text-slate-500 font-mono">migrations/0001_initial_schema.sql</span>
                </div>
                <div className="divide-y divide-slate-100 text-xs">
                  <div className="p-3 hover:bg-slate-50">
                    <span className="font-bold text-blue-600">core</span>
                    <span className="text-slate-600 ml-2">users, audit_logs, sequences. Controle de perfis RBAC e sessão.</span>
                  </div>
                  <div className="p-3 hover:bg-slate-50">
                    <span className="font-bold text-blue-600">crm</span>
                    <span className="text-slate-600 ml-2">clients, leads, quotes, quote_items. CHECK(entry_percentage = 50.00).</span>
                  </div>
                  <div className="p-3 hover:bg-slate-50">
                    <span className="font-bold text-blue-600">producao</span>
                    <span className="text-slate-600 ml-2">production_orders. CHECK(stage = 'aguardando_liberacao' OR (art_approved AND entry_payment_confirmed)).</span>
                  </div>
                  <div className="p-3 hover:bg-slate-50">
                    <span className="font-bold text-blue-600">financeiro</span>
                    <span className="text-slate-600 ml-2">transactions. Confirmação auditada com voucher de sinal de 50%.</span>
                  </div>
                  <div className="p-3 hover:bg-slate-50">
                    <span className="font-bold text-blue-600">estoque</span>
                    <span className="text-slate-600 ml-2">items, movements. Saldo próprio, alocado para OPs e em poder de facções parceiras.</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: TRILHA DE AUDITORIA */}
          {activeTab === 'audit_logs' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between text-xs text-slate-500">
                <span>Últimos registros gravados na tabela core.audit_logs:</span>
                <button
                  onClick={loadHealthAndLogs}
                  className="text-blue-600 hover:text-blue-700 font-semibold cursor-pointer flex items-center gap-1"
                >
                  <RefreshCw className="w-3 h-3" />
                  <span>Atualizar</span>
                </button>
              </div>

              <div className="space-y-2">
                {auditLogs.length === 0 ? (
                  <div className="text-center py-8 text-xs text-slate-400">
                    Nenhum evento registrado ainda. Execute ações no sistema para gerar logs.
                  </div>
                ) : (
                  auditLogs.map((log) => (
                    <div
                      key={log.id}
                      className="p-3 rounded-lg border border-slate-200 bg-white text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2 shadow-xs"
                    >
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-slate-900 font-mono text-[11px] bg-slate-100 px-1.5 py-0.5 rounded">
                            {log.action}
                          </span>
                          <span className="text-slate-500 font-medium">em {log.entityName}</span>
                          <span className="text-slate-700 font-mono">[{log.entityId}]</span>
                        </div>
                        <div className="text-slate-600 text-[11px]">{log.notes}</div>
                      </div>

                      <div className="text-right text-[10px] text-slate-400 shrink-0">
                        <div className="font-medium text-slate-600">{log.actorName} ({log.actorRole})</div>
                        <div className="flex items-center justify-end gap-1 mt-0.5">
                          <Clock className="w-3 h-3" />
                          <span>{new Date(log.createdAt).toLocaleTimeString('pt-BR')}</span>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

        </div>

        {/* Footer */}
        <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between text-xs">
          <div className="flex items-center gap-2 text-slate-600">
            <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
            <span>Persistência Ativa: Dados de teste protegidos contra exclusão acidental.</span>
          </div>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-900 text-white rounded-lg font-semibold hover:bg-slate-800 transition-colors cursor-pointer"
          >
            Fechar Painel
          </button>
        </div>

      </div>
    </div>
  );
};
