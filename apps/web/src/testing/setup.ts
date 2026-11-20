// bun test preload for the web app: a DOM (happy-dom) and Testing Library cleanup between tests.
import { afterEach } from 'bun:test';
import { GlobalRegistrator } from '@happy-dom/global-registrator';

GlobalRegistrator.register({ url: 'http://localhost:3000/' });
// happy-dom has no FontFaceSet; Mantine's autosizing Textarea (the event form's notes) listens on it.
if (!('fonts' in document)) {
  Object.defineProperty(document, 'fonts', {
    value: { ready: Promise.resolve(), addEventListener: (): void => {}, removeEventListener: (): void => {} },
  });
}

const { cleanup } = await import('@testing-library/react');
afterEach(() => cleanup());
