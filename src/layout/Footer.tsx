import { useState } from "react";
import { NavLink } from "react-router-dom";
import type { IconType } from "react-icons";
import { CiCalendar } from "react-icons/ci";
import { VscInbox } from "react-icons/vsc";
import { CgFileDocument } from "react-icons/cg";
import { FiSettings, FiPlus } from "react-icons/fi";
import AddTaskModal from "./AddTaskModal";
import type { NewTask } from "./AddTaskModal";

type Tab = { to: string; label: string; Icon: IconType };

// Left two tabs, then the centre add button, then the right two tabs
const leftTabs: Tab[] = [
  { to: "/home", label: "Today", Icon: CiCalendar },
  { to: "/inbox", label: "Inbox", Icon: VscInbox },
];
const rightTabs: Tab[] = [
  { to: "/project", label: "Projects", Icon: CgFileDocument },
  { to: "/settings", label: "Settings", Icon: FiSettings },
];

type Props = {
  // Called when the green + button is pressed
  onAdd?: () => void;
  // Called with the new task when "Add Task" is pressed in the sheet
  onAddTask?: (task: NewTask) => void;
};

const Footer = ({ onAdd, onAddTask }: Props) => {
  // Whether the "new task" sheet is open
  const [adding, setAdding] = useState(false);

  // NavLink knows which route is open, so it sets the active colour and
  // aria-current="page" for us
  const renderTab = ({ to, label, Icon }: Tab) => (
    <NavLink
      key={to}
      to={to}
      className={({ isActive }) =>
        `flex min-w-0 touch-manipulation flex-col items-center justify-center gap-1 pt-6 pb-4 ${
          isActive ? "text-[#1A7431]" : "text-[#6B7280]"
        }`
      }
    >
      {({ isActive }) => (
        <>
          <Icon className="h-6 w-6 shrink-0" aria-hidden="true" />
          <span
            className={`max-w-full truncate text-[clamp(0.75rem,3.6vw,0.9375rem)] leading-tight ${
              isActive ? "font-medium" : "font-normal"
            }`}
          >
            {label}
          </span>
        </>
      )}
    </NavLink>
  );

  return (
    <>
      {/* Pinned to the bottom, same max width as the cards above it. */}
      <nav
        aria-label="Main"
        className="fixed inset-x-0 bottom-0 z-10 mx-auto w-full max-w-md bg-white
       pr-[env(safe-area-inset-right)] pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)]"
      >
        {/* 5 columns: 2 tabs, a narrower middle gap for the button, 2 tabs */}
        <div className="grid grid-cols-[1fr_1fr_3rem_1fr_1fr] px-2">
          {leftTabs.map(renderTab)}
          <div aria-hidden="true" />
          {rightTabs.map(renderTab)}
        </div>

        {/* Add button, centred and sitting half above the bar */}
        <button
          type="button"
          aria-label="Add task"
          aria-haspopup="dialog"
          onClick={() => {
            setAdding(true);
            onAdd?.();
          }}
          className="absolute top-0 left-1/2 flex h-14 w-14 -translate-x-1/2 -translate-y-1/2 touch-manipulation items-center 
        justify-center rounded-full bg-[#1A7431] text-white shadow-[0_6px_12px_rgba(26,116,49,0.3)]"
        >
          <FiPlus size={32} strokeWidth={1.25} aria-hidden="true" />
        </button>
      </nav>

      {/* Outside the nav, so it sits above everything else on the page */}
      {adding && (
        <AddTaskModal onClose={() => setAdding(false)} onSubmit={onAddTask} />
      )}
    </>
  );
};

export default Footer;
