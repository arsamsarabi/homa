// Phase 1 spike: XML for the CalDAV server. Clients send the same request with different
// namespace prefixes (or a default namespace), so the parser must resolve namespaces.
import { describe, expect, test } from 'bun:test';
import { DOMParser, type Element, XMLSerializer } from '@xmldom/xmldom';
import { XMLParser } from 'fast-xml-parser';

const DAV = 'DAV:';
const CALDAV = 'urn:ietf:params:xml:ns:caldav';

const prefixed = `<?xml version="1.0" encoding="utf-8"?>
<D:propfind xmlns:D="DAV:" xmlns:C="urn:ietf:params:xml:ns:caldav">
  <D:prop><D:displayname/><C:calendar-home-set/></D:prop>
</D:propfind>`;

const defaultNs = `<?xml version="1.0" encoding="utf-8"?>
<propfind xmlns="DAV:">
  <prop><displayname/><calendar-home-set xmlns="urn:ietf:params:xml:ns:caldav"/></prop>
</propfind>`;

/** The requested properties as {namespace}localName. */
function requestedProps(xml: string) {
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  const prop = doc.getElementsByTagNameNS(DAV, 'prop')[0];
  if (!prop) return [];
  return Array.from(prop.childNodes)
    .filter((n) => n.nodeType === 1)
    .map((n) => `{${(n as Element).namespaceURI}}${(n as Element).localName}`);
}

describe('@xmldom/xmldom', () => {
  test('resolves namespaces the same way for prefixed and default-namespace requests', () => {
    const want = [`{${DAV}}displayname`, `{${CALDAV}}calendar-home-set`];
    expect(requestedProps(prefixed)).toEqual(want);
    expect(requestedProps(defaultNs)).toEqual(want);
  });

  test('builds a namespaced multistatus response', () => {
    const doc = new DOMParser().parseFromString(
      `<d:multistatus xmlns:d="${DAV}" xmlns:c="${CALDAV}"/>`,
      'application/xml',
    );
    const root = doc.documentElement;
    if (!root) throw new Error('no root');
    const el = (ns: string, name: string, text?: string) => {
      const e = doc.createElementNS(ns, name);
      if (text) e.appendChild(doc.createTextNode(text));
      return e;
    };
    const response = el(DAV, 'd:response');
    response.appendChild(el(DAV, 'd:href', '/dav/calendars/ada/'));
    const propstat = el(DAV, 'd:propstat');
    const prop = el(DAV, 'd:prop');
    prop.appendChild(el(DAV, 'd:displayname', 'Ada & co'));
    propstat.appendChild(prop);
    propstat.appendChild(el(DAV, 'd:status', 'HTTP/1.1 200 OK'));
    response.appendChild(propstat);
    root.appendChild(response);

    const out = new XMLSerializer().serializeToString(doc);
    expect(out).toContain('<d:displayname>Ada &amp; co</d:displayname>');
    expect(out).toContain(`xmlns:c="${CALDAV}"`);
  });
});

describe('fast-xml-parser', () => {
  test('cannot tell namespaces apart', () => {
    const p = new XMLParser({ ignoreAttributes: false, removeNSPrefix: true });
    const a = p.parse(prefixed);
    const b = p.parse(defaultNs);
    // Finding: with prefixes stripped both parse to the same shape, but the namespace URI is
    // gone, so {DAV:}foo and {CALDAV}foo would collide. Without stripping, keys depend on
    // whatever prefix the client chose. Not suitable for the DAV server.
    expect(Object.keys(a.propfind.prop)).toEqual(['displayname', 'calendar-home-set']);
    expect(Object.keys(b.propfind.prop)).toEqual(['displayname', 'calendar-home-set']);
  });
});
