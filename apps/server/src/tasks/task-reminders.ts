// Task reminders: minutes before a task's due, through the reminders job (phase 4a). Each row keeps
// when it fires next; this recomputes it whenever the due, the reminders or the task's state change.
import { REMINDER_LIMITS, taskReminderAt, ValidationError } from '@homa/core';
import { type Executor, repo } from '@homa/db';

type TaskState = Pick<repo.TaskRow, 'id' | 'ownerUserId' | 'dueDate' | 'dueTime' | 'tz' | 'completedAt'>;

/**
 * Sets a task's reminders (`minutes`, or the ones it has) with their next fire times: none while
 * the task is done or has no due, or once a fire time is past the catch-up window.
 */
export async function syncTaskReminders(
  tx: Executor,
  t: TaskState,
  minutes?: readonly number[],
  now = new Date(),
): Promise<void> {
  const list = minutes ?? (await repo.listTaskReminders(tx, [t.id])).get(t.id) ?? [];
  if (minutes?.length && !t.dueDate) throw new ValidationError('A reminder needs a due date');
  const stale = now.getTime() - REMINDER_LIMITS.catchUpMs;
  const fire = (m: number): Date | null => {
    if (t.completedAt || !t.dueDate) return null;
    const at = taskReminderAt({ date: t.dueDate, time: t.dueTime?.slice(0, 5) ?? null, tz: t.tz }, m);
    return at.getTime() > stale ? at : null;
  };
  await repo.replaceTaskReminders(
    tx,
    t.ownerUserId,
    t.id,
    list.map((m) => ({ minutes: m, nextFireAt: fire(m) })),
  );
}
