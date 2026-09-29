import { layoutInspectionPhotos, WORK_ORDER_INSPECTION_PHOTO_SLOTS } from '@unithor/shared';
import { useState } from 'react';

import type { WorkOrderInspectionPhoto } from '../../types/entities';
import type { WorkOrderInspectionPhotoSlot } from '@unithor/shared';

const labels: Record<WorkOrderInspectionPhotoSlot, string> = {
  frontal: 'Frontal',
  trasera: 'Trasera',
  lateral_izquierdo: 'Lateral izquierdo',
  lateral_derecho: 'Lateral derecho',
  frontal_izquierdo: 'Frontal izquierdo',
  frontal_derecho: 'Frontal derecho',
  trasero_izquierdo: 'Trasero izquierdo',
  trasero_derecho: 'Trasero derecho',
  interior: 'Interior',
};

interface InspectionPhotoGalleryProps {
  photos: WorkOrderInspectionPhoto[];
  width: number;
  maxPhotoHeight?: number;
}

const photoSource = (photo: WorkOrderInspectionPhoto): string =>
  `${photo.url}${photo.url.includes('?') ? '&' : '?'}v=${encodeURIComponent(photo.updatedAt)}`;

export const InspectionPhotoGallery = ({
  photos,
  width,
  maxPhotoHeight = 112,
}: InspectionPhotoGalleryProps) => {
  const [ratios, setRatios] = useState<Record<string, number>>({});
  const [failedPhotos, setFailedPhotos] = useState<Record<string, boolean>>({});
  const orderedPhotos = [...photos].sort(
    (left, right) =>
      WORK_ORDER_INSPECTION_PHOTO_SLOTS.indexOf(left.slot) -
      WORK_ORDER_INSPECTION_PHOTO_SLOTS.indexOf(right.slot),
  );
  const rows = layoutInspectionPhotos(
    orderedPhotos.map((photo) => ratios[photoSource(photo)] ?? 4 / 3),
    width,
    maxPhotoHeight,
  );

  if (photos.length === 0) return null;

  return (
    <section
      className="mt-2 border-t border-brand-line pt-2"
      aria-label="Registro fotográfico de recepción"
    >
      <div className="mb-2 flex items-center justify-between text-[9px] font-bold text-[#0E2B4E]">
        <span>Fotos periciales de recepción</span>
        <span className="font-normal text-brand-muted">{photos.length} fotografías</span>
      </div>
      <div className="space-y-2">
        {rows.map((row) => (
          <div
            key={row.startIndex}
            className="flex justify-center gap-2"
            style={{ breakInside: 'avoid' }}
          >
            {row.widths.map((photoWidth, index) => {
              const photo = orderedPhotos[row.startIndex + index];
              const source = photoSource(photo);
              return (
                <figure key={photo.id} className="m-0 min-w-0" style={{ width: photoWidth }}>
                  <div
                    className="overflow-hidden rounded-sm bg-brand-pale"
                    style={{ height: row.height }}
                  >
                    {failedPhotos[source] ? (
                      <span className="flex h-full items-center justify-center text-center text-[8px] text-brand-muted">
                        Imagen no disponible
                      </span>
                    ) : (
                      <img
                        src={source}
                        alt={`Foto ${labels[photo.slot]}`}
                        className="block h-full w-full object-contain"
                        onLoad={({ currentTarget }) => {
                          const ratio = currentTarget.naturalWidth / currentTarget.naturalHeight;
                          if (Number.isFinite(ratio) && ratio > 0) {
                            setRatios((current) =>
                              current[source] === ratio ? current : { ...current, [source]: ratio },
                            );
                          }
                        }}
                        onError={() =>
                          setFailedPhotos((current) => ({ ...current, [source]: true }))
                        }
                      />
                    )}
                  </div>
                  <figcaption className="mt-1 break-words text-center text-[8px] font-semibold leading-3 text-brand-muted">
                    {labels[photo.slot]}
                  </figcaption>
                </figure>
              );
            })}
          </div>
        ))}
      </div>
    </section>
  );
};

export default InspectionPhotoGallery;
