// Domain errors. The API maps each class to one HTTP status in one place (apps/server/src/http).

/** The thing asked for doesn't exist, or isn't the caller's. */
export class NotFoundError extends Error {
  override name = 'NotFoundError';
  constructor(message = 'Not found') {
    super(message);
  }
}

/** The request breaks a domain rule (an end before its start, an unknown calendar, …). */
export class ValidationError extends Error {
  override name = 'ValidationError';
}

/** The calendar is read-only (a subscription): its events can't be created, changed or deleted here. */
export class ReadOnlyError extends Error {
  override name = 'ReadOnlyError';
  constructor(message = 'This calendar is read-only') {
    super(message);
  }
}

/** The server isn't set up for this (a missing setting the operator must add). */
export class UnavailableError extends Error {
  override name = 'UnavailableError';
}
