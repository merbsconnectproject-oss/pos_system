import { request } from './apiClient';
import type { CartItem, Customer } from './types';

export interface HeldSaleLineWire {
  productId: string;
  productName: string;
  sku: string;
  selectedUnit: string;
  conversionFactor: number;
  quantity: number;
  unitPrice: number;
  discount: number;
  lineTotal: number;
  frozenCostPrice: number;
}

export interface HeldSaleWire {
  id: string;
  outletId: string;
  terminalId?: string | null;
  cashierId: string;
  label: string;
  customerId?: string | null;
  customerName?: string | null;
  customerPhone?: string | null;
  total: number;
  heldAt: string;
  lines: HeldSaleLineWire[];
}

const line = (item: CartItem): HeldSaleLineWire => ({
  productId: item.product.id,
  productName: item.product.name,
  sku: item.product.sku,
  selectedUnit: item.selectedUnit,
  conversionFactor: item.conversionFactor,
  quantity: item.quantity,
  unitPrice: item.unitPrice,
  discount: item.discount || 0,
  lineTotal: item.lineTotal,
  frozenCostPrice: item.frozenCostPrice || 0,
});

export const heldSalesApi = {
  list: (outletId: string) => request<HeldSaleWire[]>(`/api/held-sales?outletId=${encodeURIComponent(outletId)}`),
  hold: (outletId: string, terminalId: string | undefined, label: string, customer: Customer | null, total: number, items: CartItem[]) =>
    request<HeldSaleWire>('/api/held-sales', {
      method: 'POST',
      body: JSON.stringify({
        outletId, terminalId, label, customerId: customer?.id, customerName: customer?.name,
        customerPhone: customer?.phone, total: Math.round(total * 100), lines: items.map(line),
      }),
    }),
  remove: (id: string) => request<void>(`/api/held-sales/${encodeURIComponent(id)}`, { method: 'DELETE' }),
};
