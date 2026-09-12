import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const config = require('./config.cjs');

export default config;
