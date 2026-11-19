import { expect, test } from 'bun:test';
import { SyncError } from './errors';
import { assertPublicHost, isPublicAddress, parseFeedUrl } from './url-safety';

test('private, loopback, link-local and reserved addresses are not public', () => {
  for (const ip of [
    '127.0.0.1',
    '10.1.2.3',
    '172.20.0.1',
    '192.168.1.10',
    '169.254.169.254',
    '100.64.0.1',
    '0.0.0.0',
    '224.0.0.1',
    '::1',
    '::',
    'fe80::1',
    'fd00::1',
    '::ffff:127.0.0.1',
    '::ffff:10.0.0.1',
    'not an ip',
  ])
    expect([ip, isPublicAddress(ip)]).toEqual([ip, false]);
  for (const ip of ['8.8.8.8', '151.101.1.69', '2606:4700::1111'])
    expect([ip, isPublicAddress(ip)]).toEqual([ip, true]);
});

test('feed URLs: webcal means https; other schemes and credentials are refused', () => {
  expect(parseFeedUrl(' webcal://example.com/a.ics ').href).toBe('https://example.com/a.ics');
  expect(parseFeedUrl('http://example.com/a.ics').protocol).toBe('http:');
  expect(() => parseFeedUrl('file:///etc/passwd')).toThrow(SyncError);
  expect(() => parseFeedUrl('ftp://example.com/a.ics')).toThrow('Only http and https');
  expect(() => parseFeedUrl('https://user:pw@example.com/a.ics')).toThrow('user name or password');
  expect(() => parseFeedUrl('nonsense')).toThrow('not a valid address');
});

test('hosts on private networks are refused unless allowed', async () => {
  await expect(assertPublicHost(new URL('http://127.0.0.1/a.ics'), false)).rejects.toThrow('private or local');
  await expect(assertPublicHost(new URL('http://[::1]:8080/a.ics'), false)).rejects.toThrow('private or local');
  await expect(assertPublicHost(new URL('http://localhost/a.ics'), false)).rejects.toThrow('private or local');
  await expect(assertPublicHost(new URL('http://169.254.169.254/latest'), false)).rejects.toThrow();
  await expect(assertPublicHost(new URL('http://127.0.0.1/a.ics'), true)).resolves.toBeUndefined();
  await expect(assertPublicHost(new URL('http://8.8.8.8/a.ics'), false)).resolves.toBeUndefined();
});
