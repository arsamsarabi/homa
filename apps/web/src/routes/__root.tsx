import { createRootRouteWithContext, Outlet } from '@tanstack/react-router';
import { applyInstanceLanguage, type RouterContext } from '@/lib/router';

export const Route = createRootRouteWithContext<RouterContext>()({
  beforeLoad: applyInstanceLanguage,
  component: Outlet,
});
