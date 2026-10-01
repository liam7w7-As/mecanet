import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { api } from '../../../lib/api';
import { useAuthStore } from '../../../stores/auth.store';
import { SettingsPage } from '../SettingsPage';

import type { PublicBranding } from '@unithor/shared';
import type { AxiosResponse } from 'axios';

vi.mock('../../../lib/api', () => ({
  api: { get: vi.fn(), patch: vi.fn(), post: vi.fn(), delete: vi.fn() },
  getCookie: vi.fn(),
  setSessionExpiredHandler: vi.fn(),
}));

const branding: PublicBranding = {
  razonSocial: 'UNITHOR SERVICIOS INTEGRALES SPA',
  nombreComercial: 'UNITHOR',
  rut: '77.374.788-1',
  direccion: 'Arturo Fernández 2101',
  region: 'Tarapacá',
  comuna: 'Iquique',
  telefono: '+56 9 2375 7478',
  email: 'contacto@unithor.cl',
  sitioWeb: 'unithor.cl',
  tieneLogo: false,
  logoUrl: null,
  logoUpdatedAt: null,
};

const companyResponse = {
  ...branding,
  giro: 'Mantenimiento vehicular',
  logo: {
    tieneLogo: false,
    logoUrl: null,
    mimeType: null,
    sizeBytes: null,
    updatedAt: null,
  },
  updatedAt: '2026-09-28T10:00:00.000Z',
  lastEditor: { id: 1, nombre: 'Desarrollador UNITHOR' },
};

const renderPage = () => {
  const queryClient = new QueryClient({
    defaultOptions: { mutations: { retry: false }, queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <SettingsPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
};

describe('SettingsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuthStore.setState({
      user: { id: 1, nombre: 'Desarrollador UNITHOR', email: 'dev@unithor.local', role: 'desarrollador' },
      isAuthenticated: true,
      isLoading: false,
    });
    vi.mocked(api.get).mockImplementation((url) => {
      if (url === '/settings/branding') {
        return Promise.resolve({ data: branding } as AxiosResponse<PublicBranding>);
      }
      if (url === '/settings/company') {
        return Promise.resolve({ data: companyResponse } as AxiosResponse<typeof companyResponse>);
      }
      return Promise.reject(new Error(`URL inesperada: ${url}`));
    });
  });

  it('carga la identidad de la empresa', async () => {
    renderPage();

    expect(await screen.findByDisplayValue('UNITHOR SERVICIOS INTEGRALES SPA')).toBeInTheDocument();
    expect(screen.getByDisplayValue('77.374.788-1')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Arturo Fernández 2101')).toBeInTheDocument();
    expect(screen.getByText(/Última edición: Desarrollador UNITHOR/)).toBeInTheDocument();
  });

  it('bloquea el acceso a roles sin permisos de administración', async () => {
    useAuthStore.setState({
      user: { id: 9, nombre: 'Jefe', email: 'jefe@unithor.local', role: 'jefe' },
      isAuthenticated: true,
      isLoading: false,
    });
    renderPage();

    expect(
      await screen.findByText(/Solo los administradores pueden ver y modificar/i),
    ).toBeInTheDocument();
    expect(api.get).not.toHaveBeenCalledWith('/settings/company', expect.anything());
  });

  it('guarda la identidad normalizando RUT y teléfono', async () => {
    vi.mocked(api.patch).mockResolvedValue({ data: companyResponse } as AxiosResponse<typeof companyResponse>);
    renderPage();

    const razonSocial = await screen.findByDisplayValue('UNITHOR SERVICIOS INTEGRALES SPA');
    fireEvent.change(razonSocial, { target: { value: 'SERVICIOS PREMIUM LTDA' } });
    expect(screen.getByText('Hay cambios sin guardar')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));

    await waitFor(() => {
      expect(api.patch).toHaveBeenCalledWith('/settings/company', {
        razonSocial: 'SERVICIOS PREMIUM LTDA',
        nombreComercial: 'UNITHOR',
        // El schema normaliza: sin puntos ni guiones, y teléfono sin espacios.
        rut: '773747881',
        giro: 'Mantenimiento vehicular',
        direccion: 'Arturo Fernández 2101',
        region: 'Tarapacá',
        comuna: 'Iquique',
        telefono: '+56923757478',
        email: 'contacto@unithor.cl',
        sitioWeb: 'unithor.cl',
      });
    });
  });

  it('no envía nada si el RUT tiene un dígito verificador inválido', async () => {
    renderPage();

    const rut = await screen.findByDisplayValue('77.374.788-1');
    fireEvent.change(rut, { target: { value: '77.374.788-9' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));

    expect(await screen.findByText(/Revisa el RUN\/RUT completo/i)).toBeInTheDocument();
    expect(api.patch).not.toHaveBeenCalled();
  });

  it('permite restaurar el logo original cuando hay uno configurado', async () => {
    vi.mocked(api.get).mockImplementation((url) => {
      if (url === '/settings/branding') {
        return Promise.resolve({
          data: { ...branding, tieneLogo: true, logoUrl: '/api/settings/company/logo', logoUpdatedAt: '2026-09-28T10:00:00.000Z' },
        } as AxiosResponse<PublicBranding>);
      }
      if (url === '/settings/company') {
        return Promise.resolve({
          data: {
            ...companyResponse,
            logo: { tieneLogo: true, logoUrl: '/api/settings/company/logo', mimeType: 'image/png', sizeBytes: 1024, updatedAt: '2026-09-28T10:00:00.000Z' },
          },
        } as unknown as AxiosResponse<typeof companyResponse>);
      }
      return Promise.reject(new Error(`URL inesperada: ${url}`));
    });
    vi.mocked(api.delete).mockResolvedValue({ data: companyResponse } as AxiosResponse<typeof companyResponse>);

    renderPage();

    fireEvent.click(await screen.findByRole('button', { name: 'Restaurar logo original' }));

    await waitFor(() => {
      expect(api.delete).toHaveBeenCalledWith('/settings/company/logo');
    });
  });

  it('muestra el logo original cuando no hay uno configurado', async () => {
    renderPage();

    expect(await screen.findByText('Logo original del sistema')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Restaurar logo original' })).not.toBeInTheDocument();
  });
});
