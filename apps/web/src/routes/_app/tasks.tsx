import { createFileRoute } from '@tanstack/react-router';
import { TasksPage } from '@/pages/tasks';
import { TasksSearchSchema } from '@/schemas';

export const Route = createFileRoute('/_app/tasks')({ validateSearch: TasksSearchSchema, component: TasksPage });
