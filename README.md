# UNITHOR - Sistema de Gestión para Taller Mecánico

Monorepo TypeScript modular con npm workspaces para la plataforma UNITHOR (gestión de órdenes de trabajo, cotizaciones, clientes, vehículos y catálogos).

## Arquitectura

- **`/shared`**: Esquemas de validación Zod, tipos TypeScript y constantes compartidas.
- **`/api`**: Backend REST con Express 5, Sequelize 6 + TypeScript, MySQL y autenticación JWT.
- **`/web`**: Frontend SPA con React 18, Vite, TypeScript, TailwindCSS y Zustand / TanStack Query.

---

## Setup en 5 Pasos

### 1. Clonar el repositorio

```bash
git clone https://github.com/liam7w7-As/mecanet.git unithor
cd unithor
```

### 2. Instalar dependencias

```bash
npm install
```

### 3. Iniciar infraestructura de servicios (opcional con Docker)

```bash
docker compose up -d
```

> Si utilizas un entorno local con XAMPP / MariaDB sin Docker, asegúrate de que MySQL esté activo en el puerto 3306.

### 4. Configurar variables de entorno

```bash
cp .env.example .env
cp api/.env.example api/.env
```

### 5. Iniciar la aplicación en modo desarrollo

```bash
npm run dev
```

- **Frontend (Web)**: [http://localhost:5173](http://localhost:5173)
- **Backend API**: [http://localhost:4000](http://localhost:4000)
- **Health Check**: [http://localhost:4000/api/health](http://localhost:4000/api/health)

---

## Scripts Disponibles

- `npm run dev`: Inicia el servidor backend (`:4000`) y la app frontend (`:5173`) concurrentemente.
- `npm run build`: Compila todos los paquetes del monorepo.
- `npm run lint`: Ejecuta el análisis de linter (ESLint) en todos los workspaces.
- `npm run format`: Formatea el código con Prettier.
- `npm run test`: Ejecuta la suite de pruebas automatizadas con Vitest.
- `npm run typecheck`: Comprueba la consistencia de tipos TypeScript en todo el monorepo.
