import { useCallback, useEffect, useRef, useState } from "react";
import { MdOutlineKeyboardArrowRight } from "react-icons/md";
import { FiCheck, FiChevronLeft, FiMoreHorizontal, FiX } from "react-icons/fi";
import { GoPlus } from "react-icons/go";
import { useTasks } from "../layout/taskStore";
import type { Task } from "../layout/taskStore";

type ProjectDef = { name: string; color: string };

// The projects every account starts with. The task numbers and the percentage
// are worked out from the real tasks below, not typed in here.
const DEFAULT_PROJECTS: ProjectDef[] = [
  { name: "Work", color: "#1A7431" },
  { name: "Personal", color: "#C84904" },
  { name: "Freelance", color: "#1890FF" },
];

// The colours offered when creating a project
const COLOR_CHOICES = [
  { label: "Green", value: "#1A7431" },
  { label: "Blue", value: "#1890FF" },
  { label: "Orange", value: "#C84904" },
  { label: "Navy", value: "#111827" },
  { label: "Red", value: "#EF4444" },
];

const NAME_MAX = 30;

// Projects you create are kept in this browser for now. When you add a
// backend, save and load them there instead.
const PROJECTS_KEY = "planora-projects";

const loadCustomProjects = (): ProjectDef[] => {
  try {
    const saved: unknown = JSON.parse(
      localStorage.getItem(PROJECTS_KEY) ?? "[]",
    );
    if (!Array.isArray(saved)) return [];
    return saved.filter(
      (p): p is ProjectDef =>
        !!p && typeof p.name === "string" && typeof p.color === "string",
    );
  } catch {
    return [];
  }
};

const saveCustomProjects = (list: ProjectDef[]) => {
  try {
    localStorage.setItem(PROJECTS_KEY, JSON.stringify(list));
  } catch {
    // storage full or blocked: the project just won't survive a refresh
  }
};

// The "Create Project" pop-up: a name and a colour
const CreateProjectDialog = ({
  existingNames,
  onClose,
  onCreate,
}: {
  existingNames: string[];
  onClose: () => void;
  onCreate: (project: ProjectDef) => void;
}) => {
  const [name, setName] = useState("");
  const [color, setColor] = useState(COLOR_CHOICES[0].value);
  const inputRef = useRef<HTMLInputElement>(null);

  const trimmed = name.trim();
  const isDuplicate = existingNames.some(
    (n) => n.toLowerCase() === trimmed.toLowerCase(),
  );
  const canCreate = trimmed.length > 0 && !isDuplicate;

  useEffect(() => {
    // Focus goes to the name box, and back to the button afterwards
    const previouslyFocused = document.activeElement as HTMLElement | null;
    inputRef.current?.focus({ preventScroll: true });

    // Stop the page behind from scrolling while the pop-up is open
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
      previouslyFocused?.focus({ preventScroll: true });
    };
  }, [onClose]);

  const submit = () => {
    if (!canCreate) return;
    onCreate({ name: trimmed, color });
  };

  return (
    // Dark backdrop. Tapping it closes the pop-up.
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/40 p-4"
    >
      <form
        role="dialog"
        aria-modal="true"
        aria-labelledby="create-project-title"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
        className="w-full max-w-sm rounded-3xl bg-white p-4 min-[360px]:p-5"
      >
        <div className="flex justify-end">
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-10 w-10 touch-manipulation items-center justify-center rounded-xl border border-[#E5EAF1] bg-[#F8FAFC] text-[#111827]"
          >
            <FiX size={18} aria-hidden="true" />
          </button>
        </div>

        <h2
          id="create-project-title"
          className="mt-1 text-[14px] font-normal text-[#111827]"
        >
          Create Project
        </h2>

        <label
          htmlFor="project-name"
          className="mt-6 block text-[12px] font-normal text-[#6B7280]"
        >
          Name
        </label>
        {/* 16px text, so phones don't zoom in when the box is tapped */}
        <input
          id="project-name"
          ref={inputRef}
          type="text"
          value={name}
          maxLength={NAME_MAX}
          onChange={(e) => setName(e.target.value)}
          placeholder="E.g Marketing"
          autoComplete="off"
          aria-invalid={isDuplicate}
          aria-describedby={isDuplicate ? "project-name-error" : undefined}
          style={{ fontSize: 16 }}
          className="mt-2 h-11 w-full rounded-lg border border-[#E5EAF1] bg-white px-3 font-normal text-[#111827] outline-none placeholder:text-[#C3CAD4] focus:border-[#1A7431]"
        />
        {isDuplicate && (
          <p
            id="project-name-error"
            role="alert"
            className="mt-1.5 text-[12px] font-normal text-[#EF4444]"
          >
            You already have a project with this name.
          </p>
        )}

        <fieldset className="mt-5 min-w-0 border-0 p-0 px-1">
          <legend className="text-[12px] font-normal text-[#6B7280]">
            Color
          </legend>
          <div className="mt-2 flex flex-wrap gap-x-1 gap-y-1">
            {COLOR_CHOICES.map((choice) => (
              <button
                key={choice.value}
                type="button"
                onClick={() => setColor(choice.value)}
                aria-label={choice.label}
                aria-pressed={color === choice.value}
                className="flex h-11 w-11 touch-manipulation items-center justify-center"
              >
                <span
                  className="flex h-8 w-8 items-center justify-center rounded-xl text-white"
                  style={{ backgroundColor: choice.value }}
                >
                  {color === choice.value && (
                    <FiCheck size={16} strokeWidth={3} aria-hidden="true" />
                  )}
                </span>
              </button>
            ))}
          </div>
        </fieldset>

        <div className="mt-5 flex justify-end">
          <button
            type="submit"
            disabled={!canCreate}
            className="flex h-11 touch-manipulation items-center justify-center gap-2 rounded-xl bg-[#1A7431] px-5 text-[14px] font-normal text-white disabled:cursor-not-allowed disabled:bg-[#A9D0B4]"
          >
            <GoPlus aria-hidden="true" />
            Create
          </button>
        </div>
      </form>
    </div>
  );
};

