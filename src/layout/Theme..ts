import { useSyncExternalStore } from "react";

/* ========================================================================== */
/*                         LIGHT / DARK / SYSTEM THEME                        */
/* ========================================================================== */
// One place that controls the theme of the whole app.
//
//   "system"  follows the device (and changes by itself when the device does)
//   "light"   always light
//   "dark"    always dark
//
// The choice is kept in this browser. Dark mode works by adding the class
// "dark" to <html>; the colours below are swapped under that class, so none of
// the pages need to change. Import this file once at the top of main.tsx
// (import "./theme";) so the saved theme is applied the moment the app opens.

export type ThemePreference = "system" | "light" | "dark";

const THEME_KEY = "planora-theme";
const DARK_QUERY = "(prefers-color-scheme: dark)";

// What the browser's address bar / status bar is painted with
const THEME_COLOR = { light: "#F1F4F8", dark: "#0B0F14" };

/* ----------------------------- THE DARK COLOURS ---------------------------- */
// Light colour used in the app -> its dark replacement. To adjust the dark look
// change the right-hand side of any line.

const BACKGROUNDS: Record<string, string> = {
  "#F8F9FB": "#0B0F14", // sign in / sign up page
  "#F1F4F8": "#2A3441", // small pills and chips (the page itself is below)
  "#F8FAFC": "#151B23", // outer cards, inputs
  "#FFFFFF": "#151B23", // cards sitting straight on the page
  "#FAFBFC": "#1D252F", // code boxes
  "#FAFAFA": "#1D252F",
  "#EEF3F9": "#26303C", // picture frame
  "#D8E5F3": "#3A4452", // switch track when off, radio when off
  "#C6CCD3": "#3A4452",
  "#FFFDF5": "#231F10", // high priority card
  "#F5FFF8": "#10241A", // completed card
  "#A9D0B4": "#2F5A3B", // disabled green button
};

const TEXTS: Record<string, string> = {
  "#111827": "#F3F4F6",
  "#1E1E1E": "#F3F4F6",
  "#1D1B20": "#F3F4F6",
  "#2C3E50": "#E5E7EB",
  "#374151": "#D1D5DB",
  "#4B5563": "#B6BDC8",
  "#525252": "#C4C4C4",
  "#5F6F65": "#A9B7AE",
  "#6B7280": "#9CA3AF",
  "#7F8C8D": "#9AA5A6",
  "#9CA3AF": "#7A8494",
  "#1E3A5F": "#BFD3EE",
  "#1A2B4C": "#BFD3EE",
  "#1A7431": "#4FC271", // brand green, lighter so it reads on dark
};

const BORDERS: Record<string, string> = {
  "#D8E5F3": "#2A3441",
  "#E5EAF1": "#2F3946",
  "#E1E7F0": "#2F3946",
  "#D5DAE1": "#3A4452",
  "#D9D9D9": "#3A4452",
  "#C6CCD3": "#3A4452",
  "#EEF2F7": "#232C37",
  "#1A2B4C": "#8FA9CC",
};

const DIVIDERS: Record<string, string> = {
  "#D8E5F3": "#2A3441",
  "#EEF1F5": "#232C37",
  "#F1EEDF": "#3A3523",
  "#E1F1E6": "#1F3A2A",
};

const PLACEHOLDERS: Record<string, string> = {
  "#C6CCD3": "#5B6675",
  "#C3CAD4": "#5B6675",
  "#B3B3B3": "#5B6675",
};

// Turns a class name like  bg-[#F8FAFC]  into  .bg-\[\#F8FAFC\]
const cls = (name: string) =>
  "." + name.replace(/[^a-zA-Z0-9_-]/g, (c) => "\\" + c);

