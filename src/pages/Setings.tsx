import { useCallback, useEffect, useRef, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import profile from "../assets/Profile.svg";
import notifications from "../assets/NOTIFCATIONS.svg";
import theme from "../assets/Theme.svg";
import security from "../assets/Security.svg";
import avatar from "../assets/baby head.svg";
import {
  MdOutlineKeyboardArrowRight,
  MdOutlineKeyboardArrowLeft,
  MdOutlineKeyboardArrowDown,
} from "react-icons/md";
import {
  FiHeadphones,
  FiCloud,
  FiShield,
  FiAlertCircle,
  FiEdit2,
  FiCamera,
  FiEye,
  FiEyeOff,
  FiRefreshCw,
} from "react-icons/fi";

type Screen =
  | "settings"
  | "profile"
  | "notifications"
  | "theme"
  | "security"
  | "password"
  | "help"
  | "sync"
  | "privacy"
  | "about";

// "opens" is optional: rows with it switch the Settings page to that screen
type Item = {
  title: string;
  description: string;
  icon: ReactNode;
  opens?: Screen;
};

// What the Edit screen can change
type ProfileData = {
  name: string;
  email: string;
  photo: string;
};

// Rounded box around a react-icons icon, to match the box in your SVGs
const IconBox = ({ children }: { children: ReactNode }) => (
  <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-[#D8E5F3] bg-[#F8FAFC] text-[#111827]">
    {children}
  </span>
);

// The Profile row's description is replaced with the saved name and email
// when the list is shown (see `accountList` in the page below).
const accountItems: Item[] = [
  {
    title: "Profile",
    description: "Adaeze · adaeze@appname.app",
    icon: <img src={profile} alt="" className="h-10 w-10" />,
    opens: "profile",
  },
  {
    title: "Notifications",
    description: "Daily summary, Reminders",
    icon: <img src={notifications} alt="" className="h-10 w-10" />,
    opens: "notifications",
  },
  {
    title: "Theme",
    description: "System",
    icon: <img src={theme} alt="" className="h-10 w-10" />,
    opens: "theme",
  },
  {
    title: "Security",
    description: "Device Protection",
    icon: <img src={security} alt="" className="h-10 w-10" />,
    opens: "security",
  },
];

const moreItems: Item[] = [
  {
    title: "Help & Support",
    description: "Reach us on",
    icon: (
      <IconBox>
        <FiHeadphones size={16} aria-hidden="true" />
      </IconBox>
    ),
    opens: "help",
  },
  {
    title: "Sync & Back up",
    description: "Auto-sync on",
    icon: (
      <IconBox>
        <FiCloud size={16} aria-hidden="true" />
      </IconBox>
    ),
    opens: "sync",
  },
  {
    title: "Privacy",
    description: "End-to-End",
    icon: (
      <IconBox>
        <FiShield size={16} aria-hidden="true" />
      </IconBox>
    ),
    opens: "privacy",
  },
  {
    title: "About",
    description: "v1.0.0",
    icon: (
      <IconBox>
        <FiAlertCircle size={16} aria-hidden="true" />
      </IconBox>
    ),
    opens: "about",
  },
];

// Default details, used until the user saves their own
const initialProfile: ProfileData = {
  name: "Adaeze",
  email: "adaeze32@gmail.com",
  photo: avatar,
};
const MEMBER_SINCE = "Jan 2026";

/* ========================================================================== */
/*                            SAVING THE PROFILE                              */
/* ========================================================================== */

// Where the saved profile lives in this browser
const PROFILE_KEY = "profileData";

// The picture is shrunk to this size (longest side, in pixels) before saving,
// so it always fits in browser storage
const MAX_PHOTO_SIZE = 256;

// Reads the saved profile (or the defaults if nothing was saved yet)
const loadProfile = (): ProfileData => {
  try {
    const raw = localStorage.getItem(PROFILE_KEY);
    if (raw) {
      const saved = JSON.parse(raw);
      if (typeof saved?.name === "string" && typeof saved?.email === "string") {
        return {
          name: saved.name,
          email: saved.email,
          // No saved picture means the default avatar
          photo:
            typeof saved.photo === "string" && saved.photo
              ? saved.photo
              : avatar,
        };
      }
    }
  } catch {
    // storage unavailable or damaged: fall back to the defaults
  }
  return initialProfile;
};

// Saves the profile. Returns false if the browser refused (full or blocked).
const storeProfile = (data: ProfileData): boolean => {
  try {
    localStorage.setItem(
      PROFILE_KEY,
      JSON.stringify({
        name: data.name,
        email: data.email,
        // Only a picture the user chose is stored. The built-in avatar is
        // skipped because its file path changes when the app is rebuilt.
        photo: data.photo.startsWith("data:") ? data.photo : "",
      }),
    );
    return true;
  } catch {
    return false;
  }
};

// Reads a chosen picture and shrinks it to a small JPEG
const readAndShrink = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Could not read the file"));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("Could not open the picture"));
      img.onload = () => {
        const scale = Math.min(
          1,
          MAX_PHOTO_SIZE / Math.max(img.width, img.height),
        );
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(img.width * scale));
        canvas.height = Math.max(1, Math.round(img.height * scale));

        const ctx = canvas.getContext("2d");
        if (!ctx) {
          reject(new Error("Could not process the picture"));
          return;
        }
        // White behind transparent pictures, so they don't turn black as JPEG
        ctx.fillStyle = "#FFFFFF";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", 0.85));
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  });

/* ========================================================================== */
/*                           CHANGING THE PASSWORD                            */
/* ========================================================================== */
// There is no server yet, so the password is kept in this browser as a salted
// hash (never as plain text). When you add a backend, replace `changePassword`
// below with a call to it. Real password checks must happen on the server.

// Where the saved password hash lives in this browser
const PASSWORD_KEY = "accountPassword";

type StoredPassword = { salt: string; hash: string };

type PasswordResult =
  | { ok: true }
  | { ok: false; reason: "wrong-current" | "same" | "failed" };

const toHex = (bytes: Uint8Array): string =>
  Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

// Scrambles salt + password into a fixed-length code that can't be reversed
const hashPassword = async (
  password: string,
  salt: string,
): Promise<string> => {
  const subtle = window.crypto?.subtle;
  if (!subtle) throw new Error("Hashing is not available");
  const data = new TextEncoder().encode(salt + password);
  return toHex(new Uint8Array(await subtle.digest("SHA-256", data)));
};

const readStoredPassword = (): StoredPassword | null => {
  try {
    const raw = localStorage.getItem(PASSWORD_KEY);
    if (!raw) return null;
    const saved = JSON.parse(raw);
    if (typeof saved?.salt === "string" && typeof saved?.hash === "string") {
      return { salt: saved.salt, hash: saved.hash };
    }
  } catch {
    // storage unavailable or damaged
  }
  return null;
};

