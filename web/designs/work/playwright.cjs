/**
 * Resuelve Playwright para los scripts de diseño.
 *
 * Antes cada script hacía
 *   require('C:/Users/<usuario>/.cache/.../node_modules/playwright')
 * con una ruta absoluta a una maquina concreta. En la de otra persona los once
 * scripts de verificacion no arrancaban.
 *
 * Se intenta en orden y el ultimo recurso es explicito:
 *   1. PLAYWRIGHT_PATH, si se define.
 *   2. playwright, si esta instalado.
 *   3. playwright-core, que es lo que basta: los scripts abren Edge del sistema
 *      con `channel: 'msedge'` y no necesitan navegadores descargados.
 */
const candidates = [
  process.env.PLAYWRIGHT_PATH,
  'playwright',
  'playwright-core',
].filter(Boolean);

const failures = [];

for (const candidate of candidates) {
  try {
    module.exports = require(candidate);
    return;
  } catch (error) {
    failures.push(`  ${candidate}: ${error.code || error.message}`);
  }
}

throw new Error(
  [
    '',
    'No se encontro Playwright. Los scripts de web/designs/work lo necesitan para',
    'auditar las paginas con un navegador real.',
    '',
    'Instalar en el workspace de web:',
    '  npm install --save-dev --workspace=web playwright-core',
    '',
    'O indicar una instalacion existente:',
    '  set PLAYWRIGHT_PATH=C:\\ruta\\a\\node_modules\\playwright',
    '',
    'Intentos:',
    ...failures,
    '',
  ].join('\n'),
);

