import api from "./client";

/* ========================================================================== */
/*                             PROJECT REQUESTS                               */
/* ========================================================================== */
//   POST   /api/projects        create
//   GET    /api/projects        list
//   GET    /api/projects/{id}   one project
//   PATCH  /api/projects/{id}   update
//   DELETE /api/projects/{id}   delete
// All of them need the person to be signed in (the shared client adds the token).

// A project as the app uses it
export type ProjectDef = { id?: string; name: string; color: string };

const FALLBACK_COLOR = "#1A7431";

/* ----- THE ONE PLACE TO MATCH YOUR BACKEND'S FIELD NAMES ------------------ */
// What is sent: { name, color }. If the server says a field is missing or
// invalid, change the names here and nowhere else.
const toServer = (project: Partial<ProjectDef>) => {
  const body: Record<string, unknown> = {};
  if (project.name !== undefined) body.name = project.name;
  if (project.color !== undefined) body.color = project.color;
  return body;
};

// What comes back: id (or _id), name (or title), color (or colour / hex)
export const fromServerProject = (raw: unknown): ProjectDef | null => {
  if (!raw || typeof raw !== "object") return null;
  const body = raw as Record<string, unknown>;
  const rawId = body.id ?? body._id;
  const name =
    typeof body.name === "string"
      ? body.name
      : typeof body.title === "string"
        ? body.title
        : "";
  if (!name.trim()) return null;

  const color = [body.color, body.colour, body.hex].find(
    (c): c is string => typeof c === "string" && c.trim() !== "",
  );

  return {
    id:
      rawId === undefined || rawId === null || rawId === ""
        ? undefined
        : String(rawId),
    name: name.trim(),
    color: color ?? FALLBACK_COLOR,
  };
};

// Server answers come as the project itself, or wrapped in { project } / { data }
const unwrap = (data: unknown): unknown => {
  if (data && typeof data === "object") {
    const body = data as Record<string, unknown>;
    for (const key of ["project", "data"]) {
      const inner = body[key];
      if (inner && typeof inner === "object" && !Array.isArray(inner)) {
        return inner;
      }
    }
  }
  return data;
};

export const createProject = async (
  project: ProjectDef,
): Promise<ProjectDef | null> => {
  const res = await api.post<unknown>("/projects", toServer(project));
  return fromServerProject(unwrap(res.data));
};

export const getProjects = async (): Promise<ProjectDef[]> => {
  const res = await api.get<unknown>("/projects");
  const data = res.data as Record<string, unknown> | unknown[];
  let list: unknown[] = [];
  if (Array.isArray(data)) list = data;
  else {
    for (const key of ["projects", "data", "items"]) {
      const found = (data as Record<string, unknown>)?.[key];
      if (Array.isArray(found)) {
        list = found;
        break;
      }
    }
  }
  return list.map(fromServerProject).filter((p): p is ProjectDef => p !== null);
};

export const getProject = async (id: string): Promise<ProjectDef | null> => {
  const res = await api.get<unknown>(`/projects/${id}`);
  return fromServerProject(unwrap(res.data));
};

export const updateProject = async (
  id: string,
  changes: Partial<ProjectDef>,
): Promise<ProjectDef | null> => {
  const res = await api.patch<unknown>(`/projects/${id}`, toServer(changes));
  return fromServerProject(unwrap(res.data));
};

export const deleteProject = async (id: string): Promise<void> => {
  await api.delete(`/projects/${id}`);
};
