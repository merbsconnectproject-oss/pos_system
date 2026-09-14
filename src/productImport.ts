/**
 * Product import — FR-PROD-10, screens D-12 … D-16.
 *
 * Parse a delimited file, map its columns onto system fields, validate every row,
 * then preview counts before anything is written. Rows that fail validation are
 * reported with a reason and can be downloaded as an error file; the operator may
 * proceed with the valid rows only.
 */
import type { Product } from './types';
import { roundMoney } from './money';

export interface ParsedFile {
  headers: string[];
  rows: string[][];
}

/** Handles quoted fields and embedded commas/newlines. */
export function parseDelimited(text: string, delimiter = ','): ParsedFile {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
      continue;
    }
    if (char === '"') {
      inQuotes = true;
    } else if (char === delimiter) {
      row.push(field.trim());
      field = '';
    } else if (char === '\n') {
      row.push(field.trim());
      if (row.some((cell) => cell !== '')) rows.push(row);
      row = [];
      field = '';
    } else if (char !== '\r') {
      field += char;
    }
  }
  row.push(field.trim());
  if (row.some((cell) => cell !== '')) rows.push(row);

  const headers = rows.shift() || [];
  return { headers, rows };
}

/** The fields an import can populate. */
export const IMPORT_FIELDS = [
  { key: 'name', label: 'Product name', required: true },
  { key: 'sku', label: 'SKU', required: false },
  { key: 'category', label: 'Category', required: false },
  { key: 'brand', label: 'Brand', required: false },
  { key: 'barcode', label: 'Barcode', required: false },
  { key: 'baseUnit', label: 'Base unit', required: false },
  { key: 'retailPrice', label: 'Retail price', required: true },
  { key: 'tradePrice', label: 'Trade price', required: false },
  { key: 'floorPrice', label: 'Floor price', required: false },
] as const;

export type ImportField = (typeof IMPORT_FIELDS)[number]['key'];
export type ColumnMapping = Partial<Record<ImportField, number>>;

/** Best-effort match of source headers to system fields, for the D-13 screen. */
export function guessMapping(headers: string[]): ColumnMapping {
  const mapping: ColumnMapping = {};
  const normalise = (value: string) => value.toLowerCase().replace(/[^a-z]/g, '');
  const aliases: Record<ImportField, string[]> = {
    name: ['name', 'productname', 'description', 'item'],
    sku: ['sku', 'code', 'itemcode', 'productcode'],
    category: ['category', 'group'],
    brand: ['brand', 'make', 'manufacturer'],
    barcode: ['barcode', 'ean', 'upc'],
    baseUnit: ['baseunit', 'unit', 'uom'],
    retailPrice: ['retail', 'retailprice', 'price', 'sellingprice'],
    tradePrice: ['trade', 'tradeprice', 'wholesale'],
    floorPrice: ['floor', 'floorprice', 'minprice', 'minimumprice'],
  };
  headers.forEach((header, index) => {
    const key = normalise(header);
    (Object.keys(aliases) as ImportField[]).forEach((field) => {
      if (mapping[field] === undefined && aliases[field].includes(key)) mapping[field] = index;
    });
  });
  return mapping;
}

export interface ValidatedRow {
  rowNumber: number;
  values: Partial<Record<ImportField, string>>;
  errors: string[];
  /** True when this SKU already exists, so the import updates rather than creates. */
  isUpdate: boolean;
}

export interface ValidationResult {
  valid: ValidatedRow[];
  invalid: ValidatedRow[];
  toCreate: number;
  toUpdate: number;
}

const isMoney = (value: string) => value !== '' && Number.isFinite(Number(value)) && Number(value) >= 0;

