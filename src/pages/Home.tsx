import { useCallback, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { useLocation } from "react-router-dom";
import { CiSearch } from "react-icons/ci";
import { IoIosNotificationsOutline } from "react-icons/io";
import { FiMoreHorizontal, FiEdit2, FiTrash2, FiCheck } from "react-icons/fi";
// Renamed from "baby head.svg": file names with spaces cause problems in builds
import head from "../assets/baby head.svg";
import priority from "../assets/Priority.svg";
import blue from "../assets/blue.svg";
import green from "../assets/Green.svg";
import {
  useTasks,
  refreshTasks,
  updateTaskRemote,
  deleteTaskRemote,
  completeTaskRemote,
} from "../layout/taskStore";
import type { Task } from "../layout/taskStore";
import AddTaskModal from "../layout/AddTaskModal";
import { showToast } from "../layout/Toast";
import type { NewTask } from "../layout/AddTaskModal";
import { authApi } from "../api/client";

type Props = {
  // Optional override for the user's name shown in the greeting
  name?: string;
  // Tasks finished today, and the total planned for today.
  // Leave them out and they are worked out from the tasks themselves.
  completedTasks?: number;
  totalTasks?: number;
};

// Storage keys shared with SignUp and Verify
const FIRST_NAME_KEY = "planora_first_name";
const LAST_NAME_KEY = "planora_last_name";
const FULL_NAME_KEY = "planora_full_name";

const readStored = (key: string): string => {
  try {
    return localStorage.getItem(key)?.trim() ?? "";
  } catch {
    return "";
  }
};

const writeStored = (key: string, value: string) => {
  try {
    if (value) localStorage.setItem(key, value);
  } catch {
    // storage unavailable
  }
};

// The profile picture chosen in Settings is kept in this browser under this key
// (the same one the Settings page saves the profile to)
const PROFILE_KEY = "profileData";

// The picture the person chose in Settings, or "" if they haven't chosen one
const readProfilePhoto = (): string => {
  try {
    const saved = JSON.parse(localStorage.getItem(PROFILE_KEY) ?? "null");
    const photo = saved?.photo;
    return typeof photo === "string" &&
      (photo.startsWith("data:image/") || photo.startsWith("http"))
      ? photo
      : "";
  } catch {
    return "";
  }
};

const formatFullName = (first?: string, last?: string): string =>
  [first?.trim(), last?.trim()].filter(Boolean).join(" ");

// "Good morning", "Good afternoon" or "Good evening" from the device's clock
const getGreeting = () => {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
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

/* ========================================================================== */
/*                          DONE AND DELETED TASKS                            */
/* ========================================================================== */
// Which tasks have been marked done, deleted or edited. For now this is kept in
// this browser, next to the task list. When you add a backend, send "done",
// "delete" and "edit" to it instead.

const STATUS_KEY = "taskStatus";

type Status = {
  done: Record<string, number>; // task id -> when it was marked done
  deleted: string[]; // task ids
  edits: Record<string, NewTask>; // task id -> its details after editing
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

const saveStatus = (status: Status) => {
  try {
    localStorage.setItem(STATUS_KEY, JSON.stringify(status));
  } catch {
    // storage full or blocked: the change just won't survive a refresh
  }
};

// Circular progress ring. The arc grows clockwise from the top as percent rises.
const ProgressRing = ({ percent }: { percent: number }) => {
  const radius = 45; // 45 + half the 10px stroke = 50, so it fits the 100x100 box
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - percent / 100);

  return (
    <div
      role="img"
      aria-label={`${percent}% of your tasks done`}
      // Scales with the screen: ~76px on a 320px phone, up to 112px on large phones
      className="relative h-[clamp(76px,24vw,112px)] w-[clamp(76px,24vw,112px)] shrink-0"
    >
      <svg
        aria-hidden="true"
        viewBox="0 0 100 100"
        className="h-full w-full -rotate-90"
      >
        {/* Track */}
        <circle
          cx="50"
          cy="50"
          r={radius}
          fill="none"
          stroke="#D9E6F2"
          strokeWidth="10"
        />
        {/* Progress arc (skipped at 0% so no stray dot is drawn) */}
        {percent > 0 && (
          <circle
            cx="50"
            cy="50"
            r={radius}
            fill="none"
            stroke="#1A7431"
            strokeWidth="10"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            className="transition-[stroke-dashoffset] duration-500 ease-out motion-reduce:transition-none"
          />
        )}
      </svg>

      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-[clamp(0.875rem,4.4vw,1.125rem)] leading-tight font-medium text-[#111827]">
          {percent}%
        </span>
        <span className="text-[clamp(0.6875rem,3.4vw,0.875rem)] leading-tight font-normal text-[#6B7280]">
          done
        </span>
      </div>
    </div>
  );
};

// The "..." button and the Edit / Delete / Done menu that opens from it
const TaskMenu = ({
  open,
  onToggle,
  onClose,
  onEdit,
  onDelete,
  onDone,
}: {
  open: boolean;
  onToggle: () => void;
  onClose: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onDone: () => void;
}) => {
  const wrapRef = useRef<HTMLDivElement>(null);

  // While open, tapping anywhere outside it, or pressing Escape, closes it
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) onClose();
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open, onClose]);

  const itemClass =
    "flex min-h-11 w-full touch-manipulation items-center gap-3 rounded-xl px-3 text-left text-[14px] font-normal";

  return (
    <div ref={wrapRef} className="relative shrink-0">
      {/* The dots look the same as before. The button is larger than the dots so it's easy to tap. */}
      <button
        type="button"
        onClick={onToggle}
        aria-label="Task options"
        aria-haspopup="menu"
        aria-expanded={open}
        className="-mt-2.5 -mr-2.5 -mb-2.5 flex h-10 w-10 touch-manipulation items-center justify-center text-[#6B7280]"
      >
        <FiMoreHorizontal size={16} aria-hidden="true" />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute top-full right-0 z-20 mt-2 w-40 rounded-2xl bg-white p-1.5 shadow-[0_8px_24px_rgba(17,24,39,0.15)]"
        >
          <button
            type="button"
            role="menuitem"
            onClick={onEdit}
            className={`${itemClass} text-[#1A7431]`}
          >
            <FiEdit2 size={16} aria-hidden="true" />
            Edit
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={onDelete}
            className={`${itemClass} text-[#F43F5E]`}
          >
            <FiTrash2 size={16} aria-hidden="true" />
            Delete
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={onDone}
            className={`${itemClass} text-[#111827]`}
          >
            <FiCheck size={16} aria-hidden="true" />
            Done
          </button>
        </div>
      )}
    </div>
  );
};

