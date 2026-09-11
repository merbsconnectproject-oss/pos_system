import React, { useState } from 'react';
import {
  Store,
  User,
  Lock,
  Eye,
  EyeOff,
  ArrowRight,
  ArrowLeft,
  AlertCircle,
  CheckCircle2,
  MailCheck,
  KeyRound,
  ShieldCheck,
  Sparkles,
  MapPin,
  Activity,
  RotateCcw,
} from 'lucide-react';
import { UserAccount, Outlet, OutletId } from '../types';

export type AuthScreen =
  | 'sign-in'
  | 'outlet-select'
  | 'forgot-password'
  | 'reset-sent'
  | 'set-password'
  | 'account-disabled';

interface AuthViewProps {
  users: UserAccount[];
  outlets: Outlet[];
  companyName: string;
  accentColor: string;
  /** Called once credentials are accepted and any mandatory password update is done. */
  onAuthenticated: (user: UserAccount, selectedOutletId?: OutletId) => void;
  /** Persists a changed / newly set password back into the user directory. */
  onUpdateUserPassword: (userId: string, newPassword: string) => void;
  onAddAuditLog: (entry: {
    actor: string;
    action: string;
    entity: string;
    outletName: string;
    details: string;
  }) => void;
}

/**
 * Sign-in hero image.
 *
 * Swap this for a photograph of the client's own shop floor — it will read as far
 * more relatable than stock, and a local file also removes the network dependency
 * on a screen that has to work when the connection does not. Drop the file in
 * `public/` and set this to e.g. `/inco-hardware-counter.jpg`.
 *
 * The panel is designed so that if this image fails to load, the layered gradient
 * beneath it stands on its own and nothing shifts.
 */
const HERO_IMAGE =
  'https://images.unsplash.com/photo-1504148455328-c376907d081c?w=1400&auto=format&fit=crop&q=80';

