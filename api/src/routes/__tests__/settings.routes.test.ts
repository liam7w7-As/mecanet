import { Op } from 'sequelize';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { sequelize } from '../../config/database.js';
import { app } from '../../main.js';
import { CompanySettings } from '../../models/CompanySettings.js';
import { RefreshToken } from '../../models/RefreshToken.js';
import { User } from '../../models/User.js';
import { hashPassword } from '../../utils/password.js';

const TEST_PASSWORD = 'Desarrollador2026!';
const TEST_EMAIL_PREFIX = 'settings-';

// PNG 1x1 válido (magic bytes + IEND).
const PNG_BYTES = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);
// Contenido que no es una imagen aunque se declare como PNG.
const FAKE_IMAGE_BYTES = Buffer.from('esto no es una imagen');

interface LoginCookies {
  accessToken: string;
  csrfToken: string;
}

const extractCookies = (res: request.Response): Record<string, string> => {
  const rawHeader = res.headers['set-cookie'];
  const rawCookies = Array.isArray(rawHeader)
    ? rawHeader
    : typeof rawHeader === 'string'
      ? [rawHeader]
      : [];

  return rawCookies.reduce<Record<string, string>>((cookies, cookieStr) => {
    const [pair] = cookieStr.split(';');
    const separatorIndex = pair.indexOf('=');
    if (separatorIndex <= 0) {
      return cookies;
    }
    cookies[pair.slice(0, separatorIndex).trim()] = pair.slice(separatorIndex + 1).trim();
    return cookies;
  }, {});
};

const loginAs = async (email: string): Promise<LoginCookies> => {
  const response = await request(app)
    .post('/api/auth/login')
    .send({ email, password: TEST_PASSWORD });
  expect(response.status).toBe(200);
  const cookies = extractCookies(response);
  return { accessToken: cookies.access_token, csrfToken: cookies.csrf_token };
};

const authCookie = (cookies: LoginCookies): string[] => [
  `access_token=${cookies.accessToken}`,
  `csrf_token=${cookies.csrfToken}`,
];

/** Guarda los valores originales para restaurarlos al terminar. */
const snapshot: Partial<CompanySettings> = {};

const cleanup = async (): Promise<void> => {
  const users = await User.findAll({
    where: { email: { [Op.like]: `${TEST_EMAIL_PREFIX}%` } },
    paranoid: false,
  });
  if (users.length > 0) {
    const userIds = users.map((user) => user.id);
    await RefreshToken.destroy({ where: { userId: userIds }, force: true });
    await User.destroy({ where: { id: userIds }, force: true });
  }
};

const restoreSnapshot = async (): Promise<void> => {
  const current = await CompanySettings.findByPk(1);
  if (current) {
    await current.update({ ...snapshot });
  }
};