// The "Delete Task" pop-up: asks first, then deletes only if "Delete" is pressed
const DeleteTaskDialog = ({
  onCancel,
  onConfirm,
}: {
  onCancel: () => void;
  onConfirm: () => void;
}) => {
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    // Focus starts on Cancel (the safe choice), and goes back afterwards
    const previouslyFocused = document.activeElement as HTMLElement | null;
    cancelRef.current?.focus({ preventScroll: true });

    // Stop the page behind from scrolling while the pop-up is open
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    document.addEventListener("keydown", onKeyDown);

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
      previouslyFocused?.focus({ preventScroll: true });
    };
  }, [onCancel]);

  return (
    // Dark backdrop. Tapping it is the same as Cancel.
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/40 p-4"
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="delete-task-title"
        aria-describedby="delete-task-text"
        className="w-full max-w-sm rounded-3xl bg-white p-5 min-[360px]:p-6"
      >
        <FiTrash2 size={28} aria-hidden="true" className="text-[#F43F5E]" />

        <h2
          id="delete-task-title"
          className="mt-4 text-[1rem] font-medium text-[#111827]"
        >
          Delete Task
        </h2>
        <p
          id="delete-task-text"
          className="mt-2 text-[0.875rem] font-normal text-[#6B7280]"
        >
          This will permanently delete this task and its related data. Once
          deleted, this action cannot be undone.
        </p>

        <div className="mt-6 flex flex-wrap justify-end gap-3">
          <button
            ref={cancelRef}
            type="button"
            onClick={onCancel}
            className="min-h-11 touch-manipulation rounded-xl border border-[#D8E5F3] bg-white px-4 text-[0.875rem] font-normal text-[#6B7280]"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="min-h-11 touch-manipulation rounded-xl bg-[#EF4444] px-5 text-[0.875rem] font-normal text-white"
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  );
};

// Colour of the priority word on a task row (High is yellow, as in the design)
const priorityColors: Record<string, string> = {
  High: "text-[#D9A100]",
  Medium: "text-[#2F80ED]",
  Low: "text-[#EF4444]",
};

// Colour of the dot beside a project name on every task row
const projectColors: Record<string, string> = {
  Work: "bg-[#1A7431]",
  Personal: "bg-[#C84904]",
  Freelance: "bg-[#1890FF]",
};

