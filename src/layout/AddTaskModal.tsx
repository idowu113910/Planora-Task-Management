import { useEffect, useRef, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import { addTask } from "../layout/taskStore";
import { showToast } from "./Toast";
import {
  FiX,
  FiHash,
  FiCalendar,
  FiClock,
  FiFlag,
  FiPlus,
} from "react-icons/fi";

// What the form hands back when "Add Task" (or "Save changes") is pressed
export type NewTask = {
  title: string;
  project: string;
  date: string; // YYYY-MM-DD, in the user's own time zone
  time: string; // HH:MM, or "" if none was chosen
  priority: string;
};

const DEFAULT_PROJECTS = ["Work", "Personal", "Freelance"];

// Projects made on the Projects page are kept in this browser under this key
// (the same one that page uses). When you add a backend, load them from there.
const PROJECTS_KEY = "planora-projects";

// Work, Personal and Freelance, then any project the person has created
const loadProjectNames = (): string[] => {
  const names = [...DEFAULT_PROJECTS];
  try {
    const saved: unknown = JSON.parse(
      localStorage.getItem(PROJECTS_KEY) ?? "[]",
    );
    if (Array.isArray(saved)) {
      for (const p of saved) {
        if (p && typeof p.name === "string" && !names.includes(p.name)) {
          names.push(p.name);
        }
      }
    }
  } catch {
    // storage unavailable or damaged: just the three default projects
  }
  return names;
};
const days = ["Today", "Tomorrow"];
const priorities = ["Low", "Medium", "High"];

// The slide animation, as in your prototype: 300ms, ease out
const SLIDE_MS = 300;
const SLIDE_EASING = "ease-out";

// A date as YYYY-MM-DD in the user's own time zone (not UTC)
const localISO = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;

// "Today" or "Tomorrow" if the date is one of those, otherwise null
const dayOf = (iso: string): string | null => {
  const now = new Date();
  if (iso === localISO(now)) return "Today";
  const tomorrow = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate() + 1,
  );
  return iso === localISO(tomorrow) ? "Tomorrow" : null;
};

// "23:35" becomes "11:35 PM", for showing a saved time in the time box
const to12h = (time: string): string => {
  const [h, m] = time.split(":").map(Number);
  return `${String(h % 12 || 12).padStart(2, "0")}:${String(m).padStart(2, "0")} ${
    h >= 12 ? "PM" : "AM"
  }`;
};

// The time box. The text is 16px so phones don't zoom in when tapped.
const timeClass =
  "h-11 w-full min-w-0 rounded-xl border border-[#D8E5F3] bg-[#F8FAFC] px-3 pr-10 text-[16px] text-[#111827] outline-none placeholder:text-[#C6CCD3] focus:border-[#1A7431]";

// A heading (icon + the chosen value) above a row of choices
const OptionGroup = ({
  name,
  icon,
  heading,
  options,
  value,
  onChange,
}: {
  name: string;
  icon: ReactNode;
  heading: string;
  options: string[];
  value: string | null;
  onChange: (option: string) => void;
}) => (
  <div>
    <p className="flex items-center gap-2 text-[0.75rem] text-[#6B7280]">
      {icon}
      {heading}
    </p>

    <div
      role="radiogroup"
      aria-label={name}
      className="mt-2 flex flex-wrap gap-2"
    >
      {options.map((option) => (
        <button
          key={option}
          type="button"
          role="radio"
          aria-checked={value === option}
          onClick={() => onChange(option)}
          className={`min-h-9 touch-manipulation rounded-lg px-3 text-[0.875rem] ${
            value === option
              ? "bg-[#F1F4F8] font-medium text-[#111827]"
              : "text-[#6B7280]"
          }`}
        >
          {option}
        </button>
      ))}
    </div>
  </div>
);

/* ========================================================================== */
/*                               DATE PICKER                                  */
/* ========================================================================== */
// A day / month / year list picker (instead of the browser's own calendar),
// matching the design. The chosen item sits at the bottom of each list.

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

// The years the picker offers. Change these two numbers to widen or shift the range.
const FIRST_YEAR = 2021;
const LAST_YEAR = 2026;

const pad2 = (n: number) => String(n).padStart(2, "0");
// month is 0-11
const daysInMonth = (year: number, month: number) =>
  new Date(year, month + 1, 0).getDate();

