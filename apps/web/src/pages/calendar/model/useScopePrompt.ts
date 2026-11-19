import { useRef, useState } from 'react';
import type { Scope } from '@/schemas';

export type ScopeQuestion = { action: 'change' | 'delete'; allowed: Scope[] };
export type ScopePrompt = {
  question: ScopeQuestion | undefined;
  /** Asks which occurrences a change or delete applies to; null means cancelled. */
  ask: (action: ScopeQuestion['action'], allowed: Scope[]) => Promise<Scope | null>;
  answer: (scope: Scope | null) => void;
};

/** The "this event, this and following, or all?" question for recurring events. */
export function useScopePrompt(): ScopePrompt {
  const [question, setQuestion] = useState<ScopeQuestion>();
  const resolver = useRef<(s: Scope | null) => void>(undefined);
  return {
    question,
    ask: (action: ScopeQuestion['action'], allowed: Scope[]): Promise<Scope | null> =>
      new Promise<Scope | null>((resolve) => {
        resolver.current?.(null); // a newer question cancels an unanswered one
        resolver.current = resolve;
        setQuestion({ action, allowed });
      }),
    answer: (scope: Scope | null): void => {
      resolver.current?.(scope);
      resolver.current = undefined;
      setQuestion(undefined);
    },
  };
}
