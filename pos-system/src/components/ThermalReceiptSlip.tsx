import React, { useMemo } from 'react';
import QRCode from 'qrcode';
import { CompletedSale, GeneralSettings, Outlet } from '../types';
import { ProductBarcodeSvg } from './ProductBarcodeModal';

/**
 * Whose shop the slip belongs to — the block at the top of every receipt.
 *
 * Every field is passed in. The component used to keep a map of two outlets'
 * addresses and phone numbers compiled into it, so a third shop printed
 * somebody else's street and a renamed one printed its old name forever. None
 * of it is invented here now: what is not supplied is not printed.
 */
export interface ReceiptBranding {
  /** The business that owns the branches. */
  companyName?: string | null;
  /** Shown above the name. Served by the API, so it follows what Settings holds. */
  logoUrl?: string | null;
  /** The branch that made the sale, and the town it trades in. */
  outletName?: string | null;
  addressLine?: string | null;
  phone?: string | null;
  taxRegistrationNumber?: string | null;
  /** FR-SET-02: the branch's returns policy, or the business's. */
  footerPolicy?: string | null;
  /** FR-SET-01: the configured currency. The screen keeps the symbol. */
  currencySymbol?: string;
  /** What the printer puts against the figures, which cannot render the symbol. */
  currencyCode?: string;
}

export interface ThermalReceiptSlipProps {
  sale: CompletedSale;
  branding?: ReceiptBranding;
  isReprint?: boolean;
  paperWidth?: '80mm' | '58mm';
  /** FR-RCPT-01: the receipt number as bars, at the foot. On by default. */
  showBarcode?: boolean;
  /**
   * The customer verification code.
   *
   * Off by default, and deliberately: the printed slip carries the barcode, not
   * this. A preview that showed a QR the roll does not have is exactly the drift
   * this screen is meant to have stopped having.
   */
  showQrCode?: boolean;
  qrPayloadType?: 'verify-url' | 'receipt-id' | 'detailed';
  onScanQrCode?: () => void;
}

/**
 * The header block, assembled from what the business and the branch actually
 * hold — the same two records the server builds its header from.
 *
 * One function rather than a literal at each call site, because the till and
 * the history screen printing headers that disagreed is how the shop ended up
 * with two receipts for one sale.
 */
export const receiptBranding = (
  settings: GeneralSettings,
  outlet?: Outlet | null
): ReceiptBranding => {
  const company = settings.companyName?.trim() || '';
  const branch = outlet?.name?.trim() || '';
  // The town, unless the branch name already says it. Two branches of one
  // business are told apart by where they are.
  const town = outlet?.town?.trim() || '';
  const named = branch && town && !branch.toLowerCase().includes(town.toLowerCase())
    ? `${branch} - ${town}`
    : branch;

  return {
    // No business profile yet: the branch takes the top line rather than the
    // receipt opening with an address and no name at all.
    companyName: company || named || null,
    outletName: company && named.toLowerCase() !== company.toLowerCase() ? named : null,
    logoUrl: settings.logoUrl || null,
    addressLine: outlet?.address?.trim() || null,
    phone: outlet?.phone?.trim() || null,
    taxRegistrationNumber: settings.taxRegistrationNumber?.trim() || null,
    footerPolicy: settings.receiptFooterPolicy?.trim() || null,
    currencySymbol: settings.currencySymbol,
    currencyCode: settings.currencyCode,
  };
};

/**
 * Dynamically generated high-contrast vector QR code for customer verification.
 * Generated synchronously from the receipt ID for instant rendering without
 * canvas taint or print delays.
 */
