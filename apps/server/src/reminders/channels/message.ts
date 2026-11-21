// The words a reminder goes out with on email, ntfy and Gotify, in the instance's language and the
// user's home zone.
import type { repo } from '@homa/db';

export type Message = { title: string; body: string; subject: string };

const TEXT = {
  en: {
    untitled: '(No title)',
    subject: 'Reminder',
    open: 'Open Homa',
    test: 'Test from Homa',
    testBody: 'This channel works.',
  },
  fa: {
    untitled: '(بدون عنوان)',
    subject: 'یادآوری',
    open: 'باز کردن هما',
    test: 'آزمایش از هما',
    testBody: 'این کانال کار می‌کند.',
  },
} as const;

const words = (language: string): (typeof TEXT)['en'] | (typeof TEXT)['fa'] => (language === 'fa' ? TEXT.fa : TEXT.en);

/** When the occurrence starts: all-day ones are UTC midnights, so they're shown as dates in UTC. */
export function whenText(n: Pick<repo.NotificationRow, 'occurrenceStart' | 'allDay'>, r: repo.Recipient): string {
  const locale = r.language === 'fa' ? 'fa-IR' : 'en-GB';
  return n.allDay
    ? new Intl.DateTimeFormat(locale, { dateStyle: 'full', timeZone: 'UTC' }).format(n.occurrenceStart)
    : new Intl.DateTimeFormat(locale, { dateStyle: 'full', timeStyle: 'short', timeZone: r.homeTz ?? 'UTC' }).format(
        n.occurrenceStart,
      );
}

export function reminderMessage(n: repo.NotificationRow, r: repo.Recipient): Message {
  const w = words(r.language);
  const title = n.title || w.untitled;
  const when = whenText(n, r);
  return { title, body: when, subject: `${w.subject}: ${title}` };
}

export function testMessage(r: repo.Recipient): Message {
  const w = words(r.language);
  return { title: w.test, body: w.testBody, subject: w.test };
}

/** The plain-text email body. */
export const mailText = (m: Message, appUrl: string, language: string): string =>
  `${m.title}\n${m.body}\n\n${words(language).open}: ${appUrl}\n`;
