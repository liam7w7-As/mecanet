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
  ['bg-slate-300', 'bg-brand-line', 'punto o esqueleto'],
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
  ['bg-brand-dark', 'bg-brand-primaryInk', 'superficie de marca'],
  ['focus-visible:ring-brand-blue', 'focus-visible:ring-brand-primary', 'foco'],
  ['focus-visible:border-brand-blue', 'focus-visible:border-brand-primary', 'foco'],
  ['focus:ring-brand-yellow', 'focus:ring-brand-primary', 'foco'],
  ['focus-within:ring-brand-yellow', 'focus-within:ring-brand-primary', 'foco'],
  ['focus-visible:ring-brand-yellow', 'focus-visible:ring-brand-primary', 'foco'],
  ['focus-visible:outline-brand-yellow', 'focus-visible:outline-brand-primary', 'foco'],
  ['sm:border-brand-yellow', 'sm:border-brand-primaryInk', 'indicador de tab'],
  // Bordes y anillos atenuados en amarillo: son acentos de estado, no texto.
  // El tono se conserva porque no llevan texto encima.
  ['border-brand-yellow/60', 'border-brand-primary/40', 'borde atenuado'],
  ['border-brand-yellow/30', 'border-brand-primary/30', 'borde atenuado'],
  ['ring-brand-yellow/30', 'ring-brand-primary/30', 'anillo atenuado'],
  ['ring-brand-yellow/40', 'ring-brand-primary/40', 'anillo atenuado'],
  ['group-hover:border-slate-400', 'group-hover:border-brand-primary', 'borde de control'],
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
  // El hover usa un token propio mas oscuro que la base: `primaryHover` es mas
  // claro que `primaryInk`, y aplicarlo dejaria el hover mas claro que el
  // estado normal, que se ve como un error.
  ['bg-brand-primary', 'bg-brand-primaryInk', 'superficie con texto'],
  ['hover:bg-brand-primary', 'hover:bg-brand-primaryInkHover', 'hover de superficie'],
  ['active:bg-brand-primary', 'active:bg-brand-primaryInk', 'superficie con texto'],
  ['group-hover:bg-brand-primary', 'group-hover:bg-brand-primaryInk', 'superficie con texto'],
  ['hover:bg-brand-dark', 'hover:bg-brand-primaryInkHover', 'hover de superficie'],
  ['focus:bg-brand-dark', 'focus:bg-brand-primaryInk', 'superficie con texto'],
  // Bordes que acompañaban a las superficies de marca. El `/40` es un borde
  // atenuado, no una superficie con texto, asi que conserva el tono claro.
  ['border-brand-blue/40', 'border-brand-primary/40', 'borde atenuado'],
  ['border-brand-blue/30', 'border-brand-primary/30', 'borde atenuado'],
  // Anillos y bordes atenuados: conservan el tono claro porque no llevan texto
  // encima, solo marcan el foco o el estado activo.
  ['ring-brand-blue/30', 'ring-brand-primary/30', 'anillo atenuado'],
  ['ring-brand-blue/40', 'ring-brand-primary/40', 'anillo atenuado'],
  ['ring-brand-blue', 'ring-brand-primary', 'anillo de foco'],
  ['border-brand-blue', 'border-brand-primaryInk', 'borde de superficie'],
  ['hover:border-brand-blue', 'hover:border-brand-primary', 'borde de control'],
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
  ['text-amber-900', 'text-brand-ink', 'texto de aviso intenso'],
  ['text-amber-500', 'text-brand-goldInk', 'texto de aviso'],
  ['bg-amber-200', 'bg-brand-goldPale', 'chip de aviso'],
  ['border-amber-200', 'border-brand-line', 'borde de aviso'],
  ['bg-red-200', 'bg-brand-coralPale', 'chip de error'],
  ['text-red-500', 'text-brand-coralInk', 'error'],
  // --- Overlays oscuros y validacion ----------------------------------------
  // El overlay se mapea al `.scrim` de la referencia (`#18273c`), que es el
  // velo que el propio diseño usa para separar el modal del fondo. El
  // `slate-950` anterior era mas frio y mas opaco.
  ['bg-slate-950/55', 'bg-brand-scrim/55', 'velo de modal'],
  ['bg-slate-950/60', 'bg-brand-scrim/60', 'velo de modal'],
  ['bg-slate-950/45', 'bg-brand-scrim/45', 'velo de cajon'],
  ['bg-slate-950/80', 'bg-brand-scrim/80', 'velo de modal'],
  ['bg-slate-950/70', 'bg-brand-scrim/70', 'velo de modal'],
  ['bg-slate-950/65', 'bg-brand-scrim/65', 'velo de modal'],
  ['bg-slate-900', 'bg-brand-surfaceDark', 'superficie oscura'],
  ['bg-slate-800', 'bg-brand-surfaceDark', 'superficie oscura'],
  ['text-blue-100', 'text-brand-mutedOnDark', 'subtitulo sobre oscuro'],
  // Azules claros sobre superficie oscura: se mapearan al cian del diseno, que
  // es el azul claro equivalente dentro de la paleta. Las variantes `Ink` son
  // para fondo pastel y aqui serian invisibles.
  ['text-blue-200', 'text-brand-cyan', 'acento claro sobre oscuro'],
  ['text-blue-300', 'text-brand-cyan', 'acento claro sobre oscuro'],
  ['text-blue-400', 'text-brand-cyan', 'acento claro sobre oscuro'],
  ['aria-[invalid=true]:border-red-500', 'aria-[invalid=true]:border-brand-coralInk', 'borde de error'],
  ['aria-[invalid=true]:border-brand-coralInk', 'aria-[invalid=true]:border-brand-coralInk', 'borde de error'],
  ['focus:ring-red-500', 'focus:ring-brand-coralInk', 'foco de error'],
  ['focus:ring-red-200', 'focus:ring-brand-coralPale', 'foco de error'],
  ['border-emerald-600', 'border-brand-mintInk', 'borde de exito'],
  ['border-emerald-500', 'border-brand-mintInk', 'borde de exito'],
  ['focus:ring-emerald-500', 'focus:ring-brand-mintInk', 'foco de exito'],
  ['focus:ring-emerald-200', 'focus:ring-brand-mintPale', 'foco de exito'],
  ['bg-emerald-600', 'bg-brand-mintInk', 'superficie de exito'],
  // Puntos de estado y barras de avance: aqui va el acento BRILLANTE, no la
  // variante Ink. Son superficies sin texto, y oscurecerlas dejaba los puntos
  // casi negros y las barras apagadas frente al resto de la tarjeta.
  ['bg-amber-500', 'bg-brand-gold', 'punto o barra de estado'],
  ['bg-emerald-500', 'bg-brand-mint', 'punto o barra de estado'],
  ['hover:bg-emerald-600', 'hover:bg-brand-mintInk', 'hover de exito'],
  ['bg-amber-600', 'bg-brand-goldInk', 'superficie de aviso'],
  ['bg-red-600', 'bg-brand-coralInk', 'superficie de error'],
  ['bg-red-500', 'bg-brand-coral', 'punto o barra de estado'],
  ['text-red-800', 'text-brand-coralInk', 'error'],
  ['text-red-900', 'text-brand-coralInk', 'error'],
  ['hover:bg-emerald-700', 'hover:bg-brand-mintInk', 'hover de exito'],
  ['hover:bg-slate-300', 'hover:bg-brand-line', 'hover de control'],
  ['hover:bg-slate-400', 'hover:bg-brand-line', 'hover de control'],
  ['hover:border-slate-400', 'hover:border-brand-primary', 'borde de control'],
  ['hover:border-slate-300', 'hover:border-brand-primary', 'borde de control'],
  // Anillos finos de los chips: no llevan texto, solo separan del fondo.
  ['ring-emerald-200', 'ring-brand-line', 'anillo de chip'],
  ['ring-amber-200', 'ring-brand-line', 'anillo de chip'],
  // Indicador nativo de un range/input: `accent-*` es lo unico que lo pinta.
  ['accent-brand-blue', 'accent-brand-primary', 'indicador de control'],
  ['bg-blue-600', 'bg-brand-primaryInk', 'superficie informativa'],
  // Patente de la card: era casi negro (`slate-950`). El rol es texto de
  // identidad, asi que va a tinta, no al navy legacy.
  ['text-slate-950', 'text-brand-ink', 'texto de identidad'],
  // Escala `green-*`: es la misma familia que `emerald-*` y solo aparecia en un
  // estado del badge de OT.
  ['bg-green-100', 'bg-brand-mintPale', 'chip de exito'],
  ['text-green-800', 'text-brand-mintInk', 'exito'],
  ['text-green-700', 'text-brand-mintInk', 'exito'],
  ['ring-green-200', 'ring-brand-line', 'anillo de chip'],
  ['ring-red-200', 'ring-brand-line', 'anillo de chip'],
  ['hover:text-red-700', 'hover:text-brand-coralInk', 'hover de error'],
  ['border-red-700', 'border-brand-coralInk', 'borde de error'],
  // Boton destructivo solido: el rojo de Tailwind daba 7.4:1 con blanco, asi
  // que aqui el problema no es contraste sino dejar la escala vieja.
  ['hover:bg-red-800', 'hover:bg-brand-coralInk', 'hover de error'],
  ['bg-red-700', 'bg-brand-coralInk', 'superficie de error'],
  ['bg-red-800', 'bg-brand-coralInk', 'superficie de error'],
  // Linea de firma del acta: convention de impresion, regla solida y oscura. Se
  // usa `muted` en vez de `slate-500` para no dejar la escala vieja.
  ['border-slate-500', 'border-brand-muted', 'regla de documento'],
  ['border-slate-600', 'border-brand-muted', 'regla de documento'],
  ['text-emerald-900', 'text-brand-mintInk', 'exito'],
  ['text-emerald-300', 'text-brand-mintInk', 'exito'],
  ['text-red-300', 'text-brand-coralInk', 'error'],
  ['ring-violet-200', 'ring-brand-line', 'anillo de chip'],
  ['ring-slate-200', 'ring-brand-line', 'anillo de chip'],
  // Bordes de boton destructivo: `red-300` era un rojo muy claro que se
  // perdia sobre blanco. Se usa el acento a baja opacidad.
  ['border-red-300', 'border-brand-coral/40', 'borde de error'],
  ['border-emerald-100', 'border-brand-line', 'borde de exito'],
  ['border-emerald-300', 'border-brand-mint', 'borde de exito'],
  ['ring-emerald-300', 'ring-brand-mint', 'anillo de exito'],
  // Paradas de degradado: el degradado de la card usaba la escala slate. Se
  // mantiene el blanco del inicio y se llevan las dos paradas siguientes al
  // `--line` del diseño, que es un gris azulado mucho más cercano al original
  // que `slate-50` y `slate-100`.
  ['via-slate-50', 'via-brand-line/40', 'degradado'],
  ['via-slate-100', 'via-brand-line/60', 'degradado'],
  ['to-slate-100/80', 'to-brand-line/60', 'degradado'],
  ['to-slate-100', 'to-brand-line/60', 'degradado'],
  ['from-slate-50', 'from-brand-line/40', 'degradado'],
  ['from-slate-100', 'from-brand-line/60', 'degradado'],
  ['outline-brand-blue', 'outline-brand-primary', 'foco'],
  ['focus:outline-brand-blue', 'focus:outline-brand-primary', 'foco'],
  ['bg-slate-200', 'bg-brand-line', 'pista o esqueleto'],
];