const buildDarkCss = (): string => {
  const out: string[] = [];
  const D = "html.dark ";

  // The page itself: the full-height wrapper of each screen
  out.push(
    `${D}body{background-color:#0B0F14;color:#F3F4F6}`,
    `${D}.min-h-dvh${cls("bg-[#F1F4F8]")},${D}.min-h-screen${cls("bg-[#F1F4F8]")}{background-color:#0B0F14}`,
  );

  for (const [light, dark] of Object.entries(BACKGROUNDS)) {
    out.push(`${D}${cls(`bg-[${light}]`)}{background-color:${dark}}`);
  }
  // The page wrapper rule above must win over the pill rule for #F1F4F8
  out.push(
    `${D}.min-h-dvh${cls("bg-[#F1F4F8]")},${D}.min-h-screen${cls("bg-[#F1F4F8]")}{background-color:#0B0F14}`,
  );

  // White surfaces (pop-ups, inner cards). Round white things such as the
  // switch knob and the empty tick circle stay white.
  out.push(
    `${D}.bg-white:not([class*="rounded-full"]){background-color:#1D252F}`,
    `${D}.border-white{border-color:#1D252F}`,
  );

  for (const [light, dark] of Object.entries(TEXTS)) {
    out.push(`${D}${cls(`text-[${light}]`)}{color:${dark}}`);
  }
  for (const [light, dark] of Object.entries(BORDERS)) {
    out.push(`${D}${cls(`border-[${light}]`)}{border-color:${dark}}`);
  }
  for (const [light, dark] of Object.entries(DIVIDERS)) {
    out.push(
      `${D}${cls(`divide-[${light}]`)}>:not(:last-child){border-color:${dark}}`,
    );
  }
  for (const [light, dark] of Object.entries(PLACEHOLDERS)) {
    out.push(
      `${D}${cls(`placeholder:text-[${light}]`)}::placeholder{color:${dark}}`,
    );
  }

  // The layout that holds every page and the bottom bar has its own light
  // background (with space at the bottom for the bar). It must be the page
  // colour, or a lighter strip shows when you scroll to the bottom.
  out.push(
    `${D}${cls("bg-[#F1F4F8]")}${cls("pb-28")}{background-color:#0B0F14}`,
    `${D}nav[aria-label="Main"]{background-color:#151B23}`,
  );

  // Round white things that must go dark too: the search and notification
  // icons at the top of Home (the icon is light, so its circle can't stay
  // white) and the empty tick circles beside tasks. The switch knob has no
  // border and stays white.
  out.push(
    `${D}svg.bg-white{background-color:#1D252F}`,
    `${D}.bg-white.rounded-full.border{background-color:#1D252F}`,
  );

  out.push(`${D}.text-black{color:#F3F4F6}`);

  // Drawn shapes: the soft shapes behind the headers and the ring tracks
  out.push(
    `${D}[fill="#EBEFF5"]{fill:#151B23}`,
    `${D}[stroke="#D9E6F2"]{stroke:#2A3441}`,
  );

  // Dark pop-up shadows disappear on dark, so give menus a thin edge
  out.push(
    `${D}[role="menu"],${D}[role="dialog"],${D}[role="alertdialog"]{border:1px solid #2A3441}`,
  );

  return out.join("\n");
};

/* --------------------------------- THE LOGIC ------------------------------- */

const isPreference = (v: unknown): v is ThemePreference =>
  v === "system" || v === "light" || v === "dark";

export const getThemePreference = (): ThemePreference => {
  try {
    const saved = localStorage.getItem(THEME_KEY);
    return isPreference(saved) ? saved : "system";
  } catch {
    return "system";
  }
};

const systemIsDark = (): boolean =>
  typeof window !== "undefined" &&
  typeof window.matchMedia === "function" &&
  window.matchMedia(DARK_QUERY).matches;

// Puts the theme on the page
const applyTheme = (pref: ThemePreference) => {
  const dark = pref === "dark" || (pref === "system" && systemIsDark());
  const root = document.documentElement;
  root.classList.toggle("dark", dark);
  root.style.colorScheme = dark ? "dark" : "light";

  let meta = document.querySelector<HTMLMetaElement>(
    'meta[name="theme-color"]',
  );
  if (!meta) {
    meta = document.createElement("meta");
    meta.name = "theme-color";
    document.head.appendChild(meta);
  }
  meta.content = dark ? THEME_COLOR.dark : THEME_COLOR.light;
};

// Everyone who is listening for a change of the chosen option (the Settings
// screen shows it)
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

export const setThemePreference = (pref: ThemePreference) => {
  try {
    localStorage.setItem(THEME_KEY, pref);
  } catch {
    // storage blocked: the choice lasts until the page is closed
  }
  applyTheme(pref);
  notify();
};

let started = false;

// Runs once: adds the dark colours, applies the saved choice, and keeps
// following the device while "System" is chosen
const initTheme = () => {
  if (started || typeof document === "undefined") return;
  started = true;

  const style = document.createElement("style");
  style.id = "planora-dark-theme";
  style.textContent = buildDarkCss();
  document.head.appendChild(style);

  applyTheme(getThemePreference());

  // The device switched between light and dark
  if (typeof window.matchMedia === "function") {
    const media = window.matchMedia(DARK_QUERY);
    const onSystemChange = () => {
      if (getThemePreference() === "system") applyTheme("system");
    };
    if (media.addEventListener)
      media.addEventListener("change", onSystemChange);
    else media.addListener(onSystemChange); // older Safari
  }

  // The choice was changed in another tab
  window.addEventListener("storage", (e) => {
    if (e.key === THEME_KEY || e.key === null) {
      applyTheme(getThemePreference());
      notify();
    }
  });
};

initTheme();

// For React: the chosen option, updating whenever it changes
export const useThemePreference = (): ThemePreference =>
  useSyncExternalStore(
    (onChange: () => void) => {
      listeners.add(onChange);
      return () => listeners.delete(onChange);
    },
    getThemePreference,
    () => "system" as ThemePreference,
  );

export const THEME_LABELS: Record<ThemePreference, string> = {
  system: "System",
  light: "Light",
  dark: "Dark",
};
