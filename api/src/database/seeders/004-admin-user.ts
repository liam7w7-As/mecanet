import bcrypt from 'bcrypt';
import dotenv from 'dotenv';

import type { QueryInterface } from 'sequelize';

dotenv.config();

export async function up(queryInterface: QueryInterface): Promise<void> {
  const email = process.env.SEED_ADMIN_EMAIL;
  const password = process.env.SEED_ADMIN_PASSWORD;
  const nombre = process.env.SEED_ADMIN_NAME || 'Desarrollador UNITHOR';

  if (!email || email.trim() === '') {
    throw new Error(
      'La variable de entorno SEED_ADMIN_EMAIL es obligatoria para ejecutar el seeder',
    );
  }

  if (!password || password.length < 12) {
    throw new Error(
      'La variable de entorno SEED_ADMIN_PASSWORD es obligatoria y debe tener al menos 12 caracteres',
    );
  }

  // Verificar si el usuario ya existe por email para idempotencia
  const [existingUser] = (await queryInterface.sequelize.query(
    'SELECT id FROM users WHERE email = :email LIMIT 1;',
    {
      replacements: { email },
    },
  )) as [{ id: number }[], unknown];

  if (existingUser.length > 0) {
    // Usuario ya existe, no duplicar ni lanzar error
    return;
  }

  // Buscar el rol 'desarrollador'
  const [roles] = (await queryInterface.sequelize.query(
    "SELECT id FROM roles WHERE nombre = 'desarrollador' LIMIT 1;",
  )) as [{ id: number }[], unknown];

  if (roles.length === 0) {
    throw new Error("No se encontró el rol 'desarrollador' en la base de datos");
  }

  const roleId = roles[0].id;
  const passwordHash = await bcrypt.hash(password, 10);
  const now = new Date();

  await queryInterface.bulkInsert('users', [
    {
      nombre,
      email,
      password_hash: passwordHash,
      role_id: roleId,
      activo: true,
      deleted_at: null,
      created_at: now,
      updated_at: now,
    },
  ]);
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  const email = process.env.SEED_ADMIN_EMAIL || 'dev@unithor.local';
  await queryInterface.bulkDelete('users', {
    email,
  });
}
