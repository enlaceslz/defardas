import React, { useEffect, useState } from 'react';
import { WifiOff, Wifi } from 'lucide-react';
import { useOnlineStatus } from '../hooks/useOnlineStatus';

export const OfflineIndicator: React.FC = () => {
  const isOnline = useOnlineStatus();
  const [wasOffline, setWasOffline] = useState(false);
  const [showReconnected, setShowReconnected] = useState(false);

  useEffect(() => {
    if (!isOnline) {
      setWasOffline(true);
      setShowReconnected(false);
    } else if (wasOffline) {
      setShowReconnected(true);
      const timer = setTimeout(() => {
        setShowReconnected(false);
        setWasOffline(false);
      }, 3500);
      return () => clearTimeout(timer);
    }
  }, [isOnline, wasOffline]);

  if (isOnline && !showReconnected) {
    return null;
  }

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-20 lg:bottom-5 left-1/2 -translate-x-1/2 z-50 px-4 max-w-[92vw]"
    >
      {!isOnline ? (
        <div className="flex items-center gap-2.5 px-4 py-2.5 rounded-xl bg-[#111113] text-white border border-amber-500/40 shadow-xl text-xs font-medium">
          <WifiOff className="w-4 h-4 text-amber-400 shrink-0" />
          <span>Sem conexão — exibindo dados em cache. Sincronização automática ao reconectar.</span>
        </div>
      ) : (
        <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#111113] text-white border border-emerald-500/40 shadow-xl text-xs font-medium">
          <Wifi className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>Conexão restabelecida com o servidor DE FARDAS.</span>
        </div>
      )}
    </div>
  );
};