// Changes the password, then reads it back to confirm it was really saved.
// If no password has been saved yet, the first change sets it (there is
// nothing to check the current password against until a server exists).
const changePassword = async (
  current: string,
  next: string,
): Promise<PasswordResult> => {
  try {
    const stored = readStoredPassword();

    if (stored) {
      const currentHash = await hashPassword(current, stored.salt);
      if (currentHash !== stored.hash) {
        return { ok: false, reason: "wrong-current" };
      }
    }

    if (next === current) return { ok: false, reason: "same" };

    const salt = toHex(window.crypto.getRandomValues(new Uint8Array(16)));
    const hash = await hashPassword(next, salt);
    localStorage.setItem(PASSWORD_KEY, JSON.stringify({ salt, hash }));

    // Proof: what is saved now must match the new password, and the old one must not
    const saved = readStoredPassword();
    if (!saved || saved.salt !== salt || saved.hash !== hash) {
      return { ok: false, reason: "failed" };
    }
    if ((await hashPassword(next, saved.salt)) !== saved.hash) {
      return { ok: false, reason: "failed" };
    }
    return { ok: true };
  } catch {
    return { ok: false, reason: "failed" };
  }
};

/* ========================================================================== */
/*                               SIGNING OUT                                  */
/* ========================================================================== */

// Where the person lands after signing out
const SIGN_IN_PATH = "/signin";

// Placeholder for "Sign out everywhere". When you add a backend, call its
// sign-out endpoint here so every session on every device is ended, for
// example: await fetch(`${API}/auth/sign-out`, { method: "POST",
// credentials: "include" }). Throw an error if it fails, and the person
// stays on this screen.
const signOutEverywhere = async (): Promise<void> => {
  // TODO: connect to your sign-out endpoint
};

/* ========================================================================== */
/*                               BACKING UP DATA                              */
/* ========================================================================== */
// There is no server yet, so "Sync Now" saves a backup copy of your data in
// this browser. When you add a backend, send the same data there instead.

// Where the backup lives in this browser
const BACKUP_KEY = "appBackup";

type Backup = { savedAt: number; size: number };

// Reads the last backup: when it was made and how big it is
const readBackup = (): Backup | null => {
  try {
    const raw = localStorage.getItem(BACKUP_KEY);
    if (!raw) return null;
    const saved = JSON.parse(raw);
    if (typeof saved?.savedAt === "number" && typeof saved?.data === "string") {
      return { savedAt: saved.savedAt, size: new Blob([saved.data]).size };
    }
  } catch {
    // storage unavailable or damaged
  }
  return null;
};

// Saves a backup, then reads it back to confirm it really was saved.
// The saved profile is backed up. The password is left out on purpose.
const runBackup = (): boolean => {
  try {
    const data = localStorage.getItem(PROFILE_KEY) ?? "{}";
    const payload = JSON.stringify({ savedAt: Date.now(), data });
    localStorage.setItem(BACKUP_KEY, payload);
    return localStorage.getItem(BACKUP_KEY) === payload;
  } catch {
    return false;
  }
};

const formatSize = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const formatAgo = (time: number, now: number): string => {
  const seconds = Math.max(0, Math.round((now - time) / 1000));
  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)} min ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} hr ago`;
  return new Date(time).toLocaleDateString();
};

// Shared input look. The text is 16px (also set inline on each input) so phones
// don't zoom in when an input is tapped.
const inputClass =
  "h-11 w-full min-w-0 rounded-xl border-[0.5px] border-[#E5EAF1] bg-[#F8FAFC] px-4 text-[16px] leading-normal font-normal text-[#111827] outline-none placeholder:text-[#C6CCD3] focus:border-[#1A7431]";

// One card with a list of rows. Used for both groups below.
const SettingsGroup = ({
  items,
  onOpen,
  className = "",
}: {
  items: Item[];
  onOpen: (screen: Screen) => void;
  className?: string;
}) => (
  <section
    className={`mx-auto w-full max-w-md rounded-3xl bg-[#F8FAFC] p-3 min-[360px]:p-4 ${className}`}
  >
    <ul className="divide-y divide-[#D8E5F3] rounded-xl bg-white px-3 min-[360px]:px-4">
      {items.map(({ title, description, icon, opens }) => (
        <li key={title}>
          <button
            type="button"
            onClick={() => opens && onOpen(opens)}
            className="flex w-full touch-manipulation items-center gap-3 py-4 text-left min-[360px]:gap-4"
          >
            <span className="shrink-0">{icon}</span>

            <span className="min-w-0 flex-1">
              <span className="block text-[0.875rem] text-[#111827]">
                {title}
              </span>
              <span className="block text-[0.75rem] break-words text-[#6B7280]">
                {description}
              </span>
            </span>

            <MdOutlineKeyboardArrowRight
              size={20}
              className="shrink-0 text-[#6B7280]"
              aria-hidden="true"
            />
          </button>
        </li>
      ))}
    </ul>
  </section>
);

// The Profile screen, shown inside the Settings page
const ProfileScreen = ({
  data,
  onBack,
  onEdit,
}: {
  data: ProfileData;
  onBack: () => void;
  onEdit: () => void;
}) => {
  const accountDetails = [
    { label: "Display Name", value: data.name },
    { label: "Email", value: data.email },
    { label: "Member Since", value: MEMBER_SINCE },
  ];

  return (
    <>
      {/* Title card */}
      <div className="mx-auto w-full max-w-md rounded-3xl bg-[#F8FAFC] p-3 min-[360px]:p-4">
        <div className="rounded-2xl bg-white p-4 min-[360px]:p-5">
          <button
            type="button"
            onClick={onBack}
            aria-label="Back to settings"
            className="-mt-2 -ml-2 flex min-h-11 touch-manipulation items-center pr-3 pl-1 text-[0.75rem] text-[#6B7280]"
          >
            <MdOutlineKeyboardArrowLeft size={16} aria-hidden="true" />
            Profile
          </button>

          <div className="mt-1 flex items-center gap-3 min-[360px]:gap-4">
            <img
              src={data.photo}
              alt=""
              className="h-12 w-12 shrink-0 rounded-full bg-[#F8FAFC] object-cover"
            />

            <div className="min-w-0">
              <h1 className="text-[1rem] font-medium text-[#111827]">
                Your Account
              </h1>
              <p className="mt-1 text-[0.875rem] text-[#6B7280]">
                Access and manage your personal account information.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Account details */}
      <section className="mx-auto mt-4 w-full max-w-md rounded-3xl bg-[#F8FAFC] p-3 min-[360px]:p-4">
        <dl className="divide-y divide-[#D8E5F3] rounded-xl bg-white px-3 min-[360px]:px-4">
          {accountDetails.map(({ label, value }) => (
            <div
              key={label}
              className="flex items-center justify-between gap-3 py-4 min-[360px]:gap-4"
            >
              <dt className="shrink-0 text-[0.875rem] text-[#111827]">
                {label}
              </dt>
              <dd className="min-w-0 text-right text-[0.75rem] font-normal break-words text-[#6B7280]">
                {value}
              </dd>
            </div>
          ))}
        </dl>
      </section>

      {/* Opens the Edit screen on top of this page */}
      <button
        type="button"
        onClick={onEdit}
        aria-haspopup="dialog"
        className="mx-auto mt-4 flex min-h-12 w-full max-w-md touch-manipulation items-center justify-center gap-2 rounded-xl bg-white text-[0.875rem] text-[#1A7431]"
      >
        <FiEdit2 size={16} aria-hidden="true" />
        Edit
      </button>
    </>
  );
};

