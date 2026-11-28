// Poll notifications. Each is worded once, in the reader's language and home zone, and stored as
// the notification's title, so the bell, web push and channels show it as is.
import { type Executor, repo } from '@homa/db';
import { notify } from '@/reminders';
import { whenText } from '@/reminders/channels/message';

export type PollNotice = 'opened' | 'closing' | 'closed' | 'finalized' | 'cancelled' | 'renamed';

type Vars = { title: string; organizer: string; when: string; old: string };

const TEXT: Record<'en' | 'fa', Record<PollNotice, (v: Vars) => string>> = {
  en: {
    opened: (v: Vars): string => `${v.organizer} asks: when can you do ${v.title}?`,
    closing: (v: Vars): string => `${v.title}: answers close tomorrow`,
    closed: (v: Vars): string => `${v.title}: answers are in. Pick a time`,
    finalized: (v: Vars): string => `${v.title} is set: ${v.when}`,
    cancelled: (v: Vars): string => `${v.title} was cancelled`,
    renamed: (v: Vars): string => `${v.old} is now ${v.title}`,
  },
  fa: {
    opened: (v: Vars): string => `${v.organizer} می‌پرسد: کی برای ${v.title} وقت دارید؟`,
    closing: (v: Vars): string => `${v.title}: مهلت پاسخ فردا تمام می‌شود`,
    closed: (v: Vars): string => `${v.title}: پاسخ‌ها رسید. زمانی را انتخاب کنید`,
    finalized: (v: Vars): string => `${v.title} قطعی شد: ${v.when}`,
    cancelled: (v: Vars): string => `${v.title} لغو شد`,
    renamed: (v: Vars): string => `${v.old} اکنون ${v.title} است`,
  },
};

/**
 * Notifies `userIds` about the poll. `at` is the time the notice is about (the deadline, the chosen
 * start, or now); `key` makes it once per person (a repeat with the same key is dropped).
 */
export async function notifyPoll(
  db: Executor,
  poll: Pick<repo.PollRow, 'id' | 'title'>,
  notice: PollNotice,
  userIds: readonly string[],
  o: { at: Date; key: string; organizer?: string; old?: string; now?: Date },
): Promise<void> {
  const now = o.now ?? new Date();
  const rows: repo.NewNotification[] = [];
  for (const userId of new Set(userIds)) {
    const to = await repo.findRecipient(db, userId);
    if (!to) continue;
    const words = TEXT[to.language === 'fa' ? 'fa' : 'en'][notice];
    const when = whenText({ occurrenceStart: o.at, allDay: false }, to);
    rows.push({
      ownerUserId: userId,
      pollId: poll.id,
      pollEvent: notice,
      title: words({ title: poll.title, organizer: o.organizer ?? '', when, old: o.old ?? '' }),
      occurrenceStart: o.at,
      fireAt: now,
      dedupeKey: `poll:${poll.id}:${notice}:${o.key}:${userId}`,
    });
  }
  if (rows.length) await notify(db, rows, now);
}
