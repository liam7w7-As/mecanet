import { PDFDocument, PDFFont, PDFImage, PDFPage, StandardFonts, rgb } from 'pdf-lib';

import type { RGB } from 'pdf-lib';

export interface LayoutTheme {
  ink: RGB;
  muted: RGB;
  line: RGB;
  pale: RGB;
  accent: RGB;
  zebra: RGB;
}

export type Align = 'left' | 'right' | 'center';

export interface Column {
  header: string;
  width: number;
  align?: Align;
  /** Clave de la fila de la que se saca el valor. Por defecto, el header. */
  key?: string;
  /** Formatea el valor. Por defecto, texto plano. */
  format?: (value: unknown, row: Record<string, unknown>) => string;
}

export interface LayoutOptions {
  title: string;
  subtitle?: string;
  company?: string;
  companyDetail?: string;
  logo?: Uint8Array | null;
  theme?: Partial<LayoutTheme>;
  page?: { width?: number; height?: number; marginTop?: number; marginBottom?: number; marginX?: number };
}

/**
 * Motor de maquetacion para PDF.
 *
 * pdf-lib dibuja a mano y no pagina solo: cada tabla implicaba calcular anchos,
 * decidir saltos y repetir encabezado a mano. Eso es lo que hizo que el reporte
 * de finanzas creciera a 23 KB. Este modulo mueve esa parte a un solo sitio y
 * deja cada reporte escrito de forma declarativa:
 *
 *   const doc = new ReportDocument({ title: 'Produccion de taller' });
 *   doc.section('Resumen por estado').table(columns, rows);
 *   return doc.finalize();
 *
 * Si manana se cambia el motor, la superficie publica de cada reporte se
 * mantiene.
 */
export class ReportDocument {
  private pdf!: PDFDocument;
  private readonly theme: LayoutTheme;
  private readonly opts: {
    title: string;
    subtitle?: string;
    company?: string;
    companyDetail?: string;
    logo?: Uint8Array | null;
    width: number;
    height: number;
    marginTop: number;
    marginBottom: number;
    marginX: number;
  };

  private regular!: PDFFont;
  private bold!: PDFFont;
  private logo?: PDFImage;
  private page!: PDFPage;
  private readonly pages: PDFPage[] = [];
  private y = 0;
  private index = 0;

  constructor(options: LayoutOptions) {
    const theme: LayoutTheme = {
      ink: rgb(0.165, 0.208, 0.278),
      muted: rgb(0.353, 0.416, 0.522),
      line: rgb(0.839, 0.886, 0.937),
      pale: rgb(0.925, 0.949, 1),
      accent: rgb(0.365, 0.529, 1),
      zebra: rgb(0.973, 0.980, 0.996),
      ...options.theme,
    };

    this.theme = theme;

    const page = options.page ?? {};
    this.opts = {
      title: options.title,
      subtitle: options.subtitle,
      company: options.company,
      companyDetail: options.companyDetail,
      logo: options.logo,
      width: page.width ?? 595.28,
      height: page.height ?? 841.89,
      marginTop: page.marginTop ?? 64,
      marginBottom: page.marginBottom ?? 56,
      marginX: page.marginX ?? 40,
    };
  }

  /** Registra las fuentes. Es asincrono porque pdf-lib las genera al vuelo. */
  async init(): Promise<this> {
    this.pdf = await PDFDocument.create();
    this.regular = await this.pdf.embedFont(StandardFonts.Helvetica);
    this.bold = await this.pdf.embedFont(StandardFonts.HelveticaBold);
    if (this.opts.logo) {
      this.logo = await this.pdf.embedPng(this.opts.logo);
    }
    this.newPage();
    return this;
  }

  static async create(options: LayoutOptions): Promise<ReportDocument> {
    return new ReportDocument(options).init();
  }

  get contentWidth(): number {
    return this.opts.width - this.opts.marginX * 2;
  }

