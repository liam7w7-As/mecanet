import { describe, it, expect } from 'vitest';

import { ROLES, WORK_ORDER_STATUS, loginSchema } from './index.js';

describe('Shared Package Constants & Schemas', () => {
  it('should export valid roles', () => {
    expect(ROLES).toContain('admin');
    expect(ROLES).toContain('desarrollador');
  });

  it('should export valid work order statuses', () => {
    expect(WORK_ORDER_STATUS).toContain('borrador');
    expect(WORK_ORDER_STATUS).toContain('en_progreso');
  });

  it('should validate login schema', () => {
    const valid = loginSchema.safeParse({ email: 'test@unithor.com', password: 'password123' });
    expect(valid.success).toBe(true);

    const invalid = loginSchema.safeParse({ email: 'invalid-email', password: '123' });
    expect(invalid.success).toBe(false);
  });
});
