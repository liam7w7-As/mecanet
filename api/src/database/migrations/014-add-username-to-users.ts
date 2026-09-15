import { DataTypes, QueryTypes } from 'sequelize';

import type { QueryInterface } from 'sequelize';

interface ExistingUser {
  id: number;
  email: string;
}

const deriveUsername = (user: ExistingUser, used: Set<string>): string => {
  const localPart = user.email.split('@')[0] ?? '';
  const normalized = localPart
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, '')
    .slice(0, 50);
  const base = normalized.length >= 3 ? normalized : `user${user.id}`;

  if (!used.has(base)) {
    used.add(base);
    return base;
  }

  const suffix = `-${user.id}`;
  const unique = `${base.slice(0, 50 - suffix.length)}${suffix}`;
  used.add(unique);
  return unique;
};

export async function up(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.sequelize.transaction(async (transaction) => {
    await queryInterface.addColumn(
      'users',
      'username',
      {
        type: DataTypes.STRING(50),
        allowNull: true,
      },
      { transaction },
    );

    const users = await queryInterface.sequelize.query<ExistingUser>(
      'SELECT id, email FROM users ORDER BY id ASC',
      { type: QueryTypes.SELECT, transaction },
    );
    const used = new Set<string>();

    for (const user of users) {
      await queryInterface.bulkUpdate(
        'users',
        { username: deriveUsername(user, used) },
        { id: user.id },
        { transaction },
      );
    }

    await queryInterface.changeColumn(
      'users',
      'username',
      {
        type: DataTypes.STRING(50),
        allowNull: false,
      },
      { transaction },
    );
    await queryInterface.addIndex('users', ['username'], {
      name: 'users_username_unique',
      unique: true,
      transaction,
    });
  });
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.sequelize.transaction(async (transaction) => {
    await queryInterface.removeIndex('users', 'users_username_unique', { transaction });
    await queryInterface.removeColumn('users', 'username', { transaction });
  });
}
