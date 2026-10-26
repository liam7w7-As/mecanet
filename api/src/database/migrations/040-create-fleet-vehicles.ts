import { FLEET_VEHICLE_STATUSES } from '@unithor/shared';
import { DataTypes } from 'sequelize';

import type { QueryInterface } from 'sequelize';
const hasTable = async (queryInterface: QueryInterface, table: string): Promise<boolean> => {
  const tables = await queryInterface.showAllTables();
  return tables.includes(table);
};

export async function up(queryInterface: QueryInterface): Promise<void> {
  if (!(await hasTable(queryInterface, 'fleet_vehicles'))) {
    await queryInterface.createTable('fleet_vehicles', {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        allowNull: false,
      },
      patente: {
        type: DataTypes.STRING(15),
        allowNull: false,
        unique: true,
      },
      codigo_interno: {
        type: DataTypes.STRING(30),
        allowNull: true,
        unique: true,
      },
      marca: { type: DataTypes.STRING(80), allowNull: true },
      modelo: { type: DataTypes.STRING(80), allowNull: true },
      ano: { type: DataTypes.INTEGER, allowNull: true },
      color: { type: DataTypes.STRING(40), allowNull: true },
      vin_chasis: { type: DataTypes.STRING(50), allowNull: true },
      motor: { type: DataTypes.STRING(50), allowNull: true },
      kilometraje: { type: DataTypes.INTEGER, allowNull: true },
      combustible: { type: DataTypes.STRING(30), allowNull: true },
      transmision: { type: DataTypes.STRING(30), allowNull: true },
      estado_operativo: {
        type: DataTypes.ENUM(...FLEET_VEHICLE_STATUSES),
        allowNull: false,
        defaultValue: 'disponible',
      },
      sucursal: { type: DataTypes.STRING(120), allowNull: true },
      responsable: { type: DataTypes.STRING(120), allowNull: true },
      created_at: { type: DataTypes.DATE, allowNull: false },
      updated_at: { type: DataTypes.DATE, allowNull: false },
      deleted_at: { type: DataTypes.DATE, allowNull: true },
    });
    await queryInterface.addIndex('fleet_vehicles', ['estado_operativo'], {
      name: 'fleet_vehicles_estado_operativo_index',
    });
  }

  if (!(await hasTable(queryInterface, 'fleet_documents'))) {
    await queryInterface.createTable('fleet_documents', {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        allowNull: false,
      },
      fleet_vehicle_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: 'fleet_vehicles', key: 'id' },
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE',
      },
      nombre: { type: DataTypes.STRING(120), allowNull: false },
      referencia: { type: DataTypes.STRING(80), allowNull: true },
      notas: { type: DataTypes.TEXT, allowNull: true },
      fecha_emision: { type: DataTypes.DATEONLY, allowNull: true },
      fecha_vencimiento: { type: DataTypes.DATEONLY, allowNull: true },
      archivo_nombre: { type: DataTypes.STRING(255), allowNull: true },
      storage_key: { type: DataTypes.STRING(255), allowNull: true },
      mime_type: { type: DataTypes.STRING(100), allowNull: true },
      size_bytes: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
      sha256: { type: DataTypes.STRING(64), allowNull: true },
      version: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      subido_por: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: { model: 'users', key: 'id' },
        onDelete: 'SET NULL',
        onUpdate: 'CASCADE',
      },
      created_at: { type: DataTypes.DATE, allowNull: false },
      updated_at: { type: DataTypes.DATE, allowNull: false },
      deleted_at: { type: DataTypes.DATE, allowNull: true },
    });
    await queryInterface.addIndex('fleet_documents', ['fleet_vehicle_id', 'fecha_vencimiento'], {
      name: 'fleet_documents_vehicle_expiry_index',
    });
  }

  if (!(await hasTable(queryInterface, 'fleet_document_versions'))) {
    await queryInterface.createTable('fleet_document_versions', {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        allowNull: false,
      },
      fleet_document_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: 'fleet_documents', key: 'id' },
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE',
      },
      version: { type: DataTypes.INTEGER, allowNull: false },
      nombre: { type: DataTypes.STRING(120), allowNull: false },
      referencia: { type: DataTypes.STRING(80), allowNull: true },
      notas: { type: DataTypes.TEXT, allowNull: true },
      fecha_emision: { type: DataTypes.DATEONLY, allowNull: true },
      fecha_vencimiento: { type: DataTypes.DATEONLY, allowNull: true },
      archivo_nombre: { type: DataTypes.STRING(255), allowNull: false },
      storage_key: { type: DataTypes.STRING(255), allowNull: false },
      mime_type: { type: DataTypes.STRING(100), allowNull: false },
      size_bytes: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
      sha256: { type: DataTypes.STRING(64), allowNull: false },
      subido_por: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: { model: 'users', key: 'id' },
        onDelete: 'SET NULL',
        onUpdate: 'CASCADE',
      },
      created_at: { type: DataTypes.DATE, allowNull: false },
      updated_at: { type: DataTypes.DATE, allowNull: false },
    });
    await queryInterface.addIndex(
      'fleet_document_versions',
      ['fleet_document_id', 'version'],
      {
        name: 'fleet_document_versions_document_version_unique',
        unique: true,
      },
    );
  }
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  if (await hasTable(queryInterface, 'fleet_document_versions')) {
    await queryInterface.dropTable('fleet_document_versions');
  }
  if (await hasTable(queryInterface, 'fleet_documents')) {
    await queryInterface.dropTable('fleet_documents');
  }
  if (await hasTable(queryInterface, 'fleet_vehicles')) {
    await queryInterface.dropTable('fleet_vehicles');
  }
}
