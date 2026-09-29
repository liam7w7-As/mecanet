import { loginSchema } from '@unithor/shared';
import axios from 'axios';
import { AlertCircle, Eye, EyeOff, LoaderCircle, LogIn } from 'lucide-react';
import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

import { useCompanyBranding } from '../../components/common/BrandingContext';
import BrandLogo from '../../components/common/BrandLogo';
import { useLoginMutation } from '../../hooks/useAuth';
import { getFieldErrors } from '../../lib/form-errors';

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
  identifier?: string;
  password?: string;
}

const inputClass =
  'h-11 w-full rounded-lg border border-brand-line bg-white px-3 text-sm text-brand-ink outline-none transition placeholder:text-brand-muted/70 focus:border-brand-primary focus:ring-2 focus:ring-brand-primary/15 aria-[invalid=true]:border-brand-coralInk';

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
    return 'Credenciales incorrectas. Verifique su usuario o correo y contraseña.';
  }

  return apiMessage || 'No fue posible iniciar sesión. Intente nuevamente.';
};

const BrandPanel = ({ company }: { company: { nombreComercial: string } }) => (
  <section
    className="relative hidden items-center justify-center bg-gradient-to-br from-[#f2f6ff] via-[#eef4fe] to-[#edf9f7] px-8 py-20 lg:flex"
    aria-label={company.nombreComercial}
  >
    <div className="absolute left-8 top-0 flex h-[70px] items-center">
      <BrandLogo heightClassName="h-9" alt={company.nombreComercial} />
    </div>

    <div className="flex flex-col items-center justify-center text-center">
      <img
        src="/assets/images/backgrounds/login-illustration.svg"
        alt="Ilustración de acceso y seguridad Modernize"
        className="h-auto w-[min(500px,38vw)] max-h-[500px] object-contain drop-shadow-sm select-none"
        loading="eager"
      />
    </div>
  </section>
);


export const LoginPage = () => {
  const [identifier, setIdentifier] = useState('');
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

    const result = loginSchema.safeParse({ identifier, password });
    if (!result.success) {
      const errors = getFieldErrors(result.error.issues);
      setFieldErrors({
        identifier: errors.identifier,
        password: errors.password,
      });
      return;
    }

    loginMutation.mutate(result.data, {
      onSuccess: () => {
        navigate(locationState?.from ?? '/dashboard', { replace: true });
      },
    });
  };

  const company = useCompanyBranding();

  return (
    <div className="grid min-h-dvh bg-white lg:grid-cols-[2fr_1fr]">
      <div className="flex h-[70px] items-center border-b border-brand-line px-6 lg:hidden">
        <BrandLogo heightClassName="h-8" alt={company.nombreComercial} />
      </div>

      <BrandPanel company={company} />

      <section className="flex items-center justify-center px-6 py-12 md:px-10">
        <div className="w-full max-w-[398px]">
          <h1 className="text-2xl font-bold leading-[1.4] text-brand-ink">Iniciar sesión</h1>
          <p className="mt-1.5 text-sm text-brand-muted">
            {company.sitioWeb ? `${company.nombreComercial} · ${company.sitioWeb}` : company.nombreComercial}
          </p>

          <form className="mt-7 flex flex-col gap-6" noValidate onSubmit={handleSubmit}>
            <div className="flex flex-col gap-[7px]">
              <label className="text-sm font-medium text-brand-ink" htmlFor="identifier">
                Usuario o correo
              </label>
              <input
                id="identifier"
                name="identifier"
                type="text"
                autoComplete="username"
                value={identifier}
                onChange={(event) => setIdentifier(event.target.value)}
                aria-invalid={Boolean(fieldErrors.identifier)}
                aria-describedby={fieldErrors.identifier ? 'identifier-error' : undefined}
                className={inputClass}
                placeholder="usuario o ejemplo@unithor.cl"
              />
              {fieldErrors.identifier && (
                <p id="identifier-error" className="text-sm text-brand-coralInk">
                  {fieldErrors.identifier}
                </p>
              )}
            </div>

            <div className="flex flex-col gap-[7px]">
              <label className="text-sm font-medium text-brand-ink" htmlFor="password">
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
                  className={`${inputClass} pr-11`}
                  placeholder="Ingrese su contraseña"
                />
                <button
                  type="button"
                  className="absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-r-lg text-brand-muted transition hover:text-brand-primary"
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
                <p id="password-error" className="text-sm text-brand-coralInk">
                  {fieldErrors.password}
                </p>
              )}
            </div>

            {loginMutation.isError && (
              <div
                className="flex items-start gap-2 rounded-lg border border-brand-coralInk/25 bg-brand-coralPale px-3 py-2.5 text-sm text-brand-coralInk"
                role="alert"
              >
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                <span>{getLoginError(loginMutation.error)}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={loginMutation.isPending}
              className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-brand-primary px-4 text-sm font-semibold text-white shadow-md transition-all hover:bg-brand-primary/90 hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-brand-primary focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loginMutation.isPending ? (
                <LoaderCircle className="h-5 w-5 animate-spin" aria-hidden="true" />
              ) : (
                <LogIn className="h-5 w-5" aria-hidden="true" />
              )}
              {loginMutation.isPending ? 'Ingresando...' : 'Iniciar Sesión'}
            </button>
          </form>

          <p className="mt-7 text-center text-xs text-brand-muted">Acceso exclusivo para personal autorizado</p>
        </div>
      </section>
    </div>
  );
};

export default LoginPage;
