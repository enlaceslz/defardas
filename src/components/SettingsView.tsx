import React, { useEffect, useRef, useState } from 'react';
import {
  Building2,
  Save,
  Download,
  Upload,
  RotateCcw,
  CheckCircle2,
  ShieldCheck,
  AlertTriangle,
  ImagePlus,
  Trash2,
  Lock,
  Database,
  FileText,
  Shirt,
  Loader2,
} from 'lucide-react';
import { CompanyProfile } from '../types/erp';
import {
  ERPState,
  exportERPStateAsJSON,
  parseAndValidateBackupJSON,
} from '../utils/storage';
import { useAuth } from '../api/authContext';
import {
  CepLookupInput,
  CnpjLookupInput,
  PhoneInputBR,
} from './FormInputs';

interface SettingsViewProps {
  profile: CompanyProfile;
  fullState: ERPState;
  onSaveProfile: (profile: CompanyProfile) => void;
  onRestoreState: (state: ERPState) => Promise<{ syncedToServer: boolean; summary?: string } | void> | void;
  onResetToDefaults: (preserveLogo?: boolean) => void;
}

const MAX_LOGO_FILE_BYTES = 2 * 1024 * 1024; // 2 MB
const MAX_RASTER_WIDTH = 480;
const MAX_RASTER_HEIGHT = 240;

/**
 * Converte e otimiza a imagem de logomarca enviada para Data URL leve e segura:
 * - Raster (PNG/JPG/WebP): redimensiona proporcionalmente (máx. 480x240) preservando transparência (PNG).
 * - SVG: sanitiza tags <script> e atributos on* antes de converter em base64.
 */
async function processLogoFile(file: File): Promise<string> {
  const allowedTypes = ['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'];
  if (!allowedTypes.includes(file.type)) {
    throw new Error('Formato não suportado. Utilize PNG, JPG, WebP ou SVG.');
  }
  if (file.size > MAX_LOGO_FILE_BYTES) {
    throw new Error('A imagem excede o limite de 2 MB. Reduza o arquivo e tente novamente.');
  }

  if (file.type === 'image/svg+xml') {
    const rawSvg = await file.text();
    const cleanedSvg = rawSvg
      .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '')
      .replace(/\son[a-z]+\s*=\s*(['"]).*?\1/gi, '')
      .replace(/javascript:/gi, '');

    if (!cleanedSvg.toLowerCase().includes('<svg')) {
      throw new Error('Arquivo SVG inválido.');
    }

    const encoded = btoa(unescape(encodeURIComponent(cleanedSvg)));
    return `data:image/svg+xml;base64,${encoded}`;
  }

  // Raster optimization via HTML5 Canvas
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Falha ao ler a imagem selecionada.'));
    reader.readAsDataURL(file);
  });

  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Não foi possível decodificar a imagem selecionada.'));
    image.src = dataUrl;
  });

  const scale = Math.min(1, MAX_RASTER_WIDTH / img.width, MAX_RASTER_HEIGHT / img.height);
  const targetWidth = Math.max(1, Math.round(img.width * scale));
  const targetHeight = Math.max(1, Math.round(img.height * scale));

  const canvas = document.createElement('canvas');
  canvas.width = targetWidth;
  canvas.height = targetHeight;
  const ctx = canvas.getContext('2d');
  if (!ctx) return dataUrl;

  ctx.clearRect(0, 0, targetWidth, targetHeight);
  ctx.drawImage(img, 0, 0, targetWidth, targetHeight);

  // Preserva transparência para PNG/WebP; usa JPEG leve se original for JPEG
  if (file.type === 'image/jpeg') {
    return canvas.toDataURL('image/jpeg', 0.88);
  }
  return canvas.toDataURL('image/png');
}

