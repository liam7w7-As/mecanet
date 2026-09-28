import { describe, expect, it } from 'vitest';

import { layoutInspectionPhotos } from '../inspection-photo-layout.js';

describe('inspection photo layout', () => {
  it('fits nine mixed orientations into three rows without changing their proportions', () => {
    const ratios = [3 / 4, 16 / 9, 1, 4 / 3, 9 / 16, 4 / 3, 3 / 4, 16 / 9, 1];
    const rows = layoutInspectionPhotos(ratios, 730, 112);
    expect(rows).toHaveLength(3);
    for (const row of rows) {
      expect(row.widths.reduce((sum, width) => sum + width, 0) + 16).toBeLessThanOrEqual(730);
      expect(row.height).toBeLessThanOrEqual(112);
      row.widths.forEach((width, index) => {
        expect(width / row.height).toBeCloseTo(ratios[row.startIndex + index]);
      });
    }
  });

  it('reduces row height for wide photos and keeps incomplete rows proportional', () => {
    const rows = layoutInspectionPhotos([3, 3, 3, 0.75], 730, 112);
    expect(rows[0].height).toBeCloseTo((730 - 16) / 9);
    expect(rows[1]).toEqual({ startIndex: 3, height: 112, widths: [84] });
    expect(layoutInspectionPhotos([], 730, 112)).toEqual([]);
  });
});
