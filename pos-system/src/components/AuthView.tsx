import { useState, type FormEvent } from 'react';
import {
  AlertCircle, ArrowLeft, ArrowRight, CheckCircle2, Eye, EyeOff,
  KeyRound, Lock, MailCheck, MapPin, RotateCcw, ShieldCheck, Store, User,
} from 'lucide-react';
import { authApi, AuthApiError, type AuthSession } from '../authApi';
import { PosTerminalArt } from './PosTerminalArt';

type AuthScreen =
  | 'sign-in'
  | 'outlet-select'
  | 'forgot-password'
  | 'reset-sent'
  | 'set-password'
  /** FR-AUTH-07: signed in on somebody else's password, and nothing else yet. */
  | 'choose-own-password'
  | 'account-disabled';

interface AuthViewProps {
  companyName: string;
  accentColor: string;
  onAuthenticated: (session: AuthSession) => void;
}

const tokenFromUrl = () => new URLSearchParams(window.location.search).get('token') || '';

export function AuthView({ companyName, accentColor, onAuthenticated }: AuthViewProps) {
  const [resetToken] = useState(tokenFromUrl);
  const [screen, setScreen] = useState<AuthScreen>(() => resetToken ? 'set-password' : 'sign-in');
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [pendingSession, setPendingSession] = useState<AuthSession | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const fieldClass =
    'w-full rounded-xl border border-slate-300 bg-white py-2.5 pl-10 pr-3 text-sm text-slate-800 placeholder:text-slate-400 focus:border-slate-500 focus:outline-hidden focus:ring-2 focus:ring-slate-900/10';
  const submitClass =
    'flex w-full items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-bold text-white shadow-xs transition-opacity hover:opacity-95 disabled:cursor-wait disabled:opacity-60';

  const run = async (work: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await work();
    } catch (failure) {
      const apiError = failure instanceof AuthApiError ? failure : null;
      if (apiError?.code === 'ACCOUNT_DEACTIVATED') {
        setScreen('account-disabled');
      } else {
        const remaining = apiError?.details.attemptsRemaining;
        const suffix = typeof remaining === 'number'
          ? ` ${remaining} attempt${remaining === 1 ? '' : 's'} remaining.`
          : '';
        setError(`${apiError?.message || 'Something went wrong. Try again.'}${suffix}`);
      }
    } finally {
      setBusy(false);
    }
  };

  const handleSignIn = (event: FormEvent) => {
    event.preventDefault();
    void run(async () => {
      const session = await authApi.signIn(identifier.trim(), password);

      // FR-AUTH-07: before anything else, including choosing a branch. The
      // server refuses every other call until this is done, so sending them to
      // the workspace first would be sending them to a wall of 403s.
      if (session.mustChangePassword) {
        setPendingSession(session);
        setNewPassword('');
        setConfirmPassword('');
        setScreen('choose-own-password');
        return;
      }

      if (session.mustChooseOutlet) {
        setPendingSession(session);
        setScreen('outlet-select');
      } else {
        onAuthenticated(session);
      }
    });
  };

  /** FR-AUTH-07: replace the password you were given with one only you know. */
  const chooseOwnPassword = (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    if (newPassword.length < 8) {
      setError('Your new password must contain at least 8 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('The two passwords do not match.');
      return;
    }
    void run(async () => {
      // The response is the session, re-stamped with the flag cleared.
      const session = await authApi.changeOwnPassword(password, newPassword);
      setPassword('');
      setNewPassword('');
      setConfirmPassword('');
      if (session.mustChooseOutlet) {
        setPendingSession(session);
        setScreen('outlet-select');
      } else {
        onAuthenticated(session);
      }
    });
  };

  const chooseOutlet = (outletId: string) => void run(async () => {
    onAuthenticated(await authApi.selectOutlet(outletId));
  });

  const requestReset = (event?: FormEvent) => {
    event?.preventDefault();
    void run(async () => {
      await authApi.requestPasswordReset(resetEmail.trim());
      setScreen('reset-sent');
    });
  };

  const confirmReset = (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    if (newPassword.length < 8) {
      setError('Your new password must contain at least 8 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('The two passwords do not match.');
      return;
    }
    void run(async () => {
      await authApi.confirmPasswordReset(resetToken, newPassword);
      window.history.replaceState({}, '', window.location.pathname);
      setPassword('');
      setNotice('Password changed. You can now sign in.');
      setScreen('sign-in');
    });
  };

  const backToSignIn = () => {
    setError(null);
    setNotice(null);
    setPassword('');
    setPendingSession(null);
    setScreen('sign-in');
  };

  const feedback = error ? (
    <div className="flex items-start gap-2 rounded-xl border border-rose-300 bg-rose-50 px-3 py-2.5 text-xs font-medium text-rose-800">
      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /><span>{error}</span>
    </div>
  ) : notice ? (
    <div className="flex items-start gap-2 rounded-xl border border-emerald-300 bg-emerald-50 px-3 py-2.5 text-xs font-medium text-emerald-800">
      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /><span>{notice}</span>
    </div>
  ) : null;

  return (
    <div className="min-h-screen bg-[#f8f9fa] text-slate-800 lg:grid lg:grid-cols-2">
      <section className="relative hidden overflow-hidden bg-slate-950 p-12 text-white lg:flex lg:flex-col lg:justify-between">
        {/*
          A real counter behind the drawing, so the panel has somewhere to be.
          Blurred and dimmed in the asset itself rather than only in CSS: it
          keeps the file at 66 KB for an installer that ships offline, and it
          means no shop's branding and nobody's face is legible on a screen
          that is not theirs.

          Swap `counter-bg.jpg` for a photograph of your own shop and nothing
          else here needs to change.
        */}
        <div
          aria-hidden="true"
          className="absolute inset-0 bg-cover opacity-[0.55]"
          style={{
            backgroundImage: 'url(/assets/counter-bg.jpg)',
            // Off-centre on purpose: the tills are on the right of the frame,
            // and a panel this narrow crops a landscape photo to its middle.
            backgroundPosition: '68% 45%',
          }}
        />
        {/* Grounds the photo in the panel and keeps the copy legible over it. */}
        <div className="absolute inset-0 bg-gradient-to-b from-slate-950/35 via-slate-950/70 to-slate-950/96" />
        <div className="absolute inset-0 opacity-30" style={{ background: `radial-gradient(circle at 20% 20%, ${accentColor}, transparent 45%)` }} />
        <div className="relative flex items-center gap-3">
          <img src="/assets/radiance-pos-icon-512.png" alt="" className="h-11 w-11 object-contain" />
          <div><div className="font-black">Radiance POS</div><div className="text-xs text-slate-400">Multi-outlet retail system</div></div>
        </div>

        {/*
          The counter, drawn. A shop being sold a till wants to see a till —
          and one that is recognisably any shop's, so the screen does not
          quietly say this system is for one trade.
        */}
        <div className="relative my-8 flex justify-center">
          <PosTerminalArt
            accentColor={accentColor}
            className="h-auto w-full max-w-[420px] text-white [filter:drop-shadow(0_18px_38px_rgba(2,6,23,0.75))]"
          />
        </div>

        <div className="relative max-w-lg">
          <h1 className="text-4xl font-black tracking-tight">Secure access at every counter.</h1>
          <p className="mt-4 text-sm leading-7 text-slate-300">Sessions, permissions, screen locking, and password recovery are enforced by the local POS server.</p>
          <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs font-semibold text-slate-400">
            <span className="inline-flex items-center gap-1.5"><ShieldCheck className="h-4 w-4" style={{ color: accentColor }} />Runs on the counter, offline</span>
            <span className="inline-flex items-center gap-1.5"><Store className="h-4 w-4" style={{ color: accentColor }} />Any trade, any outlet</span>
          </div>
        </div>

        <div className="relative text-xs text-slate-500">{companyName}</div>
      </section>

      <main className="flex min-h-screen items-center justify-center p-5 sm:p-8">
        <div className="w-full max-w-md">
          {/* The side panel is desktop-only, so a tablet at the counter would
              otherwise get a form and no sign of what it belongs to. */}
          <div className="mb-6 lg:hidden">
            <div className="flex items-center gap-3">
              <img src="/assets/radiance-pos-icon-512.png" alt="" className="h-10 w-10 object-contain" />
              <div><div className="font-black text-slate-900">Radiance POS</div><div className="text-xs text-slate-500">Secure terminal access</div></div>
            </div>
            <div className="mt-5 flex justify-center rounded-2xl border border-slate-200 bg-white px-4 py-5">
              <PosTerminalArt accentColor={accentColor} className="h-auto w-full max-w-[260px] text-slate-500" />
            </div>
          </div>

          {screen === 'sign-in' && (
            <section className="space-y-5 rounded-2xl border border-slate-300 bg-white p-7 shadow-xs">
              <div><h2 className="text-xl font-black text-slate-900">Sign in</h2><p className="mt-1 text-xs text-slate-500">Use the credentials issued by your administrator.</p></div>
              {feedback}
              <form className="space-y-4" onSubmit={handleSignIn}>
                <label className="block space-y-1.5">
                  <span className="text-xs font-bold text-slate-700">Username or email</span>
                  <div className="relative"><User className="absolute left-3.5 top-3 h-4 w-4 text-slate-400" /><input className={fieldClass} value={identifier} onChange={(e) => setIdentifier(e.target.value)} autoComplete="username" required /></div>
                </label>
                <div className="space-y-1.5">
                  <div className="flex justify-between text-xs font-bold text-slate-700"><label htmlFor="sign-in-password">Password</label><button type="button" onClick={() => { setError(null); setResetEmail(identifier.includes('@') ? identifier : ''); setScreen('forgot-password'); }} className="font-bold text-slate-500 underline">Forgot password?</button></div>
                  <div className="relative"><Lock className="absolute left-3.5 top-3 h-4 w-4 text-slate-400" /><input id="sign-in-password" className={`${fieldClass} pr-10`} type={showPassword ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required /><button type="button" aria-label={showPassword ? 'Hide password' : 'Show password'} onPointerDown={(e) => e.preventDefault()} onClick={(e) => { e.preventDefault(); e.stopPropagation(); setShowPassword((value) => !value); }} className="absolute right-3 top-2.5 text-slate-400">{showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button></div>
                </div>
                <button disabled={busy} className={submitClass} style={{ backgroundColor: accentColor }}>{busy ? 'Signing in…' : 'Sign in to terminal'}<ArrowRight className="h-4 w-4" /></button>
              </form>
            </section>
          )}

          {screen === 'outlet-select' && pendingSession && (
            <section className="space-y-5 rounded-2xl border border-slate-300 bg-white p-7 shadow-xs">
              <div><h2 className="text-xl font-black text-slate-900">Choose working outlet</h2><p className="mt-1 text-xs text-slate-500">Your session will be scoped to this outlet.</p></div>
              {feedback}
              <div className="grid gap-3">{pendingSession.outletChoices.map((outlet) => <button disabled={busy} key={outlet.id} onClick={() => chooseOutlet(outlet.id)} className="flex items-center gap-3 rounded-xl border border-slate-300 p-4 text-left hover:bg-slate-50"><MapPin className="h-5 w-5 text-slate-400" /><div><div className="text-sm font-black text-slate-900">{outlet.name}</div><div className="text-xs text-slate-500">{outlet.code}</div></div></button>)}</div>
              <button onClick={backToSignIn} className="flex w-full items-center justify-center gap-1 text-xs font-bold text-slate-500"><ArrowLeft className="h-4 w-4" />Back</button>
            </section>
          )}

          {screen === 'forgot-password' && (
            <section className="space-y-5 rounded-2xl border border-slate-300 bg-white p-7 shadow-xs">
              <div><h2 className="text-xl font-black text-slate-900">Reset your password</h2><p className="mt-1 text-xs text-slate-500">We will send a one-time link to your registered email.</p></div>
              {feedback}
              <form className="space-y-4" onSubmit={requestReset}>
                <label className="block space-y-1.5"><span className="text-xs font-bold text-slate-700">Email address</span><div className="relative"><User className="absolute left-3.5 top-3 h-4 w-4 text-slate-400" /><input className={fieldClass} type="email" value={resetEmail} onChange={(e) => setResetEmail(e.target.value)} autoComplete="email" required /></div></label>
                <button disabled={busy} className={submitClass} style={{ backgroundColor: accentColor }}>{busy ? 'Sending…' : 'Send reset instructions'}<ArrowRight className="h-4 w-4" /></button>
              </form>
              <button onClick={backToSignIn} className="flex w-full items-center justify-center gap-1 text-xs font-bold text-slate-500"><ArrowLeft className="h-4 w-4" />Back to sign in</button>
            </section>
          )}

          {screen === 'reset-sent' && (
            <section className="space-y-5 rounded-2xl border border-slate-300 bg-white p-7 text-center shadow-xs">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-emerald-200 bg-emerald-50"><MailCheck className="h-7 w-7 text-emerald-600" /></div>
              <div><h2 className="text-xl font-black text-slate-900">Check your inbox</h2><p className="mt-2 text-xs leading-5 text-slate-500">If an active account uses that email, reset instructions are on the way. The same response is shown for every address to protect staff accounts.</p></div>
              {feedback}
              <button disabled={busy} onClick={() => requestReset()} className="flex w-full items-center justify-center gap-2 rounded-xl border border-slate-300 py-2.5 text-xs font-bold text-slate-600"><RotateCcw className="h-4 w-4" />Resend instructions</button>
              <button onClick={backToSignIn} className="flex w-full items-center justify-center gap-1 text-xs font-bold text-slate-500"><ArrowLeft className="h-4 w-4" />Back to sign in</button>
            </section>
          )}

          {screen === 'choose-own-password' && pendingSession && (
            <section className="space-y-5 rounded-2xl border border-slate-300 bg-white p-7 shadow-xs">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-amber-200 bg-amber-50">
                  <KeyRound className="h-5 w-5 text-amber-600" />
                </div>
                <div>
                  <h2 className="text-xl font-black text-slate-900">Choose your own password</h2>
                  <p className="mt-1 text-xs text-slate-500">
                    Welcome, {pendingSession.fullName}. The password you just used was chosen by
                    whoever set up your account, so somebody else knows it. Pick one only you know
                    before you carry on.
                  </p>
                </div>
              </div>
              {feedback}
              <form className="space-y-4" onSubmit={chooseOwnPassword}>
                <label className="block space-y-1.5">
                  <span className="text-xs font-bold text-slate-700">New password</span>
                  <div className="relative">
                    <Lock className="absolute left-3.5 top-3 h-4 w-4 text-slate-400" />
                    <input className={fieldClass} type="password" minLength={8} value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)} autoComplete="new-password" required />
                  </div>
                </label>
                <label className="block space-y-1.5">
                  <span className="text-xs font-bold text-slate-700">Confirm password</span>
                  <div className="relative">
                    <Lock className="absolute left-3.5 top-3 h-4 w-4 text-slate-400" />
                    <input className={fieldClass} type="password" minLength={8} value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)} autoComplete="new-password" required />
                  </div>
                </label>
                <button disabled={busy} className={submitClass} style={{ backgroundColor: accentColor }}>
                  {busy ? 'Saving…' : 'Save and continue'}<KeyRound className="h-4 w-4" />
                </button>
              </form>
            </section>
          )}

          {screen === 'set-password' && (
            <section className="space-y-5 rounded-2xl border border-slate-300 bg-white p-7 shadow-xs">
              <div className="flex items-start gap-3"><div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-amber-200 bg-amber-50"><KeyRound className="h-5 w-5 text-amber-600" /></div><div><h2 className="text-xl font-black text-slate-900">Choose a new password</h2><p className="mt-1 text-xs text-slate-500">The reset link can be used once and expires shortly.</p></div></div>
              {feedback}
              <form className="space-y-4" onSubmit={confirmReset}>
                <label className="block space-y-1.5"><span className="text-xs font-bold text-slate-700">New password</span><div className="relative"><Lock className="absolute left-3.5 top-3 h-4 w-4 text-slate-400" /><input className={fieldClass} type="password" minLength={8} value={newPassword} onChange={(e) => setNewPassword(e.target.value)} autoComplete="new-password" required /></div></label>
                <label className="block space-y-1.5"><span className="text-xs font-bold text-slate-700">Confirm password</span><div className="relative"><Lock className="absolute left-3.5 top-3 h-4 w-4 text-slate-400" /><input className={fieldClass} type="password" minLength={8} value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} autoComplete="new-password" required /></div></label>
                <button disabled={busy} className={submitClass} style={{ backgroundColor: accentColor }}>{busy ? 'Saving…' : 'Set new password'}<KeyRound className="h-4 w-4" /></button>
              </form>
            </section>
          )}

          {screen === 'account-disabled' && (
            <section className="space-y-5 rounded-2xl border border-slate-300 bg-white p-7 text-center shadow-xs"><AlertCircle className="mx-auto h-10 w-10 text-rose-600" /><div><h2 className="text-xl font-black text-slate-900">Account disabled</h2><p className="mt-2 text-xs text-slate-500">This account cannot sign in. Contact an administrator to restore access.</p></div><button onClick={backToSignIn} className="flex w-full items-center justify-center gap-1 rounded-xl border border-slate-300 py-2.5 text-xs font-bold text-slate-600"><ArrowLeft className="h-4 w-4" />Back to sign in</button></section>
          )}
        </div>
      </main>
    </div>
  );
}