  private newPage(): void {
    this.page = this.pdf.addPage([this.opts.width, this.opts.height]);
    this.pages.push(this.page);
    this.index += 1;
    this.y = this.opts.height - this.opts.marginTop;
    this.drawHeader();
  }

  private get fontsReady(): boolean {
    return Boolean(this.regular && this.bold);
  }

  private drawHeader(): void {
    if (!this.fontsReady) return;
    const { height, marginX, marginTop } = this.opts;
    if (this.index === 1) {
      let textX = marginX;
      if (this.logo) {
        const bounds = this.logo.scale(1);
        const maxWidth = 92;
        const maxHeight = 34;
        const scale = Math.min(maxWidth / bounds.width, maxHeight / bounds.height);
        const logoWidth = bounds.width * scale;
        const logoHeight = bounds.height * scale;
        this.page.drawImage(this.logo, {
          x: marginX,
          y: height - marginTop - 7,
          width: logoWidth,
          height: logoHeight,
        });
        textX += Math.max(logoWidth + 16, 108);
      }
      if (this.opts.company) {
        this.text(this.opts.company, textX, height - marginTop + 8, { size: 8, font: this.bold, color: this.theme.muted });
      }
      this.text(this.opts.title, textX, height - marginTop - 4, { size: 15, font: this.bold });
      if (this.opts.subtitle) {
        this.text(this.opts.subtitle, textX, height - marginTop - 20, { size: 8, color: this.theme.muted });
      }
      if (this.opts.companyDetail) {
        this.text(this.opts.companyDetail, textX, height - marginTop - 32, { size: 7, color: this.theme.muted });
      }
      this.rule(height - marginTop - 40, this.theme.accent);
      this.y = height - marginTop - 54;
      return;
    }
    let textX = marginX;
    if (this.logo) {
      const bounds = this.logo.scale(1);
      const maxWidth = 48;
      const maxHeight = 18;
      const scale = Math.min(maxWidth / bounds.width, maxHeight / bounds.height);
      this.page.drawImage(this.logo, {
        x: marginX,
        y: height - marginTop + 6,
        width: bounds.width * scale,
        height: bounds.height * scale,
      });
      textX += 58;
    }
    this.text(this.opts.title, textX, height - marginTop + 12, { size: 8, color: this.theme.muted });
    this.rule(height - marginTop + 4);
    this.y = height - marginTop - 12;
  }

  private drawFooter(page: PDFPage, pageNumber: number, totalPages: number): void {
    const { width, marginX, marginBottom } = this.opts;
    const y = marginBottom - 14;
    page.drawLine({
      start: { x: marginX, y: y + 12 },
      end: { x: width - marginX, y: y + 12 },
      thickness: 0.5,
      color: this.theme.line,
    });
    page.drawText(`${this.opts.company ?? 'UNITHOR'} - Uso interno y confidencial`, {
      x: marginX,
      y,
      size: 7,
      font: this.regular,
      color: this.theme.muted,
    });
    const total = `Pagina ${pageNumber} de ${totalPages}`;
    page.drawText(total, {
      x: width - marginX - this.regular.widthOfTextAtSize(total, 7),
      y,
      size: 7,
      font: this.regular,
      color: this.theme.muted,
    });
  }

  private text(
    value: string,
    x: number,
    y: number,
    opts: { size?: number; font?: PDFFont; color?: RGB } = {},
  ): void {
    const font = opts.font ?? this.regular;
    this.page.drawText(value, {
      x,
      y,
      size: opts.size ?? 9,
      font,
      color: opts.color ?? this.theme.ink,
    });
  }

  private rule(y: number, color: RGB = this.theme.line): void {
    this.page.drawLine({
      start: { x: this.opts.marginX, y },
      end: { x: this.opts.width - this.opts.marginX, y },
      thickness: 0.5,
      color,
    });
  }

  private requireSpace(needed: number): void {
    if (this.y - needed <= this.opts.marginBottom) {
      this.newPage();
    }
  }

