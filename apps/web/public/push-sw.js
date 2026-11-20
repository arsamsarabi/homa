// Web push for Homa's service worker. The PWA's generated worker loads this with importScripts
// (vite.config.ts), so it is plain JavaScript in public/ rather than bundled TypeScript.
// The payload is { id, title, startAt, allDay, kind } (apps/server/src/reminders/push.ts).

const fa = () => (self.navigator.language || '').toLowerCase().startsWith('fa');
const text = {
  snooze: () => (fa() ? 'تعویق ۱۰ دقیقه' : 'Snooze 10 min'),
  done: () => (fa() ? 'انجام شد' : 'Done'),
  reminder: () => (fa() ? 'یادآوری' : 'Reminder'),
};

const when = (p) => {
  const at = new Date(p.startAt);
  if (Number.isNaN(at.getTime())) return '';
  return p.allDay
    ? at.toLocaleDateString(undefined, { dateStyle: 'medium', timeZone: 'UTC' })
    : at.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
};

self.addEventListener('push', (event) => {
  let p;
  try {
    p = event.data ? event.data.json() : null;
  } catch {
    p = null;
  }
  if (!p || typeof p.id !== 'string') return;
  event.waitUntil(
    Promise.all([
      self.registration.showNotification(p.title || text.reminder(), {
        body: when(p),
        tag: p.id,
        data: { id: p.id },
        icon: '/icon-192.png',
        badge: '/favicon-32.png',
        actions: [
          { action: 'snooze', title: text.snooze() },
          { action: 'done', title: text.done() },
        ],
      }),
      // Open pages refresh the bell.
      self.clients.matchAll({ type: 'window' }).then((list) => {
        for (const c of list) c.postMessage({ type: 'homa-notification' });
      }),
    ]),
  );
});

const post = (path, body) =>
  fetch(path, {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'content-type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });

self.addEventListener('notificationclick', (event) => {
  const id = event.notification.data?.id;
  event.notification.close();
  if (id && event.action === 'snooze') {
    event.waitUntil(post(`/api/notifications/${id}/snooze`, { minutes: 10 }));
    return;
  }
  if (id && event.action === 'done') {
    event.waitUntil(post(`/api/notifications/${id}/done`));
    return;
  }
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      const open = list.find((c) => new URL(c.url).origin === self.location.origin);
      return open ? open.focus() : self.clients.openWindow('/');
    }),
  );
});
