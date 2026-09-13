/**
 * Contract check — run with `npm run check:contract`.
 *
 * Asserts the frontend still honours the PRD rules the backend will be built
 * against: the §6 permission matrix, BR-11 money rounding, BR-12 quantities,
 * FR-PROD-04 unit-bound barcodes, and PRD §11 acceptance criterion 7.
 * If one of these fails, the API contract and the UI have drifted apart.
 */
import { readFileSync } from 'node:fs';

import {
  DEFAULT_ROLE_PERMISSIONS,
  resolvePermissions,
  canAccessTab,
  PERMISSION_CODES,
  type PermissionCode,
  type PermissionOverrides,
  type UserRole,
} from './permissions';
import { roundMoney, sumMoney, lineTotal, moneyEquals, toPesewas, fromPesewas, roundQuantity } from './money';
import { findByBarcode, findByBarcodeOrSku } from './catalogue';
import { createScanDetector } from './useScanner';
import { ACCENT_PRESETS, buildAccentScale, isBlue } from './accent';
import { costPerBaseUnit, weightedAverageCost } from './stockCosting';
import { buildErrorCsv, guessMapping, parseDelimited, validateRows } from './productImport';
import { createBlock, formatReceiptNumber, issueReceiptNumber } from './receiptSequence';
import { INITIAL_PRODUCTS } from './mockData';

interface ContractVectors {
  money: {
    roundMoney: Array<{ in: string; out: string }>;
    toPesewas: Array<{ in: string; out: number }>;
    fromPesewas: Array<{ in: number; out: string }>;
    lineTotal: Array<{ quantity: string; unitPrice: string; discount: string; out: string }>;
    sumMoney: Array<{ in: string[]; out: string }>;
  };
  quantity: { roundQuantity: Array<{ in: string; out: string }> };
  weightedAverageCost: {
    cases: Array<{
      quantityOnHand: string;
      currentAverage: string;
      quantityReceivedBase: string;
      unitCostPerBase: string;
      out: string;
    }>;
  };
  costPerBaseUnit: {
    cases: Array<{ purchaseUnitCost: string; conversionFactor: string; out: string }>;
  };
  receiptNumber: {
    cases: Array<{ outletPrefix: string; terminalCode: string; sequence: number; out: string }>;
    blockExhaustion: { start: number; size: number; issued: string[]; thirdCallRefused: boolean };
  };
  permissions: {
    allCodes: PermissionCode[];
    roles: Record<UserRole, PermissionCode[]>;
    overrides: Array<{
      baseRole: UserRole;
      override: PermissionOverrides;
      grants: PermissionCode;
      expected: boolean;
    }>;
  };
}

const vectors = JSON.parse(
  readFileSync(new URL('../docs/contract/test-vectors.json', import.meta.url), 'utf8'),
) as ContractVectors;

let fail = 0;
const check = (name: string, cond: boolean) => { if (!cond) { console.log('FAIL:', name); fail++; } else console.log('  ok:', name); };
const fixedMoney = (value: number) => value.toFixed(2);
const fixedQuantity = (value: number) => value.toFixed(3);

console.log('--- frozen contract vectors (shared with the Java backend) ---');
vectors.money.roundMoney.forEach((test) =>
  check(`roundMoney(${test.in}) = ${test.out}`, fixedMoney(roundMoney(Number(test.in))) === test.out));
vectors.money.toPesewas.forEach((test) =>
  check(`toPesewas(${test.in}) = ${test.out}`, toPesewas(Number(test.in)) === test.out));
vectors.money.fromPesewas.forEach((test) =>
  check(`fromPesewas(${test.in}) = ${test.out}`, fixedMoney(fromPesewas(test.in)) === test.out));
vectors.money.lineTotal.forEach((test) =>
  check(
    `lineTotal(${test.quantity}, ${test.unitPrice}, ${test.discount}) = ${test.out}`,
    fixedMoney(lineTotal(Number(test.quantity), Number(test.unitPrice), Number(test.discount))) === test.out,
  ));
vectors.money.sumMoney.forEach((test) =>
  check(`sumMoney(${test.in.join(', ')}) = ${test.out}`, fixedMoney(sumMoney(test.in.map(Number))) === test.out));
vectors.quantity.roundQuantity.forEach((test) =>
  check(
    `roundQuantity(${test.in}) = ${test.out}`,
    fixedQuantity(roundQuantity(Number(test.in))) === test.out,
  ));
