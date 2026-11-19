// WebDAV XML: reading 207 multistatus answers and error bodies with namespaces resolved, so a
// server's choice of prefixes (D:, d:, none with a default namespace) doesn't matter. Request
// bodies are small fixed templates built here.
import { DOMParser, type Element, type Node } from '@xmldom/xmldom';
import { SyncError } from '../feed';

export const DAV = 'DAV:';
export const CALDAV = 'urn:ietf:params:xml:ns:caldav';
export const APPLE = 'http://apple.com/ns/ical/';

/** One `<response>`: its href, the status of the whole response (deleted members), and its 2xx props. */
export type DavResponse = {
  href: string;
  /** The response-level status (a 404 in sync-collection marks a deleted member). */
  status: number | null;
  /** Properties found (2xx propstat), by `{namespace}localName`. */
  props: Map<string, Element>;
};

export type Multistatus = { responses: DavResponse[]; syncToken: string | null };

const key = (ns: string, name: string): string => `{${ns}}${name}`;

function parse(xml: string): Element {
  let root: Element | null = null;
  try {
    root = new DOMParser({ onError: () => undefined }).parseFromString(xml, 'application/xml').documentElement;
  } catch {
    root = null;
  }
  if (!root) throw new SyncError('The calendar server sent an answer Homa cannot read');
  return root;
}

const elements = (node: Node): Element[] => Array.from(node.childNodes).filter((n): n is Element => n.nodeType === 1);

/** Direct children of `el` with this namespace and name. */
export const children = (el: Element, ns: string, name: string): Element[] =>
  elements(el).filter((c) => c.namespaceURI === ns && c.localName === name);

export const child = (el: Element, ns: string, name: string): Element | undefined => children(el, ns, name)[0];

export const text = (el: Element | undefined): string => (el?.textContent ?? '').trim();

/** The status code in an `HTTP/1.1 404 Not Found` line. */
const statusOf = (el: Element | undefined): number | null => {
  const m = /^HTTP\/\S+\s+(\d{3})/.exec(text(el));
  return m ? Number(m[1]) : null;
};

/** The `<href>` values inside a property, such as current-user-principal or calendar-home-set. */
export const hrefsIn = (el: Element | undefined): string[] => (el ? children(el, DAV, 'href').map(text) : []);

/** Whether an element lists a child named `{ns}name` (resourcetype, privilege sets). */
export const has = (el: Element | undefined, ns: string, name: string): boolean =>
  !!el && el.getElementsByTagNameNS(ns, name).length > 0;

/** Reads a 207 multistatus. Throws SyncError if it isn't one. */
export function parseMultistatus(xml: string): Multistatus {
  const root = parse(xml);
  if (root.namespaceURI !== DAV || root.localName !== 'multistatus')
    throw new SyncError('The calendar server sent an answer Homa cannot read');
  const responses: DavResponse[] = [];
  for (const r of children(root, DAV, 'response')) {
    const href = text(child(r, DAV, 'href'));
    if (!href) continue;
    const props = new Map<string, Element>();
    for (const ps of children(r, DAV, 'propstat')) {
      const status = statusOf(child(ps, DAV, 'status'));
      if (status === null || status < 200 || status > 299) continue;
      const prop = child(ps, DAV, 'prop');
      if (prop) for (const p of elements(prop)) props.set(key(p.namespaceURI ?? '', p.localName ?? ''), p);
    }
    responses.push({ href, status: statusOf(child(r, DAV, 'status')), props });
  }
  const token = child(root, DAV, 'sync-token');
  return { responses, syncToken: token ? text(token) || null : null };
}

/** A property of a response, by namespace and name. */
export const prop = (r: DavResponse, ns: string, name: string): Element | undefined => r.props.get(key(ns, name));

/** True if `xml` is a DAV `<error>` body naming this precondition (such as valid-sync-token). */
export function hasPrecondition(xml: string, ns: string, name: string): boolean {
  try {
    const root = parse(xml);
    return root.namespaceURI === DAV && root.localName === 'error' && children(root, ns, name).length > 0;
  } catch {
    return false;
  }
}

const escapeXml = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const HEAD = '<?xml version="1.0" encoding="utf-8"?>';

export const propfindBody = (props: string): string =>
  `${HEAD}<d:propfind xmlns:d="DAV:" xmlns:c="${CALDAV}" xmlns:a="${APPLE}"><d:prop>${props}</d:prop></d:propfind>`;

export const syncCollectionBody = (token: string | null): string =>
  `${HEAD}<d:sync-collection xmlns:d="DAV:"><d:sync-token>${escapeXml(token ?? '')}</d:sync-token><d:sync-level>1</d:sync-level><d:prop><d:getetag/></d:prop></d:sync-collection>`;

export const etagQueryBody = (): string =>
  `${HEAD}<c:calendar-query xmlns:d="DAV:" xmlns:c="${CALDAV}"><d:prop><d:getetag/></d:prop><c:filter><c:comp-filter name="VCALENDAR"><c:comp-filter name="VEVENT"/></c:comp-filter></c:filter></c:calendar-query>`;

export const multigetBody = (hrefs: readonly string[]): string =>
  `${HEAD}<c:calendar-multiget xmlns:d="DAV:" xmlns:c="${CALDAV}"><d:prop><d:getetag/><c:calendar-data/></d:prop>${hrefs
    .map((h) => `<d:href>${escapeXml(h)}</d:href>`)
    .join('')}</c:calendar-multiget>`;
