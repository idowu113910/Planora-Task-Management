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
    if (/^https?:\/\//i.test(text)) return text;
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
