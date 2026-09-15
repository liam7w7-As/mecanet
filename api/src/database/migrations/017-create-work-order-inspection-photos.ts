import { DataTypes } from 'sequelize';

import type { QueryInterface } from 'sequelize';

export async function up(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.createTable(
    'work_order_inspection_photos',
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        allowNull: false,
      },
      inspection_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: 'work_order_inspections', key: 'id' },
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE',
      },
      slot: {
        type: DataTypes.ENUM(
          'frontal',
          'trasera',
          'lateral_izquierdo',
          'lateral_derecho',
          'frontal_izquierdo',
          'frontal_derecho',
          'trasero_izquierdo',
          'trasero_derecho',
          'interior',
        ),
        allowNull: false,
      },
      storage_key: {
        type: DataTypes.STRING(255),
        allowNull: false,
        unique: true,
      },
      mime_type: {
        type: DataTypes.STRING(50),
        allowNull: false,
      },
      size_bytes: {
        type: DataTypes.INTEGER.UNSIGNED,
        allowNull: false,
      },
      sha256: {
        type: DataTypes.STRING(64),
        allowNull: false,
      },
      uploaded_by: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: { model: 'users', key: 'id' },
        onDelete: 'SET NULL',
        onUpdate: 'CASCADE',
      },
      created_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
      },
      updated_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
      },
    },
    {
      charset: 'utf8mb4',
      collate: 'utf8mb4_unicode_ci',
    },
  );

  await queryInterface.addIndex('work_order_inspection_photos', ['inspection_id', 'slot'], {
    name: 'work_order_inspection_photos_inspection_slot_unique',
    unique: true,
  });
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.dropTable('work_order_inspection_photos');
}
