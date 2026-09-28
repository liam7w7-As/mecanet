import { fireEvent, render, screen } from '@testing-library/react';
import { WORK_ORDER_INSPECTION_PHOTO_SLOTS } from '@unithor/shared';
import { describe, expect, it } from 'vitest';

import InspectionPhotoGallery from '../InspectionPhotoGallery';

import type { WorkOrderInspectionPhoto } from '../../../types/entities';

const photos: WorkOrderInspectionPhoto[] = WORK_ORDER_INSPECTION_PHOTO_SLOTS.map((slot, index) => ({
  id: index + 1,
  slot,
  url: `/api/work-orders/1/inspection/photos/${slot}`,
  mimeType: 'image/png',
  sizeBytes: 1024,
  uploadedBy: 1,
  createdAt: '2026-09-26T12:00:00.000Z',
  updatedAt: '2026-09-26T12:00:00.000Z',
}));

describe('InspectionPhotoGallery', () => {
  it('renders every slot in canonical order, including the last three photos', () => {
    render(<InspectionPhotoGallery photos={[...photos].reverse()} width={730} />);
    const images = screen.getAllByRole('img');
    expect(images).toHaveLength(9);
    expect(images.map((image) => image.getAttribute('src'))).toEqual(
      photos.map((photo) => `${photo.url}?v=${encodeURIComponent(photo.updatedAt)}`),
    );
    expect(screen.getByText('9 fotografías')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Foto Interior' })).toBeInTheDocument();
  });

  it('adapts each frame to loaded portrait and landscape dimensions without cropping', () => {
    render(<InspectionPhotoGallery photos={photos.slice(0, 2)} width={730} />);
    const portrait = screen.getByRole('img', { name: 'Foto Frontal' });
    const landscape = screen.getByRole('img', { name: 'Foto Trasera' });
    Object.defineProperties(portrait, {
      naturalWidth: { value: 600 },
      naturalHeight: { value: 800 },
    });
    Object.defineProperties(landscape, {
      naturalWidth: { value: 1600 },
      naturalHeight: { value: 900 },
    });
    fireEvent.load(portrait);
    fireEvent.load(landscape);
    expect(portrait.closest('figure')).toHaveStyle({ width: '84px' });
    expect(portrait.parentElement).toHaveStyle({ height: '112px' });
    expect(parseFloat(landscape.closest('figure')?.style.width ?? '0') / 112).toBeCloseTo(16 / 9);
    expect(portrait).toHaveClass('object-contain');
    expect(landscape).toHaveClass('object-contain');
  });

  it('keeps a labeled placeholder when a photo is unavailable', () => {
    render(<InspectionPhotoGallery photos={photos.slice(0, 1)} width={730} />);
    fireEvent.error(screen.getByRole('img'));
    expect(screen.getByText('Imagen no disponible')).toBeInTheDocument();
    expect(screen.getByText('Frontal')).toBeInTheDocument();
  });

  it('loads a replaced photo with a new revision instead of keeping the cached failure', () => {
    const { rerender } = render(<InspectionPhotoGallery photos={photos.slice(0, 1)} width={730} />);
    fireEvent.error(screen.getByRole('img'));
    rerender(
      <InspectionPhotoGallery
        photos={[{ ...photos[0], updatedAt: '2026-09-26T13:00:00.000Z' }]}
        width={730}
      />,
    );
    expect(screen.queryByText('Imagen no disponible')).not.toBeInTheDocument();
    expect(screen.getByRole('img')).toHaveAttribute(
      'src',
      `${photos[0].url}?v=2026-09-26T13%3A00%3A00.000Z`,
    );
  });
});
