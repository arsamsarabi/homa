import { createRootRouteWithContext } from '@tanstack/react-router';
import { applyInstanceLanguage, type RouterContext } from '@/lib/router';
import { RootLayout } from '@/pages/root';

export const Route = createRootRouteWithContext<RouterContext>()({
  beforeLoad: applyInstanceLanguage,
  component: RootLayout,
});
