export interface InspectionPhotoRow {
  startIndex: number;
  height: number;
  widths: number[];
}

// Equal-height rows preserve each photo's proportions and share the available width.
export const layoutInspectionPhotos = (
  aspectRatios: readonly number[],
  availableWidth: number,
  maxHeight: number,
  gap = 8,
): InspectionPhotoRow[] => {
  const rows: InspectionPhotoRow[] = [];
  for (let startIndex = 0; startIndex < aspectRatios.length; startIndex += 3) {
    const ratios = aspectRatios
      .slice(startIndex, startIndex + 3)
      .map((ratio) => (Number.isFinite(ratio) && ratio > 0 ? ratio : 4 / 3));
    const height = Math.min(
      maxHeight,
      (availableWidth - gap * (ratios.length - 1)) / ratios.reduce((sum, ratio) => sum + ratio, 0),
    );
    rows.push({ startIndex, height, widths: ratios.map((ratio) => ratio * height) });
  }
  return rows;
};
