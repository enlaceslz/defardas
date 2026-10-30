import React, { useState, useEffect } from 'react';
import { useSubmission } from '../api/useSubmission';
import { 
  Building2, 
  Save, 
  Download, 
  Upload, 
  RotateCcw, 
  CheckCircle2, 
  ShieldCheck, 
  Sliders,
  AlertTriangle
} from 'lucide-react';
import { CompanyProfile } from '../types/erp';
import { ERPState, exportERPStateAsJSON } from '../utils/storage';

interface SettingsViewProps {
  profile: CompanyProfile;
  fullState: ERPState;
  onSaveProfile: (profile: CompanyProfile) => Promise<boolean>;
  onRestoreState: (state: ERPState) => Promise<boolean>;
  onResetToDefaults: () => void;
}

export const SettingsView: React.FC<SettingsViewProps> = ({
  profile,
  fullState,
  onSaveProfile,
  onRestoreState,
  onResetToDefaults,
}) => {
  const [formData, setFormData] = useState<CompanyProfile>(profile);
  const [savedSuccess, setSavedSuccess] = useState(false);
  const { submit, isSaving } = useSubmission();

  useEffect(() => {
    if (!savedSuccess) return;
    const timer = setTimeout(() => setSavedSuccess(false), 3000);
    return () => clearTimeout(timer);
  }, [savedSuccess]);

  useEffect(() => setFormData(profile), [profile]);
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavedSuccess(false);
    if (!(await submit(() => onSaveProfile(formData)))) return;
    setSavedSuccess(true);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const parsed = JSON.parse(event.target?.result as string);
        if (parsed.orders && parsed.inventory && parsed.quotes) {
          if (!(await onRestoreState(parsed))) return;
          alert('Backup restaurado com sucesso!');
        } else {
          alert('Arquivo de backup inválido.');
        }
      } catch (err) {
        alert('Erro ao processar o arquivo de backup.');
      }
    };
    reader.readAsText(file);
  };

  return (
    <div className="space-y-6 max-w-4xl">
      
      {/* Top Header */}
      <div className="pb-2 border-b border-slate-200">
        <div className="text-xs font-medium text-slate-500 flex items-center gap-2">
          <span>DE FARDAS</span>
          <span aria-hidden="true">/</span>
          <span>Configurações</span>
          <span aria-hidden="true">/</span>
          <span className="text-slate-800 font-semibold">Parâmetros & Backup</span>
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 mt-1">
          Dados da Empresa & Gestão de Dados
        </h1>
      </div>

      {savedSuccess && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-xs text-emerald-800 flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          <span>Dados cadastrais da empresa atualizados com sucesso!</span>
        </div>
      )}

      {/* Form: Company Profile */}
      <form onSubmit={handleSubmit} className="bg-white p-6 rounded-xl border border-slate-200 shadow-xs space-y-5 text-xs">
        <div className="flex items-center gap-2 text-slate-900 font-bold text-sm border-b border-slate-100 pb-3">
          <Building2 className="w-4 h-4 text-blue-600" />
          <span>Informações Institucionais da Indústria Têxtil</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block font-semibold text-slate-700 mb-1">Razão Social Completa</label>
            <input
              type="text"
              required
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-900"
            />
          </div>

          <div>
            <label className="block font-semibold text-slate-700 mb-1">Nome Fantasia / Marca</label>
            <input
              type="text"
              required
              value={formData.tradeName}
              onChange={(e) => setFormData({ ...formData, tradeName: e.target.value })}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-900"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className="block font-semibold text-slate-700 mb-1">CNPJ</label>
            <input
              type="text"
              required
              value={formData.cnpj}
              onChange={(e) => setFormData({ ...formData, cnpj: e.target.value })}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono text-slate-900"
            />
          </div>

          <div>
            <label className="block font-semibold text-slate-700 mb-1">Inscrição Estadual (I.E.)</label>
            <input
              type="text"
              value={formData.ie}
              onChange={(e) => setFormData({ ...formData, ie: e.target.value })}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono text-slate-900"
            />
          </div>

          <div>
            <label className="block font-semibold text-slate-700 mb-1">Capacidade Mensal (Peças)</label>
            <input
              type="number"
              value={formData.productionCapacityPiecesMonth}
              onChange={(e) => setFormData({ ...formData, productionCapacityPiecesMonth: parseInt(e.target.value) || 0 })}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono text-slate-900"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className="block font-semibold text-slate-700 mb-1">Telefone Principal</label>
            <input
              type="text"
              value={formData.phone}
              onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono text-slate-900"
            />
          </div>

          <div>
            <label className="block font-semibold text-slate-700 mb-1">WhatsApp Comercial</label>
            <input
              type="text"
              value={formData.whatsapp}
              onChange={(e) => setFormData({ ...formData, whatsapp: e.target.value })}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono text-slate-900"
            />
          </div>

          <div>
            <label className="block font-semibold text-slate-700 mb-1">E-mail Comercial</label>
            <input
              type="email"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-900"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
          <div className="sm:col-span-2">
            <label className="block font-semibold text-slate-700 mb-1">Endereço da Fábrica / Galpão</label>
            <input
              type="text"
              value={formData.address}
              onChange={(e) => setFormData({ ...formData, address: e.target.value })}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-900"
            />
          </div>

          <div>
            <label className="block font-semibold text-slate-700 mb-1">Cidade / UF</label>
            <input
              type="text"
              value={`${formData.city}/${formData.state}`}
              onChange={(e) => {
                const parts = e.target.value.split('/');
                setFormData({
                  ...formData,
                  city: parts[0] || 'São Paulo',
                  state: parts[1] || 'SP',
                });
              }}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-900"
            />
          </div>

          <div>
            <label className="block font-semibold text-slate-700 mb-1">CEP</label>
            <input
              type="text"
              value={formData.cep}
              onChange={(e) => setFormData({ ...formData, cep: e.target.value })}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono text-slate-900"
            />
          </div>
        </div>

        <div className="pt-2 flex justify-end">
          <button
            type="submit"
            disabled={isSaving}
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-500 transition-colors shadow-sm cursor-pointer"
          >
            <Save className="w-4 h-4" />
            <span>Salvar Informações Cadastrais</span>
          </button>
        </div>
      </form>

      {/* Backup and Data Management */}
      <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-xs space-y-4 text-xs">
        <div className="flex items-center gap-2 text-slate-900 font-bold text-sm border-b border-slate-100 pb-3">
          <ShieldCheck className="w-4 h-4 text-blue-600" />
          <span>Segurança de Dados & Backup do ERP</span>
        </div>

        <p className="text-slate-600 leading-relaxed">
          Todos os dados cadastrados (Ordens de Produção, Tecidos, Clientes, Propostas Comerciais e Financeiro)
          são salvos automaticamente em cache local no navegador. Você pode exportar um backup em formato JSON para arquivamento ou transferir para outro computador.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2">
          {/* Export JSON */}
          <button
            onClick={() => exportERPStateAsJSON(fullState)}
            className="flex items-center justify-center gap-2 p-3 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg font-semibold text-slate-800 transition-colors cursor-pointer"
          >
            <Download className="w-4 h-4 text-blue-600" />
            <span>Exportar Backup (JSON)</span>
          </button>

          {/* Import JSON */}
          <label className="flex items-center justify-center gap-2 p-3 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg font-semibold text-slate-800 transition-colors cursor-pointer">
            <Upload className="w-4 h-4 text-indigo-600" />
            <span>Restaurar Backup (JSON)</span>
            <input
              type="file"
              accept=".json"
              onChange={handleFileUpload}
              className="hidden"
            />
          </label>

          {/* Reset */}
          <button
            onClick={() => {
              if (confirm('Tem certeza que deseja restaurar os dados de demonstração originais da confecção?')) {
                onResetToDefaults();
              }
            }}
            className="flex items-center justify-center gap-2 p-3 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-lg font-semibold text-rose-800 transition-colors cursor-pointer"
          >
            <RotateCcw className="w-4 h-4 text-rose-600" />
            <span>Recarregar Dados Demo</span>
          </button>
        </div>
      </div>

    </div>
  );
};
