import { DataTypes, type QueryInterface } from 'sequelize';

export async function up(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.createTable(
    'clients',
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        allowNull: false,
      },
      rut: {
        type: DataTypes.STRING(20),
        allowNull: true,
      },
      nombre: {
        type: DataTypes.STRING(180),
        allowNull: false,
      },
      tipo: {
        type: DataTypes.ENUM('cliente', 'empresa'),
        allowNull: false,
        defaultValue: 'cliente',
      },
      email: {
        type: DataTypes.STRING(180),
        allowNull: true,
      },
      telefono: {
        type: DataTypes.STRING(30),
        allowNull: true,
      },
      direccion: {
        type: DataTypes.STRING(255),
        allowNull: true,
      },
      region: {
        type: DataTypes.STRING(100),
        allowNull: true,
      },
      comuna: {
        type: DataTypes.STRING(100),
        allowNull: true,
      },
      notas: {
        type: DataTypes.TEXT,
        allowNull: true,
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

  await queryInterface.addIndex('clients', ['rut'], { name: 'clients_rut_idx' });
  await queryInterface.addIndex('clients', ['nombre'], { name: 'clients_nombre_idx' });
  await queryInterface.addIndex('clients', ['tipo'], { name: 'clients_tipo_idx' });
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.dropTable('clients');
}
