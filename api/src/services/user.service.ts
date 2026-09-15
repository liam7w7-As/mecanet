import { Op } from 'sequelize';

import { invalidatePermissionCache } from './permission.service.js';
import { sequelize } from '../config/database.js';
import { RefreshToken } from '../models/RefreshToken.js';
import { Role } from '../models/Role.js';
import { User } from '../models/User.js';
import { ApiError } from '../utils/ApiError.js';
import { getPagination, type PaginationMeta } from '../utils/paginate.js';
import { hashPassword } from '../utils/password.js';

import type { CreateUserInput, UpdateUserInput, UserQueryInput } from '@unithor/shared';
import type { InferAttributes, WhereOptions } from 'sequelize';

export interface UserPublic {
  id: number;
  nombre: string;
  username: string;
  email: string;
  roleId: number;
  activo: boolean;
  createdAt: Date;
  updatedAt: Date;
  role: {
    id: number;
    nombre: string;
  };
}

export interface ListUsersResult {
  data: UserPublic[];
  meta: PaginationMeta;
}

type UserWhere = WhereOptions<InferAttributes<User>> & {
  [Op.or]?: WhereOptions<InferAttributes<User>>[];
};

const userInclude = [{ model: Role, attributes: ['id', 'nombre'] }];

const toUserPublic = (user: User): UserPublic => {
  if (!user.role) {
    throw ApiError.internal('Usuario sin rol asociado');
  }

  return {
    id: user.id,
    nombre: user.nombre,
    username: user.username,
    email: user.email,
    roleId: user.roleId,
    activo: user.activo,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
    role: {
      id: user.role.id,
      nombre: user.role.nombre,
    },
  };
};

const findRoleOrFail = async (roleId: number): Promise<Role> => {
  const role = await Role.findByPk(roleId);
  if (!role) {
    throw ApiError.badRequest('El rol especificado no existe');
  }
  return role;
};

const assertEmailAvailable = async (email: string, ignoreUserId?: number): Promise<void> => {
  const where: WhereOptions<User> = { email };
  if (ignoreUserId !== undefined) {
    where.id = { [Op.ne]: ignoreUserId };
  }

  const existing = await User.findOne({
    where,
    paranoid: false,
  });

  if (existing) {
    throw ApiError.conflict('El email ya está registrado');
  }
};

const assertUsernameAvailable = async (
  username: string,
  ignoreUserId?: number,
): Promise<void> => {
  const where: WhereOptions<User> = { username };
  if (ignoreUserId !== undefined) {
    where.id = { [Op.ne]: ignoreUserId };
  }

  const existing = await User.findOne({ where, paranoid: false });
  if (existing) {
    throw ApiError.conflict('El nombre de usuario ya está registrado');
  }
};

const assertNotLastPrivilegedUser = async (user: User): Promise<void> => {
  if (!user.role || !['desarrollador', 'admin'].includes(user.role.nombre)) {
    return;
  }

  const activePrivilegedUsers = await User.count({
    where: {
      roleId: user.roleId,
      activo: true,
      id: { [Op.ne]: user.id },
    },
  });

  if (activePrivilegedUsers === 0) {
    throw ApiError.badRequest(`No se puede eliminar al último usuario con rol '${user.role.nombre}'`);
  }
};

const revokeUserRefreshTokens = async (userId: number): Promise<void> => {
  await RefreshToken.update(
    { revokedAt: new Date() },
    { where: { userId, revokedAt: null } },
  );
};

export const listUsers = async (query: UserQueryInput): Promise<ListUsersResult> => {
  const pagination = getPagination(query);
  const where: UserWhere = {};

  if (query.search) {
    where[Op.or] = [
      { nombre: { [Op.like]: `%${query.search}%` } },
      { username: { [Op.like]: `%${query.search}%` } },
      { email: { [Op.like]: `%${query.search}%` } },
    ];
  }

  if (query.roleId !== undefined) {
    where.roleId = query.roleId;
  }

  if (query.activo !== undefined) {
    where.activo = query.activo;
  }

  const { rows, count } = await User.findAndCountAll({
    where,
    include: userInclude,
    attributes: { exclude: ['passwordHash'] },
    limit: pagination.limit,
    offset: pagination.offset,
    order: [['id', 'DESC']],
  });

  return {
    data: rows.map(toUserPublic),
    meta: pagination.meta(count),
  };
};

