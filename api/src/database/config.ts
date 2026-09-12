import { env } from '../config/env.js';

interface SequelizeCliConfig {
  url?: string;
  dialect: 'mysql';
  logging?: boolean;
  dialectOptions?: {
    charset?: string;
  };
  define?: {
    charset?: string;
    collate?: string;
    timestamps?: boolean;
    underscored?: boolean;
  };
}

const config: Record<'development' | 'test' | 'production', SequelizeCliConfig> = {
  development: {
    url: env.DATABASE_URL,
    dialect: 'mysql',
    logging: true,
    define: {
      charset: 'utf8mb4',
      collate: 'utf8mb4_unicode_ci',
      timestamps: true,
      underscored: true,
    },
  },
  test: {
    url: process.env.DATABASE_URL || 'mysql://root:@localhost:3306/unithor_test',
    dialect: 'mysql',
    logging: false,
    define: {
      charset: 'utf8mb4',
      collate: 'utf8mb4_unicode_ci',
      timestamps: true,
      underscored: true,
    },
  },
  production: {
    url: env.DATABASE_URL,
    dialect: 'mysql',
    logging: false,
    define: {
      charset: 'utf8mb4',
      collate: 'utf8mb4_unicode_ci',
      timestamps: true,
      underscored: true,
    },
  },
};

export default config;
