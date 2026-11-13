import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { MAX_INSPECTION_PHOTO_BYTES } from '../../../lib/inspection-photos';
import ReceptionPhotoCard from '../ReceptionPhotoCard';

const renderCard = (canUpload = true) => {
  const selected = vi.fn();
  function Harness() {
    const [photo, setPhoto] = useState<{ file: File; previewUrl: string }>();
    return <ReceptionPhotoCard label="Frontal" guideImage="/guide.svg" hint="Foto frontal" photo={photo} canUpload={canUpload}
      onSelect={(file) => { selected(file); setPhoto(file ? { file, previewUrl: `/preview/${file.name}` } : undefined); }} />;
  }
  render(<Harness />);
  return selected;
};

describe('Reception photo selection', () => {
  it('shows actual preparation, file size and explicit replace/remove actions without uploading before saving', () => {
    const selected = renderCard();
    const file = new File(['image'], 'frontal.png', { type: 'image/png' });
    expect(screen.getByText(/máximo 8 MB/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Subir foto Frontal'), { target: { files: [file] } });
    expect(selected).toHaveBeenLastCalledWith(file);
    expect(screen.getByRole('status')).toHaveTextContent('Preparando foto');
    expect(screen.getByText('5 B')).toBeInTheDocument();
    fireEvent.load(screen.getByRole('img', { name: 'Frontal' }));
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(screen.getByText('Lista para guardar')).toBeInTheDocument();
    expect(screen.getByText('Reemplazar foto')).toBeInTheDocument();
    const replacement = new File(['other'], 'otra.webp', { type: 'image/webp' });
    fireEvent.change(screen.getByLabelText('Subir foto Frontal'), { target: { files: [replacement] } });
    expect(screen.getByRole('img', { name: 'Frontal' })).toHaveAttribute('src', '/preview/otra.webp');
    fireEvent.click(screen.getByRole('button', { name: 'Eliminar foto Frontal' }));
    expect(selected).toHaveBeenLastCalledWith(null);
    expect(screen.getByAltText('Ejemplo de foto: Frontal')).toBeInTheDocument();
  });

  it('keeps the selected photo when a replacement exceeds the limit or has an invalid format', () => {
    const selected = renderCard();
    fireEvent.change(screen.getByLabelText('Subir foto Frontal'), { target: { files: [new File(['ok'], 'ok.png', { type: 'image/png' })] } });
    const tooLarge = new File(['x'], 'grande.png', { type: 'image/png' });
    Object.defineProperty(tooLarge, 'size', { value: MAX_INSPECTION_PHOTO_BYTES + 1 });
    fireEvent.change(screen.getByLabelText('Subir foto Frontal'), { target: { files: [tooLarge] } });
    expect(screen.getByRole('alert')).toHaveTextContent('supera el límite de 8 MB');
    expect(screen.getByAltText('Frontal')).toHaveAttribute('src', '/preview/ok.png');
    fireEvent.change(screen.getByLabelText('Subir foto Frontal'), { target: { files: [new File(['pdf'], 'archivo.pdf', { type: 'application/pdf' })] } });
    expect(screen.getByRole('alert')).toHaveTextContent('Formato no permitido');
    expect(selected).toHaveBeenCalledTimes(1);
  });

  it('respects photo permissions', () => {
    renderCard(false);
    expect(screen.queryByLabelText('Subir foto Frontal')).not.toBeInTheDocument();
    expect(screen.getByText('Sin permiso para adjuntar fotografías')).toBeInTheDocument();
  });

  it('explains a preview decoding failure and lets the user replace the photo', () => {
    renderCard();
    fireEvent.change(screen.getByLabelText('Subir foto Frontal'), { target: { files: [new File(['image'], 'bad.png', { type: 'image/png' })] } });
    fireEvent.error(screen.getByAltText('Frontal'));
    expect(screen.getByRole('alert')).toHaveTextContent('No se pudo leer la foto');
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(screen.getByText('Reemplazar foto')).toBeInTheDocument();
  });
});
