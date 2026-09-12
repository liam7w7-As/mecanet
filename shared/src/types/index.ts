import { z } from 'zod';

import { loginSchema, paginationSchema } from '../schemas/index.js';

export type LoginInput = z.infer<typeof loginSchema>;
export type PaginationInput = z.infer<typeof paginationSchema>;
