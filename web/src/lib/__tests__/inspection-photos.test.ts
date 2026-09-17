import { describe, expect, it } from 'vitest';

import { MAX_INSPECTION_PHOTO_BYTES, validateInspectionFile } from '../inspection-photos';

const makeFile = (size: number, type: string): File =>
  new File([new Uint8Array(size)], 'foto.jpg', { type });

describe('validateInspectionFile', () => {
  it('acepta JPG dentro del límite', () => {
    expect(validateInspectionFile(makeFile(1024, 'image/jpeg'))).toBeNull();
  });

  it('rechaza formatos no permitidos', () => {
    expect(validateInspectionFile(makeFile(1024, 'image/gif'))).toContain('Formato');
  });

  it('rechaza archivos sobre 8 MB', () => {
    expect(validateInspectionFile(makeFile(MAX_INSPECTION_PHOTO_BYTES + 1, 'image/png'))).toContain('8 MB');
  });
});
