// The words a reminder goes out with on email, ntfy and Gotify, in the instance's language and the
// user's home zone.
import type { repo } from '@homa/db';
import { emailHtml } from '@/email/layout';
import { notificationKind } from '@/reminders/channels';
import type { Mail } from './settings';

/** `path` is where in Homa it opens, under the app's address (the home page when absent). */
export type Message = { title: string; body: string; subject: string; path?: string };

const TEXT = {
  en: {
    untitled: '(No title)',
    subject: 'Reminder',
    open: 'Open Homa',
    test: 'Test from Homa',
    testBody: 'This channel works.',
    why: "You're getting this because email is one of your notification channels. To change that, go to Settings → Notification channels in Homa.",
  },
  fa: {
    untitled: '(بدون عنوان)',
    subject: 'یادآوری',
    open: 'باز کردن هما',
    test: 'آزمایش از هما',
    testBody: 'این کانال کار می‌کند.',
    why: 'این ایمیل را دریافت می‌کنید چون ایمیل یکی از کانال‌های اعلان شماست. برای تغییر آن، در هما به تنظیمات ← کانال‌های اعلان بروید.',
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
  return { title, body: when, subject: `${w.subject}: ${title}`, path: pathOf(n, r) };
}

/** Events open on their day in the calendar (in the home zone, as the calendar shows it); tasks and standalone reminders on their pages. */
function pathOf(n: repo.NotificationRow, r: repo.Recipient): string {
  const kind = notificationKind(n);
  if (kind === 'task') return '/tasks';
  if (kind === 'standalone') return '/reminders';
  const date = new Intl.DateTimeFormat('en-CA', {
    timeZone: n.allDay ? 'UTC' : (r.homeTz ?? 'UTC'),
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(n.occurrenceStart);
  return `/?view=day&date=${date}`;
}

export function testMessage(r: repo.Recipient): Message {
  const w = words(r.language);
  return { title: w.test, body: w.testBody, subject: w.test };
}

/** The email to `to`: a plain-text part and the branded HTML one. */
export function reminderMail(m: Message, appUrl: string, to: Pick<repo.Recipient, 'email' | 'language'>): Mail {
  const language = to.language === 'fa' ? 'fa' : 'en';
  const w = words(language);
  const url = `${appUrl.replace(/\/+$/, '')}${m.path ?? '/'}`;
  const text = `${m.title}\n${m.body}\n\n${w.open}: ${url}\n`;
  const html = emailHtml({
    language,
    title: m.subject,
    heading: m.title,
    paragraphs: [m.body],
    button: { label: w.open, url },
    note: w.why,
  });
  return { to: to.email, subject: m.subject, text, html };
}
