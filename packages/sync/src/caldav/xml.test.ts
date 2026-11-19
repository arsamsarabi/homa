import { describe, expect, test } from 'bun:test';
import { SyncError } from '../feed';
import { APPLE, CALDAV, DAV, hasPrecondition, hrefsIn, multigetBody, parseMultistatus, prop, text } from './xml';

const prefixed = `<?xml version="1.0"?>
<D:multistatus xmlns:D="DAV:" xmlns:C="urn:ietf:params:xml:ns:caldav">
  <D:response>
    <D:href>/cal/work/</D:href>
    <D:propstat>
      <D:prop><D:displayname>Work &amp; play</D:displayname><C:calendar-home-set><D:href>/cal/</D:href></C:calendar-home-set></D:prop>
      <D:status>HTTP/1.1 200 OK</D:status>
    </D:propstat>
    <D:propstat>
      <D:prop><D:getetag/></D:prop>
      <D:status>HTTP/1.1 404 Not Found</D:status>
    </D:propstat>
  </D:response>
  <D:sync-token>http://example.com/sync/7</D:sync-token>
</D:multistatus>`;

// Default namespace, a lower-case prefix for CalDAV, and Apple's color in its own default namespace.
const defaultNs = `<multistatus xmlns="DAV:" xmlns:cal="urn:ietf:params:xml:ns:caldav">
  <response>
    <href>/cal/work/</href>
    <propstat>
      <prop>
        <displayname>Work &amp; play</displayname>
        <cal:calendar-home-set><href>/cal/</href></cal:calendar-home-set>
        <calendar-color xmlns="http://apple.com/ns/ical/">#FF0000FF</calendar-color>
      </prop>
      <status>HTTP/1.1 200 OK</status>
    </propstat>
  </response>
  <response><href>/cal/work/gone.ics</href><status>HTTP/1.1 404 Not Found</status></response>
  <sync-token>http://example.com/sync/7</sync-token>
</multistatus>`;

describe('parseMultistatus', () => {
  test('reads the same properties whatever the prefixes', () => {
    for (const xml of [prefixed, defaultNs]) {
      const ms = parseMultistatus(xml);
      expect(ms.syncToken).toBe('http://example.com/sync/7');
      const [r] = ms.responses;
      if (!r) throw new Error('no response');
      expect(r.href).toBe('/cal/work/');
      expect(text(prop(r, DAV, 'displayname'))).toBe('Work & play');
      expect(hrefsIn(prop(r, CALDAV, 'calendar-home-set'))).toEqual(['/cal/']);
      // Only 2xx propstats count: a 404 for getetag means the server doesn't have it.
      expect(prop(r, DAV, 'getetag')).toBeUndefined();
    }
    expect(text(prop(parseMultistatus(defaultNs).responses[0] as never, APPLE, 'calendar-color'))).toBe('#FF0000FF');
  });

  test('a response-level status marks a deleted member', () => {
    expect(parseMultistatus(defaultNs).responses[1]).toMatchObject({ href: '/cal/work/gone.ics', status: 404 });
    expect(parseMultistatus(prefixed).responses[0]?.status).toBeNull();
  });

  test("properties with the right name in the wrong namespace don't count", () => {
    const xml = `<d:multistatus xmlns:d="DAV:" xmlns:x="urn:other"><d:response><d:href>/a</d:href><d:propstat><d:prop><x:displayname>no</x:displayname></d:prop><d:status>HTTP/1.1 200 OK</d:status></d:propstat></d:response></d:multistatus>`;
    expect(prop(parseMultistatus(xml).responses[0] as never, DAV, 'displayname')).toBeUndefined();
  });

  test('anything but a DAV multistatus is a SyncError', () => {
    for (const xml of ['', 'not xml <', '<multistatus/>', '<x:multistatus xmlns:x="urn:other"/>'])
      expect(() => parseMultistatus(xml)).toThrow(SyncError);
  });
});

test('error bodies: the valid-sync-token precondition, with any prefix', () => {
  expect(hasPrecondition('<error xmlns="DAV:"><valid-sync-token/></error>', DAV, 'valid-sync-token')).toBe(true);
  expect(hasPrecondition('<D:error xmlns:D="DAV:"><D:valid-sync-token/></D:error>', DAV, 'valid-sync-token')).toBe(
    true,
  );
  expect(hasPrecondition('<D:error xmlns:D="DAV:"><D:other/></D:error>', DAV, 'valid-sync-token')).toBe(false);
  expect(hasPrecondition('Forbidden', DAV, 'valid-sync-token')).toBe(false);
});

test('request bodies escape hrefs', () => {
  expect(multigetBody(['/a&b<c>.ics'])).toContain('<d:href>/a&amp;b&lt;c&gt;.ics</d:href>');
});