// Ordena por longitud descendente para evitar reemplazos parciales.
const ORDERED = [...MAPPING].sort((a, b) => b[0].length - a[0].length);

// Guard de claves duplicadas. Con dos reglas para la misma clase legacy pero
// destinos distintos, gana la que se definio primero y la otra nunca aplica, en
// silencio. Es mejor fallar aqui que dejar un token a medio migrar.
//
// Reporta TODOS los duplicados de una vez: si solo avisara del primero,
// corregirlo y volver a ejecutar para descubrir el siguiente convierte una
// correccion de dos lineas en varias rondas.
{
  const seen = new Map();
  const duplicates = [];
  for (const [legacy, replacement, role] of MAPPING) {
    if (seen.has(legacy)) {
      duplicates.push({ legacy, a: seen.get(legacy), b: { replacement, role } });
    } else {
      seen.set(legacy, { replacement, role });
    }
  }
  if (duplicates.length > 0) {
    console.error(`MAPPING con ${duplicates.length} clave(s) duplicada(s):`);
    for (const dup of duplicates) {
      console.error(`  "${dup.legacy}"`);
      console.error(`     -> ${dup.a.replacement} (${dup.a.role})`);
      console.error(`     -> ${dup.b.replacement} (${dup.b.role})`);
    }
    process.exit(1);
  }
}

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
  // Sin esto, pasar un directorio revienta con EISDIR a mitad del lote y es
  // facil leer ese crash como "no habia nada que cambiar".
  if (fs.statSync(file).isDirectory()) {
    console.error(`"${file}" es un directorio. Pasa los archivos, no la carpeta.`);
    process.exit(1);
  }
  const original = fs.readFileSync(file, 'utf8');
  let current = original;
  const applied = new Map();

  // Itera hasta punto fijo. Sin esto las sustituciones encadenadas no
  // convergen: el orden es por longitud, y `bg-brand-blue` -> `bg-brand-primary`
  // se aplica DESPUES de que la regla de `bg-brand-primary` ya haya pasado, de
  // modo que el resultado se queda a medio camino. Con la segunda pasada se
  // alcanza la forma final.
  for (let pass = 0; pass < 5; pass += 1) {
    let changedThisPass = 0;
    for (const [legacy, replacement, role] of ORDERED) {
      // Cuenta solo coincidencias como clase suelta, no dentro de otra clase.
      const pattern = new RegExp(`(?<![\\w-])${escapeForRegExp(legacy)}(?![\\w-])`, 'g');
      if (!pattern.test(current)) continue;
      pattern.lastIndex = 0;
      const matches = current.match(pattern);
      const key = `${legacy} -> ${replacement}`;
      const previous = applied.get(key);
      applied.set(key, { legacy, replacement, role, count: (previous?.count ?? 0) + matches.length });
      current = current.replace(pattern, replacement);
      changedThisPass += matches.length;
    }
    if (changedThisPass === 0) break;
  }

  if (current === original) {
    console.log(`${file}: sin cambios`);
    continue;
  }

  fs.writeFileSync(file, current, 'utf8');
  const entries = [...applied.values()].sort((a, b) => b.count - a.count);
  const changed = entries.reduce((acc, entry) => acc + entry.count, 0);
  totalChanged += changed;
  console.log(`${file}: ${changed} sustituciones en ${entries.length} reglas`);
  for (const entry of entries) {
    console.log(`   ${String(entry.count).padStart(3)}x  ${entry.legacy} -> ${entry.replacement}  (${entry.role})`);
  }
}

console.log(`\nTotal: ${totalChanged} sustituciones.`);
