import { expect, test } from 'bun:test';
import { inviteEmail } from './invite-email';

test('the invite HTML uses the shared layout logo for English and Farsi', () => {
  const url = 'https://app.homa.day/sign-up?invite=tok';
  const appUrl = 'https://app.homa.day';
  const en = inviteEmail('en', 'ada@example.com', { inviter: 'Ada', instance: 'Family' }, url, appUrl);
  expect(en.html).toContain('src="https://app.homa.day/icon-192.png"');
  expect(en.html).toContain('Accept the invite');
  expect(en.text).toContain(url);

  const fa = inviteEmail('fa', 'dara@example.com', { inviter: 'دارا', instance: 'خانواده' }, url, appUrl);
  expect(fa.html).toContain('src="https://app.homa.day/icon-192.png"');
  expect(fa.html).toContain('dir="rtl"');
  expect(fa.html).toContain('پذیرفتن دعوت');
});