/* ========================================================================== */
/*                               TYPING THE TIME                              */
/* ========================================================================== */
// The person types digits and A or P. This adds the colon and the AM/PM for
// them, and keeps the time valid on a 12-hour clock (01-12 : 00-59).
//   "1135a" becomes "11:35 AM"      "3" becomes "03:"

const TIME_PATTERN = /^(0[1-9]|1[0-2]):[0-5]\d (AM|PM)$/;

const formatTime = (raw: string, previous: string): string => {
  // Backspacing shouldn't re-add the colon or the AM/PM it just removed
  const deleting = raw.length < previous.length;

  // Digits, accepted one at a time
  let digits = "";
  for (const ch of raw.replace(/\D/g, "")) {
    if (digits.length === 4) break;
    if (digits.length === 0) {
      // 0 or 1 starts the hour; 2-9 means 02-09
      digits = ch === "0" || ch === "1" ? ch : `0${ch}`;
    } else if (digits.length === 1) {
      // 01-09 or 10-12
      if (digits === "0" ? ch !== "0" : Number(ch) <= 2) digits += ch;
    } else if (digits.length === 2) {
      // minutes start 0-5; 6-9 means 06-09
      digits += Number(ch) <= 5 ? ch : `0${ch}`;
    } else {
      digits += ch;
    }
  }

  // The last A or P typed decides AM or PM (only once the full time is in)
  const letters = raw.match(/[ap]/gi);
  let meridiem = "";
  if (digits.length === 4 && letters) {
    meridiem = `${letters[letters.length - 1].toUpperCase()}M`;
  }
  if (deleting && !/[ap]m/i.test(raw)) meridiem = "";

  let out = digits.slice(0, 2);
  if (digits.length > 2) out += `:${digits.slice(2)}`;
  else if (digits.length === 2 && !deleting) out += ":";
  if (meridiem) out += ` ${meridiem}`;
  return out;
};

// "11:35 PM" becomes "23:35", or "" if the time isn't complete
const to24h = (time: string): string => {
  if (!TIME_PATTERN.test(time)) return "";
  const hour = Number(time.slice(0, 2)) % 12;
  const pm = time.endsWith("PM");
  return `${pad2(hour + (pm ? 12 : 0))}:${time.slice(3, 5)}`;
};

type WheelItem = { value: number; text: string; disabled: boolean };

// One scrollable list (days, months or years)
const WheelColumn = ({
  label,
  items,
  selected,
  onPick,
}: {
  label: string;
  items: WheelItem[];
  selected: number;
  onPick: (value: number) => void;
}) => {
  const listRef = useRef<HTMLDivElement>(null);

  // When the picker opens, show the chosen item at the bottom of the list
  useEffect(() => {
    const list = listRef.current;
    const chosen = list?.querySelector<HTMLElement>('[aria-selected="true"]');
    if (list && chosen) {
      list.scrollTop =
        chosen.offsetTop - list.clientHeight + chosen.offsetHeight;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      ref={listRef}
      role="listbox"
      aria-label={label}
      className="relative flex max-h-56 flex-col gap-0.5 overflow-y-auto overscroll-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      {items.map((item) => (
        <button
          key={item.value}
          type="button"
          role="option"
          aria-selected={item.value === selected}
          disabled={item.disabled}
          onClick={() => onPick(item.value)}
          className={`h-9 shrink-0 touch-manipulation rounded-lg px-3 text-left text-[0.875rem] disabled:cursor-not-allowed disabled:opacity-40 ${
            item.value === selected
              ? "bg-[#F1F4F8] font-medium text-[#111827]"
              : "text-[#6B7280]"
          }`}
        >
          {item.text}
        </button>
      ))}
    </div>
  );
};

