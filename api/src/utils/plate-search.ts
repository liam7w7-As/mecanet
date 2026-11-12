import { normalizeChilePatente } from '@unithor/shared';
import { Op, col, fn, where } from 'sequelize';

/** Searches old and newly formatted plates without interrupting partial input. */
export const plateSearch = (column: string, term: string) =>
  where(fn('REPLACE', fn('REPLACE', col(column), '-', ''), ' ', ''), {
    [Op.like]: `%${normalizeChilePatente(term)}%`,
  });
