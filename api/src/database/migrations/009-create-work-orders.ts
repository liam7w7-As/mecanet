import { DataTypes, type QueryInterface } from 'sequelize';

export async function up(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.createTable(
    'work_orders',
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        allowNull: false,
      },
      codigo: {
        type: DataTypes.STRING(30),
        allowNull: false,
        unique: true,
      },
      client_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: {
          model: 'clients',
          key: 'id',
        },
        onDelete: 'SET NULL',
        onUpdate: 'CASCADE',
      },
      vehicle_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: {
          model: 'vehicles',
          key: 'id',
        },
        onDelete: 'SET NULL',
        onUpdate: 'CASCADE',
      },
      estado: {
        type: DataTypes.ENUM(
          'borrador',
          'en_progreso',
          'esperando_repuesto',
          'finalizada',
          'entregada',
          'cancelada',
        ),
        allowNull: false,
        defaultValue: 'borrador',
      },
      descripcion: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      kilometraje_ingreso: {
        type: DataTypes.INTEGER,
        allowNull: true,
      },
      fecha_ingreso: {
        type: DataTypes.DATE,
        allowNull: true,
      },
      fecha_entrega: {
        type: DataTypes.DATE,
        allowNull: true,
      },
      created_by: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: {
          model: 'users',
          key: 'id',
        },
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
      deleted_at: {
        type: DataTypes.DATE,
        allowNull: true,
      },
    },
    {
      charset: 'utf8mb4',
      collate: 'utf8mb4_unicode_ci',
    },
  );

  await queryInterface.addIndex('work_orders', ['codigo'], { name: 'work_orders_codigo_idx' });
  await queryInterface.addIndex('work_orders', ['estado'], { name: 'work_orders_estado_idx' });
  await queryInterface.addIndex('work_orders', ['client_id'], {
    name: 'work_orders_client_id_idx',
  });
  await queryInterface.addIndex('work_orders', ['vehicle_id'], {
    name: 'work_orders_vehicle_id_idx',
  });
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.dropTable('work_orders');
}