// The pop-up card with the three lists
const DatePickerPanel = ({
  value,
  today,
  onPick,
}: {
  value: string; // YYYY-MM-DD, or "" if nothing is chosen yet
  today: Date;
  onPick: (iso: string) => void;
}) => {
  const todayStart = new Date(
    today.getFullYear(),
    today.getMonth(),
    today.getDate(),
  );

  // Until a date is chosen, the lists start on today (kept inside the year range)
  const [year, month1, day] = value
    ? value.split("-").map(Number)
    : [
        Math.min(Math.max(todayStart.getFullYear(), FIRST_YEAR), LAST_YEAR),
        todayStart.getMonth() + 1,
        todayStart.getDate(),
      ];
  const month = month1 - 1;

  // Picks a date, keeping it valid (e.g. 31 becomes 30 in a 30-day month)
  const commit = (y: number, m: number, d: number) => {
    const next = new Date(y, m, Math.min(d, daysInMonth(y, m)));
    onPick(
      `${next.getFullYear()}-${pad2(next.getMonth() + 1)}-${pad2(next.getDate())}`,
    );
  };

  const dayItems: WheelItem[] = Array.from(
    { length: daysInMonth(year, month) },
    (_, i) => ({
      value: i + 1,
      text: String(i + 1),
      disabled: false,
    }),
  );
  const monthItems: WheelItem[] = MONTHS.map((name, i) => ({
    value: i,
    text: name,
    disabled: false,
  }));
  const yearItems: WheelItem[] = Array.from(
    { length: LAST_YEAR - FIRST_YEAR + 1 },
    (_, i) => {
      const y = FIRST_YEAR + i;
      return { value: y, text: String(y), disabled: false };
    },
  );

  return (
    <div
      role="dialog"
      aria-label="Choose a date"
      className="absolute inset-x-0 top-full z-10 mt-2 grid grid-cols-3 gap-2 rounded-2xl border border-[#EEF2F7] bg-white p-3 shadow-[0_8px_24px_rgba(17,24,39,0.12)]"
    >
      <WheelColumn
        label="Day"
        items={dayItems}
        selected={day}
        onPick={(d) => commit(year, month, d)}
      />
      <WheelColumn
        label="Month"
        items={monthItems}
        selected={month}
        onPick={(m) => commit(year, m, day)}
      />
      <WheelColumn
        label="Year"
        items={yearItems}
        selected={year}
        onPick={(y) => commit(y, month, day)}
      />
    </div>
  );
};

