# UX Phase 1: Calendar Chrome + Push Fix — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the push service-worker hang fix with calendar toolbar date-nav polish and a single vertical scrollbar on day/week views.

**Architecture:** Keep push logic in `usePush` (pure registration helper + hook). Extract a presentational `DateNav` under `pages/calendar/toolbar/` wired from `useCalendarToolbar`. Fix dual scroll by making the calendar page / time grid own height so only the grid body scrolls.

**Tech Stack:** React 19, Mantine 9, Bun test + Testing Library, CSS Modules, i18next (existing keys).

**Spec:** `docs/superpowers/specs/2026-11-26-homa-ux-todos-phased-design.md`

---

## File map

| File | Responsibility |
|------|----------------|
| `apps/web/src/hooks/reminders/usePush.ts` | `pushRegistration` + non-hanging refresh (already drafted) |
| `apps/web/src/hooks/reminders/usePush.test.ts` | Unit tests for `pushRegistration` (already drafted) |
| `apps/web/src/pages/settings/notifications/NotificationsSection.tsx` | Disable push button while loading/busy (already drafted) |
| `apps/web/src/pages/calendar/toolbar/DateNav.tsx` | Presentational date control: prev / title stack / next |
| `apps/web/src/pages/calendar/toolbar/DateNav.module.css` | Bordered control matching toolbar neighbors; RTL chevrons |
| `apps/web/src/pages/calendar/toolbar/CalendarToolbar.tsx` | Use `DateNav` instead of loose ActionIcons + Title |
| `apps/web/src/pages/calendar/toolbar/CalendarToolbar.module.css` | Remove or keep only shared bits if chevron moves to DateNav |
| `apps/web/src/pages/calendar/toolbar/DateNav.test.tsx` | Accessible names + click previous/next |
| `apps/web/src/pages/calendar/toolbar/index.ts` | Export only what the page needs (`CalendarToolbar`) |
| `apps/web/src/pages/calendar/CalendarPage.tsx` (+ optional CSS) | Height ownership so page doesn't double-scroll with TimeGrid |
| `apps/web/src/pages/calendar/time-grid/TimeGrid.module.css` | Adjust grid height to fill remaining space / single scroll |
| `apps/web/src/pages/calendar/CalendarPage.test.tsx` | Extend if needed for date nav / week scroll smoke |

---

### Task 1: Commit the drafted push fix

**Files:**
- Modify: `apps/web/src/hooks/reminders/usePush.ts`
- Create: `apps/web/src/hooks/reminders/usePush.test.ts`
- Modify: `apps/web/src/pages/settings/notifications/NotificationsSection.tsx`

- [ ] **Step 1: Run the existing push unit tests**

```bash
cd apps/web && bun test src/hooks/reminders/usePush.test.ts
```

Expected: PASS (2 tests — existing registration; timeout when none)

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/hooks/reminders/usePush.ts \
  apps/web/src/hooks/reminders/usePush.test.ts \
  apps/web/src/pages/settings/notifications/NotificationsSection.tsx
git commit -m "$(cat <<'EOF'
Fix push settings hanging when no service worker is registered.

EOF
)"
```

---

### Task 2: DateNav — failing test first

**Files:**
- Create: `apps/web/src/pages/calendar/toolbar/DateNav.tsx`
- Create: `apps/web/src/pages/calendar/toolbar/DateNav.module.css`
- Create: `apps/web/src/pages/calendar/toolbar/DateNav.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
import { describe, expect, mock, test } from 'bun:test';
import { MantineProvider } from '@mantine/core';
import { fireEvent, render, screen } from '@testing-library/react';
import type { JSX, ReactNode } from 'react';
import { DateNav } from './DateNav';

const wrap = (ui: ReactNode): JSX.Element => <MantineProvider>{ui}</MantineProvider>;

