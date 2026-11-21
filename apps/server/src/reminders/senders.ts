// The delivery job's senders: web push, and the user's channels (email, ntfy, Gotify, webhooks).
import type { Db, repo } from '@homa/db';
import type { Senders } from './channels';
import { channelSender, type NotifySettings } from './channels/index';
import { type PushSettings, sendPush } from './push';

export const reminderSenders = (push: PushSettings, notify: NotifySettings): Senders => ({
  push: (db: Db, n: repo.NotificationRow): Promise<void> => sendPush(db, push, n),
  channel: channelSender(notify),
});
