// A small shared list of tasks, so the Add Task sheet and the Home page can
// talk to each other without either one knowing about the other.
// Tasks are also kept in the browser (localStorage), so they are still there
// after a refresh. Later, replace this with your backend.

import { useSyncExternalStore } from "react";

export type Task = {
  id: string;
  title: string;
  project: string;
  date: string; // YYYY-MM-DD, in the user's own time zone
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

const makeId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

export const addTask = (input: NewTaskInput): Task => {
  const task: Task = {
    ...input,
    id: makeId(),
    done: false,
    createdAt: Date.now(),
  };
  tasks = [...tasks, task];
  persist();
  emit();
  return task;
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