vectors.weightedAverageCost.cases.forEach((test) =>
  check(
    `weightedAverageCost(...)= ${test.out}`,
    fixedMoney(weightedAverageCost(
      Number(test.quantityOnHand),
      Number(test.currentAverage),
      Number(test.quantityReceivedBase),
      Number(test.unitCostPerBase),
    )) === test.out,
  ));
vectors.costPerBaseUnit.cases.forEach((test) =>
  check(
    `costPerBaseUnit(${test.purchaseUnitCost}, ${test.conversionFactor}) = ${test.out}`,
    fixedMoney(roundMoney(costPerBaseUnit(Number(test.purchaseUnitCost), Number(test.conversionFactor)))) === test.out,
  ));
vectors.receiptNumber.cases.forEach((test) => {
  const block = createBlock(test.outletPrefix, test.terminalCode, test.sequence);
  check(
    `receipt ${test.outletPrefix}-${test.terminalCode} sequence ${test.sequence}`,
    formatReceiptNumber(block, test.sequence) === test.out,
  );
});
{
  const test = vectors.receiptNumber.blockExhaustion;
  let block = createBlock('INC', '01', test.start, test.size);
  const issued: string[] = [];
  for (let i = 0; i < test.size; i++) {
    const next = issueReceiptNumber(block);
    issued.push(next.receiptNumber);
    block = next.block;
  }
  let refused = false;
  try {
    issueReceiptNumber(block);
  } catch {
    refused = true;
  }
  check('receipt block issues the frozen sequence', JSON.stringify(issued) === JSON.stringify(test.issued));
  check('receipt block refuses the next number', refused === test.thirdCallRefused);
}
check('permission code list matches the frozen contract',
  JSON.stringify(PERMISSION_CODES) === JSON.stringify(vectors.permissions.allCodes));
Object.entries(vectors.permissions.roles).forEach(([role, expected]) => {
  const actual = [...resolvePermissions(DEFAULT_ROLE_PERMISSIONS[role as UserRole]).codes].sort();
  check(`${role} permission baseline matches`, JSON.stringify(actual) === JSON.stringify(expected));
});
vectors.permissions.overrides.forEach((test) =>
  check(
    `${test.baseRole} override for ${test.grants} matches`,
    resolvePermissions(DEFAULT_ROLE_PERMISSIONS[test.baseRole], test.override).has(test.grants) === test.expected,
  ));

console.log('--- PRD acceptance 7: a cashier sees no cost, no profit, no reports ---');
const cashier = resolvePermissions(DEFAULT_ROLE_PERMISSIONS.cashier);
check('cashier lacks price.view_cost', !cashier.has('price.view_cost'));
check('cashier lacks report.view_profit', !cashier.has('report.view_profit'));
check('cashier lacks report.view', !cashier.has('report.view'));
check('cashier cannot reach reports tab', !canAccessTab(cashier, 'reports'));
check('cashier cannot reach valuation', !canAccessTab(cashier, 'inventory-valuation'));
check('cashier CAN sell', cashier.has('pos.sell'));
check('cashier CAN see stock', canAccessTab(cashier, 'products'));

console.log('--- PRD §6 matrix spot checks ---');
const owner = resolvePermissions(DEFAULT_ROLE_PERMISSIONS.owner);
const manager = resolvePermissions(DEFAULT_ROLE_PERMISSIONS.manager);
const keeper = resolvePermissions(DEFAULT_ROLE_PERMISSIONS.storekeeper);
check('owner has all configured codes', owner.codes.length === PERMISSION_CODES.length);
check('manager lacks user.manage', !manager.has('user.manage'));
check('manager lacks outlet.view_all', !manager.has('outlet.view_all'));
check('manager lacks settings.general', !manager.has('settings.general'));
check('storekeeper CAN view cost', keeper.has('price.view_cost'));
check('storekeeper cannot sell', !keeper.has('pos.sell'));
check('storekeeper cannot see reports', !canAccessTab(keeper, 'reports'));

console.log('--- FR-USER-03: per-user overrides against the role baseline ---');
const promoted = resolvePermissions(DEFAULT_ROLE_PERMISSIONS.cashier, { 'sale.void': true });
check('override grants sale.void', promoted.has('sale.void'));
const demoted = resolvePermissions(DEFAULT_ROLE_PERMISSIONS.manager, { 'sale.void': false });
check('override revokes sale.void', !demoted.has('sale.void'));