// One row in the High Priority list. Every task shows here, whether it is
// Low, Medium or High, and the row says which one it is.
const HighPriorityItem = ({ task, menu }: { task: Task; menu: ReactNode }) => (
  <li className="flex items-start gap-3 py-4">
    {/* The empty circle on the left */}
    <span
      aria-hidden="true"
      className="mt-0.5 h-5 w-5 shrink-0 rounded-full border border-[#D5DAE1] bg-white"
    />

    <div className="min-w-0 flex-1">
      <div className="flex items-start justify-between gap-2">
        <p className="min-w-0 text-[14px] leading-snug font-normal break-words text-[#111827]">
          {task.title}
        </p>
        {menu}
      </div>

      <div className="mt-2 flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-[clamp(12px,5vw,22px)]">
          <span className="flex min-w-0 items-center gap-1.5 text-[12px] font-normal text-[#4B5563]">
            <span
              aria-hidden="true"
              className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                projectColors[task.project] ?? "bg-[#1A7431]"
              }`}
            />
            <span className="truncate">{task.project}</span>
          </span>
          <span
            className={`shrink-0 text-[11px] font-normal ${
              priorityColors[task.priority] ?? "text-[#6B7280]"
            }`}
          >
            {task.priority}
          </span>
        </div>

        <span className="shrink-0 text-right text-[12px] font-normal text-[#374151]">
          {getWhenLabel(task)}
        </span>
      </div>
    </div>
  </li>
);

// One row in the Today's Tasks list: the circle sits in the middle of the row,
// the title and the "..." on top, then project, priority and the time
const TodayTaskItem = ({ task, menu }: { task: Task; menu: ReactNode }) => (
  <li className="flex items-center gap-3 py-4">
    {/* The empty circle on the left */}
    <span
      aria-hidden="true"
      className="h-5 w-5 shrink-0 rounded-full border border-[#D5DAE1] bg-white"
    />

    <div className="min-w-0 flex-1">
      <div className="flex items-start justify-between gap-2">
        <p className="min-w-0 text-[14px] leading-snug font-medium break-words text-[#111827]">
          {task.title}
        </p>
        {menu}
      </div>

      <div className="mt-2 flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-[clamp(12px,5vw,22px)]">
          <span className="flex min-w-0 items-center gap-1.5 text-[12px] font-normal text-[#4B5563]">
            <span
              aria-hidden="true"
              className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                projectColors[task.project] ?? "bg-[#1A7431]"
              }`}
            />
            <span className="truncate">{task.project}</span>
          </span>
          <span
            className={`shrink-0 text-[11px] font-normal ${
              priorityColors[task.priority] ?? "text-[#6B7280]"
            }`}
          >
            {task.priority}
          </span>
        </div>

        <span className="shrink-0 text-right text-[12px] font-normal text-[#374151]">
          {getWhenLabel(task)}
        </span>
      </div>
    </div>
  </li>
);

// One row in the Completed list: a filled green tick, the title crossed out,
// the project underneath and "Done" on the right
const CompletedItem = ({ task }: { task: Task }) => (
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

      <span className="mt-2 flex min-w-0 items-center gap-1.5 text-[12px] font-normal text-[#4B5563]">
        <span
          aria-hidden="true"
          className={`h-1.5 w-1.5 shrink-0 rounded-full ${
            projectColors[task.project] ?? "bg-[#1A7431]"
          }`}
        />
        <span className="truncate">{task.project}</span>
      </span>
    </div>
  </li>
);

