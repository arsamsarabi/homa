import { expect, test } from 'bun:test';
import type { repo } from '@homa/db';
import { reminderMail, reminderMessage, testMessage } from './message';

const row = (o: Partial<repo.NotificationRow>): repo.NotificationRow =>
  ({
    id: 'n1',
    ownerUserId: 'u1',
    reminderId: null,
    eventId: null,
    taskId: null,
    recurrenceId: null,
    title: 'Dentist',
    occurrenceStart: new Date('2026-11-22T23:30:00Z'),
    allDay: false,
    fireAt: new Date('2026-11-22T23:00:00Z'),
    dedupeKey: 'k',
    readAt: null,
    snoozedUntil: null,
    doneAt: null,
    createdAt: new Date(),
    ...o,
  }) as repo.NotificationRow;

const en: repo.Recipient = { email: 'ada@example.com', homeTz: 'Asia/Tehran', language: 'en' };
const fa: repo.Recipient = { ...en, language: 'fa' };

test('an event reminder opens its day in the home zone, with the title as heading and why it came', () => {
  const n = row({ eventId: 'e1' });
  const mail = reminderMail(reminderMessage(n, en), 'https://app.homa.day/', en);
  expect(mail).toMatchObject({ to: 'ada@example.com', subject: 'Reminder: Dentist' });
  // 23:30 UTC is 03:00 the next day in Tehran.
  expect(mail.text).toBe(
    'Dentist\nMonday, 23 November 2026 at 03:00\n\nOpen Homa: https://app.homa.day/?view=day&date=2026-11-23\n',
  );
  expect(mail.html).toContain('href="https://app.homa.day/?view=day&amp;date=2026-11-23"');
  expect(mail.html).toContain('>Dentist</h1>');
  expect(mail.html).toContain('Settings → Notification channels');
  expect(mail.html).toContain('dir="ltr"');
});

test('tasks, standalone reminders and the test message link to their pages', () => {
  const url = (m: ReturnType<typeof reminderMessage>): string => reminderMail(m, 'https://h.example/app', en).text;
  expect(url(reminderMessage(row({ taskId: 't1' }), en))).toContain('https://h.example/app/tasks\n');
  expect(url(reminderMessage(row({}), en))).toContain('https://h.example/app/reminders\n');
  expect(url(testMessage(en))).toContain('Open Homa: https://h.example/app/\n');
});

test('Farsi goes right to left with the Farsi subject and note', () => {
  const mail = reminderMail(reminderMessage(row({ eventId: 'e1' }), fa), 'https://app.homa.day', fa);
  expect(mail.subject).toBe('یادآوری: Dentist');
  expect(mail.html).toContain('<html lang="fa" dir="rtl">');
  expect(mail.html).toContain('کانال‌های اعلان');
  expect(mail.text).toContain('باز کردن هما: https://app.homa.day/?view=day&date=2026-11-23');
});

test('the title is escaped in the HTML', () => {
  const mail = reminderMail(reminderMessage(row({ title: '<script>alert(1)</script> & co' }), en), 'https://a', en);
  expect(mail.html).not.toContain('<script>');
  expect(mail.html).toContain('&lt;script&gt;alert(1)&lt;/script&gt; &amp; co');
  expect(mail.text).toContain('<script>alert(1)</script> & co');
});
