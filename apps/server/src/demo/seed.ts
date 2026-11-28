// The demo's made-up data: calendars, recurring events, tasks, projects and reminders, laid out
// around "today" so the calendar always looks lived in. English, with a few Farsi titles for show.
import { instantOf, wallOf } from '@homa/core';
import { type Db, repo } from '@homa/db';
import { createAuth } from '@/auth';
import { createCalendar, listCalendars } from '@/calendar/calendars-service';
import { createEvent } from '@/calendar/events-service';
import { createReminder } from '@/reminders/reminders-service';
import { updateSettings } from '@/settings/settings-service';
import { createProject } from '@/tasks/projects-service';
import { completeTask, createTask, scheduleTask } from '@/tasks/tasks-service';
import { DEMO_ACCOUNT } from './account';

export const DEMO_TZ = 'Europe/London';
const DAY = 86_400_000;

/** Seeding builds its own Better Auth: the demo account is the admin, and needs no setup code. */
export type SeedAuth = { secret: string; baseURL: string };

const ymd = (d: Date): string => d.toISOString().slice(0, 10);

/**
 * Creates the demo account and its data. Expects an instance with no accounts (the startup check
 * or `resetDemo` makes sure). Returns the account's user id.
 */
export async function seedDemo(db: Db, opts: SeedAuth, now = new Date()): Promise<string> {
  const auth = createAuth(db, {
    ...opts,
    setupGate: { current: (): string => '', check: (): boolean => true },
    passkey: { rpID: 'localhost', rpName: 'Homa', origin: opts.baseURL },
  });
  const { user } = await auth.api.signUpEmail({ body: { ...DEMO_ACCOUNT } });
  const uid = user.id;
  await updateSettings(db, uid, { homeTz: DEMO_TZ, secondaryCalendar: 'jalali' });

  // Day 0 is today in the demo's zone, as a wall date (midnight UTC fields).
  const today = wallOf(now, DEMO_TZ);
  today.setUTCHours(0, 0, 0, 0);
  const day = (n: number): Date => new Date(today.getTime() + n * DAY);
  const at = (n: number, h: number, m = 0): Date =>
    instantOf(new Date(day(n).getTime() + (h * 60 + m) * 60_000), DEMO_TZ);
  const monday = -((today.getUTCDay() + 6) % 7);

  const [personalCal] = await listCalendars(db, uid);
  if (!personalCal) throw new Error('the demo account has no Personal calendar');
  const personal = personalCal.calendar;
  const work = (await createCalendar(db, uid, { name: 'Work', color: '#3b7dd8' })).calendar;
  const family = (await createCalendar(db, uid, { name: 'خانواده', color: '#c2543a' })).calendar;

  type Ev = {
    cal: string;
    title: string;
    start: Date;
    end: Date;
    allDay?: boolean;
    rrule?: string;
    where?: string;
    reminders?: number[];
    travel?: number;
  };
  const events: Ev[] = [
    {
      cal: work.id,
      title: 'Team stand-up',
      start: at(monday, 9, 30),
      end: at(monday, 9, 45),
      rrule: 'FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR',
      reminders: [5],
    },
    {
      cal: work.id,
      title: '1:1 with Priya',
      start: at(monday + 3, 14),
      end: at(monday + 3, 14, 30),
      rrule: 'FREQ=WEEKLY;BYDAY=TH',
    },
    {
      cal: work.id,
      title: 'Sprint planning',
      start: at(monday, 11),
      end: at(monday, 12),
      rrule: 'FREQ=WEEKLY;INTERVAL=2;BYDAY=MO',
      where: 'Room 3',
    },
    { cal: work.id, title: 'Team retro', start: at(-2, 15), end: at(-2, 16) },
    {
      cal: work.id,
      title: 'Quarterly review',
      start: at(6, 10),
      end: at(6, 11, 30),
      where: 'Board room',
      reminders: [30, 1440],
    },
    {
      cal: personal.id,
      title: 'Gym',
      start: at(monday + 1, 18, 30),
      end: at(monday + 1, 19, 30),
      rrule: 'FREQ=WEEKLY;BYDAY=TU,TH',
    },
    {
      cal: personal.id,
      title: 'Dentist',
      start: at(4, 10),
      end: at(4, 10, 45),
      where: 'High Street Dental',
      travel: 30,
      reminders: [60],
    },
    {
      cal: personal.id,
      title: 'Dinner with Sam and Alex',
      start: at(2, 19, 30),
      end: at(2, 22),
      where: 'Little Lebanon',
      travel: 15,
    },
    { cal: personal.id, title: 'Book club', start: at(8, 19), end: at(8, 21), rrule: 'FREQ=MONTHLY' },
    { cal: personal.id, title: 'Weekend in Edinburgh', start: day(12), end: day(15), allDay: true },
    {
      cal: family.id,
      title: 'کلاس فارسی',
      start: at(monday + 5, 11),
      end: at(monday + 5, 12),
      rrule: 'FREQ=WEEKLY;BYDAY=SA',
    },
    { cal: family.id, title: 'مهمانی خانوادگی', start: at(3, 18), end: at(3, 22), where: 'خانه‌ی مامان' },
    {
      cal: family.id,
      title: "Mum's birthday",
      start: day(9),
      end: day(10),
      allDay: true,
      rrule: 'FREQ=YEARLY',
      reminders: [1440],
    },
    { cal: family.id, title: 'Call Grandma', start: at(-1, 17), end: at(-1, 17, 30), rrule: 'FREQ=WEEKLY' },
  ];
  for (const e of events) {
    await createEvent(
      db,
      uid,
      {
        calendarId: e.cal,
        summary: e.title,
        description: null,
        location: e.where ?? null,
        start: e.start,
        end: e.end,
        allDay: e.allDay ?? false,
        tz: DEMO_TZ,
        rrule: e.rrule ?? null,
        travelMinutes: e.travel ?? null,
      },
      e.reminders,
    );
  }

  const home = await createProject(db, uid, { name: 'Home', color: '#4f9d69' });
  const job = await createProject(db, uid, { name: 'Work', color: '#3b7dd8' });
  const trip = await createProject(db, uid, { name: 'Edinburgh trip', color: '#9b6bc7' });
  const task = (t: Parameters<typeof createTask>[2]): ReturnType<typeof createTask> => createTask(db, uid, t);
  const tz = DEMO_TZ;

  await task({
    title: 'Reply to the landlord about the boiler',
    tz,
    priority: 3,
    dueDate: ymd(day(0)),
    tags: ['home'],
  });
  await task({ title: 'Buy oat milk', tz, tags: ['errands'] });
  await task({ title: 'Look into a new phone plan', tz, notes: 'Current contract ends next month.' });
  await task({ title: 'خرید سبزی برای شام', tz, dueDate: ymd(day(1)), tags: ['errands'] });
  await task({
    title: 'Water the plants',
    tz,
    projectId: home.id,
    dueDate: ymd(day(0)),
    rrule: 'FREQ=DAILY;INTERVAL=3',
  });
  await task({ title: 'Book the boiler service', tz, projectId: home.id, dueDate: ymd(day(5)), priority: 2 });
  const deck = await task({
    title: 'Draft the quarterly review deck',
    tz,
    projectId: job.id,
    dueDate: ymd(day(5)),
    dueTime: '17:00',
    priority: 3,
    reminders: [60],
    tags: ['review'],
  });
  await task({ title: 'Collect numbers from finance', tz, parentId: deck.id });
  await task({ title: 'Write the summary slide', tz, parentId: deck.id });
  const block = await task({ title: 'Review open pull requests', tz, projectId: job.id, dueDate: ymd(day(1)) });
  await scheduleTask(db, uid, block.id, { calendarId: work.id, start: at(1, 15), end: at(1, 16) });
  await task({ title: 'Submit expenses', tz, projectId: job.id, dueDate: ymd(day(-1)), priority: 1 });
  await task({ title: 'Book train tickets', tz, projectId: trip.id, dueDate: ymd(day(3)), priority: 2 });
  await task({ title: 'Pack a raincoat', tz, projectId: trip.id, dueDate: ymd(day(11)) });
  const done = await task({ title: 'Renew the passport', tz, projectId: trip.id });
  await completeTask(db, uid, done.id, now);

  await createReminder(db, uid, { title: 'Call the bank', at: at(1, 11), tz, rrule: null }, now);
  await createReminder(db, uid, { title: 'Take the bins out', at: at(monday + 3, 20), tz, rrule: 'FREQ=WEEKLY' }, now);
  await createReminder(db, uid, { title: 'پرداخت اجاره', at: at(7, 9), tz, rrule: 'FREQ=MONTHLY' }, now);
  return uid;
}

/** Drops every account and its data, then seeds the demo again. Only for HOMA_DEMO instances. */
export async function resetDemo(db: Db, opts: SeedAuth, now = new Date()): Promise<string> {
  await repo.wipeAllAccounts(db);
  return seedDemo(db, opts, now);
}
