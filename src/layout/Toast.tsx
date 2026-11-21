import { useEffect, useRef } from "react";
import { createRoot } from "react-dom/client";
import { FiCheckCircle } from "react-icons/fi";

/* ========================================================================== */
/*                                   TOAST                                    */
/* ========================================================================== */
// The "Task Added" / "Task Updated" / "Task Deleted" message. The sheet or pop-up
// that triggers it closes straight away, and anything drawn inside it would
// disappear with it. So the toast is drawn separately, straight onto the page,
// and removes itself when it is done.
//   showToast("Task Deleted", "Task has been deleted successfully.");

// How long the toast stays on screen (milliseconds)
const TOAST_MS = 4000;

const TaskToast = ({
  title,
  message,
  onDone,
}: {
  title: string;
  message: string;
  onDone: () => void;
}) => {
  const cardRef = useRef<HTMLButtonElement>(null);
  const leaving = useRef(false);

  // Slide up out of view, then remove the toast
  const dismiss = () => {
    if (leaving.current) return;
    leaving.current = true;

    const card = cardRef.current;
    if (!card || !card.animate) {
      onDone();
      return;
    }
    card.animate(
      [
        { opacity: 1, transform: "translateY(0)" },
        { opacity: 0, transform: "translateY(-16px)" },
      ],
      { duration: 200, easing: "ease-in", fill: "forwards" },
    ).onfinish = onDone;
  };

  useEffect(() => {
    // Slide in from the top, then close by itself after a few seconds
    cardRef.current?.animate?.(
      [
        { opacity: 0, transform: "translateY(-16px)" },
        { opacity: 1, transform: "translateY(0)" },
      ],
      { duration: 250, easing: "ease-out" },
    );
    const timer = setTimeout(dismiss, TOAST_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 top-0 z-[60] px-4 pt-[max(16px,env(safe-area-inset-top))]"
    >
      {/* Tapping the toast closes it early */}
      <button
        ref={cardRef}
        type="button"
        onClick={dismiss}
        aria-label="Close notification"
        className="pointer-events-auto mx-auto flex w-full max-w-md touch-manipulation items-start gap-4 rounded-2xl border border-[#D8E5F3] bg-white px-5 py-4 text-left shadow-[0_8px_24px_rgba(17,24,39,0.12)]"
      >
        <FiCheckCircle
          size={24}
          aria-hidden="true"
          className="mt-0.5 shrink-0 text-[#1A7431]"
        />
        <span className="flex min-w-0 flex-col gap-1">
          <span className="text-[clamp(15px,4.2vw,16px)] leading-tight font-medium text-[#111827]">
            {title}
          </span>
          <span className="text-[clamp(13px,3.7vw,14px)] leading-snug font-normal text-[#6B7280]">
            {message}
          </span>
        </span>
      </button>
    </div>
  );
};

// Only one toast at a time: a new one replaces any that is still showing
let dismissActiveToast: (() => void) | null = null;

export const showToast = (title: string, message: string) => {
  dismissActiveToast?.();

  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);

  const remove = () => {
    root.unmount();
    host.remove();
    if (dismissActiveToast === remove) dismissActiveToast = null;
  };

  dismissActiveToast = remove;
  root.render(<TaskToast title={title} message={message} onDone={remove} />);
};
