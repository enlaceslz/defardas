import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import App from './App.tsx';
import './index.css';
import { AuthProvider } from './api/authContext';

// Registra Service Worker do PWA com atualização automática silenciosa
registerSW({
  immediate: true,
  onRegisterError(error) {
    console.warn('[DE FARDAS PWA] Falha ao registrar Service Worker:', error);
  },
});

createRoot(document.getElementById('root')!).render(
  <AuthProvider>
    <App />
  </AuthProvider>
);
