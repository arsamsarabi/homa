# Homa UX TODOs — Phased Delivery Design

**Date:** 2026-11-26  
**Status:** Approved (conversation)  
**Scope:** Backlog from the Homa memo, delivered as medium (~1–2 day) themed PRs.

## Context

Eighteen UX polish items spanning calendar chrome, forms/modals, keyboard a11y, settings, onboarding/social, and larger redesigns/wishlist research. Work is phased **chrome → interactions → foundations → settings/social → larger/explore**, not one mega-PR.

Uncommitted work already on `main` (push service-worker hang fix + test) ships in **Phase 1**.

## Delivery rules (all phases)

- One coherent theme per PR; medium size (~1–2 days).
- No speculative refactors outside the phase theme.
- Follow `apps/web/AGENTS.md` (layering, drawers for forms, logical CSS, colocated tests, EN+FA i18n).
- Done when `bun run lint`, `bun run typecheck`, and `bun run test` pass; UI phases also smoke-checked on touched views.
- Wishlist / explore items produce a spike write-up only unless later promoted.

## Phase map

| Phase | Theme | Items |
|------|--------|--------|
| **1** | Calendar chrome + push | Push SW registration timeout (uncommitted); toolbar `< Date >` polish with secondary calendar; dual vertical scrollbars |
| **2** | Calendar navigation modes | Views → dropdown + **Work week**; datetime edit moves event in view |
| **3** | Form dismissal & reminders | Esc closes (dirty warn); click-away dirty confirm (same path); reminder scheduler UX |
| **4** | Optimistic mutations | Optimistic save for events/todos + toast success/fail + revert |
| **5** | Keyboard discoverability | Shortcut hints in UI; settings toggle to hide (hints on by default) |
| **6** | Settings & calendar connect | Tabbed settings; tidy calendar connection flow |
| **7** | Onboarding & navigation | Onboarding back buttons; invite → default invited circle; breadcrumbs where useful; **email template Homa logo 3×** (shared layout, currently 48×48 → 144×144 in `apps/server/src/email/layout.ts`) |
| **8** | Larger / explore | Event resize-to-duration; notifications panel redesign; availability subscription (spike only) |

**Dependencies:** Phase 4 is the cross-cutting mutation foundation. Phases 2–3 may keep current mutation/toast patterns and get a second pass after Phase 4 if needed. Phase 3 uses one shared unsaved-confirm path for Esc and click-away.

## Phase 1 — detailed design

### Goal

Ship the push-registration fix with calendar chrome polish: date navigation that matches the toolbar, and a single vertical scrollbar on day/week calendar views.

### 1. Push registration (existing draft)

**Problem:** `navigator.serviceWorker.ready` never resolves until a worker is registered. Vite PWA does not register one in dev by default, so the notifications UI can stick on loading.

**Approach (already in working tree):**

- Export `pushRegistration(timeoutMs?)` that returns an existing active registration, otherwise races `ready` against an 8s timeout.
- `refresh()` uses `getRegistration()`; with no registration, set state to `off` (do not await `ready`).
- `enable` / `disable` use `pushRegistration()` instead of bare `ready`.
- Disable the push button while `busy` or `loading`.
- Unit tests: resolves existing active registration without waiting on `ready`; times out when none is registered.

**Files:**

- `apps/web/src/hooks/reminders/usePush.ts`
- `apps/web/src/hooks/reminders/usePush.test.ts` (new)
- `apps/web/src/pages/settings/notifications/NotificationsSection.tsx`

### 2. Toolbar date control

**Problem:** Both previous/next chevrons sit left of the title; the title stack does not match the bordered height/feel of `Today` / `Calendars`. Secondary (Jalali) title must still fit.

**Approach:**

- Replace the chevron + title cluster with a single bordered date control matching neighboring toolbar controls:

  `[ < ]  November 2026 (+ Jalali under)  [ > ]`

- Keep `aria-live="polite"` on the primary title; keep RTL chevron flip via existing `.chevron` CSS.
- Extract a presentational `DateNav` (or equivalent) under `pages/calendar/toolbar/` so `CalendarToolbar` stays thin.
- Hook API unchanged: `useCalendarToolbar` still exposes `previous`, `next`, `title`, `jalaliTitle`.
- Fit a two-line title without exceeding neighbor control height: tighten typography/padding rather than overflowing the row.

**Files (expected):**

- `apps/web/src/pages/calendar/toolbar/CalendarToolbar.tsx`
- `apps/web/src/pages/calendar/toolbar/CalendarToolbar.module.css`
- New: `DateNav.tsx` (+ CSS module / barrel export as needed)
- Tests colocated under `toolbar/`

### 3. Dual vertical scrollbars

**Problem:** Day/week views show two vertical scrollbars (outer page/`AppShell.Main` and inner time-grid `.scroll`).

**Approach:**

- Confirm in browser: page scroll vs `TimeGrid` `.scroll` (`height: calc(100dvh - 160px)`, `overflow-y: auto`).
- Make day/week a single scroll owner: grid fills remaining viewport height; outer main does not also scroll for those views.
- Month / year / agenda remain sensible (no broken clipping).
- No change to event rendering behavior—layout/CSS only.

**Files (expected):**

- `apps/web/src/pages/calendar/time-grid/TimeGrid.module.css` (and/or page/`AppShell` layout wrappers as needed)
- Possibly `CalendarPage.tsx` / content wrapper if height ownership must move up

### Out of scope for Phase 1

View dropdown / work week, event resize, dirty-form guards, optimistic saves, settings tabs, notifications redesign.

### Testing (Phase 1)

- Keep/extend `usePush.test.ts`.
- Toolbar: previous/next still navigate; date control exposes previous/next accessible names; secondary title still renders when Jalali is on.
- Manual: day/week shows one vertical scrollbar; RTL chevrons; toolbar height aligned with neighbors.

## Non-goals (program-wide)

- Rewriting the calendar engine or switching calendar libraries.
- Building availability subscription as a product feature in Phase 8 (spike/docs only).
- Backend API redesign unless a phase discovers a hard requirement (call out in that phase’s plan).

## Success criteria

- Each phase merges as a focused PR with tests and i18n for new copy.
- Phase 1 includes the existing push fix and visibly improves calendar chrome + scroll.
- Remaining memo items are tracked by phase so work can resume without re-triaging from scratch.
