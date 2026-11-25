import { useEffect, useRef, useState } from "react";
import type { ImgHTMLAttributes } from "react";

/* ========================================================================== */
/*                  PROFILE PICTURE: FINDING IT AND SHOWING IT                */
/* ========================================================================== */
// Used by both the Home page and the Settings page, so a picture saved on the
// server shows up the same way on every device the person signs in on.

// Where the server lives. A picture link that starts with "/" belongs to it.
export const API_ORIGIN = "https://planora-uliy.onrender.com";

// A picture that can be shown: a picture stored in the browser (data:) or a
// link to one on the web
export const isPhoto = (photo: unknown): photo is string =>
  typeof photo === "string" &&
  (photo.startsWith("data:image/") || /^https?:\/\//i.test(photo));

// The names a server may give the picture, most likely first
const PHOTO_KEYS = [
  "avatar",
  "avatarUrl",
  "avatarURL",
  "avatar_url",
  "profilePicture",
  "profile_picture",
  "profilePic",
  "profile_pic",
  "profileImage",
  "profile_image",
  "profileImageUrl",
  "photo",
  "photoUrl",
  "photoURL",
  "photo_url",
  "image",
  "imageUrl",
  "imageURL",
  "image_url",
  "picture",
  "pictureUrl",
  "picture_url",
];

// When the picture is an object, the names its link may be kept under
const URL_KEYS = [
  "url",
  "secure_url",
  "secureUrl",
  "src",
  "path",
  "location",
  "link",
  "href",
  "publicUrl",
  "public_url",
  "imageUrl",
];

// A server behind a proxy (like Render) often builds picture links that start
// with "http://" even though the site is on "https://". Browsers block those
// on a secure page, so they are switched to "https://".
const upgradeToHttps = (url: string): string =>
  typeof window !== "undefined" &&
  window.location.protocol === "https:" &&
  /^http:\/\//i.test(url) &&
  !/^http:\/\/(localhost|127\.|192\.168\.)/i.test(url)
    ? url.replace(/^http:/i, "https:")
    : url;

// Turns whatever the server sends for the picture into a full link:
//   "https://..."                 used as it is
//   "/uploads/me.jpg"             the server's address is put in front
//   "uploads/me.jpg"              the same
//   { url: "..." }                the link inside is used
// Returns "" when there is no picture.
export const toPhotoUrl = (value: unknown, depth = 0): string => {
  if (typeof value === "string") {
    const text = value.trim().replace(/\\/g, "/");
    if (!text) return "";
    if (/^data:image\//i.test(text)) return text;
    if (/^https?:\/\//i.test(text)) return upgradeToHttps(text);
    if (text.startsWith("//")) return `https:${text}`;
    if (text.startsWith("/")) return `${API_ORIGIN}${text}`;
    // A path such as "uploads/me.jpg". A plain word like "default" is not one.
    if (
      text.includes("/") ||
      /\.(png|jpe?g|gif|webp|avif|svg)(\?.*)?$/i.test(text)
    ) {
      return `${API_ORIGIN}/${text}`;
    }
    return "";
  }
  if (value && typeof value === "object" && depth < 3) {
    const body = value as Record<string, unknown>;
    for (const key of URL_KEYS) {
      const found = toPhotoUrl(body[key], depth + 1);
      if (found) return found;
    }
  }
  return "";
};

// Finds the picture in whatever shape the server answers GET /profile or
// /auth/me. Returns "" if the account has no picture.
export const findPhoto = (data: unknown): string => {
  if (!data || typeof data !== "object") return "";
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const body = data as Record<string, any>;
  const places = [
    body.user,
    body.profile,
    body.data?.profile,
    body.data?.user,
    body.data,
    body,
  ].filter((place) => place && typeof place === "object");

  for (const place of places) {
    for (const key of PHOTO_KEYS) {
      const found = toPhotoUrl(place[key]);
      if (found) return found;
    }
  }

  // Last resort: any field whose name looks like a picture
  for (const place of places) {
    for (const [key, value] of Object.entries(place)) {
      if (/avatar|photo|picture|image|profile_?pic/i.test(key)) {
        const found = toPhotoUrl(value);
        if (found) return found;
      }
    }
  }
  return "";
};

type ProfilePhotoProps = Omit<
  ImgHTMLAttributes<HTMLImageElement>,
  "src" | "onError"
> & {
  // The picture to show
  src: string;
  // Shown instead if the picture can't be loaded (for example the default avatar)
  fallbackSrc?: string;
};

// A picture that does not give up easily. Some servers refuse to let another
// website show their images in a plain <img> tag. If that happens, the picture
// is fetched in the way the app's other requests are, and shown from there.
// If that fails too, the fallback picture is shown instead of a broken image.
export const ProfilePhoto = ({
  src,
  fallbackSrc,
  alt = "",
  ...rest
}: ProfilePhotoProps) => {
  const [shown, setShown] = useState(src);
  const triedFetch = useRef(false);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  // A new picture was given: start again with it
  useEffect(() => {
    setShown(src);
    triedFetch.current = false;
  }, [src]);

  // A picture made by the fetch below is released when it is replaced
  useEffect(() => {
    return () => {
      if (shown.startsWith("blob:")) URL.revokeObjectURL(shown);
    };
  }, [shown]);

  const handleError = () => {
    if (!triedFetch.current && /^https?:\/\//i.test(src) && shown === src) {
      triedFetch.current = true;
      fetch(src, { mode: "cors", credentials: "omit" })
        .then((res) =>
          res.ok ? res.blob() : Promise.reject(new Error(String(res.status))),
        )
        .then((blob) => {
          if (!blob.type.startsWith("image/")) {
            throw new Error("not an image");
          }
          if (alive.current) setShown(URL.createObjectURL(blob));
        })
        .catch((error) => {
          console.warn("[profile] couldn't load the picture:", src, error);
          if (alive.current && fallbackSrc) setShown(fallbackSrc);
        });
      return;
    }
    if (fallbackSrc && shown !== fallbackSrc) setShown(fallbackSrc);
  };

  return <img {...rest} src={shown} alt={alt} onError={handleError} />;
};

/* ========================================================================== */
/*                       "WHY IS MY PICTURE MISSING?" BOX                     */
/* ========================================================================== */
// Open the Home page with ?photodebug=1 on the end of the address (for example
// /home?photodebug=1) and a box explains what the server sent for the picture
// and whether it can be loaded. Nothing shows without it.

export const isPhotoDebug = (): boolean => {
  try {
    return new URLSearchParams(window.location.search).has("photodebug");
  } catch {
    return false;
  }
};

// A readable reason from a failed request
export const describeError = (error: unknown): string => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const e = error as any;
  const status = e?.response?.status;
  const message = e?.response?.data?.message ?? e?.message ?? String(error);
  return status ? `${message} (status ${status})` : String(message);
};

const shorten = (value: unknown): string => {
  const text =
    typeof value === "string"
      ? value
      : (JSON.stringify(value) ?? String(value));
  if (text.startsWith("data:image/")) {
    return `a picture stored inside the answer (${text.length} characters)`;
  }
  return text.length > 140 ? `${text.slice(0, 140)}…` : text;
};

// Lists what the server's answer holds about the picture
export const describeProfileAnswer = (data: unknown): string[] => {
  if (!data || typeof data !== "object") {
    return ["The server's answer was empty, or not JSON."];
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const body = data as Record<string, any>;
  const lines = [
    `Fields in the answer: ${Object.keys(body).join(", ") || "none"}`,
  ];

  const places: [string, unknown][] = [
    ["", body],
    ["user", body.user],
    ["profile", body.profile],
    ["data", body.data],
    ["data.user", body.data?.user],
    ["data.profile", body.data?.profile],
  ];
  let found = false;
  for (const [label, place] of places) {
    if (!place || typeof place !== "object") continue;
    for (const [key, value] of Object.entries(place)) {
      if (/avatar|photo|picture|image|profile_?pic/i.test(key)) {
        found = true;
        lines.push(`${label ? `${label}.` : ""}${key} = ${shorten(value)}`);
      }
    }
  }
  if (!found) {
    lines.push(
      "No field named like avatar, photo, picture or image was found in the answer.",
    );
  }
  return lines;
};

// Tries to load a picture two ways and says what happened
export const checkPhotoLink = async (url: string): Promise<string> => {
  const shownByBrowser = await new Promise<string>((resolve) => {
    const img = new Image();
    const timer = setTimeout(() => resolve("took too long to load"), 20000);
    img.onload = () => {
      clearTimeout(timer);
      resolve("loads fine");
    };
    img.onerror = () => {
      clearTimeout(timer);
      resolve("could NOT be loaded by the browser");
    };
    img.src = url;
  });

  let fetched = "";
  if (/^https?:/i.test(url)) {
    try {
      const res = await fetch(url, { mode: "cors", credentials: "omit" });
      fetched = `; asked directly, the server answered ${res.status}`;
    } catch {
      fetched = "; asking directly was blocked (CORS) or failed";
    }
  }
  return `${shorten(url)} ${shownByBrowser}${fetched}`;
};

export const PhotoDebugBox = ({
  lines,
  onClose,
}: {
  lines: string[];
  onClose: () => void;
}) => (
  <div className="fixed inset-x-2 bottom-[calc(6rem+env(safe-area-inset-bottom))] z-[70] max-h-[55dvh] overflow-y-auto rounded-2xl bg-[#111827] p-3 text-[11px] leading-snug text-white shadow-lg">
    <div className="flex items-center justify-between gap-3">
      <strong className="text-[12px]">Picture check</strong>
      <button
        type="button"
        onClick={onClose}
        className="rounded-lg bg-white/15 px-3 py-1.5"
      >
        Close
      </button>
    </div>
    <ul className="mt-2 space-y-1.5 break-all">
      {lines.map((line, i) => (
        <li key={i}>{line}</li>
      ))}
    </ul>
  </div>
);
