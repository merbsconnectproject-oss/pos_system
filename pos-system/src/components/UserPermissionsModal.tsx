import React, { useMemo, useState } from 'react';
import { ShieldCheck, X } from 'lucide-react';
import {
  PERMISSION_CATALOGUE,
  PERMISSION_GROUPS,
  type PermissionCode,
  type PermissionOverrides,
} from '../permissions';
import type { UserAccount } from '../types';

/**
 * FR-USER-03 · BR-16: what one person may do, over and above their role.
 *
 * <p>The API behind this has been complete and tested since permissions were
 * built — grant, withhold, or clear back to the role baseline, which is a
 * genuine third state rather than a synonym for withheld. It had no caller:
 * `usersApi.setPermission` was referenced nowhere outside its own definition,
 * so the only way to vary one person's rights was to move their whole role,
 * and the acceptance script's "grant a cashier one permission, then revoke it
 * mid-session" could not be demonstrated at all.
 *
 * <p>Three states, shown as three: **Role default** leaves the person wherever
 * their role puts them and follows it if the role changes later; **Granted**
 * and **Withheld** pin it regardless. Collapsing "withheld" into "not granted"
 * is the bug this shape exists to avoid — a permission a role does not have is
 * not the same as one deliberately taken away, and only the second should
 * survive the role gaining it.
 */
export type OverrideState = 'granted' | 'withheld' | 'default';

export const stateOf = (
  code: PermissionCode,
  overrides: PermissionOverrides | undefined,
): OverrideState => {
  const value = overrides?.[code];
  if (value === true) return 'granted';
  if (value === false) return 'withheld';
  return 'default';
};

interface UserPermissionsModalProps {
  user: UserAccount | null;
  /** What this person's role grants before any override. */
  roleCodes: PermissionCode[];
  onClose: () => void;
  /**
   * `granted` undefined clears the override — the third state. Resolves when
   * the server has accepted it, so the row can show the server's answer rather
   * than the one the screen hoped for.
   */
  onSetPermission: (code: PermissionCode, granted?: boolean) => Promise<void>;
}

export const UserPermissionsModal: React.FC<UserPermissionsModalProps> = ({
  user,
  roleCodes,
  onClose,
  onSetPermission,
}) => {
  const [saving, setSaving] = useState<PermissionCode | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  const roleGrants = useMemo(() => new Set(roleCodes), [roleCodes]);

  const needle = search.trim().toLowerCase();
  const matches = (code: PermissionCode, label: string) =>
    !needle || code.toLowerCase().includes(needle) || label.toLowerCase().includes(needle);

  if (!user) return null;

  const apply = async (code: PermissionCode, next: OverrideState) => {
    setSaving(code);
    setError(null);
    try {
      await onSetPermission(code, next === 'default' ? undefined : next === 'granted');
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'That change could not be saved.');
    } finally {
      setSaving(null);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/60 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-3xl max-h-[88vh] flex flex-col shadow-xl">

        <div className="flex items-start justify-between gap-4 p-5 border-b border-slate-200">
          <div>
            <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-accent-600" />
              Permissions for {user.fullName || user.username}
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Their <strong>{user.role}</strong> role is the starting point. Anything set here
              applies to this person only, and takes effect on their next request &mdash; they do
              not need to sign out.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-5 pt-4">
          <input
            type="text"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search permissions…"
            className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-300 rounded-xl focus:outline-accent-500"
          />
          {error && (
            <p className="mt-3 text-xs font-bold text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">
              {error}
            </p>
          )}
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {PERMISSION_GROUPS.map((group) => {
            const entries = PERMISSION_CATALOGUE
              .filter((item) => item.group === group && matches(item.code, item.label));
            if (entries.length === 0) return null;

            return (
              <section key={group} className="space-y-2">
                <h3 className="text-[11px] font-black uppercase tracking-wider text-slate-500">
                  {group}
                </h3>
                <div className="space-y-1.5">
                  {entries.map((item) => {
                    const state = stateOf(item.code, user.permissionOverrides);
                    const byRole = roleGrants.has(item.code);
                    const effective = state === 'granted' || (state === 'default' && byRole);

                    return (
                      <div
                        key={item.code}
                        className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 border border-slate-200 rounded-xl px-3 py-2.5"
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold text-slate-800">{item.label}</span>
                            <span className={`text-[9px] font-black uppercase px-1.5 py-0.5 rounded border ${
                              effective
                                ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                                : 'bg-slate-100 text-slate-600 border-slate-300'
                            }`}>
                              {effective ? 'allowed' : 'not allowed'}
                            </span>
                          </div>
                          <p className="text-[11px] text-slate-500 mt-0.5">{item.description}</p>
                          <code className="text-[10px] text-slate-400">{item.code}</code>
                        </div>

                        <div className="flex items-center gap-1 shrink-0" role="group" aria-label={item.label}>
                          {([
                            ['default', byRole ? 'Role default (allowed)' : 'Role default (not allowed)'],
                            ['granted', 'Granted'],
                            ['withheld', 'Withheld'],
                          ] as Array<[OverrideState, string]>).map(([option, title]) => (
                            <button
                              key={option}
                              type="button"
                              title={title}
                              disabled={saving === item.code}
                              onClick={() => apply(item.code, option)}
                              className={`px-2.5 py-1 rounded-lg text-[10px] font-bold border transition-colors disabled:opacity-50 ${
                                state === option
                                  ? option === 'granted'
                                    ? 'bg-emerald-600 text-white border-emerald-600'
                                    : option === 'withheld'
                                      ? 'bg-rose-600 text-white border-rose-600'
                                      : 'bg-slate-800 text-white border-slate-800'
                                  : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-50'
                              }`}
                            >
                              {option === 'default' ? 'Role' : option === 'granted' ? 'Grant' : 'Withhold'}
                            </button>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>

        <div className="p-4 border-t border-slate-200 flex items-center justify-between gap-3">
          <p className="text-[11px] text-slate-500">
            BR-16: the server checks every one of these on every request. Nothing here is
            only a screen setting.
          </p>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
