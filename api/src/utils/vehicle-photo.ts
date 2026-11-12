/** A replacement gets a new URL while the storage key remains private. */
export const vehiclePhotoUrl = (scope: 'vehicles' | 'fleet-vehicles', id: number, key: string | null): string | null =>
  key ? `/api/${scope}/${id}/foto?v=${encodeURIComponent(key.split('/').pop() ?? '')}` : null;
