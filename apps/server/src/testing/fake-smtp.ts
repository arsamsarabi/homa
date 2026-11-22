// Test helper: a fake SMTP server, just enough of the protocol for nodemailer. It keeps every
// message it accepts and can refuse recipients with 550. Built on node:net so the Playwright specs
// (which run on Node) can use it as well as the Bun tests.
import { createServer, type Socket } from 'node:net';

export type FakeSmtp = {
  port: number;
  /** Each accepted message, raw (headers and body), lines joined with \n. */
  mails: string[];
  /** While true, RCPT TO gets 550 (no such user). */
  refuse: boolean;
  /** The first message, counting from `from`, that `match` accepts; waits up to `timeoutMs`. */
  waitFor: (match: (mail: string) => boolean, opts?: { from?: number; timeoutMs?: number }) => Promise<string>;
  stop: () => Promise<void>;
};

export async function startFakeSmtp(port = 0, host = '127.0.0.1'): Promise<FakeSmtp> {
  const sockets = new Set<Socket>();
  const smtp: FakeSmtp = {
    port: 0,
    mails: [],
    refuse: false,
    async waitFor(
      match: (mail: string) => boolean,
      { from = 0, timeoutMs = 5000 }: { from?: number; timeoutMs?: number } = {},
    ): Promise<string> {
      const until = Date.now() + timeoutMs;
      for (;;) {
        const found = smtp.mails.slice(from).find(match);
        if (found) return found;
        if (Date.now() > until) throw new Error('no matching email arrived');
        await new Promise((r) => setTimeout(r, 50));
      }
    },
    stop: (): Promise<void> =>
      new Promise((resolve) => {
        for (const s of sockets) s.destroy();
        server.close(() => resolve());
      }),
  };
  const server = createServer((s) => {
    sockets.add(s);
    s.on('close', () => sockets.delete(s));
    let buf = '';
    let inData = false;
    let msg = '';
    s.write('220 fake ESMTP\r\n');
    s.on('data', (chunk) => {
      buf += chunk.toString();
      for (let i = buf.indexOf('\r\n'); i >= 0; i = buf.indexOf('\r\n')) {
        const line = buf.slice(0, i);
        buf = buf.slice(i + 2);
        if (inData) {
          if (line === '.') {
            inData = false;
            smtp.mails.push(msg);
            msg = '';
            s.write('250 queued\r\n');
          } else msg += `${line.startsWith('..') ? line.slice(1) : line}\n`;
          continue;
        }
        const cmd = line.slice(0, 4).toUpperCase();
        if (cmd === 'EHLO' || cmd === 'HELO') s.write('250 fake\r\n');
        else if (cmd === 'RCPT' && smtp.refuse) s.write('550 no such user\r\n');
        else if (cmd === 'DATA') {
          inData = true;
          s.write('354 go on\r\n');
        } else if (cmd === 'QUIT') {
          s.write('221 bye\r\n');
          s.end();
        } else s.write('250 ok\r\n');
      }
    });
  });
  await new Promise<void>((resolve) => server.listen(port, host, resolve));
  const address = server.address();
  smtp.port = typeof address === 'object' && address ? address.port : port;
  return smtp;
}

/** The first link in a message's text part whose path starts with `path`, quoted-printable decoded. */
export function linkIn(mail: string, path: string): string {
  const decoded = mail
    .replace(/=\n/g, '')
    .replace(/=([0-9A-F]{2})/g, (_m, hex: string) => String.fromCharCode(Number.parseInt(hex, 16)));
  const url = decoded.match(/https?:\/\/[^\s"<>]+/g)?.find((u) => new URL(u).pathname.startsWith(path));
  if (!url) throw new Error(`no ${path} link in the email`);
  return url;
}
