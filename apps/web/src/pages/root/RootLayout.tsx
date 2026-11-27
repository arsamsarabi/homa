import { Outlet } from '@tanstack/react-router';
import type { JSX } from 'react';
import { DemoWelcome } from '@/components';
import { useInstance } from '@/hooks/instance';

/** Every page: the route's page, with the demo welcome on a demo instance. */
export function RootLayout(): JSX.Element {
  const demo = useInstance().data?.demo;
  return (
    <>
      <Outlet />
      {demo && <DemoWelcome />}
    </>
  );
}
