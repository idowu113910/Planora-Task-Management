// The shared list of tasks. The backend is the source of truth: tasks are
// loaded from it (refreshTasks), and adding, editing, deleting and finishing a
// task are sent to it. A copy is kept in the browser (localStorage) so the
// screens show something straight away and after a refresh.

import { useSyncExternalStore } from "react";
import {
  deleteTask,
  getTasks,
  toggleTask,
  updateTask,
  taskErrorMessage,
} from "../api/taskApi";
import type { ServerTask } from "../api/taskApi";
import { showToast } from "./Toast";

export type Task = {
  id: string;
  title: string;
  project: string;
  date: string; // YYYY-MM-DD
  time: string; // HH:MM (24-hour), or "" if none was chosen
  priority: string; // "Low" | "Medium" | "High"
  done: boolean;
  createdAt: number;
};

// What the Add Task sheet hands over
export type NewTaskInput = Pick<
  Task,
  "title" | "project" | "date" | "time" | "priority"
>;

const STORAGE_KEY = "planora-tasks";

const isTask = (value: unknown): value is Task => {
  const t = value as Partial<Task> | null;
  return (
    !!t &&
    typeof t.id === "string" &&
    typeof t.title === "string" &&
    typeof t.project === "string" &&
    typeof t.date === "string" &&
    typeof t.time === "string" &&
    typeof t.priority === "string" &&
    typeof t.done === "boolean" &&
    typeof t.createdAt === "number"
  );
};

const readFromStorage = (): Task[] => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter(isTask) : [];
  } catch {
    return [];
  }
};

// Always replaced (never changed in place), so React can tell when it changed
let tasks: Task[] = readFromStorage();
const listeners = new Set<() => void>();

const emit = () => listeners.forEach((listener) => listener());

const persist = () => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
  } catch {
    // storage full or unavailable: the tasks still work until the page closes
  }
};

const setTasks = (next: Task[]) => {
  tasks = next;
  persist();
  emit();
};

const makeId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

/* ========================================================================== */
/*                  TURNING A BACKEND TASK INTO AN APP TASK                   */
/* ========================================================================== */
// The one place that reads the backend's answer. If a task shows up with a
// missing title, date or project, check the field names below against what
// GET /api/tasks really returns.

const text = (value: unknown): string =>
  typeof value === "string" ? value : "";

export const fromServer = (raw: ServerTask): Task | null => {
  const body = raw as Record<string, unknown>;
  const rawId = body.id ?? body._id;
  if (rawId === undefined || rawId === null || rawId === "") return null;

  const project = body.project;
  const projectName =
    typeof project === "string"
      ? project
      : project && typeof project === "object"
        ? text((project as Record<string, unknown>).name)
        : text(body.projectName);

  const rawDate = text(body.date) || text(body.dueDate) || text(body.due_date);
  const rawTime = text(body.time) || text(body.dueTime) || text(body.due_time);

  const rawPriority = text(body.priority);
  const priority = rawPriority
    ? rawPriority.charAt(0).toUpperCase() + rawPriority.slice(1).toLowerCase()
    : "Medium";

  const status = text(body.status).toLowerCase();
  const done =
    body.done === true ||
    body.completed === true ||
    body.isCompleted === true ||
    body.isDone === true ||
    status === "completed" ||
    status === "done";

  const created = Date.parse(text(body.createdAt));

  return {
    id: String(rawId),
    title: text(body.title) || text(body.name),
    project: projectName || "Work",
    date: rawDate.slice(0, 10),
    time: rawTime.slice(0, 5),
    priority,
    done,
    createdAt: Number.isNaN(created) ? Date.now() : created,
  };
};

/* ========================================================================== */
/*                               WHAT SCREENS USE                             */
/* ========================================================================== */

// Saves a task here after the backend created it (id is the backend's id)
export const addTask = (input: NewTaskInput, id?: string): Task => {
  const task: Task = {
    ...input,
    id: id ?? makeId(),
    done: false,
    createdAt: Date.now(),
  };
  setTasks([...tasks, task]);
  return task;
};

// Loads the signed-in person's tasks from the backend. If it fails (no
// internet, signed out), the saved copy stays on screen.
let loading: Promise<void> | null = null;
export const refreshTasks = (): Promise<void> => {
  if (loading) return loading;
  loading = (async () => {
    try {
      const list = await getTasks();
      const mapped = list.map(fromServer).filter((t): t is Task => t !== null);
      setTasks(mapped);
    } catch {
      // keep what is already shown
    } finally {
      loading = null;
    }
  })();
  return loading;
};

// Saves edited details on the backend
export const updateTaskRemote = async (id: string, changes: NewTaskInput) => {
  try {
    await updateTask(id, changes);
    setTasks(tasks.map((t) => (t.id === id ? { ...t, ...changes } : t)));
  } catch (error) {
    showToast("Couldn't update task", taskErrorMessage(error));
  }
};

// Deletes a task on the backend
export const deleteTaskRemote = async (id: string) => {
  try {
    await deleteTask(id);
    setTasks(tasks.filter((t) => t.id !== id));
  } catch (error) {
    showToast("Couldn't delete task", taskErrorMessage(error));
  }
};

// Marks a task done on the backend. The backend's "toggle" flips the state, so
// it is only called for a task that isn't done yet.
export const completeTaskRemote = async (task: Task) => {
  if (task.done) return;
  try {
    await toggleTask(task.id);
    setTasks(tasks.map((t) => (t.id === task.id ? { ...t, done: true } : t)));
  } catch (error) {
    showToast("Couldn't complete task", taskErrorMessage(error));
  }
};

const subscribe = (listener: () => void) => {
  listeners.add(listener);

  // Keeps other open tabs in step
  const onStorage = (e: StorageEvent) => {
    if (e.key === STORAGE_KEY) {
      tasks = readFromStorage();
      listener();
    }
  };
  window.addEventListener("storage", onStorage);

  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
};

const getSnapshot = () => tasks;

// Use this in any component that shows tasks. It re-renders when tasks change.
export const useTasks = (): Task[] =>
  useSyncExternalStore(subscribe, getSnapshot);
