import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = (name: string) => readFileSync(new URL(`../components/${name}`, import.meta.url), 'utf8');

describe('release safety checks', () => {
  it('never advertises a manager PIN in the approval dialog', () => {
    const managerPinModal = source('ManagerPinModal.tsx');
    expect(managerPinModal).not.toContain('Default authorized manager PIN');
    expect(managerPinModal).not.toContain('<strong>1234</strong>');
  });

  it('renders voucher headings from their recorded outlet instead of a hard-coded branch', () => {
    for (const file of ['InstallmentsView.tsx', 'ReturnsExchangesView.tsx']) {
      const voucher = source(file);
      expect(voucher).not.toContain('Showroom East Legon • Accra, Ghana');
      expect(voucher).toContain('outlet.address');
      expect(voucher).toContain('outlet.town');
    }
  });
});
