/**
 * Aplica el mapeo de tokens legacy a los del diseño Modernize en un archivo.
 *
 * No es un reemplazo indiscriminado: cada clase se mapea por ROL semantico
 * (texto principal, secundario, borde, superficie, foco, estado). Los colores
 * de estado (rojo de error, verde/ambar de avisos) se dejan aparte a proposito,
 * porque no son brand.
 *
 * El orden de las claves importa: se procesan de la mas larga a la mas corta
 * para que `text-slate-500` no se coma a `text-slate-50`.
 *
 * Uso: node web/designs/work/apply-design-tokens.cjs <archivo> [...]
 */
const fs = require('node:fs');

// [patron legacy, reemplazo de diseño, rol]
const MAPPING = [
  // --- Texto principal ------------------------------------------------------
  ['text-slate-900', 'text-brand-ink', 'texto principal'],
  ['text-slate-800', 'text-brand-ink', 'texto principal'],
  ['text-slate-700', 'text-brand-ink', 'texto principal'],
  ['text-slate-600', 'text-brand-muted', 'texto secundario'],
  ['text-slate-500', 'text-brand-muted', 'texto secundario'],
  ['text-slate-400', 'text-brand-muted', 'icono terciario'],
  ['text-slate-300', 'text-brand-line', 'icono de estado vacio'],
  // --- Bordes y divisores ---------------------------------------------------
  ['border-slate-300', 'border-brand-line', 'borde de control'],
  ['border-slate-200', 'border-brand-line', 'borde de superficie'],
  ['border-slate-100', 'border-brand-line', 'borde suave'],
  ['divide-slate-200', 'divide-brand-line', 'divisor'],
  ['divide-slate-100', 'divide-brand-line', 'divisor'],
  // --- Superficies ----------------------------------------------------------
  ['bg-slate-50', 'bg-brand-line/40', 'banda de encabezado'],
  ['bg-slate-100', 'bg-brand-pale', 'chip o esqueleto'],
  ['hover:bg-slate-100', 'hover:bg-brand-pale', 'hover de control'],
  ['hover:bg-slate-50', 'hover:bg-brand-pale', 'hover de fila'],
  // --- Foco -----------------------------------------------------------------
  ['focus-visible:outline-brand-blue', 'focus-visible:outline-brand-primary', 'foco'],
  ['focus:border-brand-blue', 'focus:border-brand-primary', 'foco'],
  ['focus:ring-brand-blue', 'focus:ring-brand-primary', 'foco'],
  // --- Brand legacy ---------------------------------------------------------
  ['bg-brand-blue/[0.03]', 'bg-brand-pale/60', 'fila activa'],
  ['bg-brand-blue/5', 'bg-brand-pale', 'chip o hover'],
  ['group-hover:bg-brand-blue/5', 'group-hover:bg-brand-pale', 'hover de grupo'],
  ['bg-brand-blue', 'bg-brand-primary', 'superficie de marca'],
  ['bg-brand-yellow', 'bg-brand-primary', 'CTA'],
  ['text-brand-dark', 'text-white', 'texto sobre CTA'],
  // El hover del CTA venia en el amarillo de Tailwind, no en un token de marca:
  // se quedaba amarillo sobre un boton que ya es primario.
  ['hover:bg-yellow-400', 'hover:bg-brand-primaryHover', 'hover de CTA'],
  ['hover:bg-brand-yellow', 'hover:bg-brand-primaryHover', 'hover de CTA'],
  // --- Tokens legacy de superficie ------------------------------------------
  // `brand-light` era el blanco roto de la paleta vieja y `brand-dark` el azul
  // marino. Ninguno tiene equivalente en el diseño: el blanco roto se aproxima
  // con el `--line` del diseño al 40%, que es la superficie tenue que sí usa.
  ['focus-visible:bg-brand-light', 'focus-visible:bg-brand-pale', 'foco'],
  ['hover:bg-brand-light/70', 'hover:bg-brand-line/40', 'hover de fila'],
  ['hover:bg-brand-light', 'hover:bg-brand-line/40', 'hover de fila'],
  ['bg-brand-light', 'bg-brand-line/40', 'superficie tenue'],
  ['border-brand-light', 'border-brand-line', 'borde de superficie'],
  ['hover:bg-brand-dark', 'hover:bg-brand-primaryInk', 'hover de CTA'],
  ['bg-brand-dark', 'bg-brand-primaryInk', 'superficie de marca'],
  ['focus-visible:ring-brand-blue', 'focus-visible:ring-brand-primary', 'foco'],
  ['focus-visible:border-brand-blue', 'focus-visible:border-brand-primary', 'foco'],
  ['sm:border-brand-yellow', 'sm:border-brand-primaryInk', 'indicador de tab'],
  ['text-violet-800', 'text-brand-primaryInk', 'acento como texto'],
  ['bg-amber-100', 'bg-brand-goldPale', 'chip de aviso'],
  // --- Estados (amarillo y azul de la escala Tailwind) ----------------------
  ['bg-amber-50', 'bg-brand-goldPale', 'chip de aviso'],
  ['text-amber-800', 'text-brand-goldInk', 'texto de aviso'],
  ['text-amber-700', 'text-brand-goldInk', 'texto de aviso'],
  ['hover:text-amber-700', 'hover:text-brand-goldInk', 'hover de aviso'],
  ['hover:bg-amber-50', 'hover:bg-brand-goldPale', 'hover de aviso'],
  ['bg-blue-50', 'bg-brand-pale', 'chip informativo'],
  // --- Acento como TEXTO ----------------------------------------------------
  // Van al final a proposito y en este orden. Los acentos claros no llegan a
  // 4.5:1 ni sobre su propio pastel ni sobre blanco, asi que cualquier TEXTO
  // de acento pasa a la variante `Ink`; el color brillante queda para
  // superficies, bordes e iconos. `text-brand-primary` se mapea despues que
  // `text-brand-blue` para que el orden de longitud no lo invierta.
  ['text-brand-blue', 'text-brand-primaryInk', 'enlace o acento'],
  ['hover:text-brand-blue', 'hover:text-brand-primaryInk', 'enlace o acento'],
  ['text-[#ff9800]', 'text-brand-goldInk', 'acento como texto'],
  ['text-brand-primary', 'text-brand-primaryInk', 'acento como texto'],
  ['text-brand-gold', 'text-brand-goldInk', 'acento como texto'],
  ['text-brand-coral', 'text-brand-coralInk', 'acento como texto'],
  ['text-brand-mint', 'text-brand-mintInk', 'acento como texto'],
  ['text-brand-cyan', 'text-brand-cyanInk', 'acento como texto'],
  // --- Acento como FONDO con texto encima ------------------------------------
  // `--primary` no puede llevar texto blanco: 3.29:1. En este proyecto el uso
  // de `bg-brand-primary` es practicamente siempre un boton, una tab o una
  // cabecera de tabla con texto blanco, asi que la superficie pasa a `Ink`.
  // Un icono sin texto sobre este fondo se veria algo mas oscuro, sin mas.
  ['bg-brand-primary', 'bg-brand-primaryInk', 'superficie con texto'],
  ['hover:bg-brand-primary', 'hover:bg-brand-primaryHover', 'hover de superficie'],
  ['active:bg-brand-primary', 'active:bg-brand-primaryInk', 'superficie con texto'],
  ['group-hover:bg-brand-primary', 'group-hover:bg-brand-primaryInk', 'superficie con texto'],
  // --- Estados semanticos ---------------------------------------------------
  // Tambien pasan a `Ink`: emerald y red de Tailwind tampoco cumplian 4.5:1
  // sobre sus pastel. El fondo pastel se conserva.
  ['text-emerald-700', 'text-brand-mintInk', 'exito'],
  ['text-emerald-600', 'text-brand-mintInk', 'exito'],
  ['bg-emerald-50', 'bg-brand-mintPale', 'chip de exito'],
  ['bg-emerald-100', 'bg-brand-mintPale', 'chip de exito'],
  ['text-red-700', 'text-brand-coralInk', 'error'],
  ['text-red-600', 'text-brand-coralInk', 'error'],
  ['bg-red-50', 'bg-brand-coralPale', 'chip de error'],
  ['bg-red-100', 'bg-brand-coralPale', 'chip de error'],
  // El borde de alerta no puede compartir el mismo pastel que su fondo, o
  // desaparece. Se usa el acento a baja opacidad para que se vea la separacion.
  ['border-red-200', 'border-brand-coral/30', 'borde de error'],
  ['hover:bg-red-50', 'hover:bg-brand-coralPale', 'hover de error'],
  // --- Violeta: la referencia no tiene equivalente, se acerca al primario ---
  ['bg-violet-100', 'bg-brand-pale', 'chip informativo'],
  ['text-violet-700', 'text-brand-primaryInk', 'acento como texto'],
  // --- Resto de la escala Tailwind que aparece en badges y chips -----------
  // equivalents por tono: blue -> primary, emerald/green -> mint,
  // amber/yellow -> gold, red -> coral. El fondo siempre va al pastel.
  ['bg-blue-100', 'bg-brand-pale', 'chip informativo'],
  ['text-blue-700', 'text-brand-primaryInk', 'acento como texto'],
  ['text-blue-600', 'text-brand-primaryInk', 'acento como texto'],
  ['ring-blue-200', 'ring-brand-line', 'anillo de chip'],
  ['ring-blue-100', 'ring-brand-line', 'anillo de chip'],
  ['border-blue-200', 'border-brand-line', 'borde de chip'],
  ['bg-emerald-200', 'bg-brand-mintPale', 'chip de exito'],
  ['text-emerald-800', 'text-brand-mintInk', 'exito'],
  ['text-emerald-500', 'text-brand-mintInk', 'exito'],
  ['border-emerald-200', 'border-brand-line', 'borde de exito'],
  ['text-amber-600', 'text-brand-goldInk', 'texto de aviso'],
  ['text-amber-500', 'text-brand-goldInk', 'texto de aviso'],
  ['bg-amber-200', 'bg-brand-goldPale', 'chip de aviso'],
  ['border-amber-200', 'border-brand-line', 'borde de aviso'],
  ['bg-red-200', 'bg-brand-coralPale', 'chip de error'],
  ['text-red-500', 'text-brand-coralInk', 'error'],
  ['bg-slate-200', 'bg-brand-line', 'pista o esqueleto'],
];

