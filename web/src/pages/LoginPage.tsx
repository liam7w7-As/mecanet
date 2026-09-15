import axios from 'axios';
import { AlertCircle, LoaderCircle, LogIn, Wrench } from 'lucide-react';
import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

import { useAuthStore } from '../stores/auth.store';

interface ApiErrorBody {
  error?: {
    message?: string;
  };
}

interface LoginLocationState {
  from?: string;
}

const getLoginError = (error: unknown): string => {
  if (axios.isAxiosError<ApiErrorBody>(error)) {
    return error.response?.data.error?.message ?? 'No fue posible iniciar sesión';
  }

  return 'No fue posible iniciar sesión';
};

export const LoginPage = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setSubmitting] = useState(false);
  const login = useAuthStore((state) => state.login);
  const navigate = useNavigate();
  const location = useLocation();
  const locationState = location.state as LoginLocationState | null;

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    setErrorMessage(null);
    setSubmitting(true);

    try {
      await login({ email, password });
      navigate(locationState?.from ?? '/dashboard', { replace: true });
    } catch (error: unknown) {
      setErrorMessage(getLoginError(error));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="grid min-h-screen place-items-center bg-brand-light px-4 py-10">
      <section className="w-full max-w-md overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lg shadow-brand-blue/5">
        <div className="h-2 bg-brand-yellow" />
        <div className="p-6 sm:p-8">
          <div className="mb-8 flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-brand-blue text-brand-yellow">
              <Wrench className="h-6 w-6" aria-hidden="true" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-brand-blue">UNITHOR</h1>
              <p className="text-sm text-slate-500">Acceso al panel operativo</p>
            </div>
          </div>

          <form className="space-y-5" onSubmit={(event) => void handleSubmit(event)}>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700" htmlFor="email">
                Correo electrónico
              </label>
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className="h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm outline-none transition focus:border-brand-blue focus:ring-2 focus:ring-brand-blue/15"
                placeholder="usuario@unithor.cl"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700" htmlFor="password">
                Contraseña
              </label>
              <input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
                minLength={8}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm outline-none transition focus:border-brand-blue focus:ring-2 focus:ring-brand-blue/15"
                placeholder="Ingresa tu contraseña"
              />
            </div>

            {errorMessage && (
              <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700" role="alert">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                <span>{errorMessage}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={isSubmitting}
              className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-brand-yellow px-4 text-sm font-bold text-brand-dark transition hover:bg-yellow-400 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSubmitting ? (
                <LoaderCircle className="h-5 w-5 animate-spin" aria-hidden="true" />
              ) : (
                <LogIn className="h-5 w-5" aria-hidden="true" />
              )}
              {isSubmitting ? 'Ingresando...' : 'Iniciar sesión'}
            </button>
          </form>
        </div>
      </section>
    </main>
  );
};

export default LoginPage;
