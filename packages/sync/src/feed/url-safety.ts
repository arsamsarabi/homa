// Outbound requests to user-supplied URLs (ICS feeds). Only http and https, and by default only to
// public addresses, so a feed URL can't make the server read its own network (SSRF): loopback,
// private, link-local (cloud metadata at 169.254.169.254), CGNAT, multicast and reserved ranges are
// refused, for the first URL and for every redirect. Self-hosters who subscribe to a feed on their
// own network set HOMA_SYNC_ALLOW_PRIVATE_NETWORKS=true.
//
// shortcut: the address is checked at DNS lookup, and fetch resolves the name again, so a DNS
// rebinding server could answer differently the second time; pin the checked address (a custom
// connect) if Bun's fetch gains a lookup hook.
import { lookup } from 'node:dns/promises';
import { BlockList, isIP } from 'node:net';
import { SyncError } from './errors';

const blocked = new BlockList();
for (const [net, bits] of [
  ['0.0.0.0', 8], // "this network"
  ['10.0.0.0', 8],
  ['100.64.0.0', 10], // carrier-grade NAT
  ['127.0.0.0', 8],
  ['169.254.0.0', 16], // link-local, cloud metadata
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.0.2.0', 24], // documentation
  ['192.168.0.0', 16],
  ['198.18.0.0', 15], // benchmarking
  ['198.51.100.0', 24],
  ['203.0.113.0', 24],
  ['224.0.0.0', 4], // multicast
  ['240.0.0.0', 4], // reserved, broadcast
] as const)
  blocked.addSubnet(net, bits, 'ipv4');
for (const [net, bits] of [
  ['::', 128], // unspecified
  ['::1', 128],
  ['64:ff9b::', 96], // NAT64 (wraps an IPv4 address)
  ['100::', 64], // discard
  ['2001:db8::', 32], // documentation
  ['fc00::', 7], // unique local
  ['fe80::', 10], // link-local
  ['ff00::', 8], // multicast
] as const)
  blocked.addSubnet(net, bits, 'ipv6');

/** True if `ip` is a public unicast address (IPv4-mapped IPv6 is judged by its IPv4 address). */
export function isPublicAddress(ip: string): boolean {
  const family = isIP(ip);
  if (family === 0) return false;
  return !blocked.check(ip, family === 4 ? 'ipv4' : 'ipv6');
}

/**
 * Parses a feed URL as the user typed it. `webcal://` (what "subscribe" links use) means https.
 * Throws SyncError for anything but http(s), or a URL with a user name or password in it.
 */
export function parseFeedUrl(input: string): URL {
  let url: URL;
  try {
    url = new URL(input.trim().replace(/^webcals?:\/\//i, 'https://'));
  } catch {
    throw new SyncError('That is not a valid address');
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:')
    throw new SyncError('Only http and https addresses can be subscribed to');
  if (url.username || url.password) throw new SyncError('Addresses with a user name or password are not supported');
  return url;
}

/** Throws SyncError unless every address `url`'s host resolves to is public (or private is allowed). */
export async function assertPublicHost(url: URL, allowPrivate: boolean): Promise<void> {
  if (allowPrivate) return;
  const host = url.hostname.replace(/^\[|\]$/g, '');
  let addresses: string[];
  if (isIP(host)) addresses = [host];
  else {
    try {
      addresses = (await lookup(host, { all: true, verbatim: true })).map((a) => a.address);
    } catch {
      throw new SyncError("The feed's server could not be found");
    }
  }
  if (!addresses.length || !addresses.every(isPublicAddress))
    throw new SyncError('Feeds on private or local networks are not allowed on this server');
}
