import { DatabaseError } from 'sequelize';

import { sequelize } from '../config/database.js';
import { ApiError } from '../utils/ApiError.js';

import type { Transaction } from 'sequelize';

/** Retry the entire rolled-back unit, never an individual query in a dead transaction. */
export async function withWorkshopTransaction<T>(work: (transaction: Transaction) => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt += 1) {
    try { return await sequelize.transaction(work); }
    catch (error) {
      const code = error instanceof DatabaseError ? (error.parent as Error & { code?: string }).code : undefined;
      if (code !== 'ER_LOCK_DEADLOCK') throw error;
      if (attempt >= 3) throw ApiError.conflict('Otro usuario está actualizando el trabajo. Vuelve a intentarlo');
    }
  }
}
