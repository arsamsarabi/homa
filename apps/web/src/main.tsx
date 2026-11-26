import '@mantine/core/styles.css';
import '@mantine/notifications/styles.css';
import '@mantine/spotlight/styles.css';
import '@fontsource/vazirmatn/400.css';
import '@fontsource/vazirmatn/700.css';
import '@/styles/fonts.css';
import '@/styles/global.css';
import '@/lib/i18n';
import { DirectionProvider, MantineProvider } from '@mantine/core';
import { Notifications } from '@mantine/notifications';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from '@tanstack/react-router';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createAppRouter } from '@/lib/router';
import { cssVariablesResolver, theme } from '@/styles';

const queryClient = new QueryClient();
const router = createAppRouter(queryClient);
const root = document.getElementById('root');
if (!root) throw new Error('#root is missing from index.html');

createRoot(root).render(
  <StrictMode>
    <DirectionProvider detectDirection>
      <MantineProvider theme={theme} cssVariablesResolver={cssVariablesResolver} defaultColorScheme="auto">
        <Notifications position="bottom-right" zIndex={400} />
        <QueryClientProvider client={queryClient}>
          <RouterProvider router={router} />
        </QueryClientProvider>
      </MantineProvider>
    </DirectionProvider>
  </StrictMode>,
);
