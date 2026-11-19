// The first-run setup code. Until the instance has its admin, the first sign-up must carry a
// 4-digit code that only the operator can see (it's printed to the server log). That stops
// whoever reaches a fresh instance first from taking it over.

/** Wrong guesses allowed before the code is replaced (and the new one logged). */
export const MAX_SETUP_ATTEMPTS = 5;

/** The header the setup page sends the code in, alongside the admin's sign-up. */
export const SETUP_CODE_HEADER = 'x-homa-setup-code';

export type SetupGate = {
  /** The current code, made (and announced) on first use. */
  current: () => string;
  /** True when `code` matches. Wrong guesses count; too many replace the code. */
  check: (code: string | null | undefined) => boolean;
};

const randomCode = (): string => String((crypto.getRandomValues(new Uint32Array(1))[0] ?? 0) % 10_000).padStart(4, '0');

/**
 * A setup gate. `fixed` pins the code (HOMA_SETUP_CODE, for automated tests) and never changes;
 * otherwise a random code is made and replaced after MAX_SETUP_ATTEMPTS wrong guesses.
 * `announce` is called with every new code so the operator can read it in the log.
 */
export function createSetupGate(opts: { fixed?: string; announce: (code: string) => void }): SetupGate {
  let code: string | undefined;
  let wrong = 0;
  const current = (): string => {
    if (code === undefined) {
      code = opts.fixed ?? randomCode();
      opts.announce(code);
    }
    return code;
  };
  return {
    current,
    check: (given: string | null | undefined): boolean => {
      if (given === current()) return true;
      wrong += 1;
      if (!opts.fixed && wrong >= MAX_SETUP_ATTEMPTS) {
        wrong = 0;
        code = undefined;
        current();
      }
      return false;
    },
  };
}
