import { QueryClientProvider } from '@tanstack/react-query';
import { useEffect } from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';

import App from './App';
import './index.css';
import { MotionProvider } from './components/animate-ui/motion-config';
import { queryClient } from './lib/query-client';
import { useAuthStore } from './stores/auth.store';

const AuthInitializer = () => {
  const checkAuth = useAuthStore((state) => state.checkAuth);

  useEffect(() => {
    void checkAuth();
  }, [checkAuth]);

  return <App />;
};

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('Elemento root no encontrado en el DOM');
}

ReactDOM.createRoot(rootElement).render(
  <QueryClientProvider client={queryClient}>
    <BrowserRouter>
      <MotionProvider>
        <AuthInitializer />
      </MotionProvider>
    </BrowserRouter>
  </QueryClientProvider>,
);
