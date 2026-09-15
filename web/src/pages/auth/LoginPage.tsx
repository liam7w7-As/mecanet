import { loginSchema } from '@unithor/shared';
import axios from 'axios';
import { AlertCircle, Eye, EyeOff, LoaderCircle, LogIn, Wrench } from 'lucide-react';
import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

import { useLoginMutation } from '../../hooks/useAuth';

interface ApiErrorBody {
  error?: {
    code?: string;
    message?: string;
  };
}

interface LoginLocationState {
  from?: string;
}

interface FieldErrors {
  email?: string;
  password?: string;
}

const getLoginError = (error: unknown): string => {
  if (!axios.isAxiosError<ApiErrorBody>(error)) {
    return 'Ocurrió un error inesperado. Intente nuevamente.';
  }

  if (!error.response) {
    return 'No se pudo conectar con el servidor. Verifique su conexión e intente nuevamente.';
  }

  const apiMessage = error.response.data?.error?.message ?? '';
  if (apiMessage.toLowerCase().includes('inactivo')) {
    return 'Su cuenta se encuentra inactiva. Contacte a un administrador.';
  }

  if (error.response.status === 401) {
    return 'Credenciales incorrectas. Verifique su email y contraseña.';
  }

  return apiMessage || 'No fue posible iniciar sesión. Intente nuevamente.';
};

export const LoginPage = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const loginMutation = useLoginMutation();
  const navigate = useNavigate();
  const location = useLocation();
  const locationState = location.state as LoginLocationState | null;

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    setFieldErrors({});
    loginMutation.reset();

    const result = loginSchema.safeParse({ email, password });
    if (!result.success) {
      const errors = result.error.flatten().fieldErrors;
      setFieldErrors({
        email: errors.email?.[0],
        password: errors.password?.[0],
      });
      return;
    }

    loginMutation.mutate(result.data, {
      onSuccess: () => {
        navigate(locationState?.from ?? '/dashboard', { replace: true });
      },
    });
  };

  return (
    <main className="relative grid min-h-screen place-items-center overflow-hidden bg-brand-dark px-4 py-10">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-brand-yellow" />

      <section className="relative w-full max-w-md overflow-hidden rounded-lg border border-white/10 bg-white shadow-2xl shadow-black/25">
        <div className="p-6 sm:p-8">
          <div className="mb-8 flex items-center gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-brand-blue text-brand-yellow">
              <Wrench className="h-6 w-6" aria-hidden="true" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-brand-blue">UNITHOR</h1>
              <p className="text-sm text-slate-500">Sistema de Gestión de Taller</p>
            </div>
          </div>

          <div className="mb-6">
            <h2 className="text-xl font-semibold text-slate-900">Bienvenido</h2>
            <p className="mt-1 text-sm text-slate-500">Ingrese sus credenciales para continuar.</p>
          </div>

          <form className="space-y-5" noValidate onSubmit={handleSubmit}>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700" htmlFor="email">
                Correo electrónico
              </label>
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                aria-invalid={Boolean(fieldErrors.email)}
                aria-describedby={fieldErrors.email ? 'email-error' : undefined}
                className="h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm outline-none transition focus:border-brand-yellow focus:ring-2 focus:ring-brand-yellow/30 aria-[invalid=true]:border-red-500"
                placeholder="ejemplo@unithor.cl"
              />
              {fieldErrors.email && (
                <p id="email-error" className="mt-1.5 text-sm text-red-600">
                  {fieldErrors.email}
                </p>
              )}
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700" htmlFor="password">
                Contraseña
              </label>
              <div className="relative">
                <input
                  id="password"
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  aria-invalid={Boolean(fieldErrors.password)}
                  aria-describedby={fieldErrors.password ? 'password-error' : undefined}
                  className="h-11 w-full rounded-lg border border-slate-300 bg-white px-3 pr-11 text-sm outline-none transition focus:border-brand-yellow focus:ring-2 focus:ring-brand-yellow/30 aria-[invalid=true]:border-red-500"
                  placeholder="Ingrese su contraseña"
                />
                <button
                  type="button"
                  className="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-slate-500 hover:text-brand-blue"
                  onClick={() => setShowPassword((visible) => !visible)}
                  aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                  title={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                >
                  {showPassword ? (
                    <EyeOff className="h-5 w-5" aria-hidden="true" />
                  ) : (
                    <Eye className="h-5 w-5" aria-hidden="true" />
                  )}
                </button>
              </div>
              {fieldErrors.password && (
                <p id="password-error" className="mt-1.5 text-sm text-red-600">
                  {fieldErrors.password}
                </p>
              )}
            </div>

            {loginMutation.isError && (
              <div
                className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700"
                role="alert"
              >
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                <span>{getLoginError(loginMutation.error)}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={loginMutation.isPending}
              className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-brand-yellow px-4 text-sm font-bold text-brand-dark transition hover:bg-yellow-400 focus:outline-none focus:ring-2 focus:ring-brand-yellow focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loginMutation.isPending ? (
                <LoaderCircle className="h-5 w-5 animate-spin" aria-hidden="true" />
              ) : (
                <LogIn className="h-5 w-5" aria-hidden="true" />
              )}
              {loginMutation.isPending ? 'Ingresando...' : 'Iniciar Sesión'}
            </button>
          </form>
        </div>

        <div className="border-t border-slate-100 bg-slate-50 px-6 py-3 text-center text-xs text-slate-500 sm:px-8">
          Acceso exclusivo para personal autorizado
        </div>
      </section>
    </main>
  );
};

export default LoginPage;