console.log('--- BR-11: money is half-up per line, totals sum rounded lines ---');
check('roundMoney half-up', roundMoney(0.125) === 0.13);
check('two 0.125 lines total 0.26 not 0.25', sumMoney([0.125, 0.125]) === 0.26);
check('lineTotal rounds once', lineTotal(3, 18.335) === 55.01);
check('toPesewas 18.50 -> 1850', toPesewas(18.5) === 1850);
check('0.1+0.2 equality holds', moneyEquals(0.1 + 0.2, 0.3));
check('exact payment check rejects 5p short', !moneyEquals(99.95, 100));

console.log('--- BR-12: quantities to 3dp (cut lengths) ---');
check('287.5 survives', roundQuantity(287.5) === 287.5);
check('12.3455 -> 12.346', roundQuantity(12.3455) === 12.346);

console.log('--- FR-PROD-04: a carton barcode resolves to the carton unit ---');
const multi = INITIAL_PRODUCTS.find((p) => p.barcodes.length > 1)!;
const baseHit = findByBarcode(INITIAL_PRODUCTS, multi.barcodes[0].code)!;
const bulkHit = findByBarcode(INITIAL_PRODUCTS, multi.barcodes[1].code)!;
check('base code resolves', baseHit.product.id === multi.id);
check('bulk code resolves to same product', bulkHit.product.id === multi.id);
check('bulk code names a different unit', bulkHit.unitName !== baseHit.unitName);
check('bulk unit has factor > 1', (bulkHit.sellingUnit?.conversionFactor ?? 0) > 1);
console.log(`     "${multi.name.slice(0,40)}..." ${baseHit.unitName} vs ${bulkHit.unitName} (x${bulkHit.sellingUnit?.conversionFactor})`);

console.log('--- FR-POS-03..06: scanner distinguishes a scan from typing ---');
// Feed a detector at a chosen inter-keystroke gap and report what it emitted.
const feed = (code: string, gapMs: number, detector = createScanDetector()) => {
  let t = 1000;
  let emitted: string | null = null;
  for (const ch of code) {
    t += gapMs;
    emitted = detector.push(ch, t) ?? emitted;
  }
  t += gapMs;
  return detector.push('Enter', t);
};
check('machine-speed burst is a scan', feed('603100010005', 12) === '603100010005');
check('human typing is NOT a scan', feed('603100010005', 180) === null);
check('borderline 50ms still scans', feed('603100010005', 50) === '603100010005');
check('60ms is treated as typing', feed('60310001', 60) === null);
check('short code is not a scan', feed('12', 10) === null);

// FR-POS-06: two bursts back to back both emit.
const shared = createScanDetector();
const first = feed('603100010005', 10, shared);
const second = feed('6031000100005', 10, shared);
check('consecutive scans both emit', first === '603100010005' && second === '6031000100005');

// Non-printable keys must not enter the buffer.
const d = createScanDetector();
let t = 0;
['6', '0', 'Shift', '3', '1', '0', '0', '0', '1', '0', '0', '0', '5'].forEach((k) => {
  t += 10;
  d.push(k, t);
});
check('modifier keys are ignored mid-scan', d.push('Enter', t + 10) === '603100010005');

console.log('--- FR-PROD-04: a scanned bulk code selects the bulk unit ---');
const bulkProduct = INITIAL_PRODUCTS.find((p) => p.barcodes.length > 1)!;
const bulkEntry = bulkProduct.barcodes[1];
const resolvedBulk = findByBarcodeOrSku(INITIAL_PRODUCTS, bulkEntry.code)!;
check('bulk scan resolves to the bulk unit', resolvedBulk.unitName === bulkEntry.unitName);
check(
  'bulk unit multiplies the base quantity',
  (resolvedBulk.sellingUnit?.conversionFactor ?? 1) > 1,
);

console.log('--- FR-SET-03/04 + AC-11: the accent is one token, and never blue ---');
import_check: {
  const scale = buildAccentScale('#c55200')!;
  check('scale builds a full 50-900 ramp', Object.keys(scale.shades).length === 10);
  check('50 is lighter than 900', scale.shades[50] !== scale.shades[900]);
  check('foreground is legible on the base', scale.foreground === '#ffffff' || scale.foreground === '#1f2937');
  check('a dark accent gets white text', buildAccentScale('#15803d')!.foreground === '#ffffff');
  check('a pale accent gets dark text', buildAccentScale('#fde68a')!.foreground === '#1f2937');
  check('blue is refused', isBlue('#2563eb') && isBlue('#1d4ed8'));
  check('the palette itself contains no blue', ACCENT_PRESETS.every((preset) => !isBlue(preset.hex)));
  check('orange is not mistaken for blue', !isBlue('#c55200'));
  check('invalid hex is rejected', buildAccentScale('nonsense') === null);
}

