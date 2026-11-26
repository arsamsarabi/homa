import { Center, Image, Paper, Stack, Text, Title } from '@mantine/core';
import type { JSX, ReactNode } from 'react';
import { useInstance } from '@/hooks/instance';

export type StatusCardProps = {
  title: string;
  eyebrow?: ReactNode;
  children: ReactNode;
};

/** Shared shell for status pages (runtime error, 404): logo, optional instance name, title, content. */
export function StatusCard({ title, eyebrow, children }: StatusCardProps): JSX.Element {
  const name = useInstance().data?.name;
  return (
    <Center mih="100dvh" p="md">
      <Paper withBorder p="xl" w="100%" maw={400}>
        <Stack>
          <Image src="/homa-capital-320.webp" alt="" w={120} mx="auto" />
          {name && (
            <Text c="dimmed" ta="center">
              {name}
            </Text>
          )}
          {eyebrow}
          <Title order={1} ta="center">
            {title}
          </Title>
          {children}
        </Stack>
      </Paper>
    </Center>
  );
}