// Ordena por longitud descendente para evitar reemplazos parciales.
const ORDERED = [...MAPPING].sort((a, b) => b[0].length - a[0].length);

/**
 * Escapa para regex. Vive fuera del template literal del `RegExp` porque el
 * conjunto `[.*+?^${}()|[\]\\]` lleva un `${` que, dentro de una interpolacion,
 * el parser de TypeScript de ESLint rechaza con "Property assignment expected"
 * (node lo aceptaba, asi que el script funcionaba pero no era lintable).
 */
const escapeForRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const files = process.argv.slice(2);
if (files.length === 0) {
  console.error('Uso: node apply-design-tokens.cjs <archivo> [...]');
  process.exit(1);
}

let totalChanged = 0;
for (const file of files) {
  const original = fs.readFileSync(file, 'utf8');
  let current = original;
  const applied = [];

  for (const [legacy, replacement, role] of ORDERED) {
    // Cuenta solo coincidencias como clase suelta, no dentro de otra clase.
    const pattern = new RegExp(`(?<![\\w-])${escapeForRegExp(legacy)}(?![\\w-])`, 'g');
    const matches = current.match(pattern);
    if (!matches) continue;
    applied.push({ legacy, replacement, role, count: matches.length });
    current = current.replace(pattern, replacement);
  }

  if (current === original) {
    console.log(`${file}: sin cambios`);
    continue;
  }

  fs.writeFileSync(file, current, 'utf8');
  const changed = applied.reduce((acc, entry) => acc + entry.count, 0);
  totalChanged += changed;
  console.log(`${file}: ${changed} sustituciones en ${applied.length} reglas`);
  for (const entry of applied) {
    console.log(`   ${String(entry.count).padStart(3)}x  ${entry.legacy} -> ${entry.replacement}  (${entry.role})`);
  }
}

console.log(`\nTotal: ${totalChanged} sustituciones.`);
