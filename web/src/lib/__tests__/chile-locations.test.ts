import { describe, expect, it } from 'vitest';

import { CHILE_REGIONS } from '../../data/chile-locations';
import { findChileRegion, findCommuneRegion } from '../chile-locations';

describe('Chile territorial directory', () => {
  it('includes every region and 346 distinct communes, including Nuble and Antarctica', () => {
    expect(CHILE_REGIONS).toHaveLength(16);
    expect(new Set(CHILE_REGIONS.map((region) => region.code)).size).toBe(16);
    const communes = CHILE_REGIONS.flatMap((region) => region.communes);
    expect(communes).toHaveLength(346);
    expect(new Set(communes).size).toBe(346);
    expect(findChileRegion('Ñuble')?.communes).toHaveLength(21);
    expect(findCommuneRegion('Antártica')?.code).toBe('12');
  });

  it.each([
    ['Metropolitana', '13'],
    ['RM', '13'],
    ['Valparaiso', '05'],
    ['nuble', '16'],
    ["O'Higgins", '06'],
    ['Región de Los Ríos', '14'],
  ])('recognizes the existing region name %s', (name, code) => {
    expect(findChileRegion(name)?.code).toBe(code);
  });

  it('assigns communes to their region without depending on accents or case', () => {
    expect(findCommuneRegion('  chillan viejo  ')?.code).toBe('16');
    expect(findCommuneRegion('PUNTA ARENAS')?.code).toBe('12');
    expect(findCommuneRegion('No existe')).toBeUndefined();
  });
});