console.log('--- BR-4 / acceptance 5: weighted average cost per outlet ---');
// PRD §11.5: receive 3 drums of 100m cable, then sell 12.5m.
check('3 drums of 100m adds 300m', roundQuantity(3 * 100) === 300);
check('selling 12.5m leaves 287.5m', roundQuantity(300 - 12.5) === 287.5);
check('selling a further drum leaves 187.5m', roundQuantity(287.5 - 100) === 187.5);
check(
  'first receipt sets the average to the unit cost',
  weightedAverageCost(0, 0, 300, 12.5) === 12.5,
);
// The goods-receipt case verified in the UI: 75 @ 42.00 + 50 @ 50.00 -> 45.20
check('blended average is exact', weightedAverageCost(75, 42, 50, 50) === 45.2);
check('purchase unit cost converts to base', costPerBaseUnit(250, 5) === 50);
check(
  'a dearer receipt raises the average',
  weightedAverageCost(100, 10, 100, 20) === 15,
);
check(
  'a cheaper receipt lowers the average',
  weightedAverageCost(100, 20, 100, 10) === 15,
);

console.log('--- FR-PROD-10 / D-12..D-16: import parses, maps, validates ---');
{
  const csv = [
    'Product name,SKU,Retail price,Floor price,Cost,Opening stock',
    '"Twin & Earth Cable, 2.5mm",CAB-TE-025,18.50,15.00,12.50,300',
    'Consumer Unit 8-Way,ELE-CU-008,420.00,380.00,310.00,12',
    ',ELE-NO-SKU,50.00,,,',
    'Bad Price Item,BAD-001,not-a-number,,,',
    'Floor Above Retail,BAD-002,10.00,25.00,,',
    'Duplicate SKU,CAB-TE-025,20.00,,,',
  ].join('\n');
  const parsed = parseDelimited(csv);
  check('header row is separated', parsed.headers.length === 6);
  check('quoted comma survives parsing', parsed.rows[0][0] === 'Twin & Earth Cable, 2.5mm');
  check('all data rows parsed', parsed.rows.length === 6);

  const mapping = guessMapping(parsed.headers);
  check('name column auto-mapped', mapping.name === 0);
  check('sku column auto-mapped', mapping.sku === 1);
  check('retail price auto-mapped', mapping.retailPrice === 2);
  check('floor price auto-mapped', mapping.floorPrice === 3);

  const result = validateRows(parsed, mapping, INITIAL_PRODUCTS);
  check('two clean rows are valid', result.valid.length === 2);
  check('four rows are rejected', result.invalid.length === 4);
  check(
    'missing name is caught',
    result.invalid.some((row) => row.errors.some((e) => /Product name is required/.test(e))),
  );
  check(
    'non-numeric price is caught',
    result.invalid.some((row) => row.errors.some((e) => /must be a number/.test(e))),
  );
  check(
    'floor above retail is caught',
    result.invalid.some((row) => row.errors.some((e) => /Floor price is above retail/.test(e))),
  );
  check(
    'duplicate SKU in file is caught',
    result.invalid.some((row) => row.errors.some((e) => /Duplicate SKU/.test(e))),
  );
  check('error file lists every bad row', buildErrorCsv(result.invalid).split('\n').length === 5);
  check('row numbers point at the spreadsheet line', result.valid[0].rowNumber === 2);
  check('new SKUs count as creates', result.toCreate === 2 && result.toUpdate === 0);
}

console.log('--- uniqueness: every barcode maps to one product ---');
const seen = new Map<string, string>();
let dupes = 0;
INITIAL_PRODUCTS.forEach((p) => p.barcodes.forEach((b) => {
  if (seen.has(b.code)) { dupes++; console.log('   dup:', b.code, seen.get(b.code), p.id); }
  seen.set(b.code, p.id);
}));
check('no duplicate barcodes across catalogue', dupes === 0);

console.log(fail === 0 ? `\nALL CHECKS PASSED (${seen.size} barcodes across ${INITIAL_PRODUCTS.length} products)` : `\n${fail} CHECK(S) FAILED`);
process.exit(fail === 0 ? 0 : 1);