export const ReceiptQrCode: React.FC<{
  receiptId: string;
  size?: number;
  payloadType?: 'verify-url' | 'receipt-id' | 'detailed';
  sale?: CompletedSale;
  onScanClick?: () => void;
  className?: string;
  paperWidth?: '80mm' | '58mm';
}> = ({
  receiptId,
  size,
  payloadType = 'verify-url',
  sale,
  onScanClick,
  className = '',
  paperWidth = '80mm',
}) => {
  const is58mm = paperWidth === '58mm';
  const qrSize = size ? Math.min(size, is58mm ? 66 : 82) : is58mm ? 62 : 78;

  const qrPayload = useMemo(() => {
    if (payloadType === 'receipt-id') {
      return receiptId;
    }
    if (payloadType === 'detailed' && sale) {
      return JSON.stringify({
        r: sale.receiptNumber,
        o: sale.outletName,
        t: sale.total,
        d: sale.createdAt,
      });
    }
    // Standard verification URL containing receipt ID
    return `https://radiancepos.gh/verify/${encodeURIComponent(receiptId)}`;
  }, [receiptId, payloadType, sale]);

  const matrix = useMemo(() => {
    try {
      const qr = QRCode.create(qrPayload, { errorCorrectionLevel: 'M' });
      const moduleCount = qr.modules.size;
      const darkCells: { x: number; y: number }[] = [];
      for (let r = 0; r < moduleCount; r++) {
        for (let c = 0; c < moduleCount; c++) {
          if (qr.modules.get(r, c)) {
            darkCells.push({ x: c, y: r });
          }
        }
      }
      return { size: moduleCount, cells: darkCells };
    } catch (err) {
      console.error('Failed to create QR matrix:', err);
      return null;
    }
  }, [qrPayload]);

  if (!matrix) return null;

  return (
    <div
      onClick={onScanClick}
      className={`receipt-qr-overlay border border-black p-2 bg-white text-black my-2 select-none text-left break-inside-avoid ${
        onScanClick ? 'cursor-pointer group hover:bg-slate-50' : ''
      } ${className}`}
      title={onScanClick ? 'Click to preview customer mobile verification' : undefined}
    >
      <div className="flex items-center gap-2.5 sm:gap-3">
        <div className="shrink-0 bg-white p-1 border border-black">
          <svg
            viewBox={`0 0 ${matrix.size + 2} ${matrix.size + 2}`}
            width={qrSize}
            height={qrSize}
            shapeRendering="crispEdges"
            className="block"
            aria-label={`Verification QR Code for receipt ${receiptId}`}
          >
            <rect
              className="qr-quiet-zone"
              x="0"
              y="0"
              width={matrix.size + 2}
              height={matrix.size + 2}
              fill="#ffffff"
            />
            {matrix.cells.map(({ x, y }) => (
              <rect key={`${x}-${y}`} x={x + 1} y={y + 1} width={1} height={1} fill="#000000" />
            ))}
          </svg>
        </div>

        <div className="min-w-0 flex-1 space-y-0.5">
          <div className="font-mono text-[10.5px] sm:text-[11px] font-black uppercase tracking-tight text-black leading-tight">
            Verify Receipt Online
          </div>
          <div className="font-mono text-[8.5px] sm:text-[9px] font-bold tracking-wider text-black">
            * {receiptId} *
          </div>
          <div className="font-mono text-[7.5px] sm:text-[8px] text-black leading-tight truncate">
            radiancepos.gh/verify/{receiptId}
          </div>
          <div className="font-sans text-[7.5px] sm:text-[8px] text-black leading-tight pt-0.5">
            Scan code with phone camera to authenticate receipt &amp; view digital warranty
          </div>
          {onScanClick && (
            <div className="text-[8px] text-accent-600 font-sans font-bold group-hover:underline print:hidden pt-0.5 flex items-center gap-1">
              <span>Click to test customer scan</span>
              <span aria-hidden="true">&rarr;</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

/** A heavy rule — around the header block and the total, as the printer does it. */
const HeavyRule: React.FC = () => (
  <div className="my-2 border-t-4 border-double border-black" />
);

/** The light rule between sections. */
const Rule: React.FC<{ className?: string }> = ({ className = '' }) => (
  <div className={`border-t border-dashed border-black ${className}`} />
);

/** A band nobody can miss: white on black, which is what `GS B` prints. */
const Band: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="bg-black text-white text-center font-black uppercase tracking-[0.25em] text-[10px] py-1 px-2 leading-tight">
    {children}
  </div>
);

/** One "Label : value" row from the transaction block. */
const Detail: React.FC<{ label: string; value: React.ReactNode }> = ({ label, value }) => (
  <div className="flex items-baseline gap-2">
    <span className="w-[68px] shrink-0 uppercase tracking-wider text-[9px] font-bold text-black/70">
      {label}
    </span>
    <span className="flex-1 text-right font-semibold tracking-tight text-black break-words">
      {value}
    </span>
  </div>
);

/**
 * Generates the plain-ASCII slip, laid out exactly as the server lays it out.
 *
 * Used only when the server cannot be reached — {@link ReceiptPrintModal} asks
 * the API first, so what is copied or downloaded is normally the printer's own
 * text. This is the counter's offline copy, and it follows the same order so the
 * two cannot look like different documents.
 */
export function generateReceiptPlainText(
  sale: CompletedSale,
  isReprint = false,
  width: '80mm' | '58mm' = '80mm',
  branding: ReceiptBranding = {}
): string {
  const columns = width === '58mm' ? 32 : 44;
  const rule = '-'.repeat(columns);
  const heavyRule = '='.repeat(columns);
  const currency = branding.currencyCode || 'GHS';

  const centre = (text: string) =>
    ' '.repeat(Math.max(0, Math.floor((columns - text.length) / 2))) + text;

  const pad = (left: string, right: string) =>
    left + ' '.repeat(Math.max(1, columns - left.length - right.length)) + right;

  const amount = (value: number) => `${currency} ${value.toFixed(2)}`;
  const money = (label: string, value: number) => pad(label, amount(value));

  const lines: string[] = [];

  if (branding.companyName) lines.push(centre(branding.companyName));
  if (branding.outletName) lines.push(centre(branding.outletName));
  if (branding.addressLine) lines.push(centre(branding.addressLine));
  if (branding.phone) lines.push(centre(`Tel: ${branding.phone}`));
  if (branding.taxRegistrationNumber) {
    lines.push(centre(`VAT / TIN: ${branding.taxRegistrationNumber}`));
  }
  lines.push(heavyRule);

  lines.push(centre('SALES RECEIPT'));
  if (isReprint) lines.push(centre('*** REPRINT ***'));
  if (sale.status === 'VOIDED') {
    lines.push(centre('*** VOIDED ***'));
    lines.push(centre(sale.voidReason || 'No reason recorded'));
  }
  lines.push(rule);

  lines.push(`Receipt : ${sale.receiptNumber}`);
  lines.push(`Date    : ${sale.createdAt}`);
  lines.push(`Cashier : ${sale.cashierName}`);
  if (sale.terminalId) lines.push(`Till    : TILL-${sale.terminalId}`);
  lines.push(`Customer: ${sale.customerName}`);
  lines.push(rule);

  lines.push(pad('ITEM', 'AMOUNT'));
  lines.push(rule);
  sale.items.forEach((item) => {
    lines.push(item.product.name.slice(0, columns));
    const unit = item.selectedUnit || item.product.baseUnit;
    lines.push(pad(
      `  ${item.quantity} ${unit} @ ${amount(item.unitPrice)}`,
      amount(item.lineTotal)));
    if (item.discount > 0) lines.push(pad('  Item discount', amount(-item.discount)));
  });
  lines.push(rule);

  lines.push(money('Subtotal', sale.subtotal));
  const discountTotal = sale.discountTotal ?? 0;
  if (discountTotal > 0) lines.push(money('Discount', -discountTotal));

  lines.push(heavyRule);
  lines.push(money('TOTAL', sale.total));
  lines.push(heavyRule);

  if (sale.payments && sale.payments.length > 0) {
    sale.payments.forEach((payment) => {
      lines.push(money(payment.provider || payment.method.toUpperCase(), payment.amount));
      if (payment.reference) lines.push(`  Ref: ${payment.reference}`);
    });
  } else {
    lines.push(money('Cash', sale.total));
  }
  lines.push(money('Change due', sale.changeDue ?? 0));
  lines.push(rule);

  (branding.footerPolicy || '')
    .split(' ')
    .filter(Boolean)
    .reduce<string[]>((wrapped, word) => {
      const last = wrapped[wrapped.length - 1];
      if (last && `${last} ${word}`.length <= columns) {
        wrapped[wrapped.length - 1] = `${last} ${word}`;
      } else {
        wrapped.push(word);
      }
      return wrapped;
    }, [])
    .forEach((line) => lines.push(centre(line)));
  lines.push(centre('Thank you.'));
  lines.push(rule);
  lines.push(centre(`* ${sale.receiptNumber} *`));

  return lines.join('\n');
}

/**
 * The receipt as the roll will show it — PRD §9, FR-RCPT-03.
 *
 * Laid out section for section against `ReceiptLayout` on the server, in the
 * same order, from the same fields: the mark and the shop first, the barcode
 * last. The server is still the authority on what prints; this is the picture
 * of it, and it is a picture of the right document only because the two follow
 * one structure.
 *
 * Pure black on white with no filled backgrounds except the bands, which the
 * printer fills too. A grey panel that looks soft on a screen comes off a
 * thermal head as a smear.
 */
export const ThermalReceiptSlip: React.FC<ThermalReceiptSlipProps> = ({
  sale,
  branding = {},
  isReprint = false,
  paperWidth = '80mm',
  showBarcode = true,
  showQrCode = false,
  qrPayloadType = 'verify-url',
  onScanQrCode,
}) => {
  const is58mm = paperWidth === '58mm';
  const symbol = branding.currencySymbol || 'GH₵';
  const discountTotal = sale.discountTotal ?? 0;
  const changeDue = sale.changeDue ?? 0;

  const money = (value: number) => `${symbol} ${value.toFixed(2)}`;

  return (
    <article
      className={`receipt-doc font-mono text-black select-text mx-auto px-1 ${
        is58mm ? 'slip-58mm max-w-[240px] text-[10px]' : 'slip-80mm max-w-[320px] text-[11px]'
      } leading-snug`}
      data-receipt-number={sale.receiptNumber}
      style={{ color: '#000000', backgroundColor: '#ffffff' }}
    >
      {/*
        The mark, the business, the branch, where it is and its number — in the
        order somebody reads them, and before anything about the transaction.
        A slip that opened with a receipt number was one a customer could not
        place, which is what this block is for.
      */}
      <header className="text-center space-y-1 pt-1 pb-2">
        {branding.logoUrl && (
          <img
            src={branding.logoUrl}
            alt=""
            className="mx-auto block max-h-14 w-auto max-w-[70%] object-contain contrast-[1.35] grayscale"
          />
        )}

        {branding.companyName && (
          <h1 className={`font-black tracking-tight leading-none text-black ${
            is58mm ? 'text-[15px]' : 'text-[19px]'
          }`}>
            {branding.companyName}
          </h1>
        )}

        {branding.outletName && (
          <div className="font-bold uppercase tracking-[0.18em] text-[9px] text-black">
            {branding.outletName}
          </div>
        )}

        <div className="space-y-0.5 font-sans text-[9.5px] leading-snug text-black">
          {branding.addressLine && <div>{branding.addressLine}</div>}
          {branding.phone && <div>Tel: {branding.phone}</div>}
          {branding.taxRegistrationNumber && (
            <div>VAT / TIN: {branding.taxRegistrationNumber}</div>
          )}
        </div>
      </header>

      <HeavyRule />

      {/* What this document is, before what is on it. */}
      <div className="space-y-1">
        <Band>Sales Receipt</Band>
        {isReprint && <Band>*** Reprint ***</Band>}
        {sale.status === 'VOIDED' && (
          <div className="space-y-1">
            <Band>*** Voided ***</Band>
            <div className="text-center font-sans text-[9px] leading-tight text-black">
              {sale.voidReason || 'No reason recorded'}
              {sale.voidedBy && <> · approved by {sale.voidedBy}</>}
            </div>
          </div>
        )}
      </div>

      <Rule className="my-2" />

      {/* The transaction, and which counter to take a query back to. */}
      <section className="space-y-1 text-[10px]">
        <Detail label="Receipt" value={<span className="font-black">{sale.receiptNumber}</span>} />
        <Detail label="Date" value={sale.createdAt} />
        <Detail label="Cashier" value={sale.cashierName} />
        {sale.terminalId && <Detail label="Till" value={`TILL-${sale.terminalId}`} />}
        <Detail
          label="Customer"
          value={
            <>
              {sale.customerName}
              {sale.customerType && sale.customerType !== 'retail' && (
                <span className="font-normal capitalize"> ({sale.customerType})</span>
              )}
            </>
          }
        />
        {sale.customerPhone && <Detail label="Phone" value={sale.customerPhone} />}
      </section>

      <Rule className="mt-2" />
      <div className="flex justify-between py-1 text-[9px] font-black uppercase tracking-[0.15em] text-black">
        <span>Item</span>
        <span>Amount</span>
      </div>
      <Rule />

      <div className="divide-y divide-dotted divide-black/25">
        {sale.items.map((item, index) => (
          <div key={index} className="break-inside-avoid py-1.5">
            <div className="font-bold leading-tight text-black">{item.product.name}</div>
            <div className="flex justify-between items-baseline pl-2 text-[10px] text-black">
              <span className="text-black/75">
                {item.quantity} {item.selectedUnit || item.product.baseUnit || 'pcs'} @{' '}
                {money(item.unitPrice)}
              </span>
              <span className="font-bold tracking-tight tabular-nums">{money(item.lineTotal)}</span>
            </div>
            {item.discount > 0 && (
              <div className="flex justify-between pl-2 text-[9px] italic text-black">
                <span>Item discount</span>
                <span className="tabular-nums">- {money(item.discount)}</span>
              </div>
            )}
          </div>
        ))}
      </div>

      <Rule />

      {/* Totals — the one figure a customer checks gets the weight. */}
      <section className="pt-1.5 space-y-1 text-[10px] tabular-nums">
        <div className="flex justify-between">
          <span>Subtotal</span>
          <span>{money(sale.subtotal)}</span>
        </div>
        {discountTotal > 0 && (
          <div className="flex justify-between font-medium">
            <span>Discount</span>
            <span>- {money(discountTotal)}</span>
          </div>
        )}
      </section>

      <div className="my-2 border-y-4 border-double border-black py-2">
        <div className="flex justify-between items-baseline">
          <span className={`font-black uppercase tracking-[0.2em] ${is58mm ? 'text-xs' : 'text-sm'}`}>
            Total
          </span>
          <span className={`font-black tracking-tight tabular-nums ${is58mm ? 'text-base' : 'text-lg'}`}>
            {money(sale.total)}
          </span>
        </div>
      </div>

      {/* What was tendered, and what went back across the counter. */}
      <section className="space-y-1 text-[10px] tabular-nums">
        {sale.payments && sale.payments.length > 0 ? (
          sale.payments.map((payment, index) => (
            <div key={index}>
              <div className="flex justify-between">
                <span className="font-medium capitalize">
                  {payment.provider || payment.method}
                </span>
                <span className="font-semibold">{money(payment.amount)}</span>
              </div>
              {payment.reference && (
                <div className="pl-2 text-[9px] text-black/75">Ref: {payment.reference}</div>
              )}
            </div>
          ))
        ) : (
          <div className="flex justify-between">
            <span className="font-medium">Cash</span>
            <span className="font-semibold">{money(sale.total)}</span>
          </div>
        )}
        <div className="flex justify-between font-bold">
          <span>Change due</span>
          <span>{money(changeDue)}</span>
        </div>
      </section>

      <Rule className="mt-2" />

      <footer className="pt-2 text-center space-y-1.5">
        {/*
          The shop's own returns policy, or nothing. A default policy printed
          under a shop's name is a promise the shop did not make.
        */}
        {branding.footerPolicy && (
          <p className="font-sans text-[9.5px] leading-snug text-black">
            {branding.footerPolicy}
          </p>
        )}
        <p className="font-black uppercase tracking-[0.2em] text-[10px] text-black">Thank you.</p>

        {showQrCode && (
          <ReceiptQrCode
            receiptId={sale.receiptNumber}
            paperWidth={paperWidth}
            payloadType={qrPayloadType}
            sale={sale}
            onScanClick={onScanQrCode}
          />
        )}

        {/*
          Last, because that is where a hand scanner looks and where the printer
          puts it. A slip a customer brings back is found by scanning it rather
          than by typing fourteen characters off the top of the page.
        */}
        {showBarcode && (
          <div className="pt-1 break-inside-avoid">
            <ProductBarcodeSvg
              value={sale.receiptNumber}
              format="CODE128"
              width={is58mm ? 1.1 : 1.4}
              height={is58mm ? 34 : 42}
              displayValue={false}
              className="w-full max-w-full"
            />
            <div className="pt-1 font-mono text-[9px] font-bold tracking-[0.25em] text-black">
              * {sale.receiptNumber} *
            </div>
          </div>
        )}
      </footer>
    </article>
  );
};
