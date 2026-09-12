import { Sequelize } from 'sequelize-typescript';

import { env } from './env.js';
import { logger } from '../utils/logger.js';

export const sequelize = new Sequelize(env.DATABASE_URL, {
  dialect: 'mysql',
  logging:
    env.NODE_ENV === 'production' || env.NODE_ENV === 'test'
      ? false
      : (msg: string) => logger.debug(msg),
  pool: {
    max: 10,
    min: 0,
    acquire: 30000,
    idle: 10000,
  },
});