export const getUserById = async (id: number): Promise<UserPublic> => {
  const user = await User.findByPk(id, {
    include: userInclude,
    attributes: { exclude: ['passwordHash'] },
  });

  if (!user) {
    throw ApiError.notFound('Usuario no encontrado');
  }

  return toUserPublic(user);
};

export const createUser = async (data: CreateUserInput): Promise<UserPublic> => {
  const normalizedEmail = data.email.toLowerCase().trim();
  const normalizedUsername = data.username.toLowerCase().trim();

  await Promise.all([
    assertEmailAvailable(normalizedEmail),
    assertUsernameAvailable(normalizedUsername),
  ]);
  await findRoleOrFail(data.roleId);

  const passwordHash = await hashPassword(data.password);
  const user = await User.create({
    nombre: data.nombre,
    username: normalizedUsername,
    email: normalizedEmail,
    passwordHash,
    roleId: data.roleId,
    activo: true,
  });

  return getUserById(user.id);
};

export const updateUser = async (id: number, data: UpdateUserInput): Promise<UserPublic> => {
  const user = await User.findByPk(id, {
    include: userInclude,
  });

  if (!user) {
    throw ApiError.notFound('Usuario no encontrado');
  }

  const updatePayload: Partial<
    Pick<User, 'nombre' | 'username' | 'email' | 'roleId' | 'activo'>
  > = {};

  if (data.nombre !== undefined) {
    updatePayload.nombre = data.nombre;
  }

  if (data.username !== undefined) {
    const normalizedUsername = data.username.toLowerCase().trim();
    await assertUsernameAvailable(normalizedUsername, id);
    updatePayload.username = normalizedUsername;
  }

  if (data.email !== undefined) {
    const normalizedEmail = data.email.toLowerCase().trim();
    await assertEmailAvailable(normalizedEmail, id);
    updatePayload.email = normalizedEmail;
  }

  if (data.roleId !== undefined) {
    await findRoleOrFail(data.roleId);
    if (data.roleId !== user.roleId) {
      invalidatePermissionCache(user.roleId);
      invalidatePermissionCache(data.roleId);
    }
    updatePayload.roleId = data.roleId;
  }

  if (data.activo !== undefined) {
    updatePayload.activo = data.activo;
  }

  await user.update(updatePayload);

  if (data.activo === false) {
    await revokeUserRefreshTokens(id);
  }

  return getUserById(id);
};

export const deleteUser = async (id: number, currentUserId: number): Promise<void> => {
  if (id === currentUserId) {
    throw ApiError.badRequest('Un usuario no puede eliminarse a sí mismo');
  }

  await sequelize.transaction(async (transaction) => {
    const user = await User.findByPk(id, {
      include: userInclude,
      transaction,
      lock: transaction.LOCK.UPDATE,
    });

    if (!user) {
      throw ApiError.notFound('Usuario no encontrado');
    }

    await assertNotLastPrivilegedUser(user);

    await user.update({ activo: false }, { transaction });
    await user.destroy({ transaction });
    await RefreshToken.update(
      { revokedAt: new Date() },
      { where: { userId: id, revokedAt: null }, transaction },
    );
  });
};

export const toggleUserStatus = async (
  id: number,
  activo: boolean,
  currentUserId: number,
): Promise<UserPublic> => {
  if (id === currentUserId && activo === false) {
    throw ApiError.badRequest('Un usuario no puede desactivarse a sí mismo');
  }

  const user = await User.findByPk(id);
  if (!user) {
    throw ApiError.notFound('Usuario no encontrado');
  }

  await user.update({ activo });

  if (!activo) {
    await revokeUserRefreshTokens(id);
  }

  return getUserById(id);
};
