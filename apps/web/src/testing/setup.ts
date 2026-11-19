// bun test preload for the web app: a DOM (happy-dom) and Testing Library cleanup between tests.
import { afterEach } from 'bun:test';
import { GlobalRegistrator } from '@happy-dom/global-registrator';

GlobalRegistrator.register({ url: 'http://localhost:3000/' });

const { cleanup } = await import('@testing-library/react');
afterEach(() => cleanup());
