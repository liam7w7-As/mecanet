import ExcelJS from 'exceljs';

import {
  CATALOG_IMPORT_COLUMNS,
  FLEET_IMPORT_COLUMNS,
  VEHICLE_IMPORT_COLUMNS,
} from './import-columns.js';

import type { ImportColumnDefinition } from './import-columns.js';
import type { ImportModule } from '@unithor/shared';

const BRAND = 'FF1D396A';
const BRAND_SOFT = 'FFEFF3F9';
const LINE = 'FFD7E3EF';

const MODULE_COPY: Record<
  ImportModule,
  { title: string; intro: string; columns: readonly ImportColumnDefinition[]; fileName: string }
> = {
  catalog: {
    title: 'Importar catálogo',
    intro:
      'Usa esta plantilla para cargar servicios, trabajos y repuestos existentes. Las filas con un código o nombre que ya exista se omitirán sin modificar el registro actual.',
    columns: CATALOG_IMPORT_COLUMNS,
    fileName: 'plantilla-catalogo.xlsx',
  },
  vehicles: {
    title: 'Importar vehículos de taller',
    intro:
      'Carga vehículos de clientes. Si el propietario no existe, se creará automáticamente. Las patentes que ya existan en taller o flota se omitirán.',
    columns: VEHICLE_IMPORT_COLUMNS,
    fileName: 'plantilla-vehiculos-taller.xlsx',
  },
  'fleet-vehicles': {
    title: 'Importar vehículos de flota',
    intro:
      'Carga vehículos de uso interno. Las patentes o códigos internos que ya existan se omitirán sin modificar el registro actual.',
    columns: FLEET_IMPORT_COLUMNS,
    fileName: 'plantilla-vehiculos-flota.xlsx',
  },
};

const addInstructionsSheet = (
  workbook: ExcelJS.Workbook,
  copy: (typeof MODULE_COPY)[ImportModule],
): void => {
  const sheet = workbook.addWorksheet('Instrucciones', {
    views: [{ state: 'frozen', ySplit: 1 }],
  });

  sheet.columns = [
    { width: 30 },
    { width: 14 },
    { width: 62 },
    { width: 30 },
  ];

  sheet.mergeCells('A1:D1');
  const title = sheet.getCell('A1');
  title.value = copy.title;
  title.font = { size: 16, bold: true, color: { argb: 'FFFFFFFF' } };
  title.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BRAND } };
  title.alignment = { vertical: 'middle' };
  sheet.getRow(1).height = 30;

  sheet.mergeCells('A3:D3');
  const intro = sheet.getCell('A3');
  intro.value = copy.intro;
  intro.font = { size: 11, color: { argb: 'FF44546A' } };
  intro.alignment = { wrapText: true, vertical: 'top' };
  sheet.getRow(3).height = 46;

  const steps = [
    '1. Completa la hoja "Datos". No cambies los encabezados.',
    '2. Una fila por registro. Las filas completamente vacías se ignoran.',
    `3. Máximo ${1_000} filas por archivo y 10 MB de tamaño.`,
    '4. Sube el archivo desde el botón Importar. Primero verás una vista previa.',
  ];

  sheet.getCell('A5').value = 'Cómo usar esta plantilla';
  sheet.getCell('A5').font = { bold: true, size: 12, color: { argb: 'FF1D396A' } };

  steps.forEach((step, index) => {
    const cell = sheet.getCell(`A${6 + index}`);
    cell.value = step;
    cell.font = { size: 10 };
  });

  sheet.getCell('A11').value = 'Columnas';
  sheet.getCell('A11').font = { bold: true, size: 12, color: { argb: 'FF1D396A' } };

  const headerRow = sheet.getRow(12);
  headerRow.values = ['Columna', 'Obligatoria', 'Descripción', 'Ejemplo'];
  headerRow.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: 'FF1D396A' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BRAND_SOFT } };
    cell.border = { bottom: { style: 'thin', color: { argb: LINE } } };
  });

  copy.columns.forEach((column, index) => {
    const row = sheet.getRow(13 + index);
    row.values = [
      column.header,
      column.required ? 'Sí' : 'No',
      column.description,
      column.example ?? '',
    ];
    row.getCell(1).font = { bold: true };
    row.getCell(3).alignment = { wrapText: true, vertical: 'top' };
    row.eachCell((cell) => {
      cell.border = { bottom: { style: 'hair', color: { argb: LINE } } };
    });
  });

  sheet.getCell(`A${15 + copy.columns.length}`).value =
    'Los registros existentes no se sobrescriben: se informan como omitidos en el resumen.';
  sheet.getCell(`A${15 + copy.columns.length}`).font = {
    italic: true,
    size: 10,
    color: { argb: 'FF7A8FA8' },
  };
};

const addDataSheet = (
  workbook: ExcelJS.Workbook,
  columns: readonly ImportColumnDefinition[],
): void => {
  const sheet = workbook.addWorksheet('Datos', {
    views: [{ state: 'frozen', ySplit: 1 }],
  });

  sheet.columns = columns.map((column) => ({
    key: column.key,
    width: column.width ?? 18,
  }));

  const headerRow = sheet.getRow(1);
  columns.forEach((column, index) => {
    const cell = headerRow.getCell(index + 1);
    cell.value = column.header;
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BRAND } };
    cell.alignment = { vertical: 'middle', horizontal: 'left' };
    cell.border = {
      bottom: { style: 'thin', color: { argb: LINE } },
    };
    if (column.description) {
      cell.note = column.description;
    }
  });
  headerRow.height = 24;

  // Deja preparadas las listas desplegables sin escribir una fila de ejemplo:
  // un ejemplo en "Datos" terminaría importándose como registro real.
  columns.forEach((column, index) => {
    if (!column.list?.length) return;

    const formula = `"${column.list.join(',')}"`;
    for (let row = 2; row <= 301; row += 1) {
      sheet.getCell(row, index + 1).dataValidation = {
        type: 'list',
        allowBlank: true,
        formulae: [formula],
        showErrorMessage: true,
        errorTitle: 'Valor no válido',
        error: 'Selecciona uno de los valores de la lista o deja la celda vacía.',
      };
    }
  });

  sheet.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: columns.length },
  };
};

export const buildImportTemplate = async (module: ImportModule): Promise<Buffer> => {
  const copy = MODULE_COPY[module];
  const workbook = new ExcelJS.Workbook();

  workbook.creator = 'UNITHOR';
  workbook.created = new Date();
  workbook.modified = new Date();

  addInstructionsSheet(workbook, copy);
  addDataSheet(workbook, copy.columns);

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
};

export const importTemplateFileName = (module: ImportModule): string =>
  MODULE_COPY[module].fileName;
