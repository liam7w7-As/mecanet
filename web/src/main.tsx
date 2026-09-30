import { QueryClientProvider } from '@tanstack/react-query';
import { useEffect } from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';

import App from './App';
import './index.css';
// Primitivas del diseño objetivo, en orden de precedencia:
//   shell.css      -> barra lateral, topbar, tarjetas, KPIs (del HTML de ref.)
//   modernize.css  -> tablas, formularios y chips (de views.css, iterados después)
//   overrides.css  -> desviaciones propias, al final para ganarle a las dos
// Se importan después de index.css para que ganen a las utilidades de Tailwind.
import './styles/shell.css';
import './styles/modernize.css';
// Va último a propósito: `modernize.css` se carga después de `shell.css`, así
// que una variante definida en shell.css no podría ganarle a `.status-chip`.
import './styles/overrides.css';
import { MotionProvider } from './components/animate-ui/motion-config';
import { BrandingProvider } from './components/common/BrandingContext';
import { OfflineIndicator } from './components/pwa/OfflineIndicator';
import { PwaReloadPrompt } from './components/pwa/PwaReloadPrompt';
import { queryClient } from './lib/query-client';
import { useAuthStore } from './stores/auth.store';

const AuthInitializer = () => {
  const checkAuth = useAuthStore((state) => state.checkAuth);

  useEffect(() => {
    void checkAuth();
  }, [checkAuth]);

  return (
    <>
      <App />
      <PwaReloadPrompt />
      <OfflineIndicator />
    </>
  );
};

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('Elemento root no encontrado en el DOM');
}

ReactDOM.createRoot(rootElement).render(
  <QueryClientProvider client={queryClient}>
    <BrowserRouter>
      <MotionProvider>
        <BrandingProvider>
          <AuthInitializer />
        </BrandingProvider>
      </MotionProvider>
    </BrowserRouter>
  </QueryClientProvider>,
);
