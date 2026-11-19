// Structured logging: one JSON line per event, info to stdout and warnings and errors to stderr.
// Never log tokens, passwords or secrets; ids are fine.

type Level = 'info' | 'warn' | 'error';
export type LogFields = Record<string, unknown>;

/** An error as plain fields, so JSON.stringify keeps its message and stack. */
export const errorFields = (err: unknown): LogFields =>
  err instanceof Error ? { error: err.message, name: err.name, stack: err.stack } : { error: String(err) };

export function formatLine(level: Level, msg: string, fields: LogFields = {}, now = new Date()): string {
  return JSON.stringify({ time: now.toISOString(), level, msg, ...fields });
}

function write(level: Level, msg: string, fields?: LogFields): void {
  const line = `${formatLine(level, msg, fields)}\n`;
  if (level === 'info') process.stdout.write(line);
  else process.stderr.write(line);
}

export const log = {
  info: (msg: string, fields?: LogFields): void => write('info', msg, fields),
  warn: (msg: string, fields?: LogFields): void => write('warn', msg, fields),
  error: (msg: string, fields?: LogFields): void => write('error', msg, fields),
};
