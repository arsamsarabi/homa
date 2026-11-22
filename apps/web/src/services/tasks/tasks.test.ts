import { describe, expect, test } from 'bun:test';
import type { Task } from '@/schemas';
import { dueState, parseTaskLine, quickTaskBody, relativeDay, sectionsFor, taskCounts, viewOf } from './tasks';

const task = (id: string, extra: Partial<Task> = {}): Task => ({
  id,
  uid: id,
  title: id,
  notes: null,
  projectId: null,
  parentId: null,
  tags: [],
  priority: 0,
  dueDate: null,
  dueTime: null,
  tz: 'Europe/London',
  rrule: null,
  reminders: [],
  block: null,
  completedAt: null,
  createdAt: '2026-11-01T00:00:00Z',
  updatedAt: '2026-11-01T00:00:00Z',
  ...extra,
});
const TODAY = '2026-11-21';
const ids = (s: ReturnType<typeof sectionsFor>): string[][] => s.map((x) => x.items.map((i) => i.task.id));

describe('task lists', () => {
  const open = [
    task('late', { dueDate: '2026-11-19', projectId: 'p' }),
    task('today', { dueDate: TODAY }),
    task('sub', { parentId: 'today', dueDate: TODAY }),
    task('mon', { dueDate: '2026-11-23', tags: ['Errand'] }),
    task('mon2', { dueDate: '2026-11-23', projectId: 'p' }),
    task('inbox'),
  ];

  test('the URL picks the list, Today by default', () => {
    expect(viewOf({})).toEqual({ kind: 'today' });
    expect(viewOf({ list: 'inbox' })).toEqual({ kind: 'inbox' });
    expect(viewOf({ project: 'p', list: 'inbox' })).toEqual({ kind: 'project', id: 'p' });
    expect(viewOf({ tag: 'x' })).toEqual({ kind: 'tag', name: 'x' });
  });

  test('Today has late tasks first, then today, subtasks on their own with their parent', () => {
    const s = sectionsFor({ kind: 'today' }, open, [], TODAY);
    expect(s.map((x) => x.heading)).toEqual([{ kind: 'overdue' }, { kind: 'day', date: TODAY }]);
    expect(ids(s)).toEqual([['late'], ['today', 'sub']]);
    expect(s[1]?.items[1]?.parent?.id).toBe('today');
  });

  test('Upcoming groups later tasks by day', () => {
    const s = sectionsFor({ kind: 'upcoming' }, open, [], TODAY);
    expect(s.map((x) => x.id)).toEqual(['2026-11-23']);
    expect(ids(s)).toEqual([['mon', 'mon2']]);
  });

  test('Inbox and projects nest subtasks under their task', () => {
    const inbox = sectionsFor({ kind: 'inbox' }, open, [], TODAY);
    expect(ids(inbox)).toEqual([['today', 'mon', 'inbox']]);
    expect(inbox[0]?.items[0]?.subtasks.map((t) => t.id)).toEqual(['sub']);
    expect(ids(sectionsFor({ kind: 'project', id: 'p' }, open, [], TODAY))).toEqual([['late', 'mon2']]);
  });

  test('a tag list matches ignoring case; an empty list has no sections', () => {
    expect(ids(sectionsFor({ kind: 'tag', name: 'errand' }, open, [], TODAY))).toEqual([['mon']]);
    expect(sectionsFor({ kind: 'project', id: 'none' }, open, [], TODAY)).toEqual([]);
  });

  test('counts', () => {
    expect(taskCounts(open, TODAY)).toEqual({ inbox: 3, today: 3 });
  });
});

describe('due state', () => {
  const now = new Date('2026-11-21T12:00:00Z');
  test('late, today and later, with a time earlier today counting as late', () => {
    expect(dueState(task('a'), TODAY, now)).toBeUndefined();
    expect(dueState(task('a', { dueDate: '2026-11-20' }), TODAY, now)).toBe('overdue');
    expect(dueState(task('a', { dueDate: TODAY }), TODAY, now)).toBe('today');
    expect(dueState(task('a', { dueDate: TODAY, dueTime: '11:59' }), TODAY, now)).toBe('overdue');
    expect(dueState(task('a', { dueDate: TODAY, dueTime: '12:30' }), TODAY, now)).toBe('today');
    expect(dueState(task('a', { dueDate: '2026-11-22' }), TODAY, now)).toBe('later');
  });
  test('relative days', () => {
    expect(relativeDay('2026-11-22', TODAY)).toBe('tomorrow');
    expect(relativeDay('2026-11-20', TODAY)).toBe('yesterday');
    expect(relativeDay('2026-11-25', TODAY)).toBeUndefined();
  });
});

describe('task quick add', () => {
  // Saturday 21 November 2026, 10:00 in London.
  const ctx = { now: new Date('2026-11-21T10:00:00Z'), tz: 'Europe/London', weekStart: 1 };

  test('a date makes a date-only due; a time makes a timed one in the zone', () => {
    expect(parseTaskLine('Buy milk tomorrow', ctx)).toEqual({
      title: 'Buy milk',
      due: { dueDate: '2026-11-22', dueTime: null, rrule: null },
    });
    expect(parseTaskLine('Call the bank mon 3pm', ctx)).toEqual({
      title: 'Call the bank',
      due: { dueDate: '2026-11-23', dueTime: '15:00', rrule: null },
    });
  });

  test('no date means no due, and a repeat is kept', () => {
    expect(parseTaskLine('Read a book', ctx)).toEqual({ title: 'Read a book' });
    expect(parseTaskLine('Water plants every day', ctx).due?.rrule).toBe('FREQ=DAILY');
  });

  test('the list fills in its project, tag or today', () => {
    expect(quickTaskBody('Fix shelf', { kind: 'project', id: 'p' }, ctx, TODAY)).toEqual({
      title: 'Fix shelf',
      tz: 'Europe/London',
      projectId: 'p',
    });
    expect(quickTaskBody('Fix shelf', { kind: 'today' }, ctx, TODAY)).toMatchObject({ dueDate: TODAY });
    expect(quickTaskBody('Fix shelf fri', { kind: 'today' }, ctx, TODAY)).toMatchObject({ dueDate: '2026-11-27' });
    expect(quickTaskBody('Stamps', { kind: 'tag', name: 'errand' }, ctx, TODAY)).toMatchObject({ tags: ['errand'] });
  });
});