describe('Configuración de la empresa (E2E)', () => {
  let devCookies: LoginCookies;
  let jefeCookies: LoginCookies;

  beforeAll(async () => {
    await sequelize.authenticate();
    await cleanup();

    const settings = await CompanySettings.findByPk(1);
    expect(settings).not.toBeNull();
    Object.assign(snapshot, {
      razonSocial: settings?.razonSocial,
      nombreComercial: settings?.nombreComercial,
      rut: settings?.rut,
      giro: settings?.giro,
      direccion: settings?.direccion,
      region: settings?.region,
      comuna: settings?.comuna,
      telefono: settings?.telefono,
      email: settings?.email,
      sitioWeb: settings?.sitioWeb,
      logoStorageKey: settings?.logoStorageKey,
      logoMimeType: settings?.logoMimeType,
      logoSizeBytes: settings?.logoSizeBytes,
      logoUpdatedAt: settings?.logoUpdatedAt,
    });

    const passwordHash = await hashPassword(TEST_PASSWORD);
    const devUser = await User.findOne({ where: { email: 'dev@unithor.local' } });
    if (!devUser) {
      throw new Error('No se encontró el usuario desarrollador para la prueba');
    }
    await devUser.update({ passwordHash, activo: true });

    const jefeRole = await (await import('../../models/Role.js')).Role.findOne({
      where: { nombre: 'jefe' },
    });
    if (!jefeRole) {
      throw new Error('No se encontró el rol jefe para la prueba');
    }
    const previousJefe = await User.findOne({
      where: { email: { [Op.like]: `${TEST_EMAIL_PREFIX}%` } },
      paranoid: false,
    });
    if (previousJefe) {
      await previousJefe.destroy({ force: true });
    }
    const jefe = await User.create({
      nombre: 'Jefe Settings',
      email: `${TEST_EMAIL_PREFIX}jefe@unithor.local`,
      passwordHash,
      roleId: jefeRole.id,
      activo: true,
    });
    expect(jefe).toBeDefined();

    devCookies = await loginAs('dev@unithor.local');
    jefeCookies = await loginAs(`${TEST_EMAIL_PREFIX}jefe@unithor.local`);
  });

  beforeEach(async () => {
    await restoreSnapshot();
  });

  afterAll(async () => {
    await restoreSnapshot();
    await cleanup();
  });

  it('sirve el branding público sin autenticación', async () => {
    const response = await request(app).get('/api/settings/branding');

    expect(response.status).toBe(200);
    expect(response.body.razonSocial).toBe('UNITHOR SERVICIOS INTEGRALES SPA');
    expect(response.body.tieneLogo).toBe(false);
    expect(response.body.logoUrl).toBeNull();
  });

  it('responde 404 al pedir el logo cuando no hay uno configurado', async () => {
    const response = await request(app).get('/api/settings/company/logo');
    expect(response.status).toBe(404);
  });

  it('exige autenticación para leer la configuración completa', async () => {
    const response = await request(app).get('/api/settings/company');
    expect(response.status).toBe(401);
  });

  it('permite leer la configuración al desarrollador', async () => {
    const response = await request(app)
      .get('/api/settings/company')
      .set('Cookie', authCookie(devCookies));

    expect(response.status).toBe(200);
    expect(response.body.razonSocial).toBe('UNITHOR SERVICIOS INTEGRALES SPA');
    expect(response.body.logo.tieneLogo).toBe(false);
  });

  it('impide que el jefe de taller edite la configuración', async () => {
    const response = await request(app)
      .patch('/api/settings/company')
      .set('Cookie', authCookie(jefeCookies))
      .set('X-CSRF-Token', jefeCookies.csrfToken)
      .send({ razonSocial: 'OTRO NOMBRE SPA' });

    expect(response.status).toBe(403);

    const current = await CompanySettings.findByPk(1);
    expect(current?.razonSocial).toBe('UNITHOR SERVICIOS INTEGRALES SPA');
  });

  it('rechaza un RUT con dígito verificador incorrecto', async () => {
    const response = await request(app)
      .patch('/api/settings/company')
      .set('Cookie', authCookie(devCookies))
      .set('X-CSRF-Token', devCookies.csrfToken)
      .send({ rut: '77.374.788-9' });

    expect(response.status).toBe(400);
  });

  it('rechaza un payload vacío', async () => {
    const response = await request(app)
      .patch('/api/settings/company')
      .set('Cookie', authCookie(devCookies))
      .set('X-CSRF-Token', devCookies.csrfToken)
      .send({});

    expect(response.status).toBe(400);
  });

  it('actualiza la identidad y la refleja en el branding público', async () => {
    const update = await request(app)
      .patch('/api/settings/company')
      .set('Cookie', authCookie(devCookies))
      .set('X-CSRF-Token', devCookies.csrfToken)
      .send({
        razonSocial: 'SERVICIOS PREMIUM LTDA',
        nombreComercial: 'Premium',
        rut: '76.543.210-3',
        direccion: 'Av. Siempre Viva 742',
        comuna: 'Providencia',
        region: 'Metropolitana',
        telefono: '+56 2 2345 6789',
        email: 'contacto@premium.cl',
        sitioWeb: 'premium.cl',
      });

    expect(update.status).toBe(200);
    expect(update.body.razonSocial).toBe('SERVICIOS PREMIUM LTDA');
    expect(update.body.lastEditor).not.toBeNull();

    const branding = await request(app).get('/api/settings/branding');
    expect(branding.status).toBe(200);
    expect(branding.body.razonSocial).toBe('SERVICIOS PREMIUM LTDA');
    expect(branding.body.direccion).toBe('Av. Siempre Viva 742');
  });

  it('sube un logo válido y lo sirve por el endpoint público', async () => {
    const upload = await request(app)
      .post('/api/settings/company/logo')
      .set('Cookie', authCookie(devCookies))
      .set('X-CSRF-Token', devCookies.csrfToken)
      .attach('logo', PNG_BYTES, { filename: 'logo.png', contentType: 'image/png' });

    expect(upload.status).toBe(200);
    expect(upload.body.logo.tieneLogo).toBe(true);
    expect(upload.body.logo.mimeType).toBe('image/png');

    const branding = await request(app).get('/api/settings/branding');
    expect(branding.body.tieneLogo).toBe(true);
    expect(branding.body.logoUrl).toBe('/api/settings/company/logo');
    expect(branding.body.logoUpdatedAt).not.toBeNull();

    const file = await request(app).get('/api/settings/company/logo');
    expect(file.status).toBe(200);
    expect(file.headers['content-type']).toContain('image/png');
    expect(Buffer.from(file.body).subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
  });

  it('rechaza un logo cuyo contenido no es una imagen', async () => {
    const response = await request(app)
      .post('/api/settings/company/logo')
      .set('Cookie', authCookie(devCookies))
      .set('X-CSRF-Token', devCookies.csrfToken)
      .attach('logo', FAKE_IMAGE_BYTES, { filename: 'logo.png', contentType: 'image/png' });

    expect(response.status).toBe(400);
  });

  it('impide que el jefe suba un logo', async () => {
    const response = await request(app)
      .post('/api/settings/company/logo')
      .set('Cookie', authCookie(jefeCookies))
      .set('X-CSRF-Token', jefeCookies.csrfToken)
      .attach('logo', PNG_BYTES, { filename: 'logo.png', contentType: 'image/png' });

    expect(response.status).toBe(403);
  });

  it('elimina el logo y vuelve al asset original', async () => {
    const response = await request(app)
      .delete('/api/settings/company/logo')
      .set('Cookie', authCookie(devCookies))
      .set('X-CSRF-Token', devCookies.csrfToken);

    expect(response.status).toBe(200);
    expect(response.body.logo.tieneLogo).toBe(false);

    const file = await request(app).get('/api/settings/company/logo');
    expect(file.status).toBe(404);
  });
});