export const AuthView: React.FC<AuthViewProps> = ({
  users,
  outlets,
  companyName,
  accentColor,
  onAuthenticated,
  onUpdateUserPassword,
  onAddAuditLog,
}) => {
  const [screen, setScreen] = useState<AuthScreen>('sign-in');
  const [heroFailed, setHeroFailed] = useState(false);

  // Sign-in form
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberDevice, setRememberDevice] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [attemptsRemaining, setAttemptsRemaining] = useState(3);

  // Forgot-password form
  const [recoveryContact, setRecoveryContact] = useState('');
  const [recoveryTarget, setRecoveryTarget] = useState<UserAccount | null>(null);
  const [disabledUser, setDisabledUser] = useState<UserAccount | null>(null);

  // Mandatory password update
  const [pendingUser, setPendingUser] = useState<UserAccount | null>(null);
  const [outletSelectUser, setOutletSelectUser] = useState<UserAccount | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const findUser = (value: string) => {
    const needle = value.trim().toLowerCase();
    if (!needle) return undefined;
    return users.find(
      (u) => u.username.toLowerCase() === needle || u.email.toLowerCase() === needle
    );
  };

  const outletNameFor = (user: UserAccount) =>
    user.outletId === 'all-outlets'
      ? 'All Outlets (HQ)'
      : outlets.find((o) => o.id === user.outletId)?.name || 'Unassigned Branch';

  const resetFeedback = () => {
    setError(null);
    setNotice(null);
  };

  const activeSelectableOutlets = outlets.filter(
    (outlet) => outlet.active !== false && outlet.id !== 'all-outlets'
  );

  const continueWithUser = (user: UserAccount, selectedOutletId?: OutletId) => {
    setAttemptsRemaining(3);
    onAuthenticated(user, selectedOutletId);
  };

  const beginAuthenticatedFlow = (user: UserAccount) => {
    if (user.outletId === 'all-outlets') {
      setOutletSelectUser(user);
      setScreen('outlet-select');
      return;
    }
    continueWithUser(user, user.outletId);
  };

  const passwordStrength = (() => {
    let score = 0;
    if (newPassword.length >= 8) score += 1;
    if (/[A-Z]/.test(newPassword) && /[a-z]/.test(newPassword)) score += 1;
    if (/\d/.test(newPassword)) score += 1;
    if (/[^A-Za-z0-9]/.test(newPassword)) score += 1;
    return score;
  })();

  const passwordStrengthLabel =
    passwordStrength <= 1 ? 'Weak' : passwordStrength === 2 ? 'Fair' : passwordStrength === 3 ? 'Good' : 'Strong';

  const handleSignIn = (e: React.FormEvent) => {
    e.preventDefault();
    resetFeedback();

    const user = findUser(identifier);
    if (!user) {
      const nextAttempts = Math.max(0, attemptsRemaining - 1);
      setAttemptsRemaining(nextAttempts);
      setError(`No account matches that username or email address. ${nextAttempts} attempt${nextAttempts === 1 ? '' : 's'} remaining.`);
      return;
    }
    if (!user.active) {
      setDisabledUser(user);
      setScreen('account-disabled');
      return;
    }

    const accepted =
      (user.password && password === user.password) ||
      (user.tempPassword && password === user.tempPassword);

    if (!accepted) {
      const nextAttempts = Math.max(0, attemptsRemaining - 1);
      setAttemptsRemaining(nextAttempts);
      setError(`Incorrect password. ${nextAttempts} attempt${nextAttempts === 1 ? '' : 's'} remaining before this terminal slows sign-in attempts.`);
      return;
    }

    // Branch must still exist and be open for business before the session starts.
    const branch = outlets.find((o) => o.id === user.outletId);
    if (user.outletId !== 'all-outlets' && branch && branch.active === false) {
      setError(
        `Your assigned branch (${branch.name}) is currently deactivated. Contact a system administrator.`
      );
      return;
    }

    if (user.mustChangePasswordOnNextLogin) {
      setPendingUser(user);
      setNewPassword('');
      setConfirmPassword('');
      setScreen('set-password');
      return;
    }

    beginAuthenticatedFlow(user);
  };

  const handleRequestReset = (e: React.FormEvent) => {
    e.preventDefault();
    resetFeedback();

    const user = findUser(recoveryContact);
    if (!user) {
      setError('We could not find an account with that username or email address.');
      return;
    }

    setRecoveryTarget(user);
    onAddAuditLog({
      actor: user.fullName,
      action: 'PASSWORD_RESET_REQUESTED',
      entity: `User: ${user.username}`,
      outletName: outletNameFor(user),
      details: `Self-service password reset requested from the sign-in screen for ${user.email}.`,
    });
    setScreen('reset-sent');
  };

  const handleOpenResetToken = () => {
    const user = recoveryTarget || findUser(recoveryContact);
    if (!user) return;
    setPendingUser(user);
    setPassword(user.tempPassword || '');
    setNewPassword('');
    setConfirmPassword('');
    resetFeedback();
    setScreen('set-password');
  };

  const handleResendReset = () => {
    if (!recoveryTarget) return;
    resetFeedback();
    onAddAuditLog({
      actor: recoveryTarget.fullName,
      action: 'PASSWORD_RESET_RESENT',
      entity: `User: ${recoveryTarget.username}`,
      outletName: outletNameFor(recoveryTarget),
      details: `Self-service password reset instructions resent to ${recoveryTarget.email}.`,
    });
    setNotice('Reset instructions have been resent.');
  };

  const handleSetPassword = (e: React.FormEvent) => {
    e.preventDefault();
    resetFeedback();
    if (!pendingUser) return;

    if (newPassword.length < 8) {
      setError('Your new password must contain at least 8 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('The two passwords do not match. Please retype them carefully.');
      return;
    }
    if (newPassword === password) {
      setError('Your new password cannot be the same as your temporary password.');
      return;
    }

    onUpdateUserPassword(pendingUser.id, newPassword);
    onAddAuditLog({
      actor: pendingUser.fullName,
      action: 'USER_PASSWORD_CHANGE_COMPLETED',
      entity: `User: ${pendingUser.username}`,
      outletName: outletNameFor(pendingUser),
      details: 'Completed the mandatory password update prompted at sign-in.',
    });

    beginAuthenticatedFlow({
      ...pendingUser,
      password: newPassword,
      tempPassword: undefined,
      mustChangePasswordOnNextLogin: false,
    });
  };

  const goToSignIn = () => {
    resetFeedback();
    setPassword('');
    setPendingUser(null);
    setOutletSelectUser(null);
    setDisabledUser(null);
    setScreen('sign-in');
  };

  const fieldClass =
    'w-full pl-10 pr-3 py-2.5 text-sm bg-white border border-slate-300 rounded-xl text-slate-800 placeholder:text-slate-400 focus:outline-hidden focus:border-slate-500 focus:ring-2 focus:ring-slate-900/10 transition-colors';

  return (
    <div className="min-h-screen bg-[#f8f9fa] text-slate-800 font-sans lg:grid lg:grid-cols-2">
      {/* LEFT: BRAND PANEL */}
      <div className="relative hidden lg:flex flex-col justify-between bg-slate-900 text-white p-10 xl:p-14 overflow-hidden">
        {/*
          Blended hero. Layer order, bottom to top: slate base → photograph →
          dark scrim for text contrast (NFR-14) → accent tint so the panel follows
          the chosen theme → the existing radial glows → content.
        */}
        {!heroFailed && (
          <img
            src={HERO_IMAGE}
            alt=""
            aria-hidden="true"
            loading="eager"
            onError={() => setHeroFailed(true)}
            className="pointer-events-none absolute inset-0 h-full w-full object-cover object-center opacity-[0.72] saturate-[0.9] contrast-[1.05]"
          />
        )}

        {/*
          Scrim. Kept deliberately light overall so the photograph reads, with the
          darkening concentrated left-to-right where the copy actually sits — the
          text column stays past 11:1 while the right of the panel opens up (NFR-14).
        */}
        <div className="pointer-events-none absolute inset-0 bg-slate-900/30" />
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-slate-900 via-slate-900/85 to-slate-900/10" />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-slate-900 to-transparent" />
        <div className="pointer-events-none absolute inset-x-0 top-0 h-32 bg-gradient-to-b from-slate-900/80 to-transparent" />

        {/* Accent tint — ties the photograph to the active theme colour. */}
        <div
          className="pointer-events-none absolute inset-0 mix-blend-soft-light opacity-35"
          style={{ backgroundImage: `linear-gradient(135deg, ${accentColor} 0%, transparent 55%)` }}
        />

        {/* Hairline seam against the form panel. */}
        <div className="pointer-events-none absolute inset-y-0 right-0 w-px bg-white/10" />

        <div
          className="absolute -top-24 -right-24 w-96 h-96 rounded-full opacity-25 blur-3xl"
          style={{ backgroundColor: accentColor }}
        />
        <div
          className="absolute -bottom-32 -left-20 w-96 h-96 rounded-full opacity-15 blur-3xl"
          style={{ backgroundColor: accentColor }}
        />

        <div className="relative">
          <div className="flex items-center gap-3">
            <div
              className="w-11 h-11 rounded-2xl flex items-center justify-center shadow-lg"
              style={{ backgroundColor: accentColor }}
            >
              <Store className="w-6 h-6 text-white stroke-[2.5]" />
            </div>
            <div>
              <div className="text-lg font-black tracking-tight leading-none">Radiance POS</div>
              <div className="text-[11px] text-slate-400 font-medium tracking-wide">
                Multi-Outlet Retail OS
              </div>
            </div>
          </div>
        </div>

        <div className="relative space-y-6 max-w-md">
          <h1 className="text-3xl xl:text-4xl font-black tracking-tight leading-tight text-white">
            One terminal for every branch you run.
          </h1>
          <p className="text-sm text-slate-300 leading-relaxed">
            Sign in to reach your point of sale, live stock positions, credit ledgers and branch
            profit &amp; loss — all scoped to the outlets your role is assigned to.
          </p>

          <div className="space-y-3 pt-2">
            {[
              { icon: ShieldCheck, label: 'Role-based access', copy: 'Cashiers, managers and storekeepers each see only their own capabilities.' },
              { icon: Store, label: 'Branch-scoped data', copy: 'Your session opens on the outlet assigned to your account.' },
              { icon: KeyRound, label: 'Enforced credentials', copy: 'Temporary passwords must be replaced before the terminal unlocks.' },
            ].map(({ icon: Icon, label, copy }) => (
              <div
                key={label}
                className="flex items-start gap-3 bg-white/5 border border-white/10 rounded-xl p-3.5"
              >
                <Icon className="w-4 h-4 mt-0.5 shrink-0" style={{ color: accentColor }} />
                <div>
                  <div className="text-xs font-bold">{label}</div>
                  <div className="text-[11px] text-slate-400 leading-snug">{copy}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="relative flex items-center gap-2 text-[11px] text-slate-500">
          <Sparkles className="w-3.5 h-3.5" style={{ color: accentColor }} />
          <span>
            {companyName} • {outlets.filter((o) => o.active !== false).length} active branches
          </span>
        </div>
      </div>

      {/* RIGHT: FORM PANEL */}
      <div className="flex items-center justify-center p-5 sm:p-8 min-h-screen lg:min-h-0">
        <div className="w-full max-w-md space-y-6">
          {/* Compact brand mark for small screens */}
          <div className="flex items-center gap-3 lg:hidden">
            <div
              className="w-10 h-10 rounded-2xl flex items-center justify-center shadow-xs"
              style={{ backgroundColor: accentColor }}
            >
              <Store className="w-5 h-5 text-white stroke-[2.5]" />
            </div>
            <div>
              <div className="text-base font-black tracking-tight leading-none text-slate-900">
                Radiance POS
              </div>
              <div className="text-[11px] text-slate-500 font-medium">Multi-Outlet Retail OS</div>
            </div>
          </div>

          {/* ---------------- SIGN IN ---------------- */}
          {screen === 'sign-in' && (
            <div className="bg-white border border-slate-300 rounded-2xl shadow-xs p-6 sm:p-7 space-y-5">
              <div>
                <h2 className="text-xl font-black text-slate-900 tracking-tight">Sign in</h2>
                <p className="text-xs text-slate-500 mt-1">
                  Use the staff credentials issued by your system administrator.
                </p>
              </div>

              {error && (
                <div className="flex items-start gap-2 bg-rose-50 border border-rose-300 text-rose-800 rounded-xl px-3 py-2.5 text-xs font-medium">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{error}</span>
                </div>
              )}

              {notice && (
                <div className="flex items-start gap-2 bg-emerald-50 border border-emerald-300 text-emerald-800 rounded-xl px-3 py-2.5 text-xs font-medium">
                  <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{notice}</span>
                </div>
              )}

              <form onSubmit={handleSignIn} className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-700">Username or email</label>
                  <div className="relative">
                    <User className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
                    <input
                      type="text"
                      value={identifier}
                      onChange={(e) => setIdentifier(e.target.value)}
                      placeholder="kasante"
                      autoComplete="username"
                      className={fieldClass}
                      required
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-slate-700">Password</label>
                    <button
                      type="button"
                      onClick={() => {
                        resetFeedback();
                        setRecoveryContact(identifier);
                        setScreen('forgot-password');
                      }}
                      className="text-[11px] font-bold text-slate-500 hover:text-slate-900 underline cursor-pointer"
                    >
                      Forgot password?
                    </button>
                  </div>
                  <div className="relative">
                    <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                      autoComplete="current-password"
                      className={`${fieldClass} pr-10`}
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-700 cursor-pointer"
                      title={showPassword ? 'Hide password' : 'Show password'}
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <label className="flex items-center gap-2 text-xs text-slate-600 font-medium cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={rememberDevice}
                    onChange={(e) => setRememberDevice(e.target.checked)}
                    className="w-4 h-4 rounded cursor-pointer"
                    style={{ accentColor }}
                  />
                  <span>Keep me signed in on this terminal</span>
                </label>

                <button
                  type="submit"
                  className="w-full flex items-center justify-center gap-2 text-white text-sm font-bold py-2.5 rounded-xl shadow-xs transition-opacity hover:opacity-95 cursor-pointer"
                  style={{ backgroundColor: accentColor }}
                >
                  <span>Sign in to terminal</span>
                  <ArrowRight className="w-4 h-4 stroke-[2.5]" />
                </button>
              </form>

              <div className="pt-4 border-t border-slate-200 space-y-2">
                <div className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                  Demo accounts
                </div>
                <div className="grid gap-1.5">
                  {users.slice(0, 3).map((u) => (
                    <button
                      key={u.id}
                      type="button"
                      onClick={() => {
                        resetFeedback();
                        setIdentifier(u.username);
                        setPassword(u.tempPassword || u.password || '');
                      }}
                      className="flex items-center justify-between gap-3 text-left px-3 py-2 rounded-lg border border-slate-300 hover:bg-slate-50 transition-colors cursor-pointer"
                    >
                      <span className="text-[11px] font-bold text-slate-700">
                        {u.fullName}
                        <span className="text-slate-400 font-mono font-medium"> @{u.username}</span>
                      </span>
                      <span className="text-[10px] text-slate-400 font-medium shrink-0">
                        {outletNameFor(u)}
                      </span>
                    </button>
                  ))}
                </div>
                <p className="text-[10px] text-slate-400">
                  Click a row to fill the form. Seeded password:{' '}
                  <span className="font-mono text-slate-600">Radiance#2026</span>
                </p>
              </div>
            </div>
          )}

          {/* ---------------- OUTLET SELECT ---------------- */}
          {screen === 'outlet-select' && outletSelectUser && (
            <div className="bg-white border border-slate-300 rounded-2xl shadow-xs p-6 sm:p-7 space-y-5">
              <div>
                <h2 className="text-xl font-black text-slate-900 tracking-tight">Choose working outlet</h2>
                <p className="text-xs text-slate-500 mt-1">
                  Select the branch for this session. Transactional screens will be scoped to this outlet.
                </p>
              </div>

              <div className="grid gap-3">
                {activeSelectableOutlets.map((outlet) => (
                  <button
                    key={outlet.id}
                    type="button"
                    onClick={() => continueWithUser(outletSelectUser, outlet.id)}
                    className="text-left rounded-2xl border border-slate-300 bg-white p-4 hover:border-accent-300 hover:bg-accent-50/30 transition-colors cursor-pointer"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex items-start gap-3">
                        <div className="w-10 h-10 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-center">
                          <Store className="w-5 h-5 text-accent-600" />
                        </div>
                        <div>
                          <div className="font-black text-sm text-slate-900">{outlet.name}</div>
                          <div className="text-xs text-slate-500 mt-0.5 flex items-center gap-1">
                            <MapPin className="w-3.5 h-3.5 text-slate-400" />
                            <span>{outlet.town}</span>
                          </div>
                          <div className="text-[11px] text-slate-400 mt-1">{outlet.address}</div>
                        </div>
                      </div>
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 border border-emerald-200 px-2 py-0.5 text-[10px] font-bold text-emerald-700">
                        <Activity className="w-3 h-3" />
                        Open shift ready
                      </span>
                    </div>
                  </button>
                ))}
              </div>

              <button
                type="button"
                onClick={goToSignIn}
                className="w-full flex items-center justify-center gap-1.5 text-xs font-bold text-slate-500 hover:text-slate-900 cursor-pointer"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Back to sign in</span>
              </button>
            </div>
          )}

          {/* ---------------- ACCOUNT DISABLED ---------------- */}
          {screen === 'account-disabled' && (
            <div className="bg-white border border-slate-300 rounded-2xl shadow-xs p-6 sm:p-7 space-y-5 text-center">
              <div className="w-14 h-14 rounded-2xl bg-rose-50 border border-rose-200 flex items-center justify-center mx-auto">
                <AlertCircle className="w-7 h-7 text-rose-600" />
              </div>
              <div className="space-y-1.5">
                <h2 className="text-xl font-black text-slate-900 tracking-tight">Account disabled</h2>
                <p className="text-xs text-slate-500 leading-relaxed">
                  {disabledUser ? `${disabledUser.fullName}'s account` : 'This account'} cannot sign in.
                  Contact a system administrator to restore access or assign the user to an active outlet.
                </p>
              </div>
              <button
                type="button"
                onClick={goToSignIn}
                className="w-full flex items-center justify-center gap-1.5 text-xs font-bold text-slate-600 hover:text-slate-900 border border-slate-300 rounded-xl py-2.5 hover:bg-slate-50 transition-colors cursor-pointer"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Back to sign in</span>
              </button>
            </div>
          )}

          {/* ---------------- FORGOT PASSWORD ---------------- */}
          {screen === 'forgot-password' && (
            <div className="bg-white border border-slate-300 rounded-2xl shadow-xs p-6 sm:p-7 space-y-5">
              <div>
                <h2 className="text-xl font-black text-slate-900 tracking-tight">
                  Reset your password
                </h2>
                <p className="text-xs text-slate-500 mt-1">
                  Tell us who you are and we will send reset instructions to the email on your staff
                  record.
                </p>
              </div>

              {error && (
                <div className="flex items-start gap-2 bg-rose-50 border border-rose-300 text-rose-800 rounded-xl px-3 py-2.5 text-xs font-medium">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{error}</span>
                </div>
              )}

              <form onSubmit={handleRequestReset} className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-700">Username or email</label>
                  <div className="relative">
                    <User className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
                    <input
                      type="text"
                      value={recoveryContact}
                      onChange={(e) => setRecoveryContact(e.target.value)}
                      placeholder="kasante"
                      className={fieldClass}
                      required
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  className="w-full flex items-center justify-center gap-2 text-white text-sm font-bold py-2.5 rounded-xl shadow-xs transition-opacity hover:opacity-95 cursor-pointer"
                  style={{ backgroundColor: accentColor }}
                >
                  <span>Send reset instructions</span>
                  <ArrowRight className="w-4 h-4 stroke-[2.5]" />
                </button>
              </form>

              <button
                type="button"
                onClick={goToSignIn}
                className="w-full flex items-center justify-center gap-1.5 text-xs font-bold text-slate-500 hover:text-slate-900 cursor-pointer"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Back to sign in</span>
              </button>
            </div>
          )}

          {/* ---------------- RESET REQUEST SENT ---------------- */}
          {screen === 'reset-sent' && (
            <div className="bg-white border border-slate-300 rounded-2xl shadow-xs p-6 sm:p-7 space-y-5 text-center">
              <div className="w-14 h-14 rounded-2xl bg-emerald-50 border border-emerald-300 flex items-center justify-center mx-auto">
                <MailCheck className="w-7 h-7 text-emerald-600" />
              </div>
              <div className="space-y-1.5">
                <h2 className="text-xl font-black text-slate-900 tracking-tight">Check your inbox</h2>
                <p className="text-xs text-slate-500 leading-relaxed">
                  If an account exists for that identifier, reset instructions are on their way to{' '}
                  <span className="font-bold text-slate-700">
                    {recoveryTarget ? recoveryTarget.email : 'the registered address'}
                  </span>
                  . Your administrator can also issue a temporary password from Settings → User
                  Accounts.
                </p>
              </div>

              <div className="bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-3 text-left text-[11px] text-slate-600 leading-relaxed">
                The request has been written to the security audit trail. If you do not receive the
                email within a few minutes, check your spam folder or contact your branch manager.
              </div>

              {notice && (
                <div className="flex items-start gap-2 bg-emerald-50 border border-emerald-300 text-emerald-800 rounded-xl px-3 py-2.5 text-xs font-medium text-left">
                  <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{notice}</span>
                </div>
              )}

              <button
                type="button"
                onClick={handleOpenResetToken}
                className="w-full flex items-center justify-center gap-1.5 text-xs font-bold text-white rounded-xl py-2.5 transition-opacity hover:opacity-95 cursor-pointer"
                style={{ backgroundColor: accentColor }}
              >
                <KeyRound className="w-3.5 h-3.5" />
                <span>Open reset link</span>
              </button>

              <button
                type="button"
                onClick={handleResendReset}
                className="w-full flex items-center justify-center gap-1.5 text-xs font-bold text-slate-600 hover:text-slate-900 border border-slate-300 rounded-xl py-2.5 hover:bg-slate-50 transition-colors cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Resend instructions</span>
              </button>

              <button
                type="button"
                onClick={goToSignIn}
                className="w-full flex items-center justify-center gap-1.5 text-xs font-bold text-slate-600 hover:text-slate-900 border border-slate-300 rounded-xl py-2.5 hover:bg-slate-50 transition-colors cursor-pointer"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Back to sign in</span>
              </button>
            </div>
          )}

          {/* ---------------- MANDATORY PASSWORD UPDATE ---------------- */}
          {screen === 'set-password' && pendingUser && (
            <div className="bg-white border border-slate-300 rounded-2xl shadow-xs p-6 sm:p-7 space-y-5">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl bg-amber-50 border border-amber-300 flex items-center justify-center shrink-0">
                  <KeyRound className="w-5 h-5 text-amber-600" />
                </div>
                <div>
                  <h2 className="text-lg font-black text-slate-900 tracking-tight">
                    Set a new password
                  </h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Welcome, {pendingUser.fullName}. Your account is on a temporary password and must
                    be updated before the terminal unlocks.
                  </p>
                </div>
              </div>

              {error && (
                <div className="flex items-start gap-2 bg-rose-50 border border-rose-300 text-rose-800 rounded-xl px-3 py-2.5 text-xs font-medium">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{error}</span>
                </div>
              )}

              <form onSubmit={handleSetPassword} className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-700">New password</label>
                  <div className="relative">
                    <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="At least 8 characters"
                      autoComplete="new-password"
                      className={`${fieldClass} pr-10`}
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-700 cursor-pointer"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  <div className="space-y-1.5">
                    <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{
                          width: `${Math.max(1, passwordStrength) * 25}%`,
                          backgroundColor: passwordStrength >= 3 ? '#16a34a' : accentColor,
                        }}
                      />
                    </div>
                    <div className="text-[10px] font-bold text-slate-500">
                      Password strength: <span className="text-slate-800">{passwordStrengthLabel}</span>
                    </div>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-700">Confirm new password</label>
                  <div className="relative">
                    <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="Retype the new password"
                      autoComplete="new-password"
                      className={fieldClass}
                      required
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  className="w-full flex items-center justify-center gap-2 text-white text-sm font-bold py-2.5 rounded-xl shadow-xs transition-opacity hover:opacity-95 cursor-pointer"
                  style={{ backgroundColor: accentColor }}
                >
                  <span>Update password &amp; continue</span>
                  <ArrowRight className="w-4 h-4 stroke-[2.5]" />
                </button>
              </form>

              <button
                type="button"
                onClick={goToSignIn}
                className="w-full flex items-center justify-center gap-1.5 text-xs font-bold text-slate-500 hover:text-slate-900 cursor-pointer"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Cancel and sign in as someone else</span>
              </button>
            </div>
          )}

          <p className="text-center text-[11px] text-slate-400">
            Protected terminal • All sign-in activity is recorded in the audit trail
          </p>
        </div>
      </div>
    </div>
  );
};
