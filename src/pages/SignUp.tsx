import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import {
  BsCheckCircleFill,
  BsCircle,
  BsEyeFill,
  BsEyeSlashFill,
} from "react-icons/bs";
import planora from "../assets/planora.svg";
import { FaApple } from "react-icons/fa6";
import { FcGoogle } from "react-icons/fc";
import { useNavigate } from "react-router-dom";
import { markSignedIn } from "../auth";

// Where to go after signing up with email: the verification page, which then
// takes the person to the home page once their code is right
const VERIFY_PATH = "/verify";

// Where to go after signing in with Apple or Google (no code needed)
const HOME_PATH = "/home";

// Your backend's endpoints
const SIGNUP_URL = "https://planora-uliy.onrender.com/api/auth/signup";
const OAUTH_URL = "https://planora-uliy.onrender.com/api/auth/oauth";

// Free hosting (like Render) puts the server to sleep when it is not used, and
// the first request can take up to a minute while it wakes up. We wait that long.
const REQUEST_TIMEOUT_MS = 60000;

// Where the signed-in user's email and token are kept in the browser. The
// WelcomeBack (sign in) screen reads the same keys.
const EMAIL_KEY = "planora_email";
const TOKEN_KEY = "planora_token";

// Apple and Google sign-in need these. Create them in the Google Cloud Console
// and the Apple Developer portal, then put them in your .env file:
//   VITE_GOOGLE_CLIENT_ID=...
//   VITE_APPLE_CLIENT_ID=...        (your Apple "Services ID")
//   VITE_APPLE_REDIRECT_URI=...     (optional, defaults to this site's address)
const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID as
  | string
  | undefined;
const APPLE_CLIENT_ID = import.meta.env.VITE_APPLE_CLIENT_ID as
  | string
  | undefined;
const APPLE_REDIRECT_URI =
  (import.meta.env.VITE_APPLE_REDIRECT_URI as string | undefined) ??
  (typeof window !== "undefined" ? window.location.origin : "");

const GOOGLE_SDK = "https://accounts.google.com/gsi/client";
const APPLE_SDK =
  "https://appleid.cdn-apple.com/appleauth/static/jsapi/appleid/1/en_US/appleid.auth.js";

type Provider = "google" | "apple";

type SignUpDetails = {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
};

// Thrown when the person closes the Apple / Google window on purpose, so we
// can quietly go back to the form instead of showing an error
class CancelledError extends Error {}

// Writes to localStorage without crashing when it is blocked (private mode etc.)
const writeStored = (key: string, value: string) => {
  try {
    localStorage.setItem(key, value);
  } catch {
    // storage unavailable: the person just won't stay signed in after a reload
  }
};

// Finds the readable message in whatever shape the server sends its errors
const readServerMessage = (data: unknown): string | null => {
  if (!data || typeof data !== "object") return null;
  const body = data as Record<string, unknown>;

  for (const key of ["message", "error", "msg"]) {
    const value = body[key];
    if (typeof value === "string" && value.trim()) return value;
  }

  if (Array.isArray(body.errors)) {
    const first: unknown = body.errors[0];
    if (typeof first === "string") return first;
    if (first && typeof first === "object") {
      const msg = (first as Record<string, unknown>).message;
      if (typeof msg === "string") return msg;
    }
  }
  return null;
};

// Sends JSON to the backend and returns whatever JSON it answers with.
// Throws an Error with a readable message if the request fails.
const postJson = async (
  url: string,
  body: unknown,
  fallbackMessage: string,
): Promise<unknown> => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (error) {
    throw new Error(
      error instanceof DOMException && error.name === "AbortError"
        ? "The server is taking too long to respond. Please try again."
        : "Can't reach the server. Check your internet connection and try again.",
    );
  } finally {
    clearTimeout(timer);
  }

  // The body may be empty or not JSON, which is fine
  let data: unknown = null;
  try {
    data = await response.json();
  } catch {
    data = null;
  }

  if (!response.ok) {
    throw new Error(
      readServerMessage(data) ??
        (response.status === 409
          ? "An account with this email already exists."
          : response.status >= 500
            ? "Something went wrong on our side. Please try again shortly."
            : fallbackMessage),
    );
  }

  return data;
};

