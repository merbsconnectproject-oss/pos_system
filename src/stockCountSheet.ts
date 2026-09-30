export interface StockCountSheetMeta {
  reference: string;
  outlet: string;
  countDate: string;
  countedBy: string;
  notes: string;
}

export interface StockCountSheetRow {
  sku: string;
  product: string;
  category: string;
  systemQuantity: number;
  countedQuantity: number;
  variance: number;
  unit: string;
}

const csvCell = (value: string | number) => {
  const text = String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

export const buildStockCountCsv = (meta: StockCountSheetMeta, rows: StockCountSheetRow[]) => {
  const lines: (string | number)[][] = [
    ['Physical Stock Count'],
    ['Reference', meta.reference],
    ['Outlet', meta.outlet],
    ['Count date', meta.countDate],
    ['Counted by', meta.countedBy],
    ['Notes', meta.notes],
    [],
    ['SKU', 'Product', 'Category', 'System quantity', 'Counted quantity', 'Variance', 'Unit'],
    ...rows.map((row) => [
      row.sku,
      row.product,
      row.category,
      row.systemQuantity,
      row.countedQuantity,
      row.variance,
      row.unit,
    ]),
  ];
  return `\uFEFF${lines.map((line) => line.map(csvCell).join(',')).join('\r\n')}`;
};

const pdfText = (value: string | number) => String(value)
  .normalize('NFKD')
  .replace(/[^\x20-\x7E]/g, '?')
  .replace(/\\/g, '\\\\')
  .replace(/\(/g, '\\(')
  .replace(/\)/g, '\\)');

const clipped = (value: string, length: number) => value.length <= length ? value : `${value.slice(0, length - 3)}...`;
const numberText = (value: number) => Number.isInteger(value) ? String(value) : value.toFixed(3).replace(/0+$/, '').replace(/\.$/, '');

/** Build a dependency-free, landscape A4 PDF so desktop installs work offline. */
export const buildStockCountPdf = (meta: StockCountSheetMeta, rows: StockCountSheetRow[]): Uint8Array => {
  const rowsPerPage = 24;
  const pages = Array.from({ length: Math.max(1, Math.ceil(rows.length / rowsPerPage)) }, (_, page) =>
    rows.slice(page * rowsPerPage, (page + 1) * rowsPerPage));
  const fontId = 3 + pages.length * 2;
  const pageStreams = pages.map((pageRows, pageIndex) => {
    const commands: string[] = [
      'BT',
      '/F1 16 Tf',
      `36 555 Td (${pdfText('PHYSICAL STOCK COUNT')}) Tj`,
      '/F1 8 Tf',
      `0 -18 Td (${pdfText(`Reference: ${meta.reference}    Outlet: ${meta.outlet}    Count date: ${meta.countDate}`)}) Tj`,
      `0 -13 Td (${pdfText(`Counted by: ${meta.countedBy}    Page ${pageIndex + 1} of ${pages.length}`)}) Tj`,
      `0 -13 Td (${pdfText(`Notes: ${clipped(meta.notes || '-', 105)}`)}) Tj`,
      '/F1 7 Tf',
      `0 -22 Td (${pdfText('SKU')}) Tj`,
      `75 0 Td (${pdfText('PRODUCT')}) Tj`,
      `240 0 Td (${pdfText('CATEGORY')}) Tj`,
      `130 0 Td (${pdfText('SYSTEM')}) Tj`,
      `70 0 Td (${pdfText('COUNTED')}) Tj`,
      `80 0 Td (${pdfText('VARIANCE')}) Tj`,
      `80 0 Td (${pdfText('UNIT')}) Tj`,
    ];
    pageRows.forEach((row) => {
      commands.push(
        `-675 -17 Td (${pdfText(clipped(row.sku, 15))}) Tj`,
        `75 0 Td (${pdfText(clipped(row.product, 38))}) Tj`,
        `240 0 Td (${pdfText(clipped(row.category, 21))}) Tj`,
        `130 0 Td (${pdfText(numberText(row.systemQuantity))}) Tj`,
        `70 0 Td (${pdfText(numberText(row.countedQuantity))}) Tj`,
        `80 0 Td (${pdfText(`${row.variance > 0 ? '+' : ''}${numberText(row.variance)}`)}) Tj`,
        `80 0 Td (${pdfText(clipped(row.unit, 10))}) Tj`,
      );
    });
    commands.push('ET');
    return commands.join('\n');
  });

  const objects: string[] = [];
  objects[1] = '<< /Type /Catalog /Pages 2 0 R >>';
  objects[2] = `<< /Type /Pages /Kids [${pages.map((_, index) => `${3 + index * 2} 0 R`).join(' ')}] /Count ${pages.length} >>`;
  pageStreams.forEach((stream, index) => {
    const pageId = 3 + index * 2;
    const contentId = pageId + 1;
    objects[pageId] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 842 595] /Resources << /Font << /F1 ${fontId} 0 R >> >> /Contents ${contentId} 0 R >>`;
    objects[contentId] = `<< /Length ${new TextEncoder().encode(stream).length} >>\nstream\n${stream}\nendstream`;
  });
  objects[fontId] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>';

  let document = '%PDF-1.4\n';
  const offsets = [0];
  for (let id = 1; id <= fontId; id += 1) {
    offsets[id] = new TextEncoder().encode(document).length;
    document += `${id} 0 obj\n${objects[id]}\nendobj\n`;
  }
  const xref = new TextEncoder().encode(document).length;
  document += `xref\n0 ${fontId + 1}\n0000000000 65535 f \n`;
  for (let id = 1; id <= fontId; id += 1) document += `${String(offsets[id]).padStart(10, '0')} 00000 n \n`;
  document += `trailer\n<< /Size ${fontId + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return new TextEncoder().encode(document);
};

const safeFilename = (reference: string) => reference.trim().replace(/[^a-z0-9_-]+/gi, '-').replace(/^-|-$/g, '') || 'stock-count';

const download = (blob: Blob, filename: string) => {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
};

export const downloadStockCountCsv = (meta: StockCountSheetMeta, rows: StockCountSheetRow[]) =>
  download(new Blob([buildStockCountCsv(meta, rows)], { type: 'text/csv;charset=utf-8' }), `${safeFilename(meta.reference)}.csv`);

export const downloadStockCountPdf = (meta: StockCountSheetMeta, rows: StockCountSheetRow[]) =>
  download(new Blob([buildStockCountPdf(meta, rows)], { type: 'application/pdf' }), `${safeFilename(meta.reference)}.pdf`);
