import { useCallback, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { FiMoreHorizontal, FiEdit2, FiTrash2, FiCheck } from "react-icons/fi";
import box from "../assets/inbox.svg";
import {
  useTasks,
  refreshTasks,
  updateTaskRemote,
  deleteTaskRemote,
} from "../layout/taskStore";
import type { Task } from "../layout/taskStore";
import AddTaskModal from "../layout/AddTaskModal";
import type { NewTask } from "../layout/AddTaskModal";
import { showToast } from "../layout/Toast";

const tabs = ["All", "Today", "Upcoming", "Priority", "Completed"] as const;
type Tab = (typeof tabs)[number];

/* ========================================================================== */
/*                         REMEMBER THE TAB ON REFRESH                        */
/* ========================================================================== */
// The tab you are on is saved in this browser, so refreshing the page keeps
// you on the same tab instead of jumping back to "All".

const TAB_KEY = "inboxActiveTab";

// Reads the last tab from storage; falls back to "All" if missing or invalid
const loadTab = (): Tab => {
  try {
    const saved = localStorage.getItem(TAB_KEY);
    if (saved && (tabs as readonly string[]).includes(saved)) {
      return saved as Tab;
    }
  } catch {
    // storage unavailable: use the default
  }
  return "All";
};

const saveTab = (tab: Tab) => {
  try {
    localStorage.setItem(TAB_KEY, tab);
  } catch {
    // storage full or blocked: the tab just won't survive a refresh
  }
};

/* ========================================================================== */
/*                               DATE HELPERS                                 */
/* ========================================================================== */

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

// "Sunday, May 10"
const getDayHeading = (date: string) =>
  new Date(`${date}T00:00`).toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

// Groups tasks (already sorted by date) under their dates, in order
const groupByDate = (list: Task[]) => {
  const groups: { date: string; tasks: Task[] }[] = [];
  for (const task of list) {
    const last = groups[groups.length - 1];
    if (last && last.date === task.date) last.tasks.push(task);
    else groups.push({ date: task.date, tasks: [task] });
  }
  return groups;
};

// "April" (the year is added only when it is not this year, e.g. "April 2025")
const getMonthHeading = (date: string) => {
  const d = new Date(`${date}T00:00`);
  const month = d.toLocaleDateString(undefined, { month: "long" });
  return d.getFullYear() === new Date().getFullYear()
    ? month
    : `${month} ${d.getFullYear()}`;
};

// Groups tasks (already sorted by date) under their months, in order
const groupByMonth = (list: Task[]) => {
  const groups: { key: string; tasks: Task[] }[] = [];
  for (const task of list) {
    const key = task.date.slice(0, 7); // YYYY-MM
    const last = groups[groups.length - 1];
    if (last && last.key === key) last.tasks.push(task);
    else groups.push({ key, tasks: [task] });
  }
  return groups;
};

/* ========================================================================== */
/*                     TASKS DONE, DELETED OR EDITED ON HOME                  */
/* ========================================================================== */
// Home keeps these in this browser under the "taskStatus" key. The Inbox reads
// the same key so a task deleted or finished on Home does not show up here.
// When you add a backend, both pages should read this from the server instead.

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

const saveStatus = (status: Status) => {
  try {
    localStorage.setItem(STATUS_KEY, JSON.stringify(status));
  } catch {
    // storage full or blocked: the change just won't survive a refresh
  }
};

/* ========================================================================== */
/*                                   ROWS                                     */
/* ========================================================================== */

// Colour of the priority word on a task row
const priorityColors: Record<string, string> = {
  High: "text-[#D9A100]",
  Medium: "text-[#8B5CF6]",
  Low: "text-[#EF4444]",
};

// Colour of the dot beside a project name
const projectColors: Record<string, string> = {
  Work: "bg-[#1A7431]",
  Personal: "bg-[#C84904]",
  Freelance: "bg-[#1890FF]",
};

// The "..." button and the Edit / Delete menu that opens from it. The menu is
// positioned on the screen (not inside the list), so the scrolling list never
// cuts it off. It opens upward when there is no room below.
const TaskMenu = ({
  open,
  onToggle,
  onClose,
  onEdit,
  onDelete,
}: {
  open: boolean;
  onToggle: () => void;
  onClose: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) => {
  const wrapRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [pos, setPos] = useState<{
    top?: number;
    bottom?: number;
    right: number;
  }>({ right: 0 });

  // Works out where the menu goes each time it opens
  useEffect(() => {
    if (!open || !buttonRef.current) return;
    const rect = buttonRef.current.getBoundingClientRect();
    const right = Math.max(8, window.innerWidth - rect.right);
    if (window.innerHeight - rect.bottom < 120) {
      setPos({ bottom: window.innerHeight - rect.top + 4, right });
    } else {
      setPos({ top: rect.bottom + 4, right });
    }
  }, [open]);

  // While open, tapping outside, scrolling, or pressing Escape closes it
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
    window.addEventListener("scroll", onClose, true);
    window.addEventListener("resize", onClose);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("scroll", onClose, true);
      window.removeEventListener("resize", onClose);
    };
  }, [open, onClose]);

  const itemClass =
    "flex min-h-11 w-full touch-manipulation items-center gap-3 rounded-xl px-3 text-left text-[14px] font-normal";

  return (
    <div ref={wrapRef} className="shrink-0">
      {/* The button is larger than the dots so it's easy to tap */}
      <button
        ref={buttonRef}
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
          style={pos}
          className="fixed z-30 w-40 rounded-2xl bg-white p-1.5 shadow-[0_8px_24px_rgba(17,24,39,0.15)]"
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

// One task row, as in the design: empty circle, title and "..." on top, then
// project, priority and the time
const InboxItem = ({
  task,
  menu,
  timeOnly = false,
}: {
  task: Task;
  menu: ReactNode;
  // Under a date heading, only the time is needed on the right
  timeOnly?: boolean;
}) => (
  <li className="flex items-center gap-3 py-4">
    {/* The empty circle on the left */}
    <span
      aria-hidden="true"
      className="h-5 w-5 shrink-0 rounded-full border border-[#D5DAE1] bg-[#F8FAFC]"
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
          <span className="flex min-w-0 items-center gap-1.5 text-[12px] font-normal text-[#5F6F65]">
            <span
              aria-hidden="true"
              className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                projectColors[task.project] ?? "bg-[#1A7431]"
              }`}
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
          {timeOnly
            ? task.time
              ? to12h(task.time)
              : "All day"
            : getWhenLabel(task)}
        </span>
      </div>
    </div>
  </li>
);

// One row in the Completed tab: a filled green tick, the title crossed out,
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

      <span className="mt-2 flex min-w-0 items-center gap-1.5 text-[12px] font-normal text-[#5F6F65]">
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

/* ========================================================================== */
/*                                   PAGE                                     */
/* ========================================================================== */

const Inbox = () => {
  // Starts on the tab you were last on (saved below), or "All" the first time
  const [activeTab, setActiveTab] = useState<Tab>(loadTab);
  const storeTasks = useTasks();

  // Load this person's tasks from the backend when the page opens
  useEffect(() => {
    refreshTasks();
  }, []);
  const [status, setStatus] = useState<Status>(loadStatus);
  // Which "..." menu is open (one at a time)
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const closeMenu = useCallback(() => setOpenMenu(null), []);
  // The task being edited (its sheet is open)
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  // The task waiting for "are you sure?" before it is deleted
  const [deletingTask, setDeletingTask] = useState<Task | null>(null);
  const closeDelete = useCallback(() => setDeletingTask(null), []);

  // Remember edits and deletions (Home reads the same record)
  useEffect(() => saveStatus(status), [status]);

  // Remember the current tab so a refresh keeps you on it
  useEffect(() => saveTab(activeTab), [activeTab]);

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
  };

  const renderMenu = (task: Task) => {
    const id = String(task.id);
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
      />
    );
  };

  // Tasks with Home's edits applied, minus deleted ones
  const liveTasks = storeTasks
    .map((task) => {
      const edit = status.edits[String(task.id)];
      return edit ? { ...task, ...edit } : task;
    })
    .filter((task) => !status.deleted.includes(String(task.id)));

  const isDone = (task: Task) => task.done || String(task.id) in status.done;

  // Tasks still to do, soonest first
  const openTasks = liveTasks.filter((task) => !isDone(task)).sort(byDueDate);

  // Finished tasks, grouped by month, earliest month first
  const doneTasks = liveTasks.filter(isDone).sort(byDueDate);

  const todayISO = localISO(new Date());

  // What each tab shows
  const visibleTasks = (
    activeTab === "Completed" ? doneTasks : openTasks
  ).filter((task) => {
    switch (activeTab) {
      case "Today":
        return task.date === todayISO;
      case "Upcoming":
        return task.date > todayISO;
      case "Priority":
        return task.priority === "High";
      default:
        return true;
    }
  });

  return (
    // pb leaves room for the bottom navigation bar and the phone's home bar
    <div className="min-h-dvh bg-[#F1F4F8] pt-[max(1rem,env(safe-area-inset-top))] pr-[max(clamp(12px,4vw,16px),env(safe-area-inset-right))] pb-[max(8rem,calc(env(safe-area-inset-bottom)+6rem))] pl-[max(clamp(12px,4vw,16px),env(safe-area-inset-left))]">
      {/* Title card */}
      <div className="mx-auto w-full max-w-md rounded-3xl bg-[#F8FAFC] p-[clamp(12px,4vw,16px)]">
        <div className="rounded-2xl bg-white p-[clamp(16px,5vw,20px)]">
          <h1 className="text-[16px] font-medium text-[#111827]">Inbox</h1>
          <p className="mt-1 text-[14px] font-normal text-[#6B7280]">
            Capture everything. Sort it later.
          </p>
        </div>
      </div>

      {/* Tabs + task list card */}
      <section className="mx-auto mt-4 w-full max-w-md rounded-3xl bg-[#F8FAFC] p-[clamp(12px,4vw,16px)]">
        <div
          role="group"
          aria-label="Filter tasks"
          className="flex h-10 items-center justify-between gap-0.5 overflow-x-auto rounded-xl bg-white p-1 text-[14px] text-[#6B7280] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {tabs.map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setActiveTab(tab)}
              aria-pressed={activeTab === tab}
              className={`h-8 shrink-0 touch-manipulation rounded-lg px-[clamp(8px,2.2vw,12px)] whitespace-nowrap ${
                activeTab === tab ? "bg-[#F1F4F8] text-[#111827]" : ""
              }`}
            >
              {tab}
            </button>
          ))}
        </div>

        {visibleTasks.length > 0 ? (
          // The list scrolls inside the card, like the design
          <div className="mt-4 max-h-[clamp(26rem,62dvh,40rem)] overflow-y-auto overscroll-contain rounded-xl bg-white px-[clamp(12px,4vw,16px)]">
            {activeTab === "Upcoming" ? (
              // Every upcoming task sits under its own date
              groupByDate(visibleTasks).map((group) => (
                <section
                  key={group.date}
                  aria-label={getDayHeading(group.date)}
                  className="pt-4 first:pt-4"
                >
                  <h2 className="text-[12px] font-normal text-[#6B7280]">
                    {getDayHeading(group.date)}{" "}
                    <span className="text-[12px] font-medium text-[#111827]">
                      ({group.tasks.length})
                    </span>
                  </h2>
                  <ul className="divide-y divide-[#EEF1F5]">
                    {group.tasks.map((task) => (
                      <InboxItem
                        key={task.id}
                        task={task}
                        menu={renderMenu(task)}
                        timeOnly
                      />
                    ))}
                  </ul>
                </section>
              ))
            ) : activeTab === "Completed" ? (
              // Finished tasks, each under the month it was planned for
              groupByMonth(visibleTasks).map((group) => (
                <section
                  key={group.key}
                  aria-label={getMonthHeading(`${group.key}-01`)}
                  className="pt-4"
                >
                  <h2 className="text-[12px] font-normal text-[#6B7280]">
                    {getMonthHeading(`${group.key}-01`)}{" "}
                    <span className="text-[12px] font-medium text-[#111827]">
                      ({group.tasks.length})
                    </span>
                  </h2>
                  <ul className="divide-y divide-[#EEF1F5]">
                    {group.tasks.map((task) => (
                      <CompletedItem key={task.id} task={task} />
                    ))}
                  </ul>
                </section>
              ))
            ) : (
              <ul
                aria-label={`${activeTab} tasks`}
                className="divide-y divide-[#EEF1F5]"
              >
                {visibleTasks.map((task) => (
                  <InboxItem
                    key={task.id}
                    task={task}
                    menu={renderMenu(task)}
                  />
                ))}
              </ul>
            )}
          </div>
        ) : (
          <div className="mt-4 flex min-h-107 flex-col items-center justify-center gap-4 rounded-xl bg-white px-4 text-center">
            <img src={box} alt="" />

            <div className="flex flex-col items-center gap-1.25">
              <h3 className="text-[12px] font-medium text-[#111827]">
                {activeTab === "Completed"
                  ? "No completed tasks yet"
                  : "No active tasks"}
              </h3>
              <p className="max-w-44 text-[12px] text-[#6B7280]">
                {activeTab === "Completed"
                  ? "Completed tasks will appear here."
                  : "Create your first task and build a more productive workflow."}
              </p>
            </div>
          </div>
        )}
      </section>

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

export default Inbox;
