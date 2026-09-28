// Equal-height rows preserve each photo's proportions and share the available width.
export const layoutInspectionPhotos = (aspectRatios, availableWidth, maxHeight, gap = 8) => {
    const rows = [];
    for (let startIndex = 0; startIndex < aspectRatios.length; startIndex += 3) {
        const ratios = aspectRatios
            .slice(startIndex, startIndex + 3)
            .map((ratio) => (Number.isFinite(ratio) && ratio > 0 ? ratio : 4 / 3));
        const height = Math.min(maxHeight, (availableWidth - gap * (ratios.length - 1)) / ratios.reduce((sum, ratio) => sum + ratio, 0));
        rows.push({ startIndex, height, widths: ratios.map((ratio) => ratio * height) });
    }
    return rows;
};
