/**
 * Falla si vuelve a aparecer una clase de color legacy en el codigo.
 *
 * El auditor de paginas (verify-page.cjs) recorre el DOM, asi que no ve las
 * clases que solo existen en estados que no se alcanzan desde la vista por
 * defecto. Ese hueco es el que dejo pasar veinte clases residuales en archivos
 * que ya creia migrados. Este chequeo es a nivel de fuente y es exhaustivo.
 *
 * Uso:  node web/designs/work/check-legacy-tokens.cjs
 * Devuelve 1 si encuentra alguna, o si no puede leer algun archivo.
 */
const fs = require('node:fs');
const path = require('node:path');

const REPO = path.resolve(__dirname, '../../..');
const SRC = path.join(REPO, 'web', 'src');

const LEGACY = /\b(?:slate|emerald|amber|violet|red|green|yellow|blue|indigo)-\d{2,3}\b|\bbrand-(?:blue|yellow|dark|light)\b/g;

/**
 * Archivos con excepcion, con motivo:
 *  - LoginPage: tiene su propia composicion (fondo marino con borde dorado) y se
 *    migra en un pase propio, no con el mapeo mecanico.
 *  - PdfPreviewModal: reproduce el PDF, que queda fuera del rediseño.
 */
const ALLOWED = new Map([
  ['pages/auth/LoginPage.tsx', 'composicion propia, pase dedicated pendiente'],
  ['components/common/PdfPreviewModal.tsx', 'reproduce el PDF, fuera de alcance'],
]);

const walk = (dir) => {
  const files = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...walk(full));
    } else if (/\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) {
      files.push(full);
    }
  }
  return files;
};

const offenders = [];
const allowed = [];

for (const file of walk(SRC)) {
  const relative = path.relative(path.join(REPO, 'web', 'src'), file).split(path.sep).join('/');
  const source = fs.readFileSync(file, 'utf8');
  const found = [...new Set(source.match(LEGACY) || [])];

  if (found.length === 0) continue;
  if (ALLOWED.has(relative)) {
    allowed.push({ file: relative, count: found.length, reason: ALLOWED.get(relative) });
  } else {
    offenders.push({ file: relative, classes: found });
  }
}

if (allowed.length > 0) {
  console.log('Excepciones registradas:');
  for (const entry of allowed) {
    console.log(`  ${entry.file}: ${entry.count} clases (${entry.reason})`);
  }
  console.log('');
}

if (offenders.length > 0) {
  console.error(`Clases legacy fuera de la excepcion: ${offenders.length} archivo(s)`);
  for (const entry of offenders) {
    console.error(`  ${entry.file}`);
    console.error(`     ${entry.classes.join(', ')}`);
  }
  process.exit(1);
}

console.log(`OK: ninguna clase legacy en web/src, salvo ${allowed.length} excepcion(es).`);
