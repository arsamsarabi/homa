import { createRootRouteWithContext, Outlet } from '@tanstack/react-router';
import type { RouterContext } from '@/lib/router';

export const Route = createRootRouteWithContext<RouterContext>()({ component: Outlet });
