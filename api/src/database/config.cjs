require('dotenv').config();

const databaseUrl = process.env.DATABASE_URL || 'mysql://root:@localhost:3306/unithor_db';

module.exports = {
  development: {
    url: databaseUrl,
    dialect: 'mysql',
    logging: console.log,
    define: {
      charset: 'utf8mb4',
      collate: 'utf8mb4_unicode_ci',
      timestamps: true,
      underscored: true,
    },
  },
  test: {
    url: process.env.TEST_DATABASE_URL || 'mysql://root:@localhost:3306/unithor_test',
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
    url: databaseUrl,
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
