# Authentication Screen Audit

Date: 2026-09-09 · **Backend section superseded 2026-09-13**

> **The "Remaining Backend Gaps" section below is no longer true.** It was
> written while auth was frontend-only, against seeded users in `mockData.ts`.
> Feature A is now implemented server-side in `pos-api` — sessions, Argon2id
> hashing, rate limiting, endpoint permission checks, screen lock and an
> append-only audit log. The *screen* conformance table above it still holds
> and is still the reference for A-01…A-11.
>
> Current backend status: `pos-api/PROGRESS.md`, section A.

Source of truth:

- `docs/SCREEN-INVENTORY.md`, section A.
- `docs/PRD (1).md`, section 5.1 `FR-AUTH`.
- `docs/CHECKLIST.md`, Phase 1 Auth and permissions.

## Scope

This pass covers only `A. Authentication and session`. Later screen groups should be audited separately after review.

## Screen Conformance

| ID | Screen | Status | Implementation Notes |
|---|---|---|---|
| A-01 | Sign in | Implemented | `AuthView` supports username/email, password, show/hide, remember checkbox, sign-in button, forgot link. |
| A-02 | Sign-in error | Implemented | Inline error appears above the form with attempts remaining for wrong identifiers/passwords. |
| A-03 | Outlet select | Implemented | Users with `outletId === 'all-outlets'` choose an active outlet before entering the app. Single-outlet users are placed automatically. |
| A-04 | Forgot password | Implemented | `AuthView` has a reset request page with username/email field. |
| A-05 | Reset link sent | Implemented | Confirmation state includes resend, back to sign in, and a demo reset-link continuation. |
| A-06 | Set new password | Implemented | New password and confirm fields plus strength meter. Used for temporary-password change and reset-link flow. |
| A-07 | Screen lock | Implemented | Header user menu exposes lock screen; F9 also locks. Unlock requires the current user's PIN and preserves shift/session state. |
| A-08 | Session expired | Implemented | Idle timeout shows lock overlay rather than signing out. Unlock requires PIN. |
| A-09 | Account disabled | Implemented | Deactivated users are routed to a dedicated disabled-account state with admin guidance. |
| A-10 | Not found | Implemented | Unknown SPA tab state renders a calm not-found screen with back-to-dashboard action. |
| A-11 | Server error | Implemented | Unhandled errors/rejections route to a server-error screen with retry, dashboard action, and reference code. |

## Requirement Conformance

| Requirement | Status | Notes |
|---|---|---|
| FR-AUTH-01 | Implemented for local/demo data | Username/email and password are checked against seeded user records. |
| FR-AUTH-02 | Implemented for UI state | User PIN is used for lock/unlock and manager approval flows. |
| FR-AUTH-03 | Implemented | All-outlet users select a working outlet; single-outlet users are scoped automatically. |
| FR-AUTH-04 | Implemented for client state | Locking preserves the app state and active shift. |
| FR-AUTH-05 | Implemented for client state | Idle expiry locks the terminal. Timeout is currently hard-coded to 15 minutes until settings persistence exists. |
| FR-AUTH-06 | Partially implemented | Failed sign-in attempts show remaining attempts and are audit-ready, but real server-side rate limiting is not possible in the current local-only auth model. |
| FR-AUTH-07 | Implemented for UI/demo flow | Self-service reset screens exist; real email delivery is not connected. Admin reset exists through user settings. |
| FR-AUTH-08 | Implemented | Disabled accounts cannot sign in and see a clear message. |

## Remaining Backend Gaps

~~Superseded — see the note at the top of this file.~~ What remains:

- Real route URLs such as `/login`, `/select-outlet`, `/lock`, `/404`, and `/500` are still SPA states, not browser routes. Unchanged, and still a deliberate choice.
- ~~Server-side authentication, password hashing, endpoint permission checks, and real rate limiting~~ — **done**. Argon2id with separately hashed PINs, session cookies, `@PreAuthorize` over the permission codes, and lockout enforced before any hash work.
- ~~Reset emails are simulated~~ — **done**. Resend over HTTPS; tokens stored as a SHA-256 digest and single-use. Needs an API key and a verified sending domain before mail actually leaves.

One gap the original audit could not have seen: FR-AUTH-06's note that
"real server-side rate limiting is not possible in the current local-only
auth model" is now resolved, but the lockout is keyed on the raw identifier,
so an account with an email address has two independent attempt budgets.
