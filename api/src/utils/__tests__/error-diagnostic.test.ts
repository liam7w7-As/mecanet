import { describe, expect, it } from 'vitest';

import { errorDiagnostic } from '../error-diagnostic.js';

describe('Server error diagnostics', () => {
  it('keeps a concise first line and does not append SQL or parameter lines', () => {
    expect(errorDiagnostic(new Error('Missing column\nSELECT private values\nParameters: secret'))).toBe('Error: Missing column');
    expect(errorDiagnostic(new Error('x'.repeat(1000))).length).toBeLessThan(420);
  });
  it('does not stringify arbitrary payloads or unsafe database codes', () => {
    expect(errorDiagnostic({ password: 'secret' })).toBe('Error no identificado');
    const error = Object.assign(new Error('Database failure'), { parent: { code: 'password=secret' } });
    expect(errorDiagnostic(error)).toBe('Error: Database failure');
  });
});
