export interface InspectionPhotoRow {
    startIndex: number;
    height: number;
    widths: number[];
}
export declare const layoutInspectionPhotos: (aspectRatios: readonly number[], availableWidth: number, maxHeight: number, gap?: number) => InspectionPhotoRow[];