const pad2 = (n: number) => String(n).padStart(2, "0");

// A date as YYYY-MM-DD in the user's own time zone (not UTC)
const localISO = (d: Date) =>
  `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

// "23:35" becomes "11:35 PM"
const to12h = (time: string) => {
  const [h, m] = time.split(":").map(Number);
  return `${pad2(h % 12 || 12)}:${pad2(m)} ${h >= 12 ? "PM" : "AM"}`;
};

// What shows on the right of a task: the time, as in the design. Tasks for
// another day also say which day; tasks with no time say "Today".
const getWhenLabel = (task: Task) => {
  const now = new Date();
  const todayISO = localISO(now);
  const tomorrowISO = localISO(
    new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1),
  );

  const parts: string[] = [];
  if (task.date === tomorrowISO) parts.push("Tomorrow");
  else if (task.date !== todayISO) {
    parts.push(
      new Date(`${task.date}T00:00`).toLocaleDateString(undefined, {
        day: "numeric",
        month: "short",
      }),
    );
  }
  if (task.time) parts.push(to12h(task.time));
  return parts.length > 0 ? parts.join(" · ") : "Today";
};

// Soonest first: by day, then by time (tasks with no time go last), then by
// the order they were added
const byDueDate = (a: Task, b: Task) =>
  a.date.localeCompare(b.date) ||
  (a.time || "99:99").localeCompare(b.time || "99:99") ||
  a.createdAt - b.createdAt;

// Colour of the priority word on a task row
const priorityColors: Record<string, string> = {
  High: "text-[#D9A100]",
  Medium: "text-[#8B5CF6]",
  Low: "text-[#EF4444]",
};

// One row in a project's To Do list
const ProjectTaskItem = ({ task, dot }: { task: Task; dot: string }) => (
  <li className="flex items-center gap-3 py-4">
    {/* The empty circle on the left */}
    <span
      aria-hidden="true"
      className="h-5 w-5 shrink-0 rounded-full border border-[#D5DAE1] bg-white"
    />

    <div className="min-w-0 flex-1">
      <div className="flex items-start justify-between gap-2">
        <p className="min-w-0 text-[14px] leading-snug font-normal break-words text-[#111827]">
          {task.title}
        </p>
        <FiMoreHorizontal
          size={16}
          aria-hidden="true"
          className="mt-0.5 shrink-0 text-[#6B7280]"
        />
      </div>

      <div className="mt-2 flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-[clamp(12px,5vw,22px)]">
          <span className="flex min-w-0 items-center gap-1.5 text-[12px] font-normal text-[#5F6F65]">
            <span
              aria-hidden="true"
              className="h-1.5 w-1.5 shrink-0 rounded-full"
              style={{ backgroundColor: dot }}
            />
            <span className="truncate">{task.project}</span>
          </span>
          <span
            className={`shrink-0 text-[10px] font-normal ${
              priorityColors[task.priority] ?? "text-[#6B7280]"
            }`}
          >
            {task.priority}
          </span>
        </div>

        <span className="shrink-0 text-right text-[12px] font-normal text-[#525252]">
          {getWhenLabel(task)}
        </span>
      </div>
    </div>
  </li>
);

// One row in a project's Completed list: a filled green tick, the title
// crossed out, the project underneath and "Done" on the right
const ProjectDoneItem = ({ task, dot }: { task: Task; dot: string }) => (
  <li className="flex items-center gap-3 py-4">
    <span
      aria-hidden="true"
      className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#1A7431] text-white"
    >
      <FiCheck size={14} strokeWidth={3} />
    </span>

    <div className="min-w-0 flex-1">
      <div className="flex items-start justify-between gap-2">
        <p className="min-w-0 text-[14px] leading-snug font-normal break-words text-[#111827] line-through">
          {task.title}
        </p>
        <span className="shrink-0 text-[12px] font-normal text-[#1A7431]">
          Done
        </span>
      </div>

      <span className="mt-2 flex min-w-0 items-center gap-1.5 text-[12px] font-normal text-[#5F6F65]">
        <span
          aria-hidden="true"
          className="h-1.5 w-1.5 shrink-0 rounded-full"
          style={{ backgroundColor: dot }}
        />
        <span className="truncate">{task.project}</span>
      </span>
    </div>
  </li>
);

/* ========================================================================== */
/*                     TASKS DONE, DELETED OR EDITED ON HOME                  */
/* ========================================================================== */
// Home and the Inbox keep these in this browser under the "taskStatus" key.
// When you add a backend, read this from the server instead.

const STATUS_KEY = "taskStatus";

type Edit = Partial<
  Pick<Task, "title" | "project" | "date" | "time" | "priority">
>;

type Status = {
  done: Record<string, number>;
  deleted: string[];
  edits: Record<string, Edit>;
};

const loadStatus = (): Status => {
  try {
    const saved = JSON.parse(localStorage.getItem(STATUS_KEY) ?? "null");
    if (
      saved &&
      typeof saved.done === "object" &&
      Array.isArray(saved.deleted)
    ) {
      return {
        done: saved.done,
        deleted: saved.deleted,
        edits:
          saved.edits && typeof saved.edits === "object" ? saved.edits : {},
      };
    }
  } catch {
    // storage unavailable or damaged: start empty
  }
  return { done: {}, deleted: [], edits: {} };
};

const Project = () => {
  const storeTasks = useTasks();
  const [status] = useState<Status>(loadStatus);
  // The project that was tapped (its tasks are shown), or null for the list
  const [selected, setSelected] = useState<string | null>(null);
  // Projects you created, and whether the "Create Project" pop-up is open
  const [customProjects, setCustomProjects] =
    useState<ProjectDef[]>(loadCustomProjects);
  const [creating, setCreating] = useState(false);
  const closeCreate = useCallback(() => setCreating(false), []);

  const projects = [...DEFAULT_PROJECTS, ...customProjects];

  const createProject = (project: ProjectDef) => {
    const next = [...customProjects, project];
    setCustomProjects(next);
    saveCustomProjects(next);
    setCreating(false);
  };

  const openProject = (name: string | null) => {
    setSelected(name);
    window.scrollTo({ top: 0 });
  };

  const todayISO = localISO(new Date());

  // Tasks with edits applied, minus deleted ones
  const tasks = storeTasks
    .map((task) => {
      const edit = status.edits[String(task.id)];
      return edit ? { ...task, ...edit } : task;
    })
    .filter((task) => !status.deleted.includes(String(task.id)));

  const isDone = (task: Task) => task.done || String(task.id) in status.done;

  // For each project: how many tasks, how many are completed, how many are
  // still due today, and the percentage (completed out of all its tasks)
  const stats = projects.map((project) => {
    const mine = tasks.filter((task) => task.project === project.name);
    const total = mine.length;
    const completed = mine.filter(isDone).length;
    const dueToday = mine.filter(
      (task) => !isDone(task) && task.date === todayISO,
    ).length;
    const progress = total > 0 ? Math.round((completed / total) * 100) : 0;

    // The short line on the project's own screen: no "due today"
    const basic = `${total} ${total === 1 ? "task" : "tasks"} · ${completed} completed`;

    const todo = mine.filter((task) => !isDone(task)).sort(byDueDate);

    // Finished tasks, the one finished last on top
    const finished = mine
      .filter(isDone)
      .sort(
        (a, b) =>
          (status.done[String(b.id)] ?? 0) - (status.done[String(a.id)] ?? 0),
      );

    const summary = [
      `${total} ${total === 1 ? "task" : "tasks"}`,
      `${completed} completed`,
      ...(dueToday > 0 ? [`${dueToday} due today`] : []),
    ].join(" · ");

    return { ...project, summary, basic, todo, finished, progress };
  });

  const current = stats.find((p) => p.name === selected);

  // A project's own screen: its heading and its To Do tasks
  if (current) {
    return (
      <div className="min-h-dvh bg-[#F1F4F8] pt-4 pr-[max(clamp(12px,4vw,16px),env(safe-area-inset-right))] pb-[max(2rem,env(safe-area-inset-bottom))] pl-[max(clamp(12px,4vw,16px),env(safe-area-inset-left))]">
        {/* Heading card */}
        <div className="mx-auto w-full max-w-md rounded-3xl bg-[#F8FAFC] p-4">
          <div className="rounded-2xl bg-white p-5">
            <button
              type="button"
              onClick={() => openProject(null)}
              className="-mt-2 -ml-1 flex min-h-11 touch-manipulation items-center gap-1 px-1 text-[12px] font-normal text-[#6B7280]"
            >
              <FiChevronLeft size={14} aria-hidden="true" />
              Projects
            </button>
            <h1 className="mt-1 text-[16px] font-medium text-[#111827]">
              {current.name}
            </h1>
            <p className="mt-2 text-[14px] font-normal text-[#6B7280]">
              {current.basic}
            </p>
          </div>
        </div>

        {/* To Do card */}
        <section className="mx-auto mt-8 flex w-full max-w-md flex-col gap-2.5 rounded-3xl bg-white p-4">
          <h2 className="text-[12px] font-normal text-[#6B7280]">
            To Do{" "}
            <span className="text-[12px] font-medium text-[#111827]">
              ({current.todo.length})
            </span>
          </h2>

          {current.todo.length > 0 ? (
            <ul
              aria-label={`${current.name} to do`}
              className="divide-y divide-[#F1EEDF] rounded-2xl bg-[#FFFDF5] px-[clamp(12px,4vw,14px)]"
            >
              {current.todo.map((task) => (
                <ProjectTaskItem
                  key={task.id}
                  task={task}
                  dot={current.color}
                />
              ))}
            </ul>
          ) : (
            <p className="py-10 text-center text-[12px] font-normal text-[#6B7280]">
              No tasks to do in this project.
            </p>
          )}
        </section>

        {/* Completed card */}
        <section className="mx-auto mt-5 flex w-full max-w-md flex-col gap-2.5 rounded-3xl bg-white p-4">
          <h2 className="text-[12px] font-normal text-[#6B7280]">
            Completed{" "}
            <span className="text-[12px] font-medium text-[#111827]">
              ({current.finished.length})
            </span>
          </h2>

          {current.finished.length > 0 ? (
            <ul
              aria-label={`${current.name} completed`}
              className="divide-y divide-[#E1F1E6] rounded-2xl bg-[#F5FFF8] px-[clamp(12px,4vw,14px)]"
            >
              {current.finished.map((task) => (
                <ProjectDoneItem
                  key={task.id}
                  task={task}
                  dot={current.color}
                />
              ))}
            </ul>
          ) : (
            <p className="py-10 text-center text-[12px] font-normal text-[#6B7280]">
              No completed tasks in this project yet.
            </p>
          )}
        </section>
      </div>
    );
  }

  return (
    // The only clamp: side padding shrinks on small screens and stays clear of notches
    // (needs viewport-fit=cover in index.html; the insets are 0 otherwise)
    <div className="min-h-dvh bg-[#F1F4F8] pt-4 pr-[max(clamp(12px,4vw,16px),env(safe-area-inset-right))] pl-[max(clamp(12px,4vw,16px),env(safe-area-inset-left))]">
      {/* Title card */}
      <div className="mx-auto w-full max-w-md rounded-3xl bg-[#F8FAFC] p-4">
        <div className="rounded-2xl bg-white p-5">
          <h1 className="text-[16px] font-medium text-[#111827]">Projects</h1>
          <p className="mt-1 text-[14px] text-[#6B7280]">
            Group your work into focused streams.
          </p>
        </div>
      </div>

      {/* Projects card */}
      <section className="mx-auto mt-4 w-full max-w-md rounded-3xl bg-[#F8FAFC] p-4">
        <ul className="divide-y divide-[#D8E5F3] rounded-xl bg-white px-4">
          {stats.map(({ name, color, summary, progress }) => (
            <li key={name} className="relative py-4">
              {/* Covers the whole row, so tapping anywhere on it opens the project */}
              <button
                type="button"
                onClick={() => openProject(name)}
                aria-label={`Open ${name} project`}
                className="absolute inset-y-0 -inset-x-4 touch-manipulation"
              />
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span
                      className="h-1.5 w-1.5 shrink-0 rounded-full"
                      style={{ backgroundColor: color }}
                    />
                    <h2 className="text-[14px] text-[#111827]">{name}</h2>
                  </div>
                  <p className="mt-2 text-[12px] text-[#6B7280]">{summary}</p>
                </div>

                <MdOutlineKeyboardArrowRight
                  size={20}
                  className="shrink-0 text-[#6B7280]"
                  aria-hidden="true"
                />
              </div>

              {/* Progress bar fills the available width, so it fits any screen */}
              <div className="mt-2 flex items-center gap-4">
                <div
                  role="progressbar"
                  aria-label={`${name} progress`}
                  aria-valuenow={progress}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  className="h-1 flex-1 rounded-full bg-[#F1F4F8]"
                >
                  <div
                    className="h-full rounded-full transition-[width] duration-500 ease-out motion-reduce:transition-none"
                    style={{ width: `${progress}%`, backgroundColor: color }}
                  />
                </div>
                <span className="text-[12px] text-[#6B7280]">{progress}%</span>
              </div>
            </li>
          ))}
        </ul>

        <button
          type="button"
          onClick={() => setCreating(true)}
          className="mt-2.5 flex h-10 w-full touch-manipulation items-center justify-center gap-2 rounded-xl bg-white text-[14px] text-[#1A7431]"
        >
          <GoPlus aria-hidden="true" />
          Create Project
        </button>
      </section>

      {creating && (
        <CreateProjectDialog
          existingNames={projects.map((p) => p.name)}
          onClose={closeCreate}
          onCreate={createProject}
        />
      )}
    </div>
  );
};

export default Project;
