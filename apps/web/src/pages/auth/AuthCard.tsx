import { Center, Image, Paper, Stack, Text, Title } from '@mantine/core';
import type { JSX, ReactNode } from 'react';
import { useInstance } from '@/hooks/instance';

/** The signed-out pages' card: the logo, the instance's name and a title above the content. */
export function AuthCard({ title, children }: { title: string; children: ReactNode }): JSX.Element {
  // The route guards (or the root route) have loaded the instance.
  const instance = useInstance().data;
  return (
    <Center mih="100dvh" p="md">
      <Paper withBorder p="xl" w="100%" maw={400}>
        <Stack>
          <Image src="/homa-capital-320.webp" alt="" w={120} mx="auto" />
          {instance && (
            <Text c="dimmed" ta="center">
              {instance.name}
            </Text>
          )}
          <Title order={1} ta="center">
            {title}
          </Title>
          {children}
        </Stack>
      </Paper>
    </Center>
  );
}
