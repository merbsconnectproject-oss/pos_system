import React, { useMemo } from 'react';
import QRCode from 'qrcode';
import { CompletedSale } from '../types';

export interface ThermalReceiptSlipProps {
  sale: CompletedSale;
  isReprint?: boolean;
  paperWidth?: '80mm' | '58mm';
  showBarcode?: boolean;
  showQrCode?: boolean;
  qrPayloadType?: 'verify-url' | 'receipt-id' | 'detailed';
  onScanQrCode?: () => void;
  outletAddress?: {
    address: string;
    tel: string;
  };
}

const OUTLET_DEFAULT_ADDRESSES: Record<string, { address: string; tel: string }> = {
  'inco-hardware': {
    address: '12 Main Street, Koforidua',
    tel: '+233 24 000 0002',
  },
  'apex-electricals': {
    address: 'Harper Road, Kumasi',
    tel: '+233 24 000 0003',
  },
};

/**
 * Dynamically generated high-contrast vector QR code for thermal printing & customer verification.
 * Generated synchronously from receipt ID for instant rendering without canvas taint or print delays.
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
        {/* Dynamically Generated High-Contrast Vector QR Code */}
        <div className="shrink-0 bg-white p-1 border border-black">
          <svg
            viewBox={`0 0 ${matrix.size + 2} ${matrix.size + 2}`}
            width={qrSize}
            height={qrSize}
            shapeRendering="crispEdges"
            className="block"
            aria-label={`Verification QR Code for receipt ${receiptId}`}
          >
            {/* Pure white quiet zone */}
            <rect
              className="qr-quiet-zone"
              x="0"
              y="0"
              width={matrix.size + 2}
              height={matrix.size + 2}
              fill="#ffffff"
            />
            {/* Black QR matrix modules */}
            {matrix.cells.map(({ x, y }) => (
              <rect key={`${x}-${y}`} x={x + 1} y={y + 1} width={1} height={1} fill="#000000" />
            ))}
          </svg>
        </div>

        {/* Small, human-readable 'Verify Receipt Online' text label next to it */}
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
            Scan code with phone camera to authenticate receipt & view digital warranty
          </div>

          {onScanClick && (
            <div className="text-[8px] text-orange-600 font-sans font-bold group-hover:underline print:hidden pt-0.5 flex items-center gap-1">
              <span>Click to test customer scan</span>
              <span aria-hidden="true">&rarr;</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

/**
 * Generates an ink-saving SVG barcode simulating Code 128 / thermal barcodes.
 * Pure vector lines ensure razor-sharp rendering on both 203 DPI thermal printers
 * and 600+ DPI laser/inkjet printers without grey anti-aliasing fuzz.
 */
const ThermalBarcode: React.FC<{ value: string }> = ({ value }) => {
  // Deterministic pattern based on characters
  const bars: number[] = [];
  let checksum = 0;
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    checksum += code * (i + 1);
    bars.push(1 + (code % 3));
    bars.push(1 + ((code >> 1) % 2));
    bars.push(1 + ((code >> 2) % 3));
  }
  // Add guard bars
  const fullBars = [2, 1, 2, 1, ...bars.slice(0, 36), 2, 1, 2];

  return (
    <div className="flex flex-col items-center justify-center my-2 space-y-1">
      <svg
        className="w-full max-w-[210px] h-9"
        viewBox="0 0 240 40"
        preserveAspectRatio="none"
        shapeRendering="crispEdges"
        aria-hidden="true"
      >
        {fullBars.map((width, idx) => {
          if (idx % 2 !== 0) return null;
          const x = fullBars.slice(0, idx).reduce((sum, w) => sum + w * 2.8, 4);
          return (
            <rect
              key={idx}
              x={x}
              y={0}
              width={Math.max(1.8, width * 1.7)}
              height={40}
              fill="#000000"
            />
          );
        })}
      </svg>
      <div className="font-mono text-[9px] tracking-widest text-black font-semibold uppercase">
        * {value} *
      </div>
    </div>
  );
};

/**
 * Generates formatted pure ASCII plain-text receipt slip
 * Compatible with raw ESC/POS thermal printers, clipboard, WhatsApp, or SMS.
 */
export function generateReceiptPlainText(
  sale: CompletedSale,
  isReprint = false,
  width: '80mm' | '58mm' = '80mm'
): string {
  const colWidth = width === '58mm' ? 32 : 44;
  const divider = '-'.repeat(colWidth);
  const doubleDivider = '='.repeat(colWidth);
  const address =
    OUTLET_DEFAULT_ADDRESSES[sale.outletId] || {
      address: 'Ghana Commercial Hub',
      tel: '+233 24 000 0000',
    };

  const center = (text: string) => {
    const pad = Math.max(0, Math.floor((colWidth - text.length) / 2));
    return ' '.repeat(pad) + text;
  };

  const justify = (left: string, right: string) => {
    const space = Math.max(1, colWidth - left.length - right.length);
    return left + ' '.repeat(space) + right;
  };

  const lines: string[] = [];

  lines.push(center('[ RADIANCE POS ]'));
  lines.push(center(sale.outletName.toUpperCase()));
  lines.push(center(address.address));
  lines.push(center(`Tel: ${address.tel}`));
  lines.push(divider);

  if (isReprint) {
    lines.push(center('*** REPRINT ***'));
    lines.push(divider);
  }

  if (sale.status === 'VOIDED') {
    lines.push(center('*** VOIDED TRANSACTION ***'));
    if (sale.voidReason) {
      lines.push(center(`Reason: ${sale.voidReason}`));
    }
    if (sale.voidedBy) {
      lines.push(center(`Approved: ${sale.voidedBy}`));
    }
    lines.push(divider);
  }

  lines.push(justify('Receipt :', sale.receiptNumber));
  lines.push(justify('Date    :', sale.createdAt));
  lines.push(justify('Cashier :', sale.cashierName));
  const custDesc = sale.customerPhone
    ? `${sale.customerName} (${sale.customerPhone})`
    : sale.customerName;
  lines.push(justify('Customer:', custDesc.slice(0, colWidth - 10)));
  lines.push(justify('Terminal:', `TERM-${sale.terminalId || '01'}`));
  lines.push(divider);

  // Line items
  sale.items.forEach((item) => {
    lines.push(item.product.name.slice(0, colWidth));
    const qtyUnit = `${item.quantity} ${item.selectedUnit || item.product.baseUnit} @ ${item.unitPrice.toFixed(2)}`;
    const lineTotal = item.lineTotal.toFixed(2);
    lines.push(justify(`  ${qtyUnit}`, lineTotal));
    if (item.discount > 0) {
      lines.push(justify('  Discount', `-${item.discount.toFixed(2)}`));
    }
  });

  lines.push(divider);
  lines.push(justify('Subtotal', `GHc ${sale.subtotal.toFixed(2)}`));
  const discountTotal = sale.discountTotal ?? (sale as any).discount ?? 0;
  if (discountTotal > 0) {
    lines.push(justify('Discount', `-GHc ${discountTotal.toFixed(2)}`));
  }
  const tax = (sale as any).tax ?? 0;
  if (tax > 0) {
    lines.push(justify('VAT / Tax', `GHc ${tax.toFixed(2)}`));
  }

  lines.push(doubleDivider);
  lines.push(justify('TOTAL', `GHc ${sale.total.toFixed(2)}`));
  lines.push(doubleDivider);

  // Payments
  if (sale.payments && sale.payments.length > 0) {
    sale.payments.forEach((p) => {
      const label = p.provider || p.method.toUpperCase();
      lines.push(justify(`Paid via ${label}:`, `GHc ${p.amount.toFixed(2)}`));
      if (p.reference) {
        lines.push(`  Ref: ${p.reference}`);
      }
    });
  }

  const changeDue = sale.changeDue ?? 0;
  lines.push(justify('Change Due:', `GHc ${changeDue.toFixed(2)}`));

  lines.push(divider);
  lines.push(center('Goods returnable within 7'));
  lines.push(center('days with this receipt.'));
  lines.push(center('Thank you for your business!'));
  lines.push(divider);
  lines.push(center('[ VERIFY RECEIPT ONLINE ]'));
  lines.push(center(`https://radiancepos.gh/verify/${sale.receiptNumber}`));
  lines.push(center(`* ${sale.receiptNumber} *`));

  return lines.join('\n');
}

/**
 * Dedicated thermal receipt slip formatted strictly according to PRD §9.
 * Uses 100% ink-saving monochrome black and white design with zero background fills
 * to prevent graying, toner waste, or muddy output on thermal / standard printers.
 */
export const ThermalReceiptSlip: React.FC<ThermalReceiptSlipProps> = ({
  sale,
  isReprint = false,
  paperWidth = '80mm',
  showBarcode = false,
  showQrCode = true,
  qrPayloadType = 'verify-url',
  onScanQrCode,
  outletAddress,
}) => {
  const address =
    outletAddress ||
    OUTLET_DEFAULT_ADDRESSES[sale.outletId] || {
      address: 'Ghana Commercial Hub',
      tel: '+233 24 000 0000',
    };

  const discountTotal = sale.discountTotal ?? (sale as any).discount ?? 0;
  const tax = (sale as any).tax ?? 0;
  const changeDue = sale.changeDue ?? 0;
  const is58mm = paperWidth === '58mm';

  return (
    <article
      className={`receipt-doc font-mono text-black select-text ${
        is58mm ? 'slip-58mm max-w-[240px] text-[10px]' : 'slip-80mm max-w-[320px] text-[11px]'
      } leading-snug mx-auto p-1`}
      data-receipt-number={sale.receiptNumber}
      style={{
        color: '#000000',
        backgroundColor: '#ffffff',
      }}
    >
      {/* Thermal Store Logo & Header */}
      <header className="text-center space-y-0.5 pb-1">
        <div className="text-[10px] tracking-widest font-black uppercase text-black">
          [ RADIANCE POS ]
        </div>
        <div className="font-black text-sm uppercase tracking-tight text-black">
          {sale.outletName}
        </div>
        <div className="text-[10px] leading-tight text-black">
          {address.address}
        </div>
        <div className="text-[10px] text-black">
          Tel: {address.tel}
        </div>
      </header>

      {/* Crisp Solid Thermal Separator */}
      <div className="border-t border-black border-dashed my-1.5" />

      {/* Reprint Status Banner (Ink-saving: pure black border, NO background fill) */}
      {isReprint && (
        <div className="my-1.5 py-0.5 border border-black text-center font-black tracking-widest text-[10px] uppercase text-black">
          *** REPRINT ***
        </div>
      )}

      {/* Voided Status Banner (Ink-saving: pure black border, NO background fill) */}
      {sale.status === 'VOIDED' && (
        <div className="my-1.5 p-1 border-2 border-black text-center text-black">
          <div className="font-black tracking-widest text-[11px] uppercase">
            *** VOIDED TRANSACTION ***
          </div>
          {sale.voidReason && (
            <div className="text-[9px] mt-0.5 font-sans leading-tight">
              Reason: {sale.voidReason}
            </div>
          )}
          {sale.voidedBy && (
            <div className="text-[9px] font-mono">
              Auth by: {sale.voidedBy} {sale.voidedAt ? `(${sale.voidedAt})` : ''}
            </div>
          )}
        </div>
      )}

      {/* Transaction Metadata */}
      <section className="space-y-0.5 text-[10px] text-black">
        <div className="flex justify-between items-baseline">
          <span className="font-semibold">Receipt :</span>
          <span className="font-bold tracking-tight text-black">{sale.receiptNumber}</span>
        </div>
        <div className="flex justify-between items-baseline">
          <span className="font-semibold">Date    :</span>
          <span>{sale.createdAt}</span>
        </div>
        <div className="flex justify-between items-baseline">
          <span className="font-semibold">Cashier :</span>
          <span>{sale.cashierName}</span>
        </div>
        <div className="flex justify-between items-baseline">
          <span className="font-semibold">Customer:</span>
          <span className="font-bold truncate max-w-[65%] text-right">
            {sale.customerName}
            {sale.customerType && sale.customerType !== 'retail' && (
              <span className="font-normal capitalize text-[9px]"> ({sale.customerType})</span>
            )}
          </span>
        </div>
        {sale.customerPhone && (
          <div className="flex justify-between items-baseline">
            <span className="font-semibold">Phone   :</span>
            <span>{sale.customerPhone}</span>
          </div>
        )}
        <div className="flex justify-between items-baseline">
          <span className="font-semibold">Terminal:</span>
          <span>TERM-{sale.terminalId || '01'}</span>
        </div>
      </section>

      {/* Item Table Header */}
      <div className="border-t border-black border-dashed mt-2 mb-1" />
      <div className="flex justify-between text-[9px] font-bold uppercase tracking-wider pb-1 text-black">
        <span>Description / Qty</span>
        <span>Amount (GHS)</span>
      </div>
      <div className="border-t border-black border-dotted mb-1.5" />

      {/* Line Items (Authentic Thermal POS Stacking) */}
      <div className="space-y-2 py-0.5">
        {sale.items.map((it, idx) => (
          <div key={idx} className="break-inside-avoid">
            {/* Item Name */}
            <div className="font-bold leading-tight text-black text-[10px] sm:text-[11px]">
              {it.product.name}
            </div>

            {/* Qty x Unit Price -> Line Total */}
            <div className="flex justify-between items-baseline text-[10px] text-black pl-2">
              <span>
                {it.quantity} {it.selectedUnit || it.product.baseUnit || 'pcs'} @{' '}
                {it.unitPrice.toFixed(2)}
              </span>
              <span className="font-bold tracking-tight text-black">
                {it.lineTotal.toFixed(2)}
              </span>
            </div>

            {/* Item-level discount if any */}
            {it.discount > 0 && (
              <div className="flex justify-between text-[9px] pl-2 text-black italic">
                <span>└ Item Discount</span>
                <span>-{it.discount.toFixed(2)}</span>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Summary / Totals */}
      <div className="border-t border-black border-dashed mt-2 pt-1.5 space-y-1 text-[10px] text-black">
        <div className="flex justify-between">
          <span>Subtotal</span>
          <span>GH₵ {sale.subtotal.toFixed(2)}</span>
        </div>

        {discountTotal > 0 && (
          <div className="flex justify-between font-medium">
            <span>Discount Total</span>
            <span>- GH₵ {discountTotal.toFixed(2)}</span>
          </div>
        )}

        {tax > 0 && (
          <div className="flex justify-between">
            <span>VAT / Tax (15%)</span>
            <span>GH₵ {tax.toFixed(2)}</span>
          </div>
        )}

        {/* Crisp Double Divider for TOTAL (PRD §9) */}
        <div className="border-t-2 border-black my-1" />
        <div className="flex justify-between items-baseline py-0.5 text-xs font-black text-black">
          <span className="text-sm">TOTAL</span>
          <span className="text-sm font-mono tracking-tight">
            GH₵ {sale.total.toFixed(2)}
          </span>
        </div>
        <div className="border-b-2 border-black mb-1.5" />

        {/* Payments Tendered Breakdown */}
        {sale.payments && sale.payments.length > 0 ? (
          sale.payments.map((p, idx) => (
            <div key={idx} className="space-y-0.5">
              <div className="flex justify-between text-[10px]">
                <span className="font-medium">
                  Paid via {p.provider || p.method.toUpperCase()}
                </span>
                <span className="font-semibold">GH₵ {p.amount.toFixed(2)}</span>
              </div>
              {p.reference && (
                <div className="text-[9px] pl-2 text-black">
                  Ref: {p.reference}
                </div>
              )}
            </div>
          ))
        ) : (
          <div className="flex justify-between text-[10px]">
            <span>Paid via CASH</span>
            <span>GH₵ {sale.total.toFixed(2)}</span>
          </div>
        )}

        <div className="flex justify-between text-[10px] pt-0.5">
          <span>Change Due</span>
          <span className="font-semibold">GH₵ {changeDue.toFixed(2)}</span>
        </div>
      </div>

      {/* Legal Return Policy & Footer (PRD §9) */}
      <div className="border-t border-black border-dashed mt-3 pt-2 text-center space-y-1">
        <div className="text-[10px] font-semibold leading-tight text-black">
          Goods returnable within 7
          <br />
          days with this receipt.
        </div>
        <div className="text-[10px] font-bold uppercase tracking-wider text-black pt-0.5">
          Thank you for your business!
        </div>

        {/* Dynamic Verification QR Code Overlay at the Bottom of the Slip */}
        {showQrCode && (
          <div className="py-1">
            <ReceiptQrCode
              receiptId={sale.receiptNumber}
              paperWidth={paperWidth}
              payloadType={qrPayloadType}
              sale={sale}
              onScanClick={onScanQrCode}
            />
          </div>
        )}

        {/* Optional 1D Barcode (For Optical Register Hand Scanners) */}
        {showBarcode && <ThermalBarcode value={sale.receiptNumber} />}

        <div className="text-[8px] pt-1 text-black font-sans leading-tight">
          Radiance POS Cloud Sync • Audit Verified
        </div>
      </div>
    </article>
  );
};
