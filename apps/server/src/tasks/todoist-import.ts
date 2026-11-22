// Importing Todoist's project CSVs: one file per project, matched to a Homa project by name. Importing
// the same files again adds only what isn't there yet. The format is read in @homa/core.
import { readTodoistCsv, TASK_LIMITS, type TodoistTask, ValidationError } from '@homa/core';
import { type Db, type Executor, repo } from '@homa/db';
import { setTags } from './tasks-service';

export type TodoistFile = { name: string; csv: string };
export type TodoistSummary = {
  /** Projects created; the others were matched by name. */
  createdProjects: number;
  imported: number;
  /** Open tasks already there with the same title in the same place. */
  skipped: number;
  /** Due dates that weren't read; their text is in the task's notes. */
  unreadDates: number;
  /** Todoist sections, which Homa doesn't have. */
  sections: number;
};

/** The project name from the file name: "Garden.csv" → "Garden". */
const projectName = (file: string): string =>
  (file.replace(/\.csv$/i, '').trim() || 'Todoist').slice(0, TASK_LIMITS.projectName);

const size = (ts: readonly TodoistTask[]): number => ts.reduce((n, t) => n + 1 + t.subtasks.length, 0);

export async function importTodoist(
  db: Db,
  userId: string,
  files: readonly TodoistFile[],
  tz: string,
  now = new Date(),
): Promise<TodoistSummary> {
  const read = files.map((f) => {
    try {
      return { name: projectName(f.name), project: readTodoistCsv(f.csv, tz, now) };
    } catch (err) {
      throw new ValidationError(`${f.name}: ${(err as Error).message}`);
    }
  });
  return db.transaction(async (tx) => {
    const projects = await repo.listProjects(tx, userId);
    const open = await repo.listOpenTasks(tx, userId);
    const key = (projectId: string, parentId: string | null, title: string): string =>
      `${projectId}|${parentId ?? ''}|${title.toLowerCase()}`;
    const existing = new Map(
      open.filter((t) => t.projectId).map((t) => [key(t.projectId ?? '', t.parentId, t.title), t.id]),
    );

    const newNames = new Set(
      read.map((r) => r.name.toLowerCase()).filter((n) => !projects.some((p) => p.name.toLowerCase() === n)),
    );
    if (projects.length + newNames.size > TASK_LIMITS.projectsPerUser)
      throw new ValidationError(`You can have at most ${TASK_LIMITS.projectsPerUser} projects`);
    // Counted before skipping duplicates, so a re-import near the limit is refused rather than half done.
    if (open.length + read.reduce((n, r) => n + size(r.project.tasks), 0) > TASK_LIMITS.openPerUser)
      throw new ValidationError(`You can have at most ${TASK_LIMITS.openPerUser} open tasks`);

    const summary: TodoistSummary = { createdProjects: 0, imported: 0, skipped: 0, unreadDates: 0, sections: 0 };
    const add = async (t: TodoistTask, projectId: string, parentId: string | null): Promise<string> => {
      const k = key(projectId, parentId, t.title);
      const have = existing.get(k);
      if (have) {
        summary.skipped++;
        return have;
      }
      const row = await repo.insertTask(tx, {
        ownerUserId: userId,
        projectId,
        parentId,
        title: t.title,
        notes: t.notes,
        priority: t.priority,
        dueDate: t.dueDate,
        dueTime: t.dueTime,
        tz: t.tz,
        rrule: t.rrule,
      });
      if (t.tags.length) await setTags(tx, userId, row.id, t.tags);
      existing.set(k, row.id);
      summary.imported++;
      return row.id;
    };

    for (const { name, project } of read) {
      summary.unreadDates += project.unreadDates;
      summary.sections += project.sections;
      const projectId = await projectFor(tx, userId, projects, name, summary);
      for (const t of project.tasks) {
        const id = await add(t, projectId, null);
        for (const s of t.subtasks) await add(s, projectId, id);
      }
    }
    return summary;
  });
}

async function projectFor(
  tx: Executor,
  userId: string,
  projects: repo.ProjectRow[],
  name: string,
  summary: TodoistSummary,
): Promise<string> {
  const have = projects.find((p) => p.name.toLowerCase() === name.toLowerCase());
  if (have) return have.id;
  const row = await repo.insertProject(tx, userId, { name, color: null });
  projects.push(row);
  summary.createdProjects++;
  return row.id;
}