export const SettingsView: React.FC<SettingsViewProps> = ({
  profile,
  fullState,
  onSaveProfile,
  onRestoreState,
  onResetToDefaults,
}) => {
  const { user } = useAuth();
  const role = user?.role || '';
  const isAdmin = role === 'admin';

  const [formData, setFormData] = useState<CompanyProfile>(profile);
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [logoError, setLogoError] = useState('');
  const [isProcessingLogo, setIsProcessingLogo] = useState(false);
  const [backupFeedback, setBackupFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [isRestoringBackup, setIsRestoringBackup] = useState(false);
  const [confirmingReset, setConfirmingReset] = useState(false);
  const [preserveLogoOnReset, setPreserveLogoOnReset] = useState(true);

  const logoInputRef = useRef<HTMLInputElement | null>(null);

  // Mantém o formulário sincronizado após restauração de backup ou reset externo
  useEffect(() => {
    setFormData(profile);
  }, [profile]);

  if (!isAdmin) {
    return (
      <div className="max-w-2xl mx-auto mt-10 bg-white border border-slate-200 rounded-2xl p-8 text-center space-y-3 shadow-xs">
        <div className="w-12 h-12 rounded-xl bg-amber-50 border border-amber-200 text-amber-700 flex items-center justify-center mx-auto">
          <Lock className="w-6 h-6" />
        </div>
        <h2 className="text-lg font-bold text-slate-900">Acesso Restrito à Administração</h2>
        <p className="text-xs text-slate-600 leading-relaxed">
          O perfil atual (<strong className="font-mono">{role || 'não autenticado'}</strong>) não possui alçada de
          Administrador para alterar os dados institucionais da empresa, logomarca ou backups do ERP.
        </p>
      </div>
    );
  }

  const hasUnsavedChanges = JSON.stringify(formData) !== JSON.stringify(profile);

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    setLogoError('');
    setIsProcessingLogo(true);
    try {
      const optimizedDataUrl = await processLogoFile(file);
      const nextProfile: CompanyProfile = { ...formData, logoUrl: optimizedDataUrl };
      setFormData(nextProfile);
      // Persiste imediatamente a logomarca para que relatórios, orçamentos, pedidos e recibos já reflitam a atualização
      onSaveProfile(nextProfile);
      setSavedSuccess(true);
      setTimeout(() => setSavedSuccess(false), 3000);
    } catch (err: any) {
      setLogoError(err?.message || 'Erro ao carregar a imagem da logomarca.');
    } finally {
      setIsProcessingLogo(false);
    }
  };

  const handleRemoveLogo = () => {
    setLogoError('');
    const nextProfile: CompanyProfile = { ...formData, logoUrl: undefined };
    setFormData(nextProfile);
    onSaveProfile(nextProfile);
    setSavedSuccess(true);
    setTimeout(() => setSavedSuccess(false), 3000);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const sanitized: CompanyProfile = {
      ...formData,
      name: formData.name.trim(),
      tradeName: formData.tradeName.trim(),
      cnpj: formData.cnpj.trim(),
      ie: formData.ie.trim(),
      city: formData.city.trim() || 'São Luís',
      state: (formData.state.trim().toUpperCase().slice(0, 2)) || 'MA',
      productionCapacityPiecesMonth: Math.max(1, Number(formData.productionCapacityPiecesMonth) || 5000),
      foundedYear: Math.max(1900, Math.min(new Date().getFullYear(), Number(formData.foundedYear) || 2005)),
    };
    setFormData(sanitized);
    onSaveProfile(sanitized);
    setSavedSuccess(true);
    setTimeout(() => setSavedSuccess(false), 3000);
  };

  const handleExportBackup = () => {
    try {
      const result = exportERPStateAsJSON(fullState);
      setBackupFeedback({
        type: 'success',
        message: `Backup exportado com sucesso (${result.fileName} · ${result.sizeKB} KB), incluindo dados da empresa${
          fullState.profile.logoUrl ? ' e logomarca oficial' : ''
        }.`,
      });
    } catch {
      setBackupFeedback({
        type: 'error',
        message: 'Não foi possível gerar o arquivo de backup JSON.',
      });
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      const rawText = String(event.target?.result || '');
      const validation = parseAndValidateBackupJSON(rawText, fullState);

      if (!validation.ok || !validation.state) {
        setBackupFeedback({
          type: 'error',
          message: validation.error || 'Arquivo de backup inválido.',
        });
        return;
      }

      setIsRestoringBackup(true);
      try {
        const syncResult = await onRestoreState(validation.state);
        const timestampNote = validation.exportedAt
          ? ` (gerado em ${new Date(validation.exportedAt).toLocaleString('pt-BR')})`
          : '';
        setBackupFeedback({
          type: 'success',
          message:
            syncResult?.summary ||
            `Backup JSON restaurado com sucesso${timestampNote}. ${
              validation.state.profile.logoUrl ? 'Logomarca institucional restaurada.' : ''
            }`,
        });
      } catch {
        setBackupFeedback({
          type: 'error',
          message: 'Erro inesperado ao aplicar os dados restaurados.',
        });
      } finally {
        setIsRestoringBackup(false);
      }
    };
    reader.onerror = () => {
      setBackupFeedback({
        type: 'error',
        message: 'Falha ao ler o arquivo selecionado.',
      });
    };
    reader.readAsText(file);
  };

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Top Header */}
      <div className="pb-2 border-b border-slate-200 flex flex-col sm:flex-row sm:items-end justify-between gap-2">
        <div>
          <div className="text-xs font-medium text-slate-500 flex items-center gap-2">
            <span>{profile.tradeName}</span>
            <span aria-hidden="true">/</span>
            <span>Configurações</span>
            <span aria-hidden="true">/</span>
            <span className="text-slate-800 font-semibold">Parâmetros & Backup</span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 mt-1">
            Dados da Empresa, Identidade Visual & Backup
          </h1>
        </div>
        {hasUnsavedChanges && (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-amber-50 border border-amber-200 text-amber-800 text-[11px] font-semibold rounded-lg self-start sm:self-auto">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
            Alterações pendentes de salvamento
          </span>
        )}
      </div>

      {savedSuccess && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-xs text-emerald-800 flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>Dados institucionais e identidade visual atualizados para relatórios, orçamentos, pedidos e recibos!</span>
        </div>
      )}

      {/* Form: Company Profile & Logo */}
      <form onSubmit={handleSubmit} className="bg-white p-6 rounded-xl border border-slate-200 shadow-xs space-y-6 text-xs">
        {/* Section 1: Institutional Logo */}
        <div className="space-y-3">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div className="flex items-center gap-2 text-slate-900 font-bold text-sm">
              <ImagePlus className="w-4 h-4 text-blue-600" />
              <span>Logomarca Oficial da Empresa</span>
            </div>
            <span className="text-[11px] text-slate-500 font-medium">
              PNG, JPG, WebP ou SVG · máx. 2 MB
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-stretch">
            {/* Light Preview (Documents) */}
            <div className="p-4 rounded-xl border border-slate-200 bg-slate-50 flex flex-col justify-between gap-2">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                Prévia em Papel Timbrado
              </span>
              <div className="h-24 bg-white border border-dashed border-slate-300 rounded-lg flex items-center justify-center p-3 overflow-hidden">
                {formData.logoUrl ? (
                  <img
                    src={formData.logoUrl}
                    alt={`Logomarca ${formData.tradeName}`}
                    className="max-h-full max-w-full object-contain"
                  />
                ) : (
                  <div className="text-center text-slate-400">
                    <Shirt className="w-7 h-7 mx-auto mb-1 opacity-60" />
                    <span className="text-[11px]">Nenhuma logo inserida</span>
                  </div>
                )}
              </div>
              <span className="text-[10px] text-slate-500">
                Relatórios, Propostas, OPs e Recibos
              </span>
            </div>

            {/* Dark Preview (ERP Sidebar) */}
            <div className="p-4 rounded-xl border border-slate-200 bg-slate-900 text-white flex flex-col justify-between gap-2">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                Prévia no Menu Lateral ERP
              </span>
              <div className="h-24 bg-slate-950/70 border border-slate-800 rounded-lg flex items-center justify-center gap-3 px-4">
                <div className="w-11 h-11 rounded-xl bg-white/95 flex items-center justify-center p-1.5 shrink-0 overflow-hidden">
                  {formData.logoUrl ? (
                    <img
                      src={formData.logoUrl}
                      alt={`Ícone ${formData.tradeName}`}
                      className="max-h-full max-w-full object-contain"
                    />
                  ) : (
                    <Shirt className="w-5 h-5 text-blue-700" />
                  )}
                </div>
                <div className="min-w-0">
                  <div className="font-extrabold text-sm truncate">{formData.tradeName || 'DE FARDAS'}</div>
                  <div className="text-[10px] text-slate-400 truncate">
                    {formData.city || 'São Luís'} — {formData.state || 'MA'}
                  </div>
                </div>
              </div>
              <span className="text-[10px] text-slate-400">
                Sidebar Interna & Vitrine Pública
              </span>
            </div>

            {/* Upload Actions & Coverage */}
            <div className="p-4 rounded-xl border border-slate-200 bg-white flex flex-col justify-between gap-3">
              <div className="space-y-1.5">
                <div className="font-bold text-slate-800 flex items-center gap-1.5">
                  <FileText className="w-3.5 h-3.5 text-blue-600" />
                  <span>Incorporação Automática</span>
                </div>
                <p className="text-[11px] text-slate-600 leading-relaxed">
                  A logomarca carregada é aplicada automaticamente no cabeçalho de:
                </p>
                <ul className="text-[11px] text-slate-700 space-y-0.5 font-medium">
                  <li>• Orçamentos & Propostas Comerciais</li>
                  <li>• Pedidos / Fichas de Produção (OP)</li>
                  <li>• Recibos Financeiros de Quitação</li>
                  <li>• Relatórios Gerenciais & Fluxo de Caixa</li>
                </ul>
              </div>

              <div className="flex flex-wrap items-center gap-2 pt-1">
                <input
                  ref={logoInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/svg+xml"
                  onChange={handleLogoUpload}
                  className="hidden"
                />
                <button
                  type="button"
                  disabled={isProcessingLogo}
                  onClick={() => logoInputRef.current?.click()}
                  className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-60 text-white font-semibold rounded-lg transition-colors cursor-pointer"
                >
                  {isProcessingLogo ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <ImagePlus className="w-3.5 h-3.5" />
                  )}
                  <span>{formData.logoUrl ? 'Trocar Logo' : 'Inserir Logo'}</span>
                </button>

                {formData.logoUrl && (
                  <button
                    type="button"
                    onClick={handleRemoveLogo}
                    className="inline-flex items-center justify-center gap-1 px-2.5 py-2 bg-rose-50 hover:bg-rose-100 border border-rose-200 text-rose-700 font-semibold rounded-lg transition-colors cursor-pointer"
                    title="Remover logomarca"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Remover</span>
                  </button>
                )}
              </div>
            </div>
          </div>

          {logoError && (
            <div className="p-2.5 bg-rose-50 border border-rose-200 rounded-lg text-rose-800 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
              <span>{logoError}</span>
            </div>
          )}
        </div>

        {/* Section 2: Institutional Information */}
        <div className="space-y-4 pt-2">
          <div className="flex items-center gap-2 text-slate-900 font-bold text-sm border-b border-slate-100 pb-3">
            <Building2 className="w-4 h-4 text-blue-600" />
            <span>Informações Institucionais da Indústria Têxtil</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Razão Social Completa *</label>
              <input
                type="text"
                required
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-900 focus:ring-2 focus:ring-blue-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">Nome Fantasia / Marca *</label>
              <input
                type="text"
                required
                value={formData.tradeName}
                onChange={(e) => setFormData({ ...formData, tradeName: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-900 focus:ring-2 focus:ring-blue-500 focus:outline-none"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
            <div className="sm:col-span-2">
              <label className="block font-semibold text-slate-700 mb-1">
                CNPJ * <span className="font-normal text-slate-400">(preenchimento automático)</span>
              </label>
              <CnpjLookupInput
                required
                value={formData.cnpj}
                onChange={(masked) => setFormData({ ...formData, cnpj: masked })}
                onCnpjFound={(data) => {
                  setFormData((prev) => ({
                    ...prev,
                    cnpj: data.cnpj || prev.cnpj,
                    name: data.companyName || prev.name,
                    tradeName: data.tradeName || prev.tradeName,
                    email: data.email || prev.email,
                    phone: data.phone || prev.phone,
                    whatsapp: prev.whatsapp || data.phone || prev.whatsapp,
                    cep: data.cep || prev.cep,
                    address: data.addressLine || prev.address,
                    neighborhood: data.neighborhood || prev.neighborhood,
                    city: data.city || prev.city,
                    state: data.state || prev.state,
                    foundedYear: data.foundedYear || prev.foundedYear,
                  }));
                }}
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
              <label className="block font-semibold text-slate-700 mb-1">Ano de Fundação</label>
              <input
                type="number"
                min={1900}
                max={new Date().getFullYear()}
                value={formData.foundedYear}
                onChange={(e) => setFormData({ ...formData, foundedYear: parseInt(e.target.value, 10) || 2005 })}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono text-slate-900"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Telefone Principal</label>
              <PhoneInputBR
                value={formData.phone}
                onChange={(masked) => setFormData({ ...formData, phone: masked })}
                placeholder="(98) 3245-8800"
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">WhatsApp Comercial</label>
              <PhoneInputBR
                value={formData.whatsapp}
                onChange={(masked) => setFormData({ ...formData, whatsapp: masked })}
                placeholder="(98) 98841-2090"
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

            <div>
              <label className="block font-semibold text-slate-700 mb-1">Capacidade Mensal (Peças)</label>
              <input
                type="number"
                min={1}
                required
                value={formData.productionCapacityPiecesMonth}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    productionCapacityPiecesMonth: Math.max(1, parseInt(e.target.value, 10) || 1),
                  })
                }
                className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono text-slate-900"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-6 gap-4">
            <div className="sm:col-span-2">
              <label className="block font-semibold text-slate-700 mb-1">
                CEP <span className="font-normal text-slate-400">(busca automática)</span>
              </label>
              <CepLookupInput
                value={formData.cep}
                onChange={(masked) => setFormData({ ...formData, cep: masked })}
                onCepFound={(data) => {
                  setFormData((prev) => ({
                    ...prev,
                    cep: data.cep || prev.cep,
                    address: data.street || prev.address,
                    neighborhood: data.neighborhood || prev.neighborhood,
                    city: data.city || prev.city,
                    state: data.state || prev.state,
                  }));
                }}
              />
            </div>

            <div className="sm:col-span-2">
              <label className="block font-semibold text-slate-700 mb-1">Endereço da Fábrica / Galpão</label>
              <input
                type="text"
                value={formData.address}
                onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-900"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="block font-semibold text-slate-700 mb-1">Bairro / Polo Industrial</label>
              <input
                type="text"
                value={formData.neighborhood}
                onChange={(e) => setFormData({ ...formData, neighborhood: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-900"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="block font-semibold text-slate-700 mb-1">Cidade</label>
              <input
                type="text"
                required
                value={formData.city}
                onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-900"
              />
            </div>

            <div className="sm:col-span-1">
              <label className="block font-semibold text-slate-700 mb-1">UF</label>
              <input
                type="text"
                required
                maxLength={2}
                value={formData.state}
                onChange={(e) => setFormData({ ...formData, state: e.target.value.toUpperCase() })}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono uppercase text-slate-900"
              />
            </div>

            <div className="sm:col-span-3">
              <label className="block font-semibold text-slate-700 mb-1">Horário de Atendimento</label>
              <input
                type="text"
                value={formData.openingHours}
                onChange={(e) => setFormData({ ...formData, openingHours: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-900"
                placeholder="Ex: Seg a Sex: 08:00 às 18:00"
              />
            </div>
          </div>

          <div className="pt-2 flex justify-end">
            <button
              type="submit"
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-500 transition-colors shadow-sm cursor-pointer"
            >
              <Save className="w-4 h-4" />
              <span>Salvar Informações Cadastrais</span>
            </button>
          </div>
        </div>
      </form>

      {/* Backup and Data Management */}
      <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-xs space-y-5 text-xs">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2 text-slate-900 font-bold text-sm">
            <ShieldCheck className="w-4 h-4 text-blue-600" />
            <span>Segurança de Dados, Backup & Sincronização do ERP</span>
          </div>
          <span className="inline-flex items-center gap-1.5 text-[11px] font-mono text-slate-500">
            <Database className="w-3.5 h-3.5 text-blue-600" />
            Schema v1.6
          </span>
        </div>

        <p className="text-slate-600 leading-relaxed">
          Os registros operacionais (Clientes, Orçamentos, Ordens de Produção, Estoque e Financeiro) são persistidos no
          servidor e replicados localmente. O backup JSON inclui todos os módulos e a logomarca institucional configurada;
          ao restaurar um arquivo, os dados são validados e sincronizados de forma idempotente com o servidor.
        </p>

        {/* Live Snapshot Summary */}
        <div className="grid grid-cols-2 sm:grid-cols-6 gap-2.5">
          {[
            { label: 'Clientes', value: String(fullState.clients.length) },
            { label: 'Orçamentos', value: String(fullState.quotes.length) },
            { label: 'OPs (PCP)', value: String(fullState.orders.length) },
            { label: 'Estoque', value: String(fullState.inventory.length) },
            { label: 'Financeiro', value: String(fullState.finance.length) },
            {
              label: 'Logomarca',
              value: fullState.profile.logoUrl ? 'Ativa' : 'Padrão',
              accent: fullState.profile.logoUrl ? 'text-emerald-700' : 'text-slate-500',
            },
          ].map((item) => (
            <div
              key={item.label}
              className="p-2.5 rounded-lg bg-slate-50 border border-slate-200 text-center"
            >
              <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                {item.label}
              </div>
              <div className={`text-sm font-black font-mono mt-0.5 ${item.accent || 'text-slate-900'}`}>
                {item.value}
              </div>
            </div>
          ))}
        </div>

        {backupFeedback && (
          <div
            className={`p-3 rounded-lg border text-xs flex items-center gap-2 ${
              backupFeedback.type === 'success'
                ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                : 'bg-rose-50 border-rose-200 text-rose-800'
            }`}
          >
            {backupFeedback.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            ) : (
              <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
            )}
            <span>{backupFeedback.message}</span>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-1">
          {/* Export JSON via Blob */}
          <button
            type="button"
            onClick={handleExportBackup}
            className="flex items-center justify-center gap-2 p-3 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg font-semibold text-slate-800 transition-colors cursor-pointer"
          >
            <Download className="w-4 h-4 text-blue-600" />
            <span>Exportar Backup (JSON)</span>
          </button>

          {/* Import JSON + Server Sync */}
          <label
            className={`flex items-center justify-center gap-2 p-3 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg font-semibold text-slate-800 transition-colors ${
              isRestoringBackup ? 'opacity-60 pointer-events-none' : 'cursor-pointer'
            }`}
          >
            {isRestoringBackup ? (
              <Loader2 className="w-4 h-4 text-indigo-600 animate-spin" />
            ) : (
              <Upload className="w-4 h-4 text-indigo-600" />
            )}
            <span>{isRestoringBackup ? 'Restaurando & Sincronizando...' : 'Restaurar Backup (JSON)'}</span>
            <input
              type="file"
              accept=".json,application/json"
              disabled={isRestoringBackup}
              onChange={handleFileUpload}
              className="hidden"
            />
          </label>

          {/* Reset Local Cache & Resync */}
          {!confirmingReset ? (
            <button
              type="button"
              onClick={() => setConfirmingReset(true)}
              className="flex items-center justify-center gap-2 p-3 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-lg font-semibold text-rose-800 transition-colors cursor-pointer"
            >
              <RotateCcw className="w-4 h-4 text-rose-600" />
              <span>Ressincronizar Cache Local</span>
            </button>
          ) : (
            <div className="p-3 bg-rose-50 border border-rose-300 rounded-lg space-y-2">
              <div className="text-[11px] font-bold text-rose-900">
                Limpar cache local e recarregar do servidor?
              </div>
              <label className="flex items-center gap-1.5 text-[11px] text-rose-900 cursor-pointer">
                <input
                  type="checkbox"
                  checked={preserveLogoOnReset}
                  onChange={(e) => setPreserveLogoOnReset(e.target.checked)}
                  className="rounded border-rose-300"
                />
                <span>Manter dados e logo da empresa</span>
              </label>
              <div className="flex items-center justify-end gap-1.5">
                <button
                  type="button"
                  onClick={() => setConfirmingReset(false)}
                  className="px-2.5 py-1 text-[11px] bg-white border border-slate-300 rounded text-slate-700 hover:bg-slate-50 cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setConfirmingReset(false);
                    onResetToDefaults(preserveLogoOnReset);
                    setBackupFeedback({
                      type: 'success',
                      message: preserveLogoOnReset
                        ? 'Cache local limpo e dados ressincronizados com o servidor (perfil e logo preservados).'
                        : 'Cache local e perfil institucional restaurados aos padrões.',
                    });
                  }}
                  className="px-2.5 py-1 text-[11px] bg-rose-600 text-white font-semibold rounded hover:bg-rose-500 cursor-pointer"
                >
                  Confirmar
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
