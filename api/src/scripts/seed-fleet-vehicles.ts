/**
 * Agrega 5 vehículos de ejemplo a la flota interna.
 *
 * - Idempotente: si la patente ya existe, no la duplica.
 * - Usa el servicio real de flota, por lo que respeta las validaciones y
 *   normalización de patente/código interno.
 * - Crea las tablas de flota si aún no existen.
 *
 * Uso:
 *   npm run db:seed-fleet --workspace=api
 *   npx tsx src/scripts/seed-fleet-vehicles.ts
 */
import { createFleetVehicleSchema } from '@unithor/shared';

import { sequelize } from '../config/database.js';
import { up as ensureFleetVehicles } from '../database/migrations/040-create-fleet-vehicles.js';
import { FleetVehicle } from '../models/FleetVehicle.js';
import { createFleetVehicle } from '../services/fleet-vehicle.service.js';
import { ApiError } from '../utils/ApiError.js';

import type { CreateFleetVehicleInput } from '@unithor/shared';

const FLEET_VEHICLES: CreateFleetVehicleInput[] = [
  {
    patente: 'FLTA01',
    codigoInterno: 'FL-001',
    marca: 'Toyota',
    modelo: 'Hilux',
    ano: 2022,
    color: 'Blanco',
    kilometraje: 45_200,
    combustible: 'diesel',
    transmision: 'manual',
    estadoOperativo: 'disponible',
    sucursal: 'Casa Central',
    responsable: 'Carlos Muñoz',
  },
  {
    patente: 'FLTA02',
    codigoInterno: 'FL-002',
    marca: 'Nissan',
    modelo: 'Navara',
    ano: 2021,
    color: 'Gris',
    kilometraje: 61_800,
    combustible: 'diesel',
    transmision: 'automatica',
    estadoOperativo: 'disponible',
    sucursal: 'Sucursal Norte',
    responsable: 'María González',
  },
  {
    patente: 'FLTA03',
    codigoInterno: 'FL-003',
    marca: 'Chevrolet',
    modelo: 'D-Max',
    ano: 2023,
    color: 'Negro',
    kilometraje: 28_750,
    combustible: 'diesel',
    transmision: 'manual',
    estadoOperativo: 'en_mantencion',
    sucursal: 'Casa Central',
    responsable: 'Pedro Soto',
  },
  {
    patente: 'FLTA04',
    codigoInterno: 'FL-004',
    marca: 'Hyundai',
    modelo: 'H-1',
    ano: 2020,
    color: 'Blanco',
    kilometraje: 93_400,
    combustible: 'diesel',
    transmision: 'manual',
    estadoOperativo: 'disponible',
    sucursal: 'Sucursal Sur',
    responsable: 'Ana Rojas',
  },
  {
    patente: 'FLTA05',
    codigoInterno: 'FL-005',
    marca: 'Mitsubishi',
    modelo: 'L200',
    ano: 2019,
    color: 'Rojo',
    kilometraje: 120_300,
    combustible: 'diesel',
    transmision: 'manual',
    estadoOperativo: 'fuera_de_servicio',
    sucursal: 'Casa Central',
    responsable: 'Luis Pérez',
  },
];

const main = async (): Promise<void> => {
  await sequelize.authenticate();
  await ensureFleetVehicles(sequelize.getQueryInterface());

  let created = 0;
  let skipped = 0;
  let failed = 0;

  for (const candidate of FLEET_VEHICLES) {
    const parsed = createFleetVehicleSchema.safeParse(candidate);
    if (!parsed.success) {
      failed += 1;
      console.error(`✗ ${candidate.patente}: datos inválidos`, parsed.error.flatten().fieldErrors);
      continue;
    }

    const data = parsed.data;
    const existing = await FleetVehicle.findOne({
      where: { patente: data.patente },
      paranoid: false,
    });
    if (existing) {
      skipped += 1;
      console.info(`• ${data.patente}: ya existe (omitido)`);
      continue;
    }

    try {
      const vehicle = await createFleetVehicle(data);
      created += 1;
      console.info(
        `✓ ${vehicle.patente}: ${vehicle.marca ?? 'Sin marca'} ${vehicle.modelo ?? ''}`.trim(),
      );
    } catch (error) {
      if (error instanceof ApiError && error.statusCode === 409) {
        skipped += 1;
        console.info(`• ${data.patente}: ya existe en taller o flota (omitido)`);
        continue;
      }

      failed += 1;
      const message = error instanceof Error ? error.message : String(error);
      console.error(`✗ ${data.patente}: ${message}`);
    }
  }

  console.info('');
  console.info(
    `Resumen: ${created} creados, ${skipped} omitidos, ${failed} con error de ${FLEET_VEHICLES.length} vehículos.`,
  );

  if (failed > 0) {
    process.exitCode = 1;
  }
};

main()
  .catch((error: unknown) => {
    console.error('No se pudo ejecutar la carga de vehículos de flota.');
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await sequelize.close();
  });
