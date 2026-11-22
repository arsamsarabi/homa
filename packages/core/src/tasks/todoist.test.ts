import { describe, expect, test } from 'bun:test';
import { parseCsv, readTodoistCsv } from './todoist';

const now = new Date('2026-11-22T10:00:00Z');
const HEAD =
  'TYPE,CONTENT,DESCRIPTION,PRIORITY,INDENT,AUTHOR,RESPONSIBLE,DATE,DATE_LANG,TIMEZONE,DURATION,DURATION_UNIT,DEADLINE,DEADLINE_LANG';

describe('parseCsv', () => {
  test('quotes, doubled quotes, commas and newlines inside quotes, CRLF and a BOM', () => {
    expect(parseCsv('﻿a,"b, c","say ""hi""\nthere"\r\n\r\nd,,e\n')).toEqual([
      ['a', 'b, c', 'say "hi"\nthere'],
      ['d', '', 'e'],
    ]);
  });
});

describe('readTodoistCsv', () => {
  test('tasks, priorities, labels, notes, sections and subtasks', () => {
    const csv = [
      HEAD,
      'section,Outside,,,,,,,,,,,,',
      'task,Plant bulbs @garden @outdoors,Tulips by the wall,1,1,Ada (1),,Dec 5,en,Europe/London,,,,',
      'note,Buy the bulbs first,,,,Ada (1),,,,,,,,',
      'task,Buy compost,,4,2,Ada (1),,,,,,,,',
      'task,Find the gloves,,3,3,Ada (1),,,,,,,,',
      'task,Call the bank,,2,1,Ada (1),,tomorrow 3pm,en,America/New_York,,,,',
      'task,Water plants,,4,1,Ada (1),,every day,en,,,,,',
      '',
    ].join('\n');
    const p = readTodoistCsv(csv, 'Asia/Tehran', now);
    expect(p.sections).toBe(1);
    expect(p.unreadDates).toBe(0);
    expect(p.tasks.map((t) => t.title)).toEqual(['Plant bulbs', 'Call the bank', 'Water plants']);
    const [bulbs, bank, water] = p.tasks;
    expect(bulbs).toMatchObject({
      priority: 3,
      tags: ['garden', 'outdoors'],
      notes: 'Tulips by the wall\n\nBuy the bulbs first',
      dueDate: '2026-12-05',
      dueTime: null,
      tz: 'Europe/London',
    });
    // Todoist's third level is flattened onto the top-level task.
    expect(bulbs?.subtasks.map((t) => [t.title, t.priority])).toEqual([
      ['Buy compost', 0],
      ['Find the gloves', 1],
    ]);
    // A timed due is read in the task's own zone.
    expect(bank).toMatchObject({ priority: 2, dueDate: '2026-11-23', dueTime: '15:00', tz: 'America/New_York' });
    // No zone in the file: the importer's.
    expect(water).toMatchObject({ rrule: 'FREQ=DAILY', dueDate: '2026-11-22', tz: 'Asia/Tehran' });
  });

  test('a date it cannot read fully is kept in the notes, not guessed', () => {
    const p = readTodoistCsv(
      `${HEAD}\ntask,Rent,,4,1,,,every month on the 15th,en,,,,,\ntask,Visa,,4,1,,,12/05/2026,en,,,,,`,
      'UTC',
      now,
    );
    expect(p.unreadDates).toBe(2);
    expect(p.tasks.map((t) => [t.dueDate, t.rrule, t.notes])).toEqual([
      [null, null, 'Todoist date: every month on the 15th'],
      [null, null, 'Todoist date: 12/05/2026'],
    ]);
  });

  test('a file without TYPE and CONTENT columns is refused', () => {
    expect(() => readTodoistCsv('Subject,Start Date\nDentist,2026-12-01', 'UTC', now)).toThrow('not a Todoist CSV');
  });
});
