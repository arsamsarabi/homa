import { Container, Image, Stack, Stepper, Text, Title } from '@mantine/core';
import { type JSX, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSession } from '@/hooks/session';
import { AdminAccountStep } from './AdminAccountStep';
import { DoneStep } from './DoneStep';
import { InstanceStep } from './InstanceStep';
import { PersonalStep } from './PersonalStep';

/**
 * The first visit to a new instance: create the admin account, review the instance's settings,
 * choose your own, then go to the calendar. An admin who reloads midway resumes after step one.
 */
export function SetupPage(): JSX.Element {
  const { t } = useTranslation();
  const { data: session } = useSession();
  const [active, setActive] = useState(session ? 1 : 0);
  const next = (): void => setActive((a) => a + 1);
  // The admin account exists after step one, so going back stops at the instance step.
  const back = (): void => setActive((a) => Math.max(1, a - 1));

  return (
    <Container size="lg" py="xl">
      <Stack>
        <Image src="/homa-capital-320.webp" alt="" w={96} />
        <Title order={1}>{t('setup.title')}</Title>
        <Text c="dimmed">{t('setup.intro')}</Text>
        <Stepper
          active={active}
          size="sm"
          onStepClick={(step: number): void => {
            if (step >= 1 && step < active) setActive(step);
          }}
        >
          <Stepper.Step label={t('setup.steps.account')}>
            <AdminAccountStep onDone={next} />
          </Stepper.Step>
          <Stepper.Step label={t('setup.steps.instance')}>
            <InstanceStep onDone={next} />
          </Stepper.Step>
          <Stepper.Step label={t('setup.steps.personal')}>
            <PersonalStep onDone={next} onBack={back} />
          </Stepper.Step>
          <Stepper.Completed>
            <DoneStep onBack={back} />
          </Stepper.Completed>
        </Stepper>
      </Stack>
    </Container>
  );
}