// Looks for the token and the email in the usual places a server puts them.
// Change the names here if your backend uses different ones.
const readSession = (data: unknown): { token?: string; email?: string } => {
  if (!data || typeof data !== "object") return {};
  const body = data as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
  const token = body.token ?? body.accessToken ?? body.data?.token;
  const email = body.user?.email ?? body.data?.user?.email ?? body.email;
  return {
    token: typeof token === "string" && token ? token : undefined,
    email: typeof email === "string" && email ? email : undefined,
  };
};

// Sends the sign-up to the backend. Throws an Error with a readable message if
// it fails, and the person stays on this screen with that message shown.
const signUpWithEmail = async (details: SignUpDetails): Promise<void> => {
  const data = await postJson(
    SIGNUP_URL,
    details,
    "We couldn't create your account. Please check your details and try again.",
  );
  // Some backends sign the person in straight away. Keep the token if so.
  const { token } = readSession(data);
  if (token) writeStored(TOKEN_KEY, token);
  // The sign in screen needs the email later
  writeStored(EMAIL_KEY, details.email);
};

// Loads a script once and waits for it. Resolves straight away if it is
// already on the page.
const loadScript = (src: string): Promise<void> =>
  new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(
      `script[src="${src}"]`,
    );
    if (existing) {
      if (existing.dataset.loaded === "true") resolve();
      else {
        existing.addEventListener("load", () => resolve());
        existing.addEventListener("error", () =>
          reject(new Error("Couldn't load the sign-in window.")),
        );
      }
      return;
    }
    const script = document.createElement("script");
    script.src = src;
    script.async = true;
    script.onload = () => {
      script.dataset.loaded = "true";
      resolve();
    };
    script.onerror = () => {
      script.remove();
      reject(
        new Error(
          "Couldn't load the sign-in window. Check your connection and try again.",
        ),
      );
    };
    document.head.appendChild(script);
  });

