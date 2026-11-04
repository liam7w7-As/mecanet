import frontLeft from '../../assets/reception/front-left.png';
import frontRight from '../../assets/reception/front-right.png';
import front from '../../assets/reception/front.png';
import inside from '../../assets/reception/inside.png';
import left from '../../assets/reception/left.png';
import rearLeft from '../../assets/reception/rear-left.png';
import rearRight from '../../assets/reception/rear-right.png';
import rear from '../../assets/reception/rear.png';
import right from '../../assets/reception/right.png';

import type { WorkOrderInspectionPhotoSlot } from '@unithor/shared';

// Angles and placement supplied by the designer; storage still uses the shared slot IDs.
export const RECEPTION_PHOTO_GUIDES: ReadonlyArray<{
  slot: WorkOrderInspectionPhotoSlot;
  image: string;
  hint: string;
}> = [
  {
    slot: 'frontal_izquierdo',
    image: frontLeft,
    hint: 'Diagonal delantera izquierda, a unos 45°.',
  },
  { slot: 'frontal', image: front, hint: 'Frente al vehículo, a la altura de los faros.' },
  { slot: 'frontal_derecho', image: frontRight, hint: 'Diagonal delantera derecha, a unos 45°.' },
  { slot: 'lateral_izquierdo', image: left, hint: 'Todo el costado izquierdo, de rueda a rueda.' },
  { slot: 'interior', image: inside, hint: 'Desde los asientos delanteros hacia el tablero.' },
  { slot: 'lateral_derecho', image: right, hint: 'Todo el costado derecho, de rueda a rueda.' },
  { slot: 'trasero_izquierdo', image: rearLeft, hint: 'Diagonal trasera izquierda, a unos 45°.' },
  { slot: 'trasera', image: rear, hint: 'Desde atrás, incluyendo parachoques y luces.' },
  { slot: 'trasero_derecho', image: rearRight, hint: 'Diagonal trasera derecha, a unos 45°.' },
];