const Home = ({ name, completedTasks, totalTasks }: Props) => {
  const location = useLocation();
  const routeState = location.state as {
    firstName?: string;
    lastName?: string;
    fullName?: string;
  } | null;

  // Resolve full name from prop, router state, or localStorage
  const initialFullName =
    name?.trim() ||
    routeState?.fullName?.trim() ||
    formatFullName(routeState?.firstName, routeState?.lastName) ||
    readStored(FULL_NAME_KEY) ||
    formatFullName(readStored(FIRST_NAME_KEY), readStored(LAST_NAME_KEY));

  const [displayName, setDisplayName] = useState<string>(initialFullName);

  // The picture chosen in Settings. It also updates if it is changed in
  // another tab of the app.
  const [profilePhoto, setProfilePhoto] = useState<string>(readProfilePhoto);
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === PROFILE_KEY || e.key === null) {
        setProfilePhoto(readProfilePhoto());
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  // Sync with backend profile (/auth/me) so the full name stays accurate across
  // sessions, OAuth sign-ins, or when localStorage was cleared
  useEffect(() => {
    if (name?.trim()) {
      setDisplayName(name.trim());
      return;
    }

    let cancelled = false;
    authApi
      .me()
      .then((res) => {
        if (cancelled) return;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const data = res.data as Record<string, any>;
        const user = data?.user ?? data?.data?.user ?? data;
        const first =
          typeof user?.firstName === "string"
            ? user.firstName
            : typeof user?.first_name === "string"
              ? user.first_name
              : "";
        const last =
          typeof user?.lastName === "string"
            ? user.lastName
            : typeof user?.last_name === "string"
              ? user.last_name
              : "";
        const full =
          typeof user?.fullName === "string" && user.fullName.trim()
            ? user.fullName.trim()
            : typeof user?.name === "string" && user.name.trim()
              ? user.name.trim()
              : formatFullName(first, last);

        if (full) {
          setDisplayName(full);
          writeStored(FULL_NAME_KEY, full);
          if (first) writeStored(FIRST_NAME_KEY, first);
          if (last) writeStored(LAST_NAME_KEY, last);
        }
      })
      .catch(() => {
        // Keep whatever name was already loaded from route state or storage
      });

    return () => {
      cancelled = true;
    };
  }, [name]);

  const storeTasks = useTasks();

  // Load this person's tasks from the backend when the page opens
  useEffect(() => {
    refreshTasks();
  }, []);

  const [status, setStatus] = useState<Status>(loadStatus);
  // The task being edited (its sheet is open)
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  // The task waiting for "are you sure?" before it is deleted
  const [deletingTask, setDeletingTask] = useState<Task | null>(null);
  const closeDelete = useCallback(() => setDeletingTask(null), []);

  // Tasks with any edits applied
  const tasks = storeTasks.map((task) => {
    const edit = status.edits[String(task.id)];
    return edit ? { ...task, ...edit } : task;
  });
  // Which "..." menu is open. Each row has its own id, so only one opens at a time.
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const closeMenu = useCallback(() => setOpenMenu(null), []);

  // Remember done, deleted and edited tasks
  useEffect(() => saveStatus(status), [status]);

  const markDone = (task: Task) => {
    completeTaskRemote(task);
    setStatus((s) => ({
      ...s,
      done: { ...s.done, [String(task.id)]: Date.now() },
    }));
    setOpenMenu(null);
  };

  // Saves the edited details (the sheet shows the "Task Updated" message itself)
  const saveEdit = (task: Task, updated: NewTask) => {
    updateTaskRemote(String(task.id), updated);
    setStatus((s) => ({
      ...s,
      edits: { ...s.edits, [String(task.id)]: updated },
    }));
  };

  const removeTask = (task: Task) => {
    deleteTaskRemote(String(task.id));
    setStatus((s) => ({
      ...s,
      deleted: s.deleted.includes(String(task.id))
        ? s.deleted
        : [...s.deleted, String(task.id)],
    }));
    setOpenMenu(null);
  };

  // The "..." menu for one row. "section" keeps ids apart when the same task
  // is in both the High Priority and Today's lists.
  const renderMenu = (task: Task, section: string) => {
    const id = `${section}-${task.id}`;
    return (
      <TaskMenu
        open={openMenu === id}
        onToggle={() => setOpenMenu(openMenu === id ? null : id)}
        onClose={closeMenu}
        onEdit={() => {
          setOpenMenu(null);
          setEditingTask(task);
        }}
        onDelete={() => {
          setOpenMenu(null);
          setDeletingTask(task);
        }}
        onDone={() => markDone(task)}
      />
    );
  };

  // Tasks that haven't been deleted, and which of them are finished
  const isDone = (task: Task) => task.done || String(task.id) in status.done;
  const visibleTasks = tasks.filter(
    (task) => !status.deleted.includes(String(task.id)),
  );
  const openTasks = visibleTasks.filter((task) => !isDone(task));

  // Every open task (Low, Medium and High) goes in the High Priority list,
  // soonest first
  const highTasks = [...openTasks].sort(byDueDate);

  // Only tasks whose date is today go in Today's Tasks, earliest time first
  const todayISO = localISO(new Date());
  const todayTasks = openTasks
    .filter((task) => task.date === todayISO)
    .sort(byDueDate);

  // Finished tasks, the one finished last on top
  const doneTasks = visibleTasks
    .filter(isDone)
    .sort(
      (a, b) =>
        (status.done[String(b.id)] ?? 0) - (status.done[String(a.id)] ?? 0),
    );

  // Progress across all your tasks: the finished ones out of every task you
  // have (finished and still open). It is worked out only from your saved
  // tasks, not from today's date, so it stays the same after a refresh and
  // after signing out and back in.
  const completed = completedTasks ?? doneTasks.length;
  const total = totalTasks ?? visibleTasks.length;

  // 0 when there are no tasks yet; never below 0 or above 100
  const percent =
    total > 0
      ? Math.min(100, Math.max(0, Math.round((completed / total) * 100)))
      : 0;

  return (
    // min-h-dvh fills the screen even when mobile browser bars show/hide.
    // The max() padding keeps content clear of notches and rounded corners
    // (needs viewport-fit=cover in index.html; the insets are 0 otherwise).
    <div className="min-h-dvh bg-[#F1F4F8] pt-[max(0.5rem,env(safe-area-inset-top))] pr-[max(clamp(12px,4vw,24px),env(safe-area-inset-right))]  pl-[max(clamp(12px,4vw,24px),env(safe-area-inset-left))]">
      {/* Fluid width up to max-w-md, so it fills small phones and stays tidy on big ones */}
      <div className="mx-auto mt-[clamp(8px,3vw,16px)] min-h-58 w-full max-w-md rounded-3xl bg-[#F8FAFC] p-[clamp(12px,4vw,16px)]">
        {/* flex is what makes the gap work and puts the icons on the right */}
        <div className="flex items-center justify-between gap-2.5">
          {profilePhoto ? (
            // The picture chosen in Settings, as a round photo
            <img
              src={profilePhoto}
              alt=""
              className="h-[clamp(32px,10vw,40px)] w-[clamp(32px,10vw,40px)] shrink-0 rounded-full bg-white object-cover"
            />
          ) : (
            <img
              src={head}
              alt=""
              className="h-[clamp(32px,10vw,40px)] w-auto shrink-0"
            />
          )}

          <div className="flex items-center gap-[clamp(4px,2vw,10px)]">
            <button
              type="button"
              aria-label="Search"
              className="flex h-11 w-11 touch-manipulation items-center justify-center text-[#111827]"
            >
              <CiSearch
                size={24}
                className="h-8 w-8 rounded-full bg-white p-2"
              />
            </button>

            <button
              type="button"
              aria-label="Notifications"
              className="flex h-11 w-11 touch-manipulation items-center justify-center text-[#111827]"
            >
              <IoIosNotificationsOutline
                size={24}
                className="h-8 w-8 rounded-full bg-white p-2"
              />
            </button>
          </div>
        </div>

        {/* Greeting + today's progress */}
        <div className="mt-[clamp(12px,4vw,16px)] flex items-center justify-between gap-[clamp(8px,3vw,16px)] rounded-2xl bg-white px-[clamp(12px,4vw,16px)] py-[clamp(16px,5vw,24px)]">
          <div className="flex min-w-0 flex-col gap-[clamp(8px,3vw,16px)]">
            <h1 className="text-[clamp(1rem,4.8vw,1.25rem)] leading-[1.45] font-semibold break-words text-[#111827]">
              {getGreeting()}
              {displayName ? `, ${displayName}` : ""}{" "}
              <span role="img" aria-label="waving hand">
                👋
              </span>
            </h1>

            <p className="text-[clamp(0.8125rem,3.6vw,0.9375rem)] font-normal text-[#6B7280]">
              <span className="text-[clamp(0.9375rem,4.2vw,1.125rem)] font-medium text-[#111827]">
                {completed}
              </span>{" "}
              of {total} {total === 1 ? "task" : "tasks"} completed
            </p>
          </div>

          <ProgressRing percent={percent} />
        </div>
      </div>

      <div className="mx-auto flex min-h-68.5 w-full max-w-md flex-col gap-2.5 rounded-3xl bg-[#FFFFFF] p-[clamp(12px,4vw,16px)] mt-8">
        <h4 className="text-[12px] font-normal text-[#6B7280]">
          High Priority{" "}
          <span className="text-[12px] font-medium text-[#111827]">
            {" "}
            ({highTasks.length}){" "}
          </span>
        </h4>

        {highTasks.length > 0 ? (
          // All tasks (Low, Medium, High), on a soft yellow card
          <ul
            aria-label="High priority tasks"
            className="mt-2 divide-y divide-[#F1EEDF] rounded-2xl bg-[#FFFDF5] px-[clamp(12px,4vw,14px)]"
          >
            {highTasks.map((task) => (
              <HighPriorityItem
                key={task.id}
                task={task}
                menu={renderMenu(task, "high")}
              />
            ))}
          </ul>
        ) : (
          <>
            <img
              src={priority}
              alt=""
              className="h-25.75 w-25.75 flex mx-auto mt-6"
            />

            <div className="flex flex-col mx-auto items-center justify-center">
              <h2 className="font-medium text-[#111827] text-[12px]">
                No High Priority Tasks
              </h2>
              <p className="font-normal text-[#6B7280] text-[12px] w-68.5 text-center mt-1">
                You currently have no urgent tasks requiring immediate
                attention.
              </p>
            </div>
          </>
        )}
      </div>

      <div className="mx-auto flex min-h-68.5 w-full max-w-md flex-col gap-2.5 rounded-3xl bg-[#FFFFFF] p-[clamp(12px,4vw,16px)] mt-8">
        <h4 className="text-[12px] font-normal text-[#6B7280]">
          Today's Tasks{" "}
          <span className="text-[12px] font-medium text-[#111827]">
            {" "}
            ({todayTasks.length}){" "}
          </span>
        </h4>

        {todayTasks.length > 0 ? (
          // Tasks dated today, on a light card with a divider between rows
          <ul
            aria-label="Today's tasks"
            className="mt-2 divide-y divide-[#EEF1F5] rounded-2xl bg-[#F8FAFC] px-[clamp(12px,4vw,14px)]"
          >
            {todayTasks.map((task) => (
              <TodayTaskItem
                key={task.id}
                task={task}
                menu={renderMenu(task, "today")}
              />
            ))}
          </ul>
        ) : (
          <>
            <img
              src={blue}
              alt=""
              className="h-25.75 w-25.75 flex mx-auto mt-6"
            />

            <div className="flex flex-col mx-auto items-center justify-center">
              <h2 className="font-medium text-[#111827] text-[12px]">
                No Tasks Available
              </h2>
              <p className="font-normal text-[#6B7280] text-[12px] w-68.5 text-center mt-1">
                Your workspace is empty. Create a task to get started.
              </p>
            </div>
          </>
        )}
      </div>

      <div className="mx-auto flex min-h-68.5 w-full max-w-md flex-col gap-2.5 rounded-3xl bg-[#FFFFFF] p-[clamp(12px,4vw,16px)] mt-8">
        <h4 className="text-[12px] font-normal text-[#6B7280]">
          Completed
          <span className="text-[12px] font-medium text-[#111827]">
            {" "}
            ({doneTasks.length}){" "}
          </span>
        </h4>

        {doneTasks.length > 0 ? (
          // Tasks marked Done, on a soft green card
          <ul
            aria-label="Completed tasks"
            className="mt-2 divide-y divide-[#E1F1E6] rounded-2xl bg-[#F5FFF8] px-[clamp(12px,4vw,14px)]"
          >
            {doneTasks.map((task) => (
              <CompletedItem key={task.id} task={task} />
            ))}
          </ul>
        ) : (
          <>
            <img
              src={green}
              alt=""
              className="h-25.75 w-25.75 flex mx-auto mt-6"
            />

            <div className="flex flex-col mx-auto items-center justify-center">
              <h2 className="font-medium text-[#111827] text-[12px]">
                No Completed Tasks Yet
              </h2>
              <p className="font-normal text-[#6B7280] text-[12px] w-68.5 text-center mt-1">
                Completed tasks will appear here.
              </p>
            </div>
          </>
        )}
      </div>

      {/* The "are you sure?" pop-up. Only "Delete" really deletes. */}
      {deletingTask && (
        <DeleteTaskDialog
          onCancel={closeDelete}
          onConfirm={() => {
            removeTask(deletingTask);
            setDeletingTask(null);
            showToast("Task Deleted", "Task has been deleted successfully.");
          }}
        />
      )}

      {/* The Edit Task sheet, filled in with the task */}
      {editingTask && (
        <AddTaskModal
          initial={{
            title: editingTask.title,
            project: editingTask.project,
            date: editingTask.date,
            time: editingTask.time ?? "",
            priority: editingTask.priority,
          }}
          onClose={() => setEditingTask(null)}
          onSubmit={(updated) => saveEdit(editingTask, updated)}
        />
      )}
    </div>
  );
};

export default Home;