// The "new task" sheet. It slides up from the bottom and fills the full width of the screen.
const AddTaskModal = ({
  onClose,
  onSubmit,
  initial,
}: {
  // Called after the sheet has finished sliding away
  onClose: () => void;
  onSubmit?: (task: NewTask) => void;
  // Give it a task and the sheet becomes the "Edit Task" sheet, filled in with it
  initial?: NewTask;
}) => {
  const editing = initial !== undefined;

  // The project choices: the three defaults plus the ones that were created.
  // A task being edited keeps its own project even if that one is gone.
  const [projects] = useState<string[]>(() => {
    const names = loadProjectNames();
    if (initial?.project && !names.includes(initial.project)) {
      names.push(initial.project);
    }
    return names;
  });

  const [title, setTitle] = useState(initial?.title ?? "");
  const [date, setDate] = useState(initial?.date ?? "");
  const [time, setTime] = useState(initial?.time ? to12h(initial.time) : "");
  const [project, setProject] = useState(initial?.project ?? "Work");
  const [when, setWhen] = useState<string | null>(
    initial ? dayOf(initial.date) : "Today",
  );
  const [priority, setPriority] = useState(initial?.priority ?? "High");

  const [pickingDate, setPickingDate] = useState(false);

  const backdropRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const dateRowRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLTextAreaElement>(null);
  const closing = useRef(false);

  const today = new Date();
  const tomorrow = new Date(
    today.getFullYear(),
    today.getMonth(),
    today.getDate() + 1,
  );

  // Slide the sheet down off the screen, then tell the page it's gone
  const close = () => {
    if (closing.current) return;
    closing.current = true;

    const panel = panelRef.current;
    const backdrop = backdropRef.current;
    if (!panel || !backdrop || !panel.animate) {
      onClose();
      return;
    }

    // "forwards" keeps the sheet off-screen until the page removes it
    const options = {
      duration: SLIDE_MS,
      easing: SLIDE_EASING,
      fill: "forwards" as const,
    };
    backdrop.animate([{ opacity: 1 }, { opacity: 0 }], options);
    panel.animate(
      [{ transform: "translateY(0)" }, { transform: "translateY(100%)" }],
      options,
    ).onfinish = onClose;
  };

  useEffect(() => {
    // Slide in from the bottom. This runs the moment the sheet appears, so the
    // sheet is never drawn in its final position first and can't just pop in.
    const options = { duration: SLIDE_MS, easing: SLIDE_EASING };
    backdropRef.current?.animate?.([{ opacity: 0 }, { opacity: 1 }], options);
    panelRef.current?.animate?.(
      [{ transform: "translateY(100%)" }, { transform: "translateY(0)" }],
      options,
    );

    // Move focus into the sheet, and give it back to the + button afterwards.
    // preventScroll matters: without it the browser scrolls the screen to
    // bring the still-off-screen sheet into view, which cancels the slide-in.
    const previouslyFocused = document.activeElement as HTMLElement | null;
    panelRef.current?.focus({ preventScroll: true });

    // Stop the page behind from scrolling while the sheet is open
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("keydown", onKeyDown);

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
      previouslyFocused?.focus({ preventScroll: true });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // When editing, make the text box tall enough for the saved title
  useEffect(() => {
    const box = titleRef.current;
    if (box && initial) {
      box.style.height = "auto";
      box.style.height = `${box.scrollHeight + 2}px`;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // While the date picker is open, tapping anywhere outside it closes it
  useEffect(() => {
    if (!pickingDate) return;
    const onPointerDown = (e: PointerEvent) => {
      if (!dateRowRef.current?.contains(e.target as Node))
        setPickingDate(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [pickingDate]);

  // Picking Today/Tomorrow clears a hand-picked date, and the other way round
  const pickDay = (option: string) => {
    setWhen(option);
    setDate("");
  };
  const pickDate = (value: string) => {
    setDate(value);
    setWhen(value ? null : "Today");
  };

  const dateLabel = date ? date.split("-").reverse().join("/") : "";

  // Something is typed in the time box but it isn't a full time yet
  const timeIncomplete = time !== "" && !TIME_PATTERN.test(time);

  const dayHeading =
    when ??
    (date
      ? new Date(`${date}T00:00`).toLocaleDateString(undefined, {
          day: "numeric",
          month: "short",
        })
      : "Today");

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (title.trim() === "" || timeIncomplete) return;

    const task: NewTask = {
      title: title.trim(),
      project,
      date: date || localISO(when === "Tomorrow" ? tomorrow : today),
      time: to24h(time),
      priority,
    };

    if (editing) {
      // The page that opened the sheet saves the changes
      onSubmit?.(task);
      showToast("Task Updated", "Task has been updated successfully.");
    } else {
      // Saves the task where the Home page can find it (a "High" task shows up
      // under High Priority there)
      addTask(task);

      // TODO: also send this to your backend. When you do, add it to the list,
      // show the toast and close only after the request succeeds.
      onSubmit?.(task);
      showToast("Task Added", "Task has been added successfully.");
    }
    close();
  };

  return (
    // Dark backdrop that fades in. Tapping it closes the sheet.
    <div
      ref={backdropRef}
      onClick={(e) => {
        if (e.target === e.currentTarget) close();
      }}
      className="fixed inset-0 z-50 flex items-end justify-center overflow-hidden bg-black/40 pt-[max(16px,env(safe-area-inset-top))]"
    >
      {/* The sheet: full width, rounded at the top only, slides up from below the screen, and scrolls if it's taller than the screen. */}
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-task-title"
        tabIndex={-1}
        className="max-h-full w-full max-w-md overflow-y-auto overscroll-contain rounded-t-3xl bg-white px-4 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))] outline-none min-[360px]:px-5 min-[360px]:pt-5 min-[360px]:pb-[max(1.25rem,env(safe-area-inset-bottom))]"
      >
        <form noValidate onSubmit={handleSubmit}>
          {!editing && (
            <div className="flex justify-end">
              <button
                type="button"
                onClick={close}
                aria-label="Close"
                className="flex h-10 w-10 touch-manipulation items-center justify-center rounded-xl border border-[#D8E5F3] bg-[#F8FAFC] text-[#111827]"
              >
                <FiX size={18} aria-hidden="true" />
              </button>
            </div>
          )}

          <label
            id="add-task-title"
            htmlFor="task-title"
            className={`block text-[0.875rem] text-[#6B7280] ${editing ? "" : "mt-4"}`}
          >
            What needs to get done?
          </label>
          {/* Square, light-blue outlined box with the text sitting low, as in the design.
              It starts one line tall and grows as the person types more. */}
          <textarea
            id="task-title"
            ref={titleRef}
            rows={1}
            value={title}
            onChange={(e) => {
              setTitle(e.target.value);
              const box = e.target;
              box.style.height = "auto";
              box.style.height = `${box.scrollHeight + 2}px`;
            }}
            placeholder="Call client tomorrow at 3pm"
            style={{ fontSize: "16px" }}
            className="mt-2 max-h-40 min-h-12 w-full resize-none rounded-none border border-[#D8E5F3] bg-white px-1.5 pt-[22px] pb-0.5 text-[#111827] outline-none placeholder:text-[#C6CCD3] focus:border-[#1A7431]"
          />

          {/* Date and time */}
          <div ref={dateRowRef} className="relative mt-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="min-w-0">
                <label
                  htmlFor="task-date"
                  className="text-[0.75rem] text-[#6B7280]"
                >
                  Date
                </label>
                <button
                  id="task-date"
                  type="button"
                  onClick={() => setPickingDate((open) => !open)}
                  aria-haspopup="dialog"
                  aria-expanded={pickingDate}
                  className="mt-2 flex h-11 w-full min-w-0 touch-manipulation items-center justify-between gap-2 rounded-xl border border-[#D8E5F3] bg-[#F8FAFC] px-3 text-left text-[16px] outline-none focus-visible:border-[#1A7431]"
                >
                  <span
                    className={dateLabel ? "text-[#111827]" : "text-[#C6CCD3]"}
                  >
                    {dateLabel || "DD/MM/YYYY"}
                  </span>
                  <FiCalendar
                    size={16}
                    aria-hidden="true"
                    className="shrink-0 text-[#9CA3AF]"
                  />
                </button>
              </div>

              <div className="min-w-0">
                <label
                  htmlFor="task-time"
                  className="text-[0.75rem] text-[#6B7280]"
                >
                  Time
                </label>
                <div className="relative mt-2">
                  <input
                    id="task-time"
                    type="text"
                    inputMode="text"
                    autoComplete="off"
                    autoCapitalize="characters"
                    autoCorrect="off"
                    spellCheck={false}
                    maxLength={8}
                    placeholder="--:-- --"
                    value={time}
                    onChange={(e) => setTime(formatTime(e.target.value, time))}
                    onFocus={() => setPickingDate(false)}
                    aria-describedby={timeIncomplete ? "time-hint" : undefined}
                    aria-invalid={timeIncomplete}
                    className={timeClass}
                  />
                  <FiClock
                    size={16}
                    aria-hidden="true"
                    className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-[#9CA3AF]"
                  />
                </div>
              </div>
            </div>

            {pickingDate && (
              <DatePickerPanel value={date} today={today} onPick={pickDate} />
            )}
          </div>

          {timeIncomplete && (
            <p
              id="time-hint"
              role="alert"
              className="mt-2 text-[0.75rem] font-normal text-[#E74C3C]"
            >
              Enter the full time with AM or PM, for example 11:35 AM.
            </p>
          )}

          {/* Project, day and priority */}
          <div className="mt-5 flex flex-col gap-4">
            <OptionGroup
              name="Project"
              icon={<FiHash size={14} aria-hidden="true" />}
              heading={project}
              options={projects}
              value={project}
              onChange={setProject}
            />
            <OptionGroup
              name="Day"
              icon={<FiCalendar size={14} aria-hidden="true" />}
              heading={dayHeading}
              options={days}
              value={when}
              onChange={pickDay}
            />
            <OptionGroup
              name="Priority"
              icon={<FiFlag size={14} aria-hidden="true" />}
              heading={priority}
              options={priorities}
              value={priority}
              onChange={setPriority}
            />
          </div>

          <div className="mt-6 flex flex-wrap justify-end gap-3">
            {editing && (
              <button
                type="button"
                onClick={close}
                className="min-h-11 touch-manipulation rounded-xl border border-[#D8E5F3] bg-white px-4 text-[0.875rem] font-normal text-[#6B7280]"
              >
                Cancel
              </button>
            )}
            <button
              type="submit"
              disabled={title.trim() === "" || timeIncomplete}
              className="flex min-h-11 touch-manipulation items-center gap-2 rounded-xl bg-[#1A7431] px-4 text-[0.875rem] whitespace-nowrap text-white disabled:cursor-not-allowed disabled:opacity-40"
            >
              {editing ? (
                "Save changes"
              ) : (
                <>
                  <FiPlus size={16} aria-hidden="true" />
                  Add Task
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default AddTaskModal;