describe('DateNav', () => {
  test('exposes previous and next and calls them', () => {
    const previous = mock(() => {});
    const next = mock(() => {});
    render(
      wrap(
        <DateNav
          title="November 2026"
          secondaryTitle="Azar 1405 AP"
          previousLabel="Previous"
          nextLabel="Next"
          onPrevious={previous}
          onNext={next}
        />,
      ),
    );
    expect(screen.getByText('November 2026')).toBeTruthy();
    expect(screen.getByText('Azar 1405 AP')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Previous' }));
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(previous).toHaveBeenCalledTimes(1);
    expect(next).toHaveBeenCalledTimes(1);
  });

  test('omits the secondary line when unset', () => {
    render(
      wrap(
        <DateNav
          title="November 2026"
          previousLabel="Previous"
          nextLabel="Next"
          onPrevious={() => {}}
          onNext={() => {}}
        />,
      ),
    );
    expect(screen.getByText('November 2026')).toBeTruthy();
    expect(screen.queryByText('Azar 1405 AP')).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd apps/web && bun test src/pages/calendar/toolbar/DateNav.test.tsx
```

Expected: FAIL — `DateNav` not found / cannot resolve module

- [ ] **Step 3: Implement DateNav**

`DateNav.tsx` — presentational only:

```tsx
import { ActionIcon, Group, Stack, Text } from '@mantine/core';
import { IconChevronLeft, IconChevronRight } from '@tabler/icons-react';
import type { JSX } from 'react';
import classes from './DateNav.module.css';

export type DateNavProps = {
  title: string;
  secondaryTitle?: string;
  previousLabel: string;
  nextLabel: string;
  onPrevious: () => void;
  onNext: () => void;
};

/** Toolbar date control: previous, title (+ optional secondary calendar), next. */
export function DateNav({
  title,
  secondaryTitle,
  previousLabel,
  nextLabel,
  onPrevious,
  onNext,
}: DateNavProps): JSX.Element {
  return (
    <Group gap={0} className={classes.root} wrap="nowrap">
      <ActionIcon
        variant="subtle"
        size="lg"
        className={classes.chevronBtn}
        onClick={onPrevious}
        aria-label={previousLabel}
      >
        <IconChevronLeft size={18} className={classes.chevron} aria-hidden />
      </ActionIcon>
      <Stack gap={0} className={classes.titles} align="center">
        <Text fw={600} size="sm" lh={1.2} aria-live="polite" className={classes.title}>
          {title}
        </Text>
        {secondaryTitle ? (
          <Text size="xs" c="dimmed" lh={1.2} className={classes.secondary}>
            {secondaryTitle}
          </Text>
        ) : null}
      </Stack>
      <ActionIcon variant="subtle" size="lg" className={classes.chevronBtn} onClick={onNext} aria-label={nextLabel}>
        <IconChevronRight size={18} className={classes.chevron} aria-hidden />
      </ActionIcon>
    </Group>
  );
}
```

`DateNav.module.css`:

```css
/* Match Today / Calendars bordered control height and border. */
.root {
  border: 1px solid var(--mantine-color-default-border);
  border-radius: var(--mantine-radius-default);
  background: var(--mantine-color-body);
  min-height: 36px;
  padding-inline: 2px;
}

.titles {
  min-width: 7.5rem;
  padding-inline: 4px;
  text-align: center;
}

.title,
.secondary {
  white-space: nowrap;
}

/* Chevrons point the way time moves: flipped in right-to-left layouts. */
:global([dir="rtl"]) .chevron {
  transform: scaleX(-1);
}
```

- [ ] **Step 4: Run tests — expect PASS**

```bash
cd apps/web && bun test src/pages/calendar/toolbar/DateNav.test.tsx
```

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/pages/calendar/toolbar/DateNav.tsx \
  apps/web/src/pages/calendar/toolbar/DateNav.module.css \
  apps/web/src/pages/calendar/toolbar/DateNav.test.tsx
git commit -m "$(cat <<'EOF'
Add DateNav control with previous and next around the title.

EOF
)"
```

---

### Task 3: Wire DateNav into CalendarToolbar

**Files:**
- Modify: `apps/web/src/pages/calendar/toolbar/CalendarToolbar.tsx`
- Modify: `apps/web/src/pages/calendar/toolbar/CalendarToolbar.module.css` (remove unused chevron if moved)
- Modify: `apps/web/src/pages/calendar/CalendarPage.test.tsx` (optional assert Previous/Next still present)

- [ ] **Step 1: Replace chevron + Title cluster with DateNav**

In `CalendarToolbar.tsx`, remove `ActionIcon` / `IconChevron*` / `Title` / `Stack` for the date cluster; render:

```tsx
<DateNav
  title={bar.title}
  secondaryTitle={bar.jalaliTitle}
  previousLabel={t('calendar.previous')}
  nextLabel={t('calendar.next')}
  onPrevious={bar.previous}
  onNext={bar.next}
/>
```

Keep `Today` button to the left of `DateNav`. Drop unused imports. If `CalendarToolbar.module.css` only had `.chevron`, delete that rule or the file import if empty.

- [ ] **Step 2: Extend calendar page test — previous still works**

Add to `CalendarPage.test.tsx` (week view with fixed date):

```tsx
test('previous and next sit around the date title', async () => {
  renderApp(
    '/?view=week&date=2026-11-19',
    api(() => json([])),
  );
  expect(await screen.findByRole('button', { name: 'Previous' })).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Next' })).toBeTruthy();
  // Title text varies by locale/format; assert live region / heading content contains November or week range
  fireEvent.click(screen.getByRole('button', { name: 'Previous' }));
  // URL/search should move back one week — assert via week region or date label change after waitFor
});
```

Refine assertion against existing `viewTitle` output for week of 2026-11-19 after one `previous` click (expect week of 2026-11-12). Match patterns already used in the week-start test.

- [ ] **Step 3: Run tests**

```bash
cd apps/web && bun test src/pages/calendar/toolbar/DateNav.test.tsx src/pages/calendar/CalendarPage.test.tsx
```

Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/pages/calendar/toolbar/CalendarToolbar.tsx \
  apps/web/src/pages/calendar/toolbar/CalendarToolbar.module.css \
  apps/web/src/pages/calendar/CalendarPage.test.tsx
git commit -m "$(cat <<'EOF'
Put calendar previous and next on either side of the date title.

EOF
)"
```

---

### Task 4: Fix dual vertical scrollbars

**Files:**
- Modify: `apps/web/src/pages/calendar/CalendarPage.tsx` (and/or new `CalendarPage.module.css`)
- Modify: `apps/web/src/pages/calendar/time-grid/TimeGrid.module.css`
- Possibly: `apps/web/src/pages/calendar/content/` wrapper

- [ ] **Step 1: Diagnose**

Confirm day/week: `TimeGrid` `.grid` uses `height: calc(100dvh - 160px)` and `.scroll` has `overflow-y: auto`, while `AppShell.Main` also scrolls when content exceeds viewport (toolbar + quick add + grid taller than viewport → two bars).

- [ ] **Step 2: Make calendar page fill main without outer scroll for day/week**

Preferred approach:

1. `CalendarPage` root: flex column, `min-height: 0`, height roughly `calc(100dvh - header - paddings)` (header 60 + AppShell padding).
2. `CalendarContent` / `TimeGrid` flex `1 1 auto` with `min-height: 0`.
3. Replace fixed `calc(100dvh - 160px)` on `.grid` with `height: 100%` (or `flex: 1; min-height: 0`) so only `.scroll` scrolls inside the grid.
4. Month/year/agenda: allow natural growth; if outer page must scroll for agenda, that's OK — dual bars are the day/week bug.

Example page CSS sketch:

```css
.page {
  display: flex;
  flex-direction: column;
  gap: var(--mantine-spacing-md);
  min-height: calc(100dvh - 60px - 2 * var(--mantine-spacing-md));
  max-height: calc(100dvh - 60px - 2 * var(--mantine-spacing-md));
}

.content {
  flex: 1 1 auto;
  min-height: 0;
  display: flex;
  flex-direction: column;
}
```

Tune constants against real header/padding; do not hard-code magic hex colors.

- [ ] **Step 3: Verify manually**

Run `bun run dev` in `apps/web`, open `/?view=week` and `/?view=day`: one vertical scrollbar on the time grid, none on the page chrome. Check month/agenda still usable.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/pages/calendar/CalendarPage.tsx \
  apps/web/src/pages/calendar/CalendarPage.module.css \
  apps/web/src/pages/calendar/time-grid/TimeGrid.module.css \
  apps/web/src/pages/calendar/content/CalendarContent.tsx
git commit -m "$(cat <<'EOF'
Give day and week views a single vertical scrollbar.

EOF
)"
```

---

### Task 5: Spec touch-up + verify + PR

**Files:**
- Modify: `docs/superpowers/specs/2026-11-26-homa-ux-todos-phased-design.md` (email logo Phase 7 line, if not committed)
- This plan file under `docs/superpowers/plans/`

- [ ] **Step 1: Commit docs**

```bash
git add docs/superpowers/specs/2026-11-26-homa-ux-todos-phased-design.md \
  docs/superpowers/plans/2026-11-26-ux-phase1-calendar-chrome.md
git commit -m "$(cat <<'EOF'
Add Phase 1 implementation plan and Phase 7 email logo todo.

EOF
)"
```

- [ ] **Step 2: Full verify**

```bash
cd /path/to/homa && bun run lint && bun run typecheck && bun run test
```

Expected: all green. Fix any failures before PR.

- [ ] **Step 3: Push and open PR**

```bash
git push -u origin HEAD
gh pr create --title "Polish calendar chrome and fix push hang in settings" --body "$(cat <<'EOF'
## Summary
- Fix push enable/disable hanging when no service worker is registered (common in Vite dev)
- Calendar toolbar: previous/next flank the date title in a bordered control (secondary calendar still fits)
- Day/week views: one vertical scrollbar

## Test plan
- [ ] Settings → Notifications: push button leaves loading and shows Off when SW missing
- [ ] Calendar week/day: date control looks like Today/Calendars; arrows either side of title; Jalali secondary line OK
- [ ] RTL: chevrons flip correctly
- [ ] Day/week: only one vertical scrollbar
- [ ] `bun run lint && bun run typecheck && bun run test`

EOF
)"
```

---

## Self-review

- Spec coverage: push ✓, DateNav/toolbar ✓, dual scroll ✓, out-of-scope left out ✓
- No TBD placeholders in task steps
- Types: `DateNavProps` matches toolbar wiring (`jalaliTitle` → `secondaryTitle`)
