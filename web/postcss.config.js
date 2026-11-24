import autoprefixer from 'autoprefixer';
import tailwindcss from 'tailwindcss';

import typography from './postcss/typography.js';

export default {
  // The same pipeline runs in Vite development and production. Typography must
  // see Tailwind's generated utilities, including arbitrary and variant sizes.
  plugins: [tailwindcss(), autoprefixer(), typography()],
};