  section(title: string): this {
    this.requireSpace(34);
    this.text(title, this.opts.marginX, this.y - 10, { size: 10, font: this.bold });
    this.y -= 20;
    this.rule(this.y);
    this.y -= 12;
    return this;
  }

  /** Bloque de pares clave/valor, en dos columnas. */
  keyValues(pairs: Array<[string, string]>): this {
    const columns = 2;
    const width = this.contentWidth / columns;
    const start = this.y;
    pairs.forEach(([label, value], i) => {
      const col = i % columns;
      const line = Math.floor(i / columns);
      const x = this.opts.marginX + col * width;
      const y = start - line * 16;
      this.text(label, x, y, { size: 8, color: this.theme.muted });
      this.text(value, x + 78, y, { size: 9, font: this.bold });
    });
    const used = Math.ceil(pairs.length / columns);
    this.y = start - used * 16 - 6;
    return this;
  }

  /**
   * Dibuja una tabla. Repite el encabezado en cada pagina y salta de pagina
   * antes de partir una fila, de modo que ninguna fila queda cortada.
   */
  table(columns: Column[], rows: Array<Record<string, unknown>>): this {
    if (rows.length === 0) {
      this.text('Sin registros en el periodo.', this.opts.marginX, this.y - 8, { size: 8, color: this.theme.muted });
      this.y -= 22;
      return this;
    }

    const total = columns.reduce((sum, column) => sum + column.width, 0);
    const scale = this.contentWidth / total;
    const widths = columns.map((column) => column.width * scale);
    const xOf = (index: number): number =>
      this.opts.marginX + widths.slice(0, index).reduce((sum, width) => sum + width, 0);

    const drawHeader = (): void => {
      const y = this.y;
      columns.forEach((column, i) => {
        const value = column.header;
        const x =
          column.align === 'right'
            ? xOf(i) + widths[i] - this.bold.widthOfTextAtSize(value, 8) - 4
            : column.align === 'center'
              ? xOf(i) + (widths[i] - this.bold.widthOfTextAtSize(value, 8)) / 2
              : xOf(i) + 4;
        this.text(value, x, y, { size: 8, font: this.bold, color: this.theme.muted });
      });
      this.y -= 6;
      this.rule(this.y);
      this.y -= 8;
    };

    this.requireSpace(46);
    drawHeader();

    rows.forEach((row, rowIndex) => {
      if (this.y - 16 <= this.opts.marginBottom) {
        this.newPage();
        drawHeader();
      }
      if (rowIndex % 2 === 1) {
        this.page.drawRectangle({
          x: this.opts.marginX,
          y: this.y - 4,
          width: this.contentWidth,
          height: 13,
          color: this.theme.zebra,
        });
      }
      columns.forEach((column, i) => {
        const raw = row[column.key ?? column.header];
        const value = column.format ? column.format(raw, row) : String(raw ?? '-');
        const truncated = this.fit(value, column, widths[i]);
        const x =
          column.align === 'right'
            ? xOf(i) + widths[i] - this.regular.widthOfTextAtSize(truncated, 7.6) - 4
            : column.align === 'center'
              ? xOf(i) + (widths[i] - this.regular.widthOfTextAtSize(truncated, 7.6)) / 2
              : xOf(i) + 4;
        this.text(truncated, x, this.y, { size: 7.6 });
      });
      this.y -= 13;
    });

    this.rule(this.y + 4);
    this.y -= 10;
    return this;
  }

  private fit(value: string, column: Column, width: number): string {
    const max = width - 8;
    if (this.regular.widthOfTextAtSize(value, 7.6) <= max) return value;
    let out = value;
    while (out.length > 1 && this.regular.widthOfTextAtSize(`${out}...`, 7.6) > max) {
      out = out.slice(0, -1);
    }
    return `${out}...`;
  }

  /** Cierra el documento, dibujando los pies de todas las paginas. */
  async finalize(): Promise<Uint8Array> {
    this.pages.forEach((page, index) => this.drawFooter(page, index + 1, this.pages.length));
    return this.pdf.save();
  }
}