// Opens Google's sign-in window and returns Google's token for the person
const getGoogleToken = async (): Promise<string> => {
  if (!GOOGLE_CLIENT_ID) {
    throw new Error("Google sign-in isn't set up yet.");
  }
  await loadScript(GOOGLE_SDK);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const google = (window as any).google;
  if (!google?.accounts?.oauth2) {
    throw new Error("Couldn't load Google sign-in. Please try again.");
  }

  return new Promise<string>((resolve, reject) => {
    const client = google.accounts.oauth2.initTokenClient({
      client_id: GOOGLE_CLIENT_ID,
      scope: "openid email profile",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      callback: (response: any) => {
        if (response?.access_token) resolve(response.access_token);
        else if (response?.error === "access_denied")
          reject(new CancelledError());
        else reject(new Error("Google sign-in failed. Please try again."));
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      error_callback: (error: any) => {
        if (
          error?.type === "popup_closed" ||
          error?.type === "popup_failed_to_open"
        ) {
          reject(
            error.type === "popup_closed"
              ? new CancelledError()
              : new Error(
                  "Your browser blocked the Google window. Allow pop-ups and try again.",
                ),
          );
        } else {
          reject(new Error("Google sign-in failed. Please try again."));
        }
      },
    });
    client.requestAccessToken();
  });
};

// Opens Apple's sign-in window and returns Apple's token (plus the person's
// name, which Apple only sends the very first time)
const getAppleToken = async (): Promise<{
  token: string;
  user?: unknown;
}> => {
  if (!APPLE_CLIENT_ID) {
    throw new Error("Apple sign-in isn't set up yet.");
  }
  await loadScript(APPLE_SDK);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const AppleID = (window as any).AppleID;
  if (!AppleID?.auth) {
    throw new Error("Couldn't load Apple sign-in. Please try again.");
  }

  AppleID.auth.init({
    clientId: APPLE_CLIENT_ID,
    scope: "name email",
    redirectURI: APPLE_REDIRECT_URI,
    usePopup: true,
  });

  try {
    const result = await AppleID.auth.signIn();
    const token = result?.authorization?.id_token;
    if (!token) throw new Error("Apple sign-in failed. Please try again.");
    return { token, user: result.user };
  } catch (error) {
    const code = (error as { error?: string })?.error;
    if (code === "popup_closed_by_user" || code === "user_cancelled_authorize")
      throw new CancelledError();
    if (error instanceof Error) throw error;
    throw new Error("Apple sign-in failed. Please try again.");
  }
};

// Signs in or signs up with Apple or Google. Gets the token from the provider,
// sends it to your backend's oauth endpoint, and keeps the session it returns.
// Sends: { provider: "google" | "apple", token, user? }
const signInWithProvider = async (provider: Provider): Promise<void> => {
  let token: string;
  let user: unknown;

  if (provider === "google") {
    token = await getGoogleToken();
  } else {
    ({ token, user } = await getAppleToken());
  }

  const data = await postJson(
    OAUTH_URL,
    { provider, token, ...(user ? { user } : {}) },
    `We couldn't sign you in with ${provider === "google" ? "Google" : "Apple"}. Please try again.`,
  );

  const session = readSession(data);
  if (session.token) writeStored(TOKEN_KEY, session.token);
  if (session.email) writeStored(EMAIL_KEY, session.email);
};

type Field = {
  id: "firstName" | "lastName" | "email" | "password" | "confirmPassword";
  label: string;
  placeholder: string;
  type: "text" | "email" | "password";
  autoComplete: string;
};

// Declare the fields once, then map through them below
const fields: Field[] = [
  {
    id: "firstName",
    label: "First Name",
    placeholder: "Enter First Name",
    type: "text",
    autoComplete: "given-name",
  },
  {
    id: "lastName",
    label: "Last Name",
    placeholder: "Enter Last Name",
    type: "text",
    autoComplete: "family-name",
  },
  {
    id: "email",
    label: "Email Address",
    placeholder: "Enter Email Address",
    type: "email",
    autoComplete: "email",
  },
  {
    id: "password",
    label: "Password",
    placeholder: "Enter Password",
    type: "password",
    autoComplete: "new-password",
  },
  {
    id: "confirmPassword",
    label: "Confirm Password",
    placeholder: "Confirm Password",
    type: "password",
    autoComplete: "new-password",
  },
];

// Password rules: add, remove or edit rules here and the checklist follows
const passwordRules = [
  {
    id: "length",
    label: "At least 8 characters",
    test: (v: string) => v.length >= 8,
  },
  {
    id: "letter",
    label: "Contains a letter",
    test: (v: string) => /\p{L}/u.test(v),
  },
  {
    id: "special",
    label: "Contains a special character (e.g. ! @ # $ %)",
    test: (v: string) => /[^\p{L}\p{N}\s]/u.test(v),
  },
];

const SignUp = () => {
  const [values, setValues] = useState<Record<Field["id"], string>>({
    firstName: "",
    lastName: "",
    email: "",
    password: "",
    confirmPassword: "",
  });

  // which password fields are currently visible
  const [visible, setVisible] = useState<Record<Field["id"], boolean>>({
    firstName: false,
    lastName: false,
    email: false,
    password: false,
    confirmPassword: false,
  });

  // Shown above the Sign Up button when something goes wrong
  const [errorMsg, setErrorMsg] = useState("");

  const handleChange = (id: Field["id"], value: string) => {
    setValues((prev) => ({ ...prev, [id]: value }));
    setErrorMsg("");
  };

  const toggleVisible = (id: Field["id"]) =>
    setVisible((prev) => ({ ...prev, [id]: !prev[id] }));

  // becomes true after the first tap on Sign Up, so errors show only then
  const [submitted, setSubmitted] = useState(false);

  // true while signing up: shows the blank loading screen
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  // Load the Apple and Google sign-in scripts ahead of time, so their windows
  // open the moment a button is tapped (browsers block pop-ups that open late)
  useEffect(() => {
    if (GOOGLE_CLIENT_ID) loadScript(GOOGLE_SDK).catch(() => {});
    if (APPLE_CLIENT_ID) loadScript(APPLE_SDK).catch(() => {});
  }, []);

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (loading || !allFilled) return;
    setSubmitted(true);
    setErrorMsg("");

    if (!isEmailValid) {
      setErrorMsg("Enter a valid email address.");
      return;
    }
    if (!isPasswordValid) return; // password must meet every rule
    if (!passwordsMatch) return; // the message under Confirm Password shows

    setLoading(true);
    try {
      const email = values.email.trim();
      await signUpWithEmail({
        firstName: values.firstName.trim(),
        lastName: values.lastName.trim(),
        email,
        password: values.password,
      });
      // On to the verification page. It gets the email address, so it can
      // send the 6-digit code straight away.
      navigate(VERIFY_PATH, { state: { email } });
    } catch (error) {
      // sign-up failed: go back to the form and say why
      setErrorMsg(
        error instanceof Error && error.message
          ? error.message
          : "We couldn't create your account. Please try again.",
      );
      setLoading(false);
    }
  };

  // Apple / Google: opens the provider's window first (the form stays on
  // screen behind it), then shows the loading screen while the backend
  // checks the token, then opens the home page.
  const handleProvider = async (provider: Provider) => {
    if (loading) return;
    setErrorMsg("");
    try {
      // The provider's window opens as its own window, so the loader can show
      // behind it straight away
      setLoading(true);
      await signInWithProvider(provider);
      // Tell the app someone is signed in. Without this, ProtectedRoute would
      // send them straight back to the sign in page.
      markSignedIn();
      navigate(HOME_PATH, { replace: true });
    } catch (error) {
      setLoading(false);
      // Closing the window on purpose is not an error
      if (error instanceof CancelledError) return;
      setErrorMsg(
        error instanceof Error && error.message
          ? error.message
          : "Sign in failed. Please try again.",
      );
    }
  };

  const passwordChecks = passwordRules.map((rule) => ({
    ...rule,
    passed: rule.test(values.password),
  }));
  const isPasswordValid = passwordChecks.every((check) => check.passed);
  const isEmailValid = /^\S+@\S+\.\S+$/.test(values.email.trim());
  const passwordsMatch = values.password === values.confirmPassword;
  const showMismatch = values.confirmPassword !== "" && !passwordsMatch;
  // show the checklist as soon as the user starts typing, or after a failed submit
  const showPasswordRules = values.password.length > 0 || submitted;

  // The Sign Up button stays faded and unclickable until every box is filled
  const allFilled =
    values.firstName.trim() !== "" &&
    values.lastName.trim() !== "" &&
    values.email.trim() !== "" &&
    values.password !== "" &&
    values.confirmPassword !== "";

  // Blank white screen with a green circle that keeps rolling
  if (loading) {
    return (
      <div
        role="status"
        aria-live="polite"
        className="flex min-h-dvh w-full items-center justify-center bg-white"
      >
        <span
          aria-hidden="true"
          className="h-12 w-12 animate-spin rounded-full border-4 border-[#1A7431]/20 border-t-[#1A7431]"
        />
        <span className="sr-only">Please wait</span>
      </div>
    );
  }

  return (
    <>
      {/* Full-screen background, so the colour reaches the bottom of tall
          phones and the sides of wide ones. overflow-x-hidden stops any
          sideways scrolling on very narrow screens (320px and below). */}
      <div className="min-h-dvh w-full overflow-x-hidden bg-[#F1F4F8]">
        <div className="relative mx-auto flex min-h-dvh w-full max-w-md flex-col overflow-x-hidden">
          <svg
            aria-hidden="true"
            viewBox="0 0 375 240"
            preserveAspectRatio="xMidYMin slice"
            className="pointer-events-none absolute inset-x-0 top-0 h-auto w-full"
          >
            <path
              d="M73.6054 -183.584L-89.0054 184.199L176.351 236.263L533.155 -112.813L73.6054 -183.584Z"
              fill="#EBEFF5"
            />
          </svg>

          {/* Logo: shrinks on short screens (small phones, landscape) */}
          <div className="relative z-10 mt-[clamp(20px,8dvh,80px)] flex items-center justify-center px-4">
            <img
              src={planora}
              alt="Planora"
              className="h-auto max-h-[clamp(56px,16dvh,140px)] w-auto max-w-[60%] object-contain"
            />
          </div>

          <div className="relative z-10 mt-[clamp(16px,5dvh,60px)] flex flex-col gap-1 px-4 min-[360px]:px-5 min-[414px]:px-6">
            <h4 className="text-[clamp(18px,5.5vw,22px)] font-medium text-[#111827]">
              Sign Up
            </h4>
            <p className="text-[14px] font-normal text-[#6B7280]">
              Start managing your tasks in minutes.
            </p>
          </div>

          {/* The buttons are inside the form, so they are always exactly as wide
              as the fields and the Enter key submits the form */}
          <form
            onSubmit={handleSubmit}
            noValidate
            className="relative z-10 mt-5 flex flex-1 flex-col gap-4 px-4 pb-[max(24px,env(safe-area-inset-bottom))] min-[360px]:px-5 min-[414px]:px-6"
          >
            {fields.map((field) => {
              const isPassword = field.type === "password";
              const show = visible[field.id];
              const isPasswordField = field.id === "password";
              const isConfirmField = field.id === "confirmPassword";
              const hasError =
                (isPasswordField && submitted && !isPasswordValid) ||
                (isConfirmField && showMismatch);

              return (
                <div key={field.id} className="flex flex-col gap-1">
                  <label
                    htmlFor={field.id}
                    className="text-[14px] font-medium text-[#111827]"
                  >
                    {field.label}
                  </label>

                  <div className="relative">
                    {/* font-size is 16px on purpose: iPhones zoom into any input
                        smaller than 16px when it is tapped */}
                    <input
                      id={field.id}
                      name={field.id}
                      type={isPassword && show ? "text" : field.type}
                      inputMode={field.type === "email" ? "email" : undefined}
                      autoComplete={field.autoComplete}
                      autoCapitalize={field.type === "text" ? "words" : "none"}
                      autoCorrect="off"
                      spellCheck={false}
                      placeholder={field.placeholder}
                      value={values[field.id]}
                      onChange={(e) => handleChange(field.id, e.target.value)}
                      aria-invalid={hasError || undefined}
                      aria-describedby={
                        isPasswordField && showPasswordRules
                          ? "password-rules"
                          : undefined
                      }
                      className={`h-11 w-full min-w-0 rounded-xl border-[0.5px] ${
                        hasError ? "border-[#E74C3C]" : "border-[#D8E5F3]"
                      } bg-white px-4 text-[16px] leading-normal font-normal text-[#111827] outline-none placeholder:text-[#C6CCD3] focus:border-[#1A7431] ${
                        isPassword ? "pr-12" : ""
                      }`}
                    />

                    {isPassword && (
                      <button
                        type="button"
                        onClick={() => toggleVisible(field.id)}
                        aria-label={show ? "Hide password" : "Show password"}
                        className="absolute top-0 right-0 flex h-11 w-11 touch-manipulation items-center justify-center text-[#6B7280]"
                      >
                        {show ? (
                          <BsEyeFill size={18} />
                        ) : (
                          <BsEyeSlashFill size={18} />
                        )}
                      </button>
                    )}
                  </div>

                  {isConfirmField && showMismatch && (
                    <p
                      role="alert"
                      className="mt-1 text-[12px] font-normal text-[#E74C3C]"
                    >
                      Passwords don't match.
                    </p>
                  )}

                  {/* Live checklist: each rule turns green once it is met */}
                  {isPasswordField && showPasswordRules && (
                    <ul
                      id="password-rules"
                      aria-live="polite"
                      className="mt-1 flex flex-col gap-1"
                    >
                      {passwordChecks.map((check) => (
                        <li
                          key={check.id}
                          className={`flex items-center gap-2 text-[12px] font-normal ${
                            check.passed
                              ? "text-[#1A7431]"
                              : submitted
                                ? "text-[#E74C3C]"
                                : "text-[#6B7280]"
                          }`}
                        >
                          {check.passed ? (
                            <BsCheckCircleFill
                              aria-hidden="true"
                              className="h-3.5 w-3.5 shrink-0"
                            />
                          ) : (
                            <BsCircle
                              aria-hidden="true"
                              className="h-3.5 w-3.5 shrink-0"
                            />
                          )}
                          <span>{check.label}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              );
            })}

            {errorMsg && (
              <p
                role="alert"
                className="text-center text-[12px] font-normal text-[#E74C3C]"
              >
                {errorMsg}
              </p>
            )}

            <button
              type="submit"
              disabled={!allFilled}
              className="mt-2 h-11 w-full touch-manipulation rounded-xl bg-[#1A7431] px-3 text-[14px] font-normal text-white transition-opacity disabled:cursor-not-allowed disabled:opacity-40"
            >
              Sign Up
            </button>

            <div className="flex items-center gap-4">
              <span className="h-[0.5px] flex-1 bg-[#D8E5F3]" />
              <span className="text-[12px] font-normal text-[#6B7280]">OR</span>
              <span className="h-[0.5px] flex-1 bg-[#D8E5F3]" />
            </div>

            <button
              type="button"
              onClick={() => handleProvider("apple")}
              className="flex h-11 w-full touch-manipulation items-center justify-center gap-2 rounded-xl bg-[#1A7431] px-3 text-white"
            >
              <FaApple className="h-5 w-5 shrink-0" />
              <span className="text-[14px] font-normal">
                Continue with Apple
              </span>
            </button>

            <button
              type="button"
              onClick={() => handleProvider("google")}
              className="flex h-11 w-full touch-manipulation items-center justify-center gap-2 rounded-xl bg-white px-3 text-[#1A7431]"
            >
              <FcGoogle className="h-5 w-5 shrink-0" />
              <span className="text-[14px] font-normal">
                Continue with Google
              </span>
            </button>
          </form>
        </div>
      </div>
    </>
  );
};

export default SignUp;