/** D-14: row-level errors with reasons. */
export function validateRows(
  parsed: ParsedFile,
  mapping: ColumnMapping,
  existingProducts: Product[],
): ValidationResult {
  const existingSkus = new Set(existingProducts.map((product) => product.sku.toLowerCase()));
  const seenSkus = new Set<string>();
  const valid: ValidatedRow[] = [];
  const invalid: ValidatedRow[] = [];

  parsed.rows.forEach((cells, index) => {
    const values: Partial<Record<ImportField, string>> = {};
    (Object.keys(mapping) as ImportField[]).forEach((field) => {
      const column = mapping[field];
      if (column !== undefined) values[field] = (cells[column] ?? '').trim();
    });

    const errors: string[] = [];
    IMPORT_FIELDS.filter((field) => field.required).forEach((field) => {
      if (!values[field.key]) errors.push(`${field.label} is required`);
    });

    const sku = (values.sku || '').toLowerCase();
    if (sku && seenSkus.has(sku)) errors.push('Duplicate SKU within this file');
    if (sku) seenSkus.add(sku);

    (['costPrice', 'retailPrice', 'tradePrice', 'floorPrice'] as ImportField[]).forEach((field) => {
      const raw = values[field];
      if (raw && !isMoney(raw)) errors.push(`${field} must be a number`);
    });

    if (values.retailPrice && values.floorPrice && isMoney(values.retailPrice) && isMoney(values.floorPrice)) {
      if (Number(values.floorPrice) > Number(values.retailPrice)) {
        errors.push('Floor price is above retail price');
      }
    }

    const row: ValidatedRow = {
      rowNumber: index + 2, // +1 for the header, +1 for 1-based numbering
      values,
      errors,
      isUpdate: existingSkus.has(sku),
    };
    if (errors.length > 0) invalid.push(row);
    else valid.push(row);
  });

  return {
    valid,
    invalid,
    toCreate: valid.filter((row) => !row.isUpdate).length,
    toUpdate: valid.filter((row) => row.isUpdate).length,
  };
}

/** D-15/D-16: turn validated rows into products for the commit. */
export function rowsToProducts(rows: ValidatedRow[], outletId: string, existing: Product[]): Product[] {
  const bySku = new Map(existing.map((product) => [product.sku.toLowerCase(), product]));
  return rows.map((row) => {
    const current = bySku.get((row.values.sku || '').toLowerCase());
    const retail = roundMoney(Number(row.values.retailPrice) || 0);
    const barcode = row.values.barcode?.trim();
    const baseUnit = (row.values.baseUnit || current?.baseUnit || 'pcs') as Product['baseUnit'];
    return {
      ...(current || {}),
      id: current?.id || `import-row-${row.rowNumber}`,
      name: row.values.name || current?.name || '',
      sku: (row.values.sku || current?.sku || '').toUpperCase(),
      outletId,
      category: (row.values.category || current?.category || 'Hardware & Tools') as Product['category'],
      brand: row.values.brand || current?.brand || 'Generic',
      barcodes: barcode ? [{ code: barcode, unitName: baseUnit }] : current?.barcodes || [],
      baseUnit,
      sellingUnits: current?.sellingUnits,
      retailPrice: retail || current?.retailPrice || 0,
      tradePrice: roundMoney(Number(row.values.tradePrice) || 0) || current?.tradePrice || retail,
      floorPrice: roundMoney(Number(row.values.floorPrice) || 0) || current?.floorPrice || retail,
      costPrice: current?.costPrice || { [outletId]: 0 },
      stock: current?.stock || { [outletId]: 0 },
      minStockAlert: current?.minStockAlert || { [outletId]: 0 },
      imageUrl: current?.imageUrl || '',
      active: true,
    } as Product;
  });
}

/** The template the client fills in (PRD §3.2 dependency). */
export const IMPORT_TEMPLATE_HEADERS = IMPORT_FIELDS.map((field) => field.label);

export function buildTemplateCsv(): string {
  const example = [
    'Twin & Earth Cable 2.5mm',
    'CAB-TE-025',
    'Cables & Wires',
    'Nexans',
    '6031000200001',
    'm',
    '18.50',
    '16.00',
    '15.00',
  ];
  return `${IMPORT_TEMPLATE_HEADERS.join(',')}\n${example.join(',')}\n`;
}

/** D-14: the error file the operator downloads to fix their spreadsheet. */
export function buildErrorCsv(invalid: ValidatedRow[]): string {
  const header = 'Row,SKU,Name,Errors';
  const lines = invalid.map((row) =>
    [row.rowNumber, row.values.sku || '', row.values.name || '', `"${row.errors.join('; ')}"`].join(','),
  );
  return [header, ...lines].join('\n');
}
