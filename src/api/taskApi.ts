import axios from "axios";
// Your axios instance from src/api/client.ts. If that file exports it by name
// (export const api = ...), change this line to: import { api } from "./client";
import api from "./client";

/* ========================================================================== */
/*                               TASK REQUESTS                                */
/* ========================================================================== */
// Endpoints (all need the person to be signed in):
//   POST   /api/tasks              create
//   GET    /api/tasks              list
//   GET    /api/tasks/{id}         one task
//   PATCH  /api/tasks/{id}         update
//   DELETE /api/tasks/{id}         delete
//   PATCH  /api/tasks/{id}/toggle  mark done / not done

// What the app's form works with
export type TaskInput = {
  title: string;
  project: string;
  date: string; // YYYY-MM-DD
  time: string; // HH:MM, or ""
  priority: string; // Low | Medium | High
};

// A task as the backend returns it
export type ServerTask = {
  id?: string;
  _id?: string;
  [key: string]: unknown;
};

/* ----- THE ONE PLACE TO MATCH YOUR BACKEND'S FIELD NAMES ------------------ */
// If the server says a field is missing or invalid, change the names here and
// nowhere else. Check them against the request body in your Swagger page.
const toServer = (task: Partial<TaskInput>) => {
  const body: Record<string, unknown> = {};
  if (task.title !== undefined) body.title = task.title;
  if (task.project !== undefined) body.project = task.project;
  if (task.date !== undefined) body.date = task.date;
  if (task.time !== undefined && task.time !== "") body.time = task.time;
  // The server only accepts low, medium or high (lowercase)
  if (task.priority !== undefined) body.priority = task.priority.toLowerCase();
  return body;
};

// Readable reason for a failed request, including which field the server
// rejected (for example "Reset code must be a 4-digit number")
export const taskErrorMessage = (error: unknown): string => {
  if (axios.isAxiosError(error)) {
    const details: unknown = error.response?.data?.details;
    if (Array.isArray(details)) {
      const lines = details
        .map((d) => {
          const item = d as { path?: string; msg?: string };
          return item.msg
            ? `${item.path ? `${item.path}: ` : ""}${item.msg}`
            : "";
        })
        .filter(Boolean);
      if (lines.length) return lines.join(". ");
    }
  }
  if (axios.isAxiosError(error)) {
    if (error.code === "ECONNABORTED") {
      return "The server is taking too long to respond. Please try again.";
    }
    if (!error.response) {
      return "Can't reach the server. Check your internet connection and try again.";
    }
    const message: unknown = error.response.data?.message;
    if (typeof message === "string" && message.trim()) return message;
  }
  return "Couldn't save the task. Please try again.";
};

// Finds the task inside the server's answer, however deeply it is wrapped
// (for example { data: { task: {...} } })
const unwrap = (data: unknown, depth = 0): ServerTask => {
  if (data && typeof data === "object" && !Array.isArray(data)) {
    const body = data as Record<string, unknown>;
    if (body.id !== undefined || body._id !== undefined)
      return body as ServerTask;
    if (depth < 3) {
      for (const key of ["task", "data", "result"]) {
        const inner = body[key];
        if (inner && typeof inner === "object" && !Array.isArray(inner)) {
          return unwrap(inner, depth + 1);
        }
      }
    }
    return body as ServerTask;
  }
  return {};
};

export const createTask = async (task: TaskInput): Promise<ServerTask> => {
  const res = await api.post<unknown>("/tasks", toServer(task));
  return unwrap(res.data);
};

export const getTasks = async (): Promise<ServerTask[]> => {
  const res = await api.get<unknown>("/tasks");
  const data = res.data as Record<string, unknown> | unknown[];
  if (Array.isArray(data)) return data as ServerTask[];
  for (const key of ["tasks", "data", "items"]) {
    const list = (data as Record<string, unknown>)?.[key];
    if (Array.isArray(list)) return list as ServerTask[];
  }
  return [];
};

export const getTask = async (id: string): Promise<ServerTask> => {
  const res = await api.get<unknown>(`/tasks/${id}`);
  return unwrap(res.data);
};

export const updateTask = async (
  id: string,
  changes: Partial<TaskInput>,
): Promise<ServerTask> => {
  const res = await api.patch<unknown>(`/tasks/${id}`, toServer(changes));
  return unwrap(res.data);
};

export const deleteTask = async (id: string): Promise<void> => {
  await api.delete(`/tasks/${id}`);
};

export const toggleTask = async (id: string): Promise<ServerTask> => {
  const res = await api.patch<unknown>(`/tasks/${id}/toggle`);
  return unwrap(res.data);
};
