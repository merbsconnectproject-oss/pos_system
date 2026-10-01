import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * BR-6 · FR-SET-05 — a branch can have more than one till.
 *
 * The create and re-block endpoints were built and tested with BR-6 and nothing
 * called either for months, so every outlet was stuck with the single till its
 * creation seeded. The tests here are source assertions rather than rendered
 * ones because what went wrong was not behaviour inside a component — it was a
 * caller that did not exist, and a shift handler that took `tills[0]` while its
 * own comment explained why that is wrong at a branch with two counters.
 */

const source = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');

const salesApi = source('../salesApi.ts');
const app = source('../App.tsx');
const shiftsModal = source('../components/ShiftsModal.tsx');
const settings = source('../components/SettingsView.tsx');

describe('tills — BR-6', () => {
  it('exposes create and re-block, not only the list', () => {
    expect(salesApi).toContain('export const terminalsApi');
    expect(salesApi).toMatch(/atOutlet:/);
    expect(salesApi).toMatch(/create:\s*\(outletId: string, code: string, name: string\)/);
    expect(salesApi).toMatch(/issueBlock:\s*\(terminalId: string\)/);

    // The POST bodies the server actually accepts.
    expect(salesApi).toContain("method: 'POST'");
    expect(salesApi).toContain('/api/terminals');
    expect(salesApi).toMatch(/\/api\/terminals\/\$\{encodeURIComponent\(terminalId\)\}\/block/);
  });

  it('carries every field the server returns, including what is left in the block', () => {
    // `remaining` is the only thing that warns a counter before it runs out of
    // numbers mid-trade; a wire type that dropped it could not be warned from.
    for (const field of ['blockStart', 'blockEnd', 'current', 'remaining', 'outletId', 'code', 'name']) {
      expect(salesApi).toMatch(new RegExp(`${field}:\\s*(string|number);`));
    }
  });

  it('opens the shift on a chosen till rather than always the first', () => {
    expect(app).toMatch(/handleStartShift\s*=\s*\(openingFloat: number, terminalId\?: string\)/);
    // The defect exactly: tills[0] with no way to choose.
    expect(app).not.toMatch(/shiftsApi\.open\(tills\[0\]\.id/);
    // A chosen id is resolved against the list the server just returned, so a
    // till removed since the screen loaded cannot open a drawer.
    expect(app).toContain('tills.find((till) => till.id === terminalId)');
  });

  it('refuses to open a drawer at a branch with no till, and says where to add one', () => {
    expect(app).toMatch(/No till is configured for this branch/);
    expect(app).toMatch(/Settings . Hardware & Receipts/);
    expect(shiftsModal).toMatch(/No till is configured for this branch/);
  });

  it('asks which till only when there is more than one', () => {
    // One counter is not a decision; asking would be a field every cashier at
    // every single-till branch has to clear every morning for no information.
    expect(shiftsModal).toContain('const mustChooseTill = !shiftInfo.isOpen && terminals.length > 1;');
    expect(shiftsModal).toContain('Which till are you on?');
    // And the button cannot start a shift while that choice is outstanding.
    expect(shiftsModal).toContain('disabled={!tillReady || terminals.length === 0}');
    expect(shiftsModal).toContain('onStartShift(openingFloatValue, chosenTill?.id)');
  });

  it('names the open till instead of printing its UUID', () => {
    // "Terminal #a3f2c891-4e0d-..." is not something a cashier can check
    // against the sticker on the machine in front of them.
    expect(shiftsModal).not.toMatch(/Terminal #\{shiftInfo\.terminalId\}/);
    expect(shiftsModal).toContain('namedTill(shiftInfo.terminalId)');
    expect(shiftsModal).toMatch(/Till \$\{till\.code\} · \$\{till\.name\}/);
  });

  it('puts till management behind the permission the endpoints require', () => {
    // settings.terminal is what TerminalController demands for create and
    // re-block; gating the screen on anything else would show a control that
    // always fails, or hide one the person may actually use.
    const panel = settings.slice(settings.indexOf('Tills at {currentOutlet.name}') - 2000);
    expect(panel).toContain("activeTab === 'printers' && permissions.has('settings.terminal')");
    expect(settings).toContain('onCreateTerminal');
    expect(settings).toContain('onIssueTerminalBlock');
  });

  it('keeps the typed code and name when the server refuses', () => {
    // The expenses form lost an entry this way: cleared on the same tick as the
    // call, so a rejection cost the value and the reason both.
    const submit = settings.slice(
      settings.indexOf('const submitTill'),
      settings.indexOf('const issueBlock'),
    );
    expect(submit).toContain('setTillError(');
    const clearIndex = submit.indexOf("setTillCode('')");
    const awaitIndex = submit.indexOf('await onCreateTerminal');
    expect(awaitIndex).toBeGreaterThan(-1);
    expect(clearIndex).toBeGreaterThan(awaitIndex);
  });

  it('rejects a till code the server would reject, before the round trip', () => {
    const submit = settings.slice(
      settings.indexOf('const submitTill'),
      settings.indexOf('const issueBlock'),
    );
    // The same constraint TerminalController.NewTerminal carries.
    expect(submit).toContain('/^[A-Za-z0-9]{1,4}$/');
    // And a duplicate code at this branch, which is the common mistake.
    expect(submit).toContain('terminals.some((till) => till.code.toUpperCase() === code.toUpperCase())');
  });
});