// The Notifications screen, shown inside the Settings page
const notificationOptions = [
  {
    id: "push",
    label: "Push Notifications",
    description: "Get notified on this device",
    on: true,
  },
  {
    id: "reminders",
    label: "Tasks Reminders",
    description: "Alert before tasks are due",
    on: true,
  },
  {
    id: "email",
    label: "Email Notifications",
    description: "Receive task updates by email",
    on: true,
  },
  {
    id: "digest",
    label: "Daily Digest",
    description: "Morning summary of today's tasks",
    on: false,
  },
];

const NotificationsScreen = ({ onBack }: { onBack: () => void }) => {
  // Which switches are on. Starts as in the design.
  const [enabled, setEnabled] = useState<Record<string, boolean>>(
    Object.fromEntries(notificationOptions.map((o) => [o.id, o.on])),
  );

  return (
    <>
      {/* Title card */}
      <div className="mx-auto w-full max-w-md rounded-3xl bg-[#F8FAFC] p-3 min-[360px]:p-4">
        <div className="rounded-2xl bg-white p-4 min-[360px]:p-5">
          <button
            type="button"
            onClick={onBack}
            aria-label="Back to settings"
            className="-mt-2 -ml-2 flex min-h-11 touch-manipulation items-center pr-3 pl-1 text-[0.75rem] text-[#6B7280] font-normal"
          >
            <MdOutlineKeyboardArrowLeft size={16} aria-hidden="true" />
            Notifications
          </button>

          <h1 className="mt-1 text-[1rem] font-medium text-[#111827]">
            Stay updated
          </h1>
          <p className="mt-1 text-[0.875rem] text-[#6B7280] font-normal">
            Receive timely notifications about what matters most.
          </p>
        </div>
      </div>

      {/* Switches */}
      <section className="mx-auto mt-4 w-full max-w-md rounded-3xl bg-[#F8FAFC] p-3 min-[360px]:p-4">
        <ul className="divide-y divide-[#D8E5F3] rounded-xl bg-white px-3 min-[360px]:px-4">
          {notificationOptions.map(({ id, label, description }) => (
            <li
              key={id}
              className="flex items-center justify-between gap-3 py-4 min-[360px]:gap-4"
            >
              <div className="min-w-0">
                <p className="text-[0.875rem] font-normal text-[#111827]">
                  {label}
                </p>
                <p className="text-[0.75rem] text-[#6B7280] font-normal">
                  {description}
                </p>
              </div>

              <button
                type="button"
                role="switch"
                aria-checked={enabled[id]}
                aria-label={label}
                onClick={() =>
                  setEnabled((prev) => ({ ...prev, [id]: !prev[id] }))
                }
                className={`relative h-6 w-11 shrink-0 touch-manipulation rounded-full transition-colors before:absolute before:-inset-x-1 before:-inset-y-2.5 ${
                  enabled[id] ? "bg-[#1A7431]" : "bg-[#D8E5F3]"
                }`}
              >
                <span
                  className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white transition-transform ${
                    enabled[id] ? "translate-x-5" : ""
                  }`}
                />
              </button>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
};

// The Theme screen, shown inside the Settings page
const themeOptions = ["System", "Light", "Dark"];

const ThemeScreen = ({ onBack }: { onBack: () => void }) => {
  // Which option is picked. Starts on System, as in the design.
  const [selected, setSelected] = useState("System");

  return (
    <>
      {/* Title card */}
      <div className="mx-auto w-full max-w-md rounded-3xl bg-[#F8FAFC] p-3 min-[360px]:p-4">
        <div className="rounded-2xl bg-white p-4 min-[360px]:p-5">
          <button
            type="button"
            onClick={onBack}
            aria-label="Back to settings"
            className="-mt-2 -ml-2 flex min-h-11 touch-manipulation items-center pr-3 pl-1 text-[0.75rem] font-normal text-[#6B7280]"
          >
            <MdOutlineKeyboardArrowLeft size={16} aria-hidden="true" />
            Theme
          </button>

          <h1 className="mt-1 text-[1rem] font-medium text-[#111827]">
            Make it yours
          </h1>
          <p className="mt-1 text-[0.875rem] font-normal text-[#6B7280]">
            Choose the theme that works best for your eyes and style.
          </p>
        </div>
      </div>

      {/* Options */}
      <section className="mx-auto mt-4 w-full max-w-md rounded-3xl bg-[#F8FAFC] p-3 min-[360px]:p-4">
        <ul
          role="radiogroup"
          aria-label="Theme"
          className="divide-y divide-[#D8E5F3] rounded-xl bg-white px-3 min-[360px]:px-4"
        >
          {themeOptions.map((option) => {
            const isSelected = selected === option;
            return (
              <li key={option}>
                <button
                  type="button"
                  role="radio"
                  aria-checked={isSelected}
                  onClick={() => setSelected(option)}
                  className="flex w-full touch-manipulation items-center justify-between gap-3 py-4 text-left text-[0.875rem] font-normal text-[#111827] min-[360px]:gap-4"
                >
                  {option}

                  <span
                    className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full ${
                      isSelected
                        ? "border-[1.5px] border-[#1A7431]"
                        : "bg-[#D8E5F3]"
                    }`}
                  >
                    {isSelected && (
                      <span className="h-2 w-2 rounded-full bg-[#1A7431]" />
                    )}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </section>
    </>
  );
};

// The Security screen, shown inside the Settings page
const securitySwitches = [
  {
    id: "biometrics",
    label: "Biometrics",
    description: "Enable fingerprint/Face ID",
  },
  {
    id: "2fa",
    label: "2FA",
    description: "Add additional security to your account",
  },
];

const SecurityScreen = ({
  onBack,
  onOpenPassword,
  onSignOutAll,
}: {
  onBack: () => void;
  onOpenPassword: () => void;
  // Called when "Sign out all" is pressed. Resolves once signed out.
  onSignOutAll: () => Promise<void>;
}) => {
  // true while signing out, so the button can't be pressed twice
  const [signingOut, setSigningOut] = useState(false);

  const handleSignOutAll = async () => {
    if (signingOut) return;
    setSigningOut(true);
    try {
      await onSignOutAll();
    } catch {
      // sign-out failed: stay here so it can be tried again
      setSigningOut(false);
    }
  };

  // Which switches are on. Both start off, as in the design.
  const [enabled, setEnabled] = useState<Record<string, boolean>>({
    biometrics: false,
    "2fa": false,
  });

  return (
    <>
      {/* Title card */}
      <div className="mx-auto w-full max-w-md rounded-3xl bg-[#F8FAFC] p-3 min-[360px]:p-4">
        <div className="rounded-2xl bg-white p-4 min-[360px]:p-5">
          <button
            type="button"
            onClick={onBack}
            aria-label="Back to settings"
            className="-mt-2 -ml-2 flex min-h-11 touch-manipulation items-center pr-3 pl-1 text-[0.75rem] font-normal text-[#6B7280]"
          >
            <MdOutlineKeyboardArrowLeft size={16} aria-hidden="true" />
            Security
          </button>

          <h1 className="mt-1 text-[1rem] font-medium text-[#111827]">
            Protect your account
          </h1>
          <p className="mt-1 text-[0.875rem] font-normal text-[#6B7280]">
            Keep your account secure with advanced protection settings.
          </p>
        </div>
      </div>

      {/* Password and switches */}
      <section className="mx-auto mt-4 w-full max-w-md rounded-3xl bg-[#F8FAFC] p-3 min-[360px]:p-4">
        <ul className="divide-y divide-[#D8E5F3] rounded-xl bg-white px-3 min-[360px]:px-4">
          <li>
            <button
              type="button"
              onClick={onOpenPassword}
              className="flex w-full touch-manipulation items-center justify-between gap-3 py-4 text-left min-[360px]:gap-4"
            >
              <span className="min-w-0">
                <span className="block text-[0.875rem] font-normal text-[#111827]">
                  Password
                </span>
                <span className="block text-[0.75rem] font-normal text-[#6B7280]">
                  Change your password
                </span>
              </span>

              <MdOutlineKeyboardArrowRight
                size={20}
                className="shrink-0 text-[#6B7280]"
                aria-hidden="true"
              />
            </button>
          </li>

          {securitySwitches.map(({ id, label, description }) => (
            <li
              key={id}
              className="flex items-center justify-between gap-3 py-4 min-[360px]:gap-4"
            >
              <div className="min-w-0">
                <p className="text-[0.875rem] font-normal text-[#111827]">
                  {label}
                </p>
                <p className="text-[0.75rem] font-normal text-[#6B7280]">
                  {description}
                </p>
              </div>

              <button
                type="button"
                role="switch"
                aria-checked={enabled[id]}
                aria-label={label}
                onClick={() =>
                  setEnabled((prev) => ({ ...prev, [id]: !prev[id] }))
                }
                className={`relative h-6 w-11 shrink-0 touch-manipulation rounded-full transition-colors before:absolute before:-inset-x-1 before:-inset-y-2.5 ${
                  enabled[id] ? "bg-[#1A7431]" : "bg-[#D8E5F3]"
                }`}
              >
                <span
                  className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white transition-transform ${
                    enabled[id] ? "translate-x-5" : ""
                  }`}
                />
              </button>
            </li>
          ))}
        </ul>
      </section>

      {/* Sign out and delete */}
      <section className="mx-auto mt-4 w-full max-w-md rounded-3xl bg-[#F8FAFC] p-3 min-[360px]:p-4">
        <ul className="divide-y divide-[#D8E5F3] rounded-xl bg-white px-3 min-[360px]:px-4">
          <li className="flex items-center justify-between gap-3 py-4 min-[360px]:gap-4">
            <div className="min-w-0">
              <p className="text-[0.875rem] font-normal text-[#111827]">
                Sign out everywhere
              </p>
              <p className="text-[0.75rem] font-normal text-[#6B7280]">
                End all active sessions on every device
              </p>
            </div>

            <button
              type="button"
              onClick={handleSignOutAll}
              disabled={signingOut}
              className="flex min-h-9 shrink-0 whitespace-nowrap touch-manipulation items-center gap-1 rounded-lg bg-[#F1F4F8] px-3 text-[0.875rem] font-normal text-[#111827] disabled:cursor-not-allowed disabled:opacity-50"
            >
              Sign out all
              <MdOutlineKeyboardArrowRight size={16} aria-hidden="true" />
            </button>
          </li>

          <li className="flex items-center justify-between gap-3 py-4 min-[360px]:gap-4">
            <div className="min-w-0">
              <p className="text-[0.875rem] font-normal text-[#111827]">
                Delete Account
              </p>
              <p className="text-[0.75rem] font-normal text-[#6B7280]">
                Permanently remove your account and data
              </p>
            </div>

            <button
              type="button"
              className="min-h-9 shrink-0 whitespace-nowrap touch-manipulation rounded-lg bg-[#EF4444] px-4 text-[0.875rem] font-normal text-white"
            >
              Delete
            </button>
          </li>
        </ul>
      </section>
    </>
  );
};

// The Password screen, opened from the Security screen
// Same look as the other inputs, with extra room on the right for the eye button
const passwordInputClass = inputClass.replace("px-4", "pl-4 pr-12");

const PasswordField = ({
  id,
  label,
  placeholder,
  autoComplete,
  value,
  onChange,
}: {
  id: string;
  label: string;
  placeholder: string;
  autoComplete: string;
  value: string;
  onChange: (value: string) => void;
}) => {
  const [visible, setVisible] = useState(false);

  return (
    <div className="flex flex-col gap-2">
      <label
        htmlFor={id}
        className="text-[0.875rem] font-medium text-[#111827]"
      >
        {label}
      </label>

      <div className="relative">
        <input
          id={id}
          name={id}
          type={visible ? "text" : "password"}
          autoComplete={autoComplete}
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          style={{ fontSize: "16px" }}
          className={passwordInputClass}
        />

        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          aria-label={`${visible ? "Hide" : "Show"} ${label.toLowerCase()}`}
          className="absolute inset-y-0 right-0 flex w-12 touch-manipulation items-center justify-center text-[#9CA3AF]"
        >
          {visible ? (
            <FiEyeOff size={16} aria-hidden="true" />
          ) : (
            <FiEye size={16} aria-hidden="true" />
          )}
        </button>
      </div>
    </div>
  );
};

const PasswordScreen = ({
  onBack,
  onChanged,
}: {
  onBack: () => void;
  // Called once the password has really been changed
  onChanged: () => void;
}) => {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const message =
    next !== "" && next.length < 8
      ? "Use at least 8 characters for the new password."
      : confirm !== "" && next !== confirm
        ? "The new passwords don't match."
        : "";

  const canUpdate = current !== "" && next.length >= 8 && next === confirm;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!canUpdate || busy) return;

    setBusy(true);
    setError("");
    const result = await changePassword(current, next);
    setBusy(false);

    if (result.ok) {
      // Clear the fields, then let the page show "Password successfully changed"
      setCurrent("");
      setNext("");
      setConfirm("");
      onChanged();
      return;
    }

    setError(
      result.reason === "wrong-current"
        ? "Your current password is incorrect."
        : result.reason === "same"
          ? "Choose a new password that is different from the current one."
          : "We couldn't change your password. Please try again.",
    );
  };

  return (
    <>
      {/* Title card */}
      <div className="mx-auto w-full max-w-md rounded-3xl bg-[#F8FAFC] p-3 min-[360px]:p-4">
        <div className="rounded-2xl bg-white p-4 min-[360px]:p-5">
          <button
            type="button"
            onClick={onBack}
            aria-label="Back to security"
            className="-mt-2 -ml-2 flex min-h-11 touch-manipulation items-center pr-3 pl-1 text-[0.75rem] font-normal text-[#6B7280]"
          >
            <MdOutlineKeyboardArrowLeft size={16} aria-hidden="true" />
            Password
          </button>

          <h1 className="mt-1 text-[1rem] font-medium text-[#111827]">
            Change password
          </h1>
          <p className="mt-1 text-[0.875rem] font-normal text-[#6B7280]">
            Keep your account protected at all times.
          </p>
        </div>
      </div>

      {/* Change password form */}
      <section className="mx-auto mt-4 w-full max-w-md rounded-3xl bg-[#F8FAFC] p-3 min-[360px]:p-4">
        <form
          noValidate
          onSubmit={handleSubmit}
          className="rounded-xl bg-white p-3 min-[360px]:p-4"
        >
          <div className="flex flex-col gap-4">
            <PasswordField
              id="current-password"
              label="Password"
              placeholder="Enter Password"
              autoComplete="current-password"
              value={current}
              onChange={(v) => {
                setCurrent(v);
                setError("");
              }}
            />
            <PasswordField
              id="new-password"
              label="New Password"
              placeholder="Enter New Password"
              autoComplete="new-password"
              value={next}
              onChange={(v) => {
                setNext(v);
                setError("");
              }}
            />
            <PasswordField
              id="confirm-password"
              label="Confirm Password"
              placeholder="Re-Enter Password"
              autoComplete="new-password"
              value={confirm}
              onChange={(v) => {
                setConfirm(v);
                setError("");
              }}
            />
          </div>

          {(error || message) && (
            <p
              role="alert"
              className="mt-4 text-[0.75rem] font-normal text-[#E74C3C]"
            >
              {error || message}
            </p>
          )}

          <button
            type="submit"
            disabled={!canUpdate || busy}
            className="mt-5 min-h-10 touch-manipulation rounded-xl bg-[#1A7431] px-4 text-[0.875rem] font-normal text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy ? "Updating…" : "Update Password"}
          </button>
        </form>
      </section>

      {/* Forgotten password */}
      <section className="mx-auto mt-4 w-full max-w-md rounded-3xl bg-[#F8FAFC] p-3 min-[360px]:p-4">
        <div className="flex items-center justify-between gap-3 rounded-xl bg-white p-3 min-[360px]:gap-4 min-[360px]:p-4">
          <div className="min-w-0">
            <p className="text-[0.875rem] font-normal text-[#111827]">
              Forgotten password
            </p>
            <p className="text-[0.75rem] font-normal text-[#6B7280]">
              Send a reset link to your email
            </p>
          </div>

          <button
            type="button"
            className="flex min-h-9 shrink-0 whitespace-nowrap touch-manipulation items-center gap-1 rounded-lg bg-[#F1F4F8] px-3 text-[0.875rem] font-normal text-[#111827]"
          >
            Send reset code
            <MdOutlineKeyboardArrowRight size={16} aria-hidden="true" />
          </button>
        </div>
      </section>
    </>
  );
};

// The Help & Support screen, shown inside the Settings page
const supportDetails = [
  {
    label: "Support Email",
    value: "planorasupport@gmail.com",
    href: "mailto:planorasupport@gmail.com",
  },
  {
    label: "Support Phone number",
    value: "+2349024576789",
    href: "tel:+2349024576789",
  },
];

// Placeholder: replace with your real release notes
const whatsNewNotes = ["Version 1.0.0"];

const HelpScreen = ({ onBack }: { onBack: () => void }) => {
  const [showNew, setShowNew] = useState(false);

  return (
    <>
      {/* Title card */}
      <div className="mx-auto w-full max-w-md rounded-3xl bg-[#F8FAFC] p-3 min-[360px]:p-4">
        <div className="rounded-2xl bg-white p-4 min-[360px]:p-5">
          <button
            type="button"
            onClick={onBack}
            aria-label="Back to settings"
            className="-mt-2 -ml-2 flex min-h-11 touch-manipulation items-center pr-3 pl-1 text-[0.75rem] font-normal text-[#6B7280]"
          >
            <MdOutlineKeyboardArrowLeft size={16} aria-hidden="true" />
            Help &amp; Support
          </button>

          <h1 className="mt-1 text-[1rem] font-medium text-[#111827]">
            Talk to us
          </h1>
          <p className="mt-1 text-[0.875rem] font-normal text-[#6B7280]">
            Get assistance, find answers, and contact support whenever you need
            help.
          </p>
        </div>
      </div>

      {/* Contact details and what's new */}
      <section className="mx-auto mt-4 w-full max-w-md rounded-3xl bg-[#F8FAFC] p-3 min-[360px]:p-4">
        <ul className="divide-y divide-[#D8E5F3] rounded-xl bg-white px-3 min-[360px]:px-4">
          {supportDetails.map(({ label, value, href }) => (
            <li key={label}>
              <a
                href={href}
                className="flex touch-manipulation items-center justify-between gap-3 py-4 min-[360px]:gap-4"
              >
                <span className="shrink-0 text-[0.875rem] font-normal text-[#111827]">
                  {label}
                </span>
                <span className="min-w-0 text-right text-[0.75rem] font-normal break-words text-[#6B7280]">
                  {value}
                </span>
              </a>
            </li>
          ))}

          <li>
            <button
              type="button"
              onClick={() => setShowNew((open) => !open)}
              aria-expanded={showNew}
              className="flex w-full touch-manipulation items-center justify-between gap-3 py-4 text-left min-[360px]:gap-4"
            >
              <span className="text-[0.875rem] font-normal text-[#111827]">
                What&apos;s New
              </span>
              <MdOutlineKeyboardArrowDown
                size={20}
                className={`shrink-0 text-[#6B7280] transition-transform ${
                  showNew ? "rotate-180" : ""
                }`}
                aria-hidden="true"
              />
            </button>

            {showNew && (
              <ul className="pb-4 text-[0.75rem] font-normal text-[#6B7280]">
                {whatsNewNotes.map((note) => (
                  <li key={note}>{note}</li>
                ))}
              </ul>
            )}
          </li>
        </ul>
      </section>
    </>
  );
};

// The Sync & Back up screen, shown inside the Settings page
const syncOptions = [
  {
    id: "auto",
    label: "Automatic sync",
    description: "Keep your data up to date in the background",
  },
  {
    id: "wifi",
    label: "Sync over Wi-Fi only",
    description: "Avoid using mobile data",
  },
];

const SyncScreen = ({
  onBack,
  onSynced,
}: {
  onBack: () => void;
  // Called after a backup has really been saved
  onSynced: () => void;
}) => {
  // Which switches are on. Both start on, as in the design.
  const [enabled, setEnabled] = useState<Record<string, boolean>>({
    auto: true,
    wifi: true,
  });
  const [backup, setBackup] = useState<Backup | null>(readBackup);
  const [now, setNow] = useState(Date.now());
  const [error, setError] = useState("");

  // Keeps "Last synced" fresh while the screen is open
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(timer);
  }, []);

  const handleSync = () => {
    if (runBackup()) {
      setBackup(readBackup());
      setNow(Date.now());
      setError("");
      onSynced();
    } else {
      setError("We couldn't back up your data. Please try again.");
    }
  };

  return (
    <>
      {/* Title card */}
      <div className="mx-auto w-full max-w-md rounded-3xl bg-[#F8FAFC] p-3 min-[360px]:p-4">
        <div className="rounded-2xl bg-white p-4 min-[360px]:p-5">
          <button
            type="button"
            onClick={onBack}
            aria-label="Back to settings"
            className="-mt-2 -ml-2 flex min-h-11 touch-manipulation items-center pr-3 pl-1 text-[0.75rem] font-normal text-[#6B7280]"
          >
            <MdOutlineKeyboardArrowLeft size={16} aria-hidden="true" />
            Sync &amp; Back up
          </button>

          <h1 className="mt-1 text-[1rem] font-medium text-[#111827]">
            Back your data
          </h1>
          <p className="mt-1 text-[0.875rem] font-normal text-[#6B7280]">
            Automatically sync and save your information securely.
          </p>
        </div>
      </div>

      {/* Switches */}
      <section className="mx-auto mt-4 w-full max-w-md rounded-3xl bg-[#F8FAFC] p-3 min-[360px]:p-4">
        <ul className="divide-y divide-[#D8E5F3] rounded-xl bg-white px-3 min-[360px]:px-4">
          {syncOptions.map(({ id, label, description }) => (
            <li
              key={id}
              className="flex items-center justify-between gap-3 py-4 min-[360px]:gap-4"
            >
              <div className="min-w-0">
                <p className="text-[0.875rem] font-normal text-[#111827]">
                  {label}
                </p>
                <p className="text-[0.75rem] font-normal text-[#6B7280]">
                  {description}
                </p>
              </div>

              <button
                type="button"
                role="switch"
                aria-checked={enabled[id]}
                aria-label={label}
                onClick={() =>
                  setEnabled((prev) => ({ ...prev, [id]: !prev[id] }))
                }
                className={`relative h-6 w-11 shrink-0 touch-manipulation rounded-full transition-colors before:absolute before:-inset-x-1 before:-inset-y-2.5 ${
                  enabled[id] ? "bg-[#1A7431]" : "bg-[#D8E5F3]"
                }`}
              >
                <span
                  className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white transition-transform ${
                    enabled[id] ? "translate-x-5" : ""
                  }`}
                />
              </button>
            </li>
          ))}
        </ul>
      </section>

      {/* Sync details, from the last backup */}
      <section className="mx-auto mt-4 w-full max-w-md rounded-3xl bg-[#F8FAFC] p-3 min-[360px]:p-4">
        <div className="flex flex-col gap-5 rounded-xl bg-white p-4 text-[0.75rem] font-normal text-[#6B7280]">
          <p>
            Last synced: {backup ? formatAgo(backup.savedAt, now) : "never"}
          </p>
          <p>Backup size: {backup ? formatSize(backup.size) : "—"}</p>
        </div>
      </section>

      {error && (
        <p
          role="alert"
          className="mx-auto mt-4 w-full max-w-md px-1 text-[0.75rem] font-normal text-[#E74C3C]"
        >
          {error}
        </p>
      )}

      <button
        type="button"
        onClick={handleSync}
        className="mx-auto mt-4 flex min-h-12 w-full max-w-md touch-manipulation items-center justify-center gap-2 rounded-xl bg-white text-[0.875rem] text-[#1A7431]"
      >
        <FiRefreshCw size={16} aria-hidden="true" />
        Sync Now
      </button>
    </>
  );
};

// The Privacy screen, shown inside the Settings page
const privacyOptions = [
  {
    id: "analytics",
    label: "Share usage analytics",
    description: "Help us improve the app anonymously",
    on: true,
  },
  {
    id: "crash",
    label: "Send crash reports",
    description: "Automatically report errors",
    on: true,
  },
  {
    id: "suggestions",
    label: "Personalized suggestions",
    description: "Use your activity to tailor suggestions",
    on: false,
  },
];

const PrivacyScreen = ({ onBack }: { onBack: () => void }) => {
  // Which switches are on. Starts as in the design.
  const [enabled, setEnabled] = useState<Record<string, boolean>>(
    Object.fromEntries(privacyOptions.map((o) => [o.id, o.on])),
  );

  return (
    <>
      {/* Title card */}
      <div className="mx-auto w-full max-w-md rounded-3xl bg-[#F8FAFC] p-3 min-[360px]:p-4">
        <div className="rounded-2xl bg-white p-4 min-[360px]:p-5">
          <button
            type="button"
            onClick={onBack}
            aria-label="Back to settings"
            className="-mt-2 -ml-2 flex min-h-11 touch-manipulation items-center pr-3 pl-1 text-[0.75rem] font-normal text-[#6B7280]"
          >
            <MdOutlineKeyboardArrowLeft size={16} aria-hidden="true" />
            Privacy
          </button>

          <h1 className="mt-1 text-[1rem] font-medium text-[#111827]">
            End-to-end encrypted
          </h1>
          <p className="mt-1 text-[0.875rem] font-normal text-[#6B7280]">
            Your tasks and projects are encrypted on your device before syncing
            to our servers.
          </p>
        </div>
      </div>

      {/* Switches and export */}
      <section className="mx-auto mt-4 w-full max-w-md rounded-3xl bg-[#F8FAFC] p-3 min-[360px]:p-4">
        <ul className="divide-y divide-[#D8E5F3] rounded-xl bg-white px-3 min-[360px]:px-4">
          {privacyOptions.map(({ id, label, description }) => (
            <li
              key={id}
              className="flex items-center justify-between gap-3 py-4 min-[360px]:gap-4"
            >
              <div className="min-w-0">
                <p className="text-[0.875rem] font-normal text-[#111827]">
                  {label}
                </p>
                <p className="text-[0.75rem] font-normal text-[#6B7280]">
                  {description}
                </p>
              </div>

              <button
                type="button"
                role="switch"
                aria-checked={enabled[id]}
                aria-label={label}
                onClick={() =>
                  setEnabled((prev) => ({ ...prev, [id]: !prev[id] }))
                }
                className={`relative h-6 w-11 shrink-0 touch-manipulation rounded-full transition-colors before:absolute before:-inset-x-1 before:-inset-y-2.5 ${
                  enabled[id] ? "bg-[#1A7431]" : "bg-[#D8E5F3]"
                }`}
              >
                <span
                  className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white transition-transform ${
                    enabled[id] ? "translate-x-5" : ""
                  }`}
                />
              </button>
            </li>
          ))}

          <li className="flex items-center justify-between gap-3 py-4 min-[360px]:gap-4">
            <div className="min-w-0">
              <p className="text-[0.875rem] font-normal text-[#111827]">
                Export Data
              </p>
              <p className="text-[0.75rem] font-normal text-[#6B7280]">
                Download a copy of your tasks
              </p>
            </div>

            <button
              type="button"
              className="flex min-h-9 shrink-0 touch-manipulation items-center gap-1 rounded-lg bg-[#F1F4F8] px-3 text-[0.875rem] font-normal whitespace-nowrap text-[#111827]"
            >
              Export
              <MdOutlineKeyboardArrowRight size={16} aria-hidden="true" />
            </button>
          </li>
        </ul>
      </section>
    </>
  );
};

// The About screen, shown inside the Settings page
const appDetails = [
  { label: "Build", value: "2026.05.11" },
  { label: "Platform", value: "Mobile" },
  { label: "Developer", value: "Planora Team" },
];

const AboutScreen = ({ onBack }: { onBack: () => void }) => (
  <>
    {/* Title card */}
    <div className="mx-auto w-full max-w-md rounded-3xl bg-[#F8FAFC] p-3 min-[360px]:p-4">
      <div className="rounded-2xl bg-white p-4 min-[360px]:p-5">
        <button
          type="button"
          onClick={onBack}
          aria-label="Back to settings"
          className="-mt-2 -ml-2 flex min-h-11 touch-manipulation items-center pr-3 pl-1 text-[0.75rem] font-normal text-[#6B7280]"
        >
          <MdOutlineKeyboardArrowLeft size={16} aria-hidden="true" />
          About
        </button>

        <h1 className="mt-1 text-[1rem] font-medium text-[#111827]">
          App Information
        </h1>
        <p className="mt-1 text-[0.875rem] font-normal text-[#6B7280]">
          View details about the app, version, and developer.
        </p>
      </div>
    </div>

    {/* App icon, name and version */}
    <section className="mx-auto mt-4 w-full max-w-md rounded-3xl bg-[#F8FAFC] p-3 min-[360px]:p-4">
      <div className="flex flex-col items-center rounded-xl bg-white px-4 py-6">
        {/* Placeholder icon: replace with your logo, e.g. <img src={logo} alt="" className="h-16 w-16 rounded-2xl" /> */}
        <div
          aria-hidden="true"
          className="flex h-16 w-16 items-center justify-center rounded-2xl bg-[#EEF3F9] text-[2rem] font-bold text-[#1A7431]"
        >
          P
        </div>

        <h2 className="mt-4 text-[0.875rem] font-medium text-[#111827]">
          Planora
        </h2>
        <p className="mt-1 text-[0.75rem] font-normal text-[#6B7280]">
          Version 1.0.0
        </p>
      </div>
    </section>

    {/* Build, platform and developer */}
    <section className="mx-auto mt-4 w-full max-w-md rounded-3xl bg-[#F8FAFC] p-3 min-[360px]:p-4">
      <dl className="divide-y divide-[#D8E5F3] rounded-xl bg-white px-3 min-[360px]:px-4">
        {appDetails.map(({ label, value }) => (
          <div
            key={label}
            className="flex items-center justify-between gap-3 py-4 min-[360px]:gap-4"
          >
            <dt className="shrink-0 text-[0.875rem] font-normal text-[#111827]">
              {label}
            </dt>
            <dd className="min-w-0 text-right text-[0.75rem] font-normal break-words text-[#6B7280]">
              {value}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  </>
);

// The Edit screen: a pop-up over the Profile screen
const EditProfileModal = ({
  data,
  onSave,
  onClose,
}: {
  data: ProfileData;
  // Returns true when the changes were saved (the page then closes this pop-up)
  onSave: (next: ProfileData) => boolean;
  onClose: () => void;
}) => {
  // Changes are kept here until "Save changes", so Cancel throws them away
  const [name, setName] = useState(data.name);
  const [email, setEmail] = useState(data.email);
  const [photo, setPhoto] = useState(data.photo);
  const [error, setError] = useState("");

  const panelRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const canSave = name.trim() !== "" && /^\S+@\S+\.\S+$/.test(email.trim());

  useEffect(() => {
    // Move focus into the pop-up, and give it back to the Edit button on close
    const previouslyFocused = document.activeElement as HTMLElement | null;
    panelRef.current?.focus();

    // Stop the page behind from scrolling while the pop-up is open
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    // Escape closes it
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
      previouslyFocused?.focus();
    };
  }, [onClose]);

  // Shrinks the chosen picture and shows it straight away
  const handlePhoto = async (file: File | undefined) => {
    if (!file || !file.type.startsWith("image/")) return;
    try {
      setPhoto(await readAndShrink(file));
      setError("");
    } catch {
      setError("That picture couldn't be used. Please try another one.");
    }
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!canSave) return;

    // TODO: send the changes to your backend too, and close only after it succeeds
    const saved = onSave({ name: name.trim(), email: email.trim(), photo });

    if (!saved) {
      setError(
        "We couldn't save your changes. Free up some space or try a different picture, then try again.",
      );
    }
  };

  return (
    // Dark backdrop. It scrolls if the pop-up is taller than the screen
    // (small phones, landscape, keyboard open); tapping outside closes it.
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="fixed inset-0 z-50 flex overflow-y-auto overscroll-contain bg-black/50 px-4 pt-[max(16px,env(safe-area-inset-top))] pb-[max(16px,env(safe-area-inset-bottom))]"
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="Edit profile"
        tabIndex={-1}
        className="m-auto w-full max-w-[343px] rounded-3xl bg-white p-4 outline-none min-[360px]:p-5"
      >
        <form noValidate onSubmit={handleSubmit}>
          {/* Photo */}
          <div className="rounded-3xl bg-[#F8FAFC] p-3">
            <div className="flex flex-col items-center gap-3 rounded-2xl bg-white px-4 py-6">
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                aria-label="Change profile photo"
                className="relative touch-manipulation"
              >
                <img
                  src={photo}
                  alt=""
                  className="h-[clamp(76px,24vw,92px)] w-[clamp(76px,24vw,92px)] rounded-2xl bg-[#EEF3F9] object-cover"
                />
                <span className="absolute -right-1.5 -bottom-1.5 flex h-6 w-6 items-center justify-center rounded-lg border-2 border-white bg-[#D8E5F3] text-[#1E3A5F]">
                  <FiCamera size={12} aria-hidden="true" />
                </span>
              </button>

              <p className="text-[0.75rem] font-normal text-[#6B7280]">
                Tap to change photo
              </p>

              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  handlePhoto(e.target.files?.[0]);
                  e.target.value = ""; // lets the same picture be chosen again
                }}
              />
            </div>
          </div>

          {/* Fields */}
          <div className="mt-5 flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <label
                htmlFor="edit-name"
                className="text-[0.875rem] font-medium text-[#111827]"
              >
                Display Name
              </label>
              <input
                id="edit-name"
                name="name"
                type="text"
                autoComplete="name"
                enterKeyHint="next"
                placeholder="Enter your name"
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  setError("");
                }}
                style={{ fontSize: "16px" }}
                className={inputClass}
              />
            </div>

            <div className="flex flex-col gap-2">
              <label
                htmlFor="edit-email"
                className="text-[0.875rem] font-medium text-[#111827]"
              >
                Email
              </label>
              <input
                id="edit-email"
                name="email"
                type="email"
                inputMode="email"
                autoComplete="email"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                enterKeyHint="done"
                placeholder="Enter your email"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  setError("");
                }}
                style={{ fontSize: "16px" }}
                className={inputClass}
              />
            </div>
          </div>

          {/* Shown if the picture or the saving failed */}
          {error && (
            <p
              role="alert"
              className="mt-4 text-[0.75rem] font-normal text-[#E74C3C]"
            >
              {error}
            </p>
          )}

          {/* Actions */}
          <div className="mt-6 flex flex-wrap justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="min-h-10 touch-manipulation rounded-xl border border-[#D8E5F3] bg-white px-4 text-[0.875rem] font-normal text-[#6B7280]"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!canSave}
              className="min-h-10 touch-manipulation rounded-xl bg-[#1A7431] px-4 text-[0.875rem] font-normal text-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              Save changes
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

const Setings = () => {
  const [screen, setScreen] = useState<Screen>("settings");
  // Starts from what was saved before, so changes survive a refresh
  const [profileData, setProfileData] = useState<ProfileData>(loadProfile);
  const [isEditing, setIsEditing] = useState(false);
  const [toast, setToast] = useState("");
  const navigate = useNavigate();

  const closeEdit = useCallback(() => setIsEditing(false), []);

  // Hide the success message after a moment
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(""), 2500);
    return () => clearTimeout(timer);
  }, [toast]);

  // Saves the changes, then closes the pop-up and confirms
  const handleSave = (next: ProfileData): boolean => {
    if (!storeProfile(next)) return false; // the pop-up shows the error

    setProfileData(next);
    setIsEditing(false);
    setToast("Profile updated successfully");
    return true;
  };

  // The Profile row shows the saved name and email
  const accountList = accountItems.map((item) =>
    item.opens === "profile"
      ? {
          ...item,
          description: `${profileData.name} · ${profileData.email}`,
        }
      : item,
  );

  return (
    // touch-manipulation stops double-tap zoom, text-size-adjust stops phones
    // from silently enlarging text, and the padding keeps content clear of
    // notches and home bars on every phone
    <div className="min-h-dvh touch-manipulation bg-[#F1F4F8] pt-4 pr-[max(clamp(12px,4vw,16px),env(safe-area-inset-right))] pb-[max(24px,env(safe-area-inset-bottom))] pl-[max(clamp(12px,4vw,16px),env(safe-area-inset-left))] [-webkit-text-size-adjust:100%] [text-size-adjust:100%]">
      {screen === "profile" ? (
        <ProfileScreen
          data={profileData}
          onBack={() => setScreen("settings")}
          onEdit={() => setIsEditing(true)}
        />
      ) : screen === "notifications" ? (
        <NotificationsScreen onBack={() => setScreen("settings")} />
      ) : screen === "theme" ? (
        <ThemeScreen onBack={() => setScreen("settings")} />
      ) : screen === "security" ? (
        <SecurityScreen
          onBack={() => setScreen("settings")}
          onOpenPassword={() => setScreen("password")}
          onSignOutAll={async () => {
            await signOutEverywhere();
            // replace: the Back button can't return to the signed-in pages
            navigate(SIGN_IN_PATH, { replace: true });
          }}
        />
      ) : screen === "password" ? (
        <PasswordScreen
          onBack={() => setScreen("security")}
          onChanged={() => setToast("Password successfully changed")}
        />
      ) : screen === "help" ? (
        <HelpScreen onBack={() => setScreen("settings")} />
      ) : screen === "sync" ? (
        <SyncScreen
          onBack={() => setScreen("settings")}
          onSynced={() => setToast("Backup completed")}
        />
      ) : screen === "privacy" ? (
        <PrivacyScreen onBack={() => setScreen("settings")} />
      ) : screen === "about" ? (
        <AboutScreen onBack={() => setScreen("settings")} />
      ) : (
        <>
          <div className="mx-auto w-full max-w-md rounded-3xl bg-[#F8FAFC] p-3 min-[360px]:p-4">
            <div className="rounded-2xl bg-white p-4 min-[360px]:p-5">
              <h1 className="text-[1rem] font-medium text-[#111827]">
                Settings
              </h1>
              <p className="mt-1 text-[0.875rem] text-[#6B7280]">
                Group your work into focused streams.
              </p>
            </div>
          </div>

          <SettingsGroup
            items={accountList}
            onOpen={setScreen}
            className="mt-4"
          />

          <p className="mx-auto mt-6 w-full max-w-md px-4 text-[0.875rem] font-medium text-[#C6CCD3]">
            More
          </p>

          <SettingsGroup
            items={moreItems}
            onOpen={setScreen}
            className="mt-2"
          />
        </>
      )}

      {/* The Edit screen, on top of the Profile screen */}
      {isEditing && (
        <EditProfileModal
          data={profileData}
          onSave={handleSave}
          onClose={closeEdit}
        />
      )}

      {/* Success message */}
      {toast && (
        <div
          role="status"
          className="pointer-events-none fixed inset-x-0 bottom-[calc(6rem+env(safe-area-inset-bottom))] z-[60] flex justify-center px-4"
        >
          <p className="rounded-xl bg-[#1A7431] px-4 py-3 text-[0.875rem] text-white shadow-lg">
            {toast}
          </p>
        </div>
      )}
    </div>
  );
};

export default Setings;
