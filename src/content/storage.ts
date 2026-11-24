import { emptyBoard, type ProjectBoard, type ResolveTemplates } from '../shared/types';

const PREFIX = 'kanban:v1:';
const projectKey = (projectId: string) => `${PREFIX}project:${projectId}`;
const TEMPLATES_KEY = `${PREFIX}resolveTemplates`;
const SETTINGS_KEY = `${PREFIX}settings`;

export interface Settings {
  /** Log discovered endpoints and thread lists to the DevTools console. */
  debug: boolean;
}

export async function loadBoard(projectId: string): Promise<ProjectBoard> {
  const key = projectKey(projectId);
  const res = await chrome.storage.local.get(key);
  const b = res[key] as ProjectBoard | undefined;
  if (!b) return emptyBoard();
  const base = emptyBoard();
  return { ...base, ...b, order: { ...base.order, ...b.order } };
}

export async function saveBoard(projectId: string, board: ProjectBoard): Promise<void> {
  await chrome.storage.local.set({ [projectKey(projectId)]: board });
}

export async function loadTemplates(): Promise<ResolveTemplates> {
  const res = await chrome.storage.local.get(TEMPLATES_KEY);
  return (res[TEMPLATES_KEY] as ResolveTemplates | undefined) ?? {};
}

export async function saveTemplates(t: ResolveTemplates): Promise<void> {
  await chrome.storage.local.set({ [TEMPLATES_KEY]: t });
}

export async function loadSettings(): Promise<Settings> {
  const res = await chrome.storage.local.get(SETTINGS_KEY);
  return { debug: true, ...(res[SETTINGS_KEY] as Partial<Settings> | undefined) };
}
