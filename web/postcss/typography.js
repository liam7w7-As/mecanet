import { list } from 'postcss';

const SIZE_STEP = '--ui-font-size-step';
const NORMAL_WEIGHT = '--ui-font-weight-normal';
const BOLD_WEIGHT = '--ui-font-weight-bold';
const step = `var(${SIZE_STEP}, 1pt)`;
const normalWeight = `var(${NORMAL_WEIGHT}, 600)`;
const dimension = /^(\d*\.?\d+)([a-z]+|%)$/i;
const expression = /^(?:calc|clamp|min|max|var)\(/i;

function increaseSize(value) {
  const size = value.trim();
  // Inheritance already receives the parent's increase; zero hides text in
  // several compact controls. Neither should receive an additional point.
  if (/^(?:inherit|initial|unset|revert(?:-layer)?|0)$/i.test(size) || size.includes(SIZE_STEP)) {
    return value;
  }

  const match = size.match(dimension);
  if (match) {
    const amount = Number(match[1]);
    if (amount === 0) return value;

    const unit = match[2].toLowerCase();
    if (unit === 'em' || unit === '%') {
      // Tailwind preflight uses 100%, 80% and 75%. The parent has already
      // grown by 1pt, so compensate its contribution to keep the net step 1pt.
      const factor = unit === '%' ? amount / 100 : amount;
      const compensation = Number((1 - factor).toFixed(8));
      if (compensation === 0) return value;
      return `calc(${size} + ${compensation} * ${step})`;
    }
  } else if (!expression.test(size)) {
    return value;
  }

  return `calc(${size} + ${step})`;
}

function isRootRule(rule) {
  return rule.selectors.every(
    (selector) =>
      list.space(selector).length === 1 && /^(?:html|:root|:host)(?=$|[.#[:])/.test(selector),
  );
}

function isDocumentRule(rule) {
  return rule.selectors.every((selector) =>
    /(?:\.pdf-paper-sheet|#unithor-print-portal)(?![\w-])/.test(selector),
  );
}

function isDocumentContext(node) {
  for (let parent = node.parent; parent; parent = parent.parent) {
    if (parent.type === 'rule' && isDocumentRule(parent)) return true;
    if (parent.type !== 'atrule') continue;
    if (/^(?:font-face|page)$/i.test(parent.name)) return true;
    if (
      parent.name.toLowerCase() === 'media' &&
      list.comma(parent.params).some((query) => /^(?:only\s+)?print\b/i.test(query))
    )
      return true;
  }
  return false;
}

function transformFont(value, preserveRootSize) {
  if (value.includes(SIZE_STEP) || (preserveRootSize && value.includes(NORMAL_WEIGHT)))
    return value;
  // Keep font: inherit (including the form-control resets) and system fonts.
  // Split at top-level spaces/slashes so calc() and quoted families stay whole.
  const tokens = list.space(value);
  const sizeIndex = tokens.findIndex((token) => {
    const [size] = list.split(token, ['/']);
    return dimension.test(size) || expression.test(size) || size === '0';
  });
  if (sizeIndex === -1) return value;

  const [size] = list.split(tokens[sizeIndex], ['/']);
  if (!preserveRootSize) {
    tokens[sizeIndex] = increaseSize(size) + tokens[sizeIndex].slice(size.length);
  }

  const prefix = tokens.slice(0, sizeIndex);
  const weightIndex = prefix.findIndex((token) =>
    /^(?:[1-9]\d{0,2}|1000|bold|bolder|lighter)$/i.test(token),
  );
  if (weightIndex !== -1) {
    if (tokens[weightIndex] === '400') tokens[weightIndex] = normalWeight;
  } else if (!prefix.some((token) => token.startsWith('var('))) {
    const normalIndex = prefix.findIndex((token) => token.toLowerCase() === 'normal');
    if (normalIndex !== -1) tokens[normalIndex] = normalWeight;
    else tokens.unshift(normalWeight);
  }
  return tokens.join(' ');
}

export default function typography() {
  return {
    postcssPlugin: 'unithor-ui-typography',
    // PostCSS can revisit changed declarations. OnceExit runs once, after
    // Tailwind expansion, so each explicit size receives exactly one step.
    OnceExit(root) {
      root.walkDecls(/^(?:font-size|font-weight|font)$/i, (decl) => {
        if (isDocumentContext(decl) || decl.parent.type !== 'rule') return;
        const property = decl.prop.toLowerCase();
        if (property === 'font-size') {
          // The root's 14px also sizes rem-based spacing and must stay fixed.
          if (!isRootRule(decl.parent)) decl.value = increaseSize(decl.value);
        } else if (property === 'font-weight') {
          if (/^(?:normal|400)$/i.test(decl.value.trim())) decl.value = normalWeight;
          else if (
            decl.value.trim().toLowerCase() === 'bolder' &&
            decl.parent.selectors.length === 2 &&
            decl.parent.selectors.every((selector) => ['b', 'strong'].includes(selector.trim()))
          ) {
            // Preflight's bolder was 700 over regular 400. Keep that default
            // at 700 when the UI base becomes 600; documents retain bolder.
            decl.value = `var(${BOLD_WEIGHT}, 700)`;
          }
        } else {
          // shell.css sets body's font with a shorthand, resetting its weight.
          decl.value = transformFont(decl.value, isRootRule(decl.parent));
        }
      });
    },
  };
}
