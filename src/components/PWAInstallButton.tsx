import React, { useState } from 'react';
import { Download, Share, PlusSquare, Smartphone, X, CheckCircle2 } from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall';

interface PWAInstallButtonProps {
  variant?: 'sidebar' | 'sidebar-collapsed' | 'header' | 'login';
  className?: string;
}

export const PWAInstallButton: React.FC<PWAInstallButtonProps> = ({
  variant = 'header',
  className = '',
}) => {
  const { canInstall, canInstallNatively, isInstalled, isIOS, promptInstall } = usePWAInstall();
  const [showGuideModal, setShowGuideModal] = useState(false);

  if (isInstalled) {
    return null;
  }

  // Em navegadores desktop/mobile sem beforeinstallprompt e fora de iOS,
  // só exibimos o botão se canInstall estiver ativo OU no variant sidebar como guia discreto
  if (!canInstall && variant === 'header') {
    return null;
  }

  const handleClick = async () => {
    if (canInstallNatively) {
      await promptInstall();
      return;
    }
    setShowGuideModal(true);
  };

  const renderTrigger = () => {
    if (variant === 'sidebar-collapsed') {
      return (
        <button
          type="button"
          onClick={handleClick}
          title="Instalar App DE FARDAS"
          aria-label="Instalar App DE FARDAS"
          className={`w-full h-9 flex items-center justify-center rounded-lg border border-white/[0.07] bg-white/[0.03] text-zinc-400 hover:text-white hover:border-white/20 hover:bg-white/[0.07] transition-colors cursor-pointer ${className}`}
        >
          <Download className="w-4 h-4 text-[#E3263E]" />
        </button>
      );
    }

    if (variant === 'sidebar') {
      return (
        <button
          type="button"
          onClick={handleClick}
          className={`w-full flex items-center justify-between gap-2 px-2.5 py-2 rounded-lg bg-white/[0.03] hover:bg-white/[0.07] border border-white/[0.07] text-left transition-colors cursor-pointer group ${className}`}
        >
          <span className="flex items-center gap-2 min-w-0">
            <Smartphone className="w-3.5 h-3.5 text-[#E3263E] shrink-0" />
            <span className="text-[11px] font-medium text-zinc-300 group-hover:text-white truncate">
              {canInstallNatively ? 'Instalar aplicativo' : 'Instalar app (PWA)'}
            </span>
          </span>
          <Download className="w-3.5 h-3.5 text-zinc-500 group-hover:text-zinc-200 shrink-0 transition-colors" />
        </button>
      );
    }

    if (variant === 'login') {
      return (
        <button
          type="button"
          onClick={handleClick}
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-zinc-300 hover:text-white bg-zinc-900/80 hover:bg-zinc-800 border border-zinc-800 transition-colors cursor-pointer whitespace-nowrap ${className}`}
        >
          <Download className="w-3.5 h-3.5 text-[#E3263E]" />
          <span>Instalar App</span>
        </button>
      );
    }

    // Default: header compact
    return (
      <button
        type="button"
        onClick={handleClick}
        title="Instalar aplicativo DE FARDAS"
        className={`inline-flex items-center gap-1.5 px-2.5 py-2 text-xs font-semibold text-zinc-700 hover:text-zinc-950 bg-zinc-100/90 hover:bg-zinc-200/80 border border-zinc-200/90 rounded-lg transition-colors cursor-pointer whitespace-nowrap shrink-0 ${className}`}
      >
        <Download className="w-3.5 h-3.5 text-[#C8102E]" />
        <span className="hidden xl:inline">Instalar App</span>
      </button>
    );
  };

  return (
    <>
      {renderTrigger()}

      {showGuideModal && (
        <div
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4"
          onClick={() => setShowGuideModal(false)}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl border border-zinc-200 max-w-md w-full overflow-hidden text-zinc-900"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 py-4 bg-[#111113] text-white flex items-center justify-between border-b border-zinc-800">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-white p-1 flex items-center justify-center shrink-0">
                  <img
                    src="/pwa-192x192.png"
                    alt="DE FARDAS"
                    className="w-full h-full object-contain"
                  />
                </div>
                <div>
                  <h3 className="text-sm font-bold leading-tight">Instalar DE FARDAS ERP</h3>
                  <p className="text-[11px] text-zinc-400">Aplicativo Web Progressivo (PWA)</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowGuideModal(false)}
                className="p-1.5 text-zinc-400 hover:text-white rounded-lg hover:bg-zinc-800 transition-colors cursor-pointer"
                aria-label="Fechar instruções de instalação"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-4 text-xs text-zinc-600">
              {isIOS ? (
                <>
                  <p className="text-zinc-700 leading-relaxed">
                    Para instalar o aplicativo oficial da <strong className="text-zinc-900">DE FARDAS</strong> no seu iPhone ou iPad via Safari:
                  </p>
                  <ol className="space-y-3">
                    <li className="flex items-start gap-3 p-3 rounded-xl bg-zinc-50 border border-zinc-200/80">
                      <span className="w-6 h-6 rounded-full bg-[#111113] text-white text-[11px] font-bold flex items-center justify-center shrink-0">
                        1
                      </span>
                      <div className="leading-relaxed">
                        Toque no botão <strong className="text-zinc-900 inline-flex items-center gap-1"><Share className="w-3.5 h-3.5 inline text-[#C8102E]" /> Compartilhar</strong> na barra do Safari.
                      </div>
                    </li>
                    <li className="flex items-start gap-3 p-3 rounded-xl bg-zinc-50 border border-zinc-200/80">
                      <span className="w-6 h-6 rounded-full bg-[#111113] text-white text-[11px] font-bold flex items-center justify-center shrink-0">
                        2
                      </span>
                      <div className="leading-relaxed">
                        Role para baixo e selecione <strong className="text-zinc-900 inline-flex items-center gap-1"><PlusSquare className="w-3.5 h-3.5 inline text-[#C8102E]" /> Adicionar à Tela de Início</strong>.
                      </div>
                    </li>
                    <li className="flex items-start gap-3 p-3 rounded-xl bg-zinc-50 border border-zinc-200/80">
                      <span className="w-6 h-6 rounded-full bg-[#111113] text-white text-[11px] font-bold flex items-center justify-center shrink-0">
                        3
                      </span>
                      <div className="leading-relaxed">
                        Toque em <strong className="text-zinc-900">Adicionar</strong> no canto superior direito. O ícone da DE FARDAS aparecerá junto aos seus apps.
                      </div>
                    </li>
                  </ol>
                </>
              ) : (
                <>
                  <p className="text-zinc-700 leading-relaxed">
                    Instale o <strong className="text-zinc-900">DE FARDAS ERP</strong> como aplicativo dedicado no computador ou celular Android:
                  </p>
                  <ul className="space-y-2.5">
                    <li className="flex items-start gap-2.5 p-3 rounded-xl bg-zinc-50 border border-zinc-200/80">
                      <CheckCircle2 className="w-4 h-4 text-[#C8102E] shrink-0 mt-0.5" />
                      <span>
                        No <strong className="text-zinc-900">Chrome ou Edge (Desktop)</strong>: clique no ícone de instalação na barra de endereços ou abra o menu <strong>⋮ → Salvar e compartilhar → Instalar página como app</strong>.
                      </span>
                    </li>
                    <li className="flex items-start gap-2.5 p-3 rounded-xl bg-zinc-50 border border-zinc-200/80">
                      <CheckCircle2 className="w-4 h-4 text-[#C8102E] shrink-0 mt-0.5" />
                      <span>
                        No <strong className="text-zinc-900">Android (Chrome)</strong>: toque no menu <strong>⋮</strong> e escolha <strong>Instalar aplicativo</strong> ou <strong>Adicionar à tela inicial</strong>.
                      </span>
                    </li>
                  </ul>
                </>
              )}
            </div>

            <div className="px-5 py-3.5 bg-zinc-50 border-t border-zinc-200 flex justify-end">
              <button
                type="button"
                onClick={() => setShowGuideModal(false)}
                className="px-4 py-2 rounded-lg bg-[#111113] hover:bg-zinc-800 text-white text-xs font-semibold transition-colors cursor-pointer"
              >
                Entendi
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
