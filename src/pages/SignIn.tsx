import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import {
  BsArrowLeft,
  BsCheckCircle,
  BsCheckCircleFill,
  BsChevronLeft,
  BsCircle,
  BsEye,
  BsEyeSlash,
} from "react-icons/bs";
import planora from "../assets/planora.svg";
import { markSignedIn } from "../auth";
import { authApi } from "../api/client"; // Update this path to match your actual client.ts location

type Props = {
  // Optional. The returning user's first name, shown in the greeting. If you
  // don't pass it, it is read from what sign up / the last sign in saved.
  name?: string;
  // Optional. The returning user's email. If you don't pass it, it is read
  // from localStorage (EMAIL_KEY).
  email?: string;
};

// Which screen is showing. All screens live in this one component, so the page
// and its address never change when the user moves between them.
type View = "signin" | "forgot" | "loading" | "code" | "newPassword";

// How many digits the reset code has
const CODE_LENGTH = 4;

// How long the "Account Verified" toast stays on screen (milliseconds)
const TOAST_DURATION = 5000;

// The page users land on after signing in. Change this to your home page route.
const HOME_PATH = "/home";

// How long to wait for the login request before giving up (milliseconds).
// Render's free plan can take up to a minute to wake a sleeping server.
const LOGIN_TIMEOUT = 60000;

// Where the account's details are kept in the browser. Sign up and the
// Settings page use these same keys. The tokens themselves are saved by
// client.ts.
const EMAIL_KEY = "planora_email";
const FIRST_NAME_KEY = "planora_first_name";
const LAST_NAME_KEY = "planora_last_name";
const FULL_NAME_KEY = "planora_full_name";
const CREATED_AT_KEY = "planora_created_at";
const PROFILE_KEY = "profileData";

const emptyDigits = () => Array<string>(CODE_LENGTH).fill("");

// New password rules: add, remove or edit rules here and the checklist follows
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

// Shared input look (16px text so phones don't zoom in when it is tapped)
const inputClass =
  "h-11 w-full min-w-0 rounded-xl border-[0.5px] border-[#E5EAF1] bg-white px-4 text-[16px] leading-normal font-normal text-[#111827] outline-none placeholder:text-[#C6CCD3] focus:border-[#1A7431]";

// Reads localStorage without crashing when it is blocked (private mode etc.)
const readStored = (key: string): string => {
  try {
    return localStorage.getItem(key)?.trim() ?? "";
  } catch {
    return "";
  }
};

const writeStored = (key: string, value: string) => {
  try {
    localStorage.setItem(key, value);
  } catch {
    // storage unavailable: the greeting screen just won't remember it
  }
};

const removeStored = (key: string) => {
  try {
    localStorage.removeItem(key);
  } catch {
    // nothing to remove
  }
};

// The first name of the person who last signed up or signed in on this device.
// Empty if nobody has, so no name is ever invented.
const loadSavedFirstName = (): string => {
  const first = readStored(FIRST_NAME_KEY);
  if (first) return first;
  const full = readStored(FULL_NAME_KEY);
  return full ? full.split(/\s+/)[0] : "";
};

// Keeps the person's name where sign up and Settings look for it
const saveName = (fullName: string) => {
  const [first = "", ...rest] = fullName.trim().split(/\s+/);
  writeStored(FULL_NAME_KEY, fullName.trim());
  writeStored(FIRST_NAME_KEY, first);
  writeStored(LAST_NAME_KEY, rest.join(" "));
};

// Forgets the details of whoever was here before, so one person's name or
// profile can never show up for a different account
const forgetAccountDetails = () => {
  for (const key of [
    FIRST_NAME_KEY,
    LAST_NAME_KEY,
    FULL_NAME_KEY,
    CREATED_AT_KEY,
    PROFILE_KEY,
  ]) {
    removeStored(key);
  }
};

// Finds the person's name in whatever shape the server answers. Returns "" if
// the answer has no name in it.
const readPersonName = (data: unknown): string => {
  if (!data || typeof data !== "object") return "";
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const body = data as Record<string, any>;
  const user =
    body.user ??
    body.profile ??
    body.data?.profile ??
    body.data?.user ??
    body.data ??
    body;
  const text = (v: unknown) => (typeof v === "string" ? v.trim() : "");

  const first = text(user?.firstName) || text(user?.first_name);
  const last = text(user?.lastName) || text(user?.last_name);
  return (
    text(user?.fullName) ||
    text(user?.displayName) ||
    text(user?.name) ||
    [first, last].filter(Boolean).join(" ")
  );
};

/* ========================================================================== */
/*                     PASSWORD RESET ENDPOINTS (BACKEND)                     */
/* ========================================================================== */
// The same three endpoints the Settings page uses:
//   POST /forgot-password      emails a code to the address
//   POST /verify-reset-code    checks the code, answers with a resetToken
//   POST /reset-password       sets the new password, using that resetToken

const AUTH_API = "https://planora-uliy.onrender.com/api/auth";
const FORGOT_PASSWORD_URL = `${AUTH_API}/forgot-password`;
const VERIFY_RESET_CODE_URL = `${AUTH_API}/verify-reset-code`;
const RESET_PASSWORD_URL = `${AUTH_API}/reset-password`;

// How long to wait before a new code can be requested (seconds)
const RESEND_SECONDS = 30;

// While you are testing, error messages also show the server's status number
// (like 400 or 401), so a failure can be understood without opening the
// browser's developer tools. Set this to false before you launch.
const SHOW_ERROR_DETAILS = true;

// Sends cookies with each request, like the rest of the app does
const SEND_COOKIES = true;

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

// Looks for a reset token in the usual places a server puts one
const readResetToken = (data: unknown): string | undefined => {
  if (!data || typeof data !== "object") return undefined;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const body = data as Record<string, any>;
  const token = body.resetToken ?? body.token ?? body.data?.resetToken;
  return typeof token === "string" && token ? token : undefined;
};

// Sends JSON to the backend and returns whatever JSON it answers with. Throws
// an Error with a readable message if the request fails.
const postJson = async (
  url: string,
  body: Record<string, unknown>,
  fallbackMessage: string,
): Promise<unknown> => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), LOGIN_TIMEOUT);

  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      ...(SEND_COOKIES ? { credentials: "include" as const } : {}),
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
    const message =
      readServerMessage(data) ??
      (response.status === 429
        ? "Too many attempts. Please wait a moment and try again."
        : response.status >= 500
          ? "Something went wrong on our side. Please try again shortly."
          : fallbackMessage);
    throw new Error(
      SHOW_ERROR_DETAILS ? `${message} (status ${response.status})` : message,
    );
  }

  return data;
};

// 1. Emails a reset code to the address
const sendResetCode = async (email: string): Promise<void> => {
  await postJson(
    FORGOT_PASSWORD_URL,
    { email },
    "We couldn't send the code. Please check the email address and try again.",
  );
};

// 2. Checks the code. Throws if it is wrong or expired. The server answers
// with a resetToken, which step 3 needs.
const verifyResetCode = async (
  email: string,
  code: string,
): Promise<string> => {
  // Stop here if the boxes didn't produce exactly the right number of digits
  if (!new RegExp(`^\\d{${CODE_LENGTH}}$`).test(code)) {
    throw new Error(
      `Please enter all ${CODE_LENGTH} digits of the code (got ${code.length}).`,
    );
  }
  const data = await postJson(
    VERIFY_RESET_CODE_URL,
    { email, code },
    "That code didn't work. Please check it and try again.",
  );
  const resetToken = readResetToken(data);
  if (!resetToken) {
    throw new Error("We couldn't verify the code. Please try again.");
  }
  return resetToken;
};

// 3. Sets the new password, using the resetToken from step 2
const resetPassword = async (
  resetToken: string,
  newPassword: string,
): Promise<void> => {
  await postJson(
    RESET_PASSWORD_URL,
    { resetToken, newPassword, confirmPassword: newPassword },
    "We couldn't reset your password. Please try again.",
  );
};

// Turns any login failure into a readable message for the user
const getLoginError = (e: unknown): string => {
  if (axios.isAxiosError<{ message?: string; error?: string }>(e)) {
    // The request timed out (server still waking up, or very slow network)
    if (e.code === "ECONNABORTED") {
      return "The server took too long to respond. Please try again.";
    }
    // No response at all: offline, blocked by CORS, or server down
    if (!e.response) {
      return "Couldn't reach the server. Check your connection and try again.";
    }
    // The server answered with its own error message
    const message = e.response.data?.message ?? e.response.data?.error;
    if (typeof message === "string" && message) return message;
    if (e.response.status === 400 || e.response.status === 401) {
      return "Incorrect email or password.";
    }
  }
  return "Sign in failed. Please try again.";
};

const WelcomeBack = ({ name: nameProp, email: emailProp }: Props) => {
  const navigate = useNavigate();

  const [view, setView] = useState<View>("signin");

  // Who this device remembers: the person who last signed up or signed in.
  // Both are empty for someone who has never had an account here.
  const [rememberedEmail] = useState(() =>
    (emailProp ?? readStored(EMAIL_KEY)).trim(),
  );
  const [rememberedName] = useState(
    () => nameProp?.trim() || loadSavedFirstName(),
  );

  // "Use a different account" switches to typing in an email
  const [useOtherAccount, setUseOtherAccount] = useState(false);

  // A remembered person only needs their password. Anyone else types both.
  const returningMode = rememberedEmail !== "" && !useOtherAccount;

  // Sign in screen
  const [signInEmail, setSignInEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  // Forgot password screen
  const [email, setEmail] = useState("");

  // Reset code screen: one entry per box
  const [digits, setDigits] = useState<string[]>(emptyDigits);
  const codeRefs = useRef<(HTMLInputElement | null)[]>([]);

  // Create new password screen
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  // "Account Verified Successfully" toast
  const [showToast, setShowToast] = useState(false);

  // The token the server gives once the reset code is correct. It is needed to
  // set the new password.
  const [resetToken, setResetToken] = useState<string | undefined>(undefined);

  // Seconds left before a new reset code can be requested
  const [secondsLeft, setSecondsLeft] = useState(0);

  // Green message on the sign in screen, e.g. after the password was reset
  const [successMsg, setSuccessMsg] = useState("");

  // Error shown on the sign in / forgot password / reset code screens
  const [errorMsg, setErrorMsg] = useState("");

  // The email the sign in will use
  const accountEmail = returningMode ? rememberedEmail : signInEmail.trim();

  // The Continue button only works once the email (when it is needed) looks
  // valid and a password has been typed
  const canSubmit = password.length > 0 && /^\S+@\S+\.\S+$/.test(accountEmail);

  // The reset button only works once the email looks valid
  const canReset = /^\S+@\S+\.\S+$/.test(email.trim());

  // The verify button only works once every box is filled
  const canVerify = digits.every((d) => d !== "");

  // New password: every rule met, and both fields match
  const passwordChecks = passwordRules.map((rule) => ({
    ...rule,
    passed: rule.test(newPassword),
  }));
  const isNewPasswordValid = passwordChecks.every((check) => check.passed);
  const passwordsMatch = newPassword === confirmPassword;
  const showMismatch = confirmPassword.length > 0 && !passwordsMatch;
  const canCreate =
    isNewPasswordValid && confirmPassword.length > 0 && passwordsMatch;

  // Put the cursor in the first box when the reset code screen opens
  useEffect(() => {
    if (view === "code") codeRefs.current[0]?.focus();
  }, [view]);

  // Counts down until a new reset code can be requested
  useEffect(() => {
    if (secondsLeft <= 0) return;
    const timer = setTimeout(() => setSecondsLeft((n) => n - 1), 1000);
    return () => clearTimeout(timer);
  }, [secondsLeft]);

  // The toast closes by itself after a few seconds (or when it is tapped)
  useEffect(() => {
    if (!showToast) return;
    const timer = setTimeout(() => setShowToast(false), TOAST_DURATION);
    return () => clearTimeout(timer);
  }, [showToast]);

  // Shows the loading screen while signing in, then opens the home page.
  // If it fails, goes back to the sign in screen with an error (the email and
  // password stay typed in).
  const handleSubmit = async () => {
    if (!canSubmit) return;
    setErrorMsg("");
    setSuccessMsg("");
    setView("loading");
    try {
      // 1. Sign in through client.ts. It saves the tokens itself, so the home
      // page can ask /auth/me who is signed in.
      let loginResponse: unknown;
      try {
        loginResponse = await authApi.login(
          { email: accountEmail, password },
          { timeout: LOGIN_TIMEOUT },
        );
      } catch (loginError) {
        throw new Error(getLoginError(loginError));
      }

      // 2. A different person than the one remembered here? Forget the old
      // name and profile so they can't show up for this account.
      if (readStored(EMAIL_KEY).toLowerCase() !== accountEmail.toLowerCase()) {
        forgetAccountDetails();
      }
      writeStored(EMAIL_KEY, accountEmail);

      // 3. Remember the name for next time's greeting: from the login answer,
      // or else from /auth/me. If neither has a name, nothing is saved.
      let personName = readPersonName(
        (loginResponse as { data?: unknown } | undefined)?.data,
      );
      if (!personName) {
        try {
          const me = await authApi.me();
          personName = readPersonName(me.data);
        } catch {
          // not critical: the greeting just won't have a name
        }
      }
      if (personName) saveName(personName);

      // 4. Tell the app someone is signed in
      markSignedIn();

      // 5. Navigate to home page
      navigate(HOME_PATH, { replace: true });
    } catch (e) {
      setErrorMsg(
        e instanceof Error && e.message
          ? e.message
          : "Sign in failed. Please try again.",
      );
      setView("signin");
    }
  };

  // Switches from the remembered account to typing in any email
  const handleUseOtherAccount = () => {
    setUseOtherAccount(true);
    setSignInEmail("");
    setPassword("");
    setShowPassword(false);
    setErrorMsg("");
  };

  // Opens the forgot password screen. An email the person typed is carried
  // over, but a remembered email is never shown, so they type it themselves.
  const openForgot = () => {
    setErrorMsg("");
    setEmail((prev) => prev || (returningMode ? "" : accountEmail));
    setView("forgot");
  };

  // Shows the loading screen, asks for a code, then opens the reset code
  // screen. If it fails, goes back to the screen the user was on.
  const requestCode = async (onError: View) => {
    setErrorMsg("");
    setView("loading");
    try {
      await sendResetCode(email.trim());
      setDigits(emptyDigits());
      setSecondsLeft(RESEND_SECONDS);
      setView("code");
    } catch (e) {
      setErrorMsg(
        e instanceof Error && e.message
          ? e.message
          : "Couldn't send the code. Please try again.",
      );
      setView(onError);
    }
  };

  const handleReset = () => {
    if (!canReset) return;
    requestCode("forgot");
  };

  const handleResend = () => requestCode("code");

  // Shows the loading screen while the code is checked. If it is right: show
  // the toast and open the create new password screen. If not: go back to the
  // reset code screen with an error (the digits stay filled in).
  const handleVerify = async () => {
    if (!canVerify) return;
    setErrorMsg("");
    setView("loading");
    try {
      setResetToken(await verifyResetCode(email.trim(), digits.join("")));
      setNewPassword("");
      setConfirmPassword("");
      setShowNew(false);
      setShowConfirm(false);
      setView("newPassword");
      setShowToast(true);
    } catch (e) {
      setErrorMsg(
        e instanceof Error && e.message
          ? e.message
          : "That code didn't work. Please try again.",
      );
      setView("code");
    }
  };

  // Sets the new password on the server. Only after that works does it go
  // back to the sign in screen, with everything from the reset cleared.
  const handleCreatePassword = async () => {
    if (!canCreate) return;
    if (!resetToken) {
      setErrorMsg("Please enter your reset code again.");
      setView("code");
      return;
    }

    setErrorMsg("");
    setView("loading");
    try {
      await resetPassword(resetToken, newPassword);
    } catch (e) {
      setErrorMsg(
        e instanceof Error && e.message
          ? e.message
          : "We couldn't reset your password. Please try again.",
      );
      setView("newPassword");
      return;
    }

    setPassword("");
    setShowPassword(false);
    setNewPassword("");
    setConfirmPassword("");
    setShowNew(false);
    setShowConfirm(false);
    setDigits(emptyDigits());
    setResetToken(undefined);
    setSecondsLeft(0);
    setShowToast(false);
    setSuccessMsg("Password changed. Please sign in with your new password.");
    setView("signin");
  };

  // Typing, pasting or autofilling: extra digits flow into the next boxes
  const handleDigitChange = (index: number, raw: string) => {
    const cleaned = raw.replace(/\D/g, "");
    setErrorMsg("");

    setDigits((prev) => {
      const next = [...prev];
      if (!cleaned) {
        next[index] = "";
        return next;
      }
      cleaned
        .slice(0, CODE_LENGTH - index)
        .split("")
        .forEach((d, k) => {
          next[index + k] = d;
        });
      return next;
    });

    if (cleaned) {
      codeRefs.current[
        Math.min(index + cleaned.length, CODE_LENGTH - 1)
      ]?.focus();
    }
  };

  const handleDigitKeyDown = (
    index: number,
    e: React.KeyboardEvent<HTMLInputElement>,
  ) => {
    if (e.key === "Backspace" && !digits[index] && index > 0) {
      // empty box: erase and move to the previous one
      e.preventDefault();
      setDigits((prev) => {
        const next = [...prev];
        next[index - 1] = "";
        return next;
      });
      codeRefs.current[index - 1]?.focus();
    } else if (e.key === "ArrowLeft" && index > 0) {
      codeRefs.current[index - 1]?.focus();
    } else if (e.key === "ArrowRight" && index < CODE_LENGTH - 1) {
      codeRefs.current[index + 1]?.focus();
    }
  };

  const isForgot = view === "forgot";
  const isCode = view === "code";
  const isNewPassword = view === "newPassword";

  // The two fields on the create new password screen
  const newPasswordFields = [
    {
      id: "new-password",
      label: "New Password",
      placeholder: "Enter New Password",
      value: newPassword,
      onChange: setNewPassword,
      show: showNew,
      toggle: () => setShowNew((prev) => !prev),
    },
    {
      id: "confirm-password",
      label: "Confirm Password",
      placeholder: "Confirm New Password",
      value: confirmPassword,
      onChange: setConfirmPassword,
      show: showConfirm,
      toggle: () => setShowConfirm((prev) => !prev),
    },
  ];

  // Blank screen with a circular loader, shown while the code is being sent
  // or checked
  if (view === "loading") {
    return (
      <div className="flex min-h-dvh w-full touch-manipulation items-center justify-center bg-white">
        <div role="status" aria-live="polite">
          <div className="h-12 w-12 animate-spin rounded-full border-4 border-[#D8E5F3] border-t-[#1A7431]" />
          <span className="sr-only">Loading...</span>
        </div>
      </div>
    );
  }

  return (
    // touch-manipulation stops the double-tap zoom on every tap target, the
    // text-size-adjust rule stops phones from silently enlarging text, and
    // overflow-x-hidden stops sideways scrolling on very narrow screens
    <div className="min-h-dvh w-full touch-manipulation overflow-x-hidden bg-[#F8F9FB] [-webkit-text-size-adjust:100%] [text-size-adjust:100%]">
      {/* "Account Verified Successfully" toast: sits at the top of the screen,
          closes by itself, or when it is tapped */}
      {showToast && (
        <div
          role="status"
          aria-live="polite"
          className="pointer-events-none fixed inset-x-0 top-0 z-50 px-4 pt-[max(16px,env(safe-area-inset-top))]"
        >
          <button
            type="button"
            onClick={() => setShowToast(false)}
            aria-label="Close notification"
            className="pointer-events-auto mx-auto flex w-full max-w-md touch-manipulation items-start gap-4 rounded-2xl border border-[#D8E5F3] bg-white px-5 py-5 text-left shadow-[0_8px_24px_rgba(17,24,39,0.12)]"
          >
            <BsCheckCircle
              aria-hidden="true"
              className="mt-0.5 h-6 w-6 shrink-0 text-[#1A7431]"
            />
            <span className="flex min-w-0 flex-col gap-1.5">
              <span className="text-[clamp(15px,4.2vw,16px)] leading-tight font-medium text-[#111827]">
                Account Verified Successfully
              </span>
              <span className="text-[clamp(14px,4vw,16px)] leading-relaxed font-normal text-[#6B7280]">
                Please close this alert and get right into Planora
              </span>
            </span>
          </button>
        </div>
      )}

      <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col">
        {/* Header: tinted area with the logo and greeting. Spacing scales with
            the screen height so small phones and landscape still fit. */}
        <header className="relative overflow-hidden bg-[#F1F4F8] px-4 pt-[clamp(32px,12dvh,110px)] pb-6 min-[360px]:px-5 min-[414px]:px-6">
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

          {/* Back arrow, only on the forgot password screen */}
          {isForgot && (
            <button
              type="button"
              onClick={() => setView("signin")}
              aria-label="Back to sign in"
              className="absolute top-2 left-2 z-20 flex h-11 w-11 touch-manipulation items-center justify-center text-[#111827] min-[360px]:left-3"
            >
              <BsArrowLeft size={22} />
            </button>
          )}

          <div className="relative z-10 flex justify-center">
            <img
              src={planora}
              alt="Planora"
              className="h-auto max-h-[clamp(32px,8dvh,64px)] w-auto max-w-[50%] object-contain"
            />
          </div>

          <div className="relative z-10 mt-[clamp(20px,7dvh,56px)] flex flex-col gap-1">
            {isNewPassword ? (
              <>
                <h1 className="text-[clamp(18px,5.5vw,22px)] leading-tight font-semibold break-words text-[#111827]">
                  Create New Password
                </h1>
                <p className="text-[clamp(13px,3.8vw,14px)] font-normal text-[#6B7280]">
                  Choose a strong password to keep your account secure.
                </p>
              </>
            ) : isCode ? (
              <>
                <h1 className="text-[clamp(18px,5.5vw,22px)] leading-tight font-semibold break-words text-[#111827]">
                  Enter Reset Code
                </h1>
                <p className="text-[clamp(13px,3.8vw,14px)] font-normal text-[#6B7280]">
                  We sent a {CODE_LENGTH}-digit code to{" "}
                  <span className="break-all">{email.trim()}</span>
                </p>
              </>
            ) : isForgot ? (
              <>
                <h1 className="text-[clamp(18px,5.5vw,22px)] leading-tight font-semibold break-words text-[#111827]">
                  Forgot Password?
                </h1>
                <p className="text-[clamp(13px,3.8vw,14px)] font-normal text-[#6B7280]">
                  Enter your email address to receive a reset code.
                </p>
              </>
            ) : returningMode ? (
              /* Someone this device remembers: only their name from sign up is
                 shown. The email is used for sign in but never displayed. */
              <>
                <h1 className="text-[clamp(18px,5.5vw,22px)] leading-tight font-semibold break-words text-[#111827]">
                  Welcome Back{rememberedName ? `, ${rememberedName}` : ""}
                </h1>
                <p className="text-[clamp(13px,3.8vw,14px)] font-normal text-[#6B7280]">
                  Not you?{" "}
                  <button
                    type="button"
                    onClick={handleUseOtherAccount}
                    className="touch-manipulation font-medium text-[#1A7431]"
                  >
                    Use a different account
                  </button>
                </p>
              </>
            ) : (
              /* Nobody remembered: no name is shown, only a plain sign in */
              <>
                <h1 className="text-[clamp(18px,5.5vw,22px)] leading-tight font-semibold break-words text-[#111827]">
                  Sign In
                </h1>
                <p className="text-[clamp(13px,3.8vw,14px)] font-normal text-[#6B7280]">
                  New to Planora?{" "}
                  <a href="/signup" className="font-medium text-[#1A7431]">
                    Sign Up
                  </a>
                </p>
              </>
            )}
          </div>
        </header>

        {/* Sheet with rounded top corners that overlaps the header */}
        <main className="relative z-10 -mt-4 flex flex-1 flex-col rounded-t-3xl bg-[#F8F9FB] px-4 pt-6 pb-[max(24px,env(safe-area-inset-bottom))] min-[360px]:px-5 min-[414px]:px-6">
          {isNewPassword ? (
            /* ---------- Screen 4: Create new password ---------- */
            <div className="flex flex-1 flex-col">
              <form
                noValidate
                onSubmit={(e) => {
                  e.preventDefault();
                  handleCreatePassword();
                }}
                className="flex flex-col gap-4"
              >
                {newPasswordFields.map((field, index) => (
                  <div key={field.id} className="flex flex-col gap-2">
                    <label
                      htmlFor={field.id}
                      className="text-[14px] font-medium text-[#111827]"
                    >
                      {field.label}
                    </label>

                    <div className="relative">
                      <input
                        id={field.id}
                        name={field.id}
                        type={field.show ? "text" : "password"}
                        autoComplete="new-password"
                        autoCapitalize="none"
                        autoCorrect="off"
                        spellCheck={false}
                        enterKeyHint={index === 0 ? "next" : "go"}
                        placeholder={field.placeholder}
                        value={field.value}
                        onChange={(e) => field.onChange(e.target.value)}
                        style={{ fontSize: "16px" }}
                        className={`${inputClass} pr-12 ${
                          index === 1 && showMismatch ? "border-[#E74C3C]" : ""
                        }`}
                      />
                      <button
                        type="button"
                        onClick={field.toggle}
                        aria-label={
                          field.show ? "Hide password" : "Show password"
                        }
                        className="absolute top-0 right-0 flex h-11 w-11 touch-manipulation items-center justify-center text-[#9CA3AF]"
                      >
                        {field.show ? (
                          <BsEye size={18} />
                        ) : (
                          <BsEyeSlash size={18} />
                        )}
                      </button>
                    </div>

                    {/* Live checklist under the new password field */}
                    {index === 0 && newPassword.length > 0 && (
                      <ul aria-live="polite" className="flex flex-col gap-1">
                        {passwordChecks.map((check) => (
                          <li
                            key={check.id}
                            className={`flex items-center gap-2 text-[12px] font-normal ${
                              check.passed ? "text-[#1A7431]" : "text-[#6B7280]"
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

                    {index === 1 && showMismatch && (
                      <p
                        role="alert"
                        className="text-[12px] font-normal text-[#E74C3C]"
                      >
                        Passwords don't match.
                      </p>
                    )}
                  </div>
                ))}

                <button
                  type="submit"
                  disabled={!canCreate}
                  className="mt-1 h-11 w-full touch-manipulation rounded-xl bg-[#1A7431] px-3 text-[14px] font-normal text-white disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Create Password
                </button>
              </form>

              {errorMsg && (
                <p
                  role="alert"
                  className="mt-3 text-center text-[12px] font-normal text-[#E74C3C]"
                >
                  {errorMsg}
                </p>
              )}

              {/* Back pill, pushed to the bottom right of the sheet */}
              <div className="mt-auto flex justify-end pt-8">
                <button
                  type="button"
                  onClick={() => setView("code")}
                  className="flex h-10 touch-manipulation items-center gap-2 rounded-xl bg-[#F1F4F8] px-4 text-[13px] font-medium text-[#111827]"
                >
                  <BsChevronLeft size={12} aria-hidden="true" />
                  Back
                </button>
              </div>
            </div>
          ) : isCode ? (
            /* ---------- Screen 3: Reset code ---------- */
            <div className="flex flex-1 flex-col">
              <form
                noValidate
                onSubmit={(e) => {
                  e.preventDefault();
                  handleVerify();
                }}
                className="flex flex-col"
              >
                {/* One square box per digit. Each box keeps its text at 24px,
                    so phones don't zoom in when a box is tapped. */}
                <div
                  className="grid gap-3"
                  style={{
                    gridTemplateColumns: `repeat(${CODE_LENGTH}, minmax(0, 1fr))`,
                  }}
                >
                  {digits.map((digit, i) => (
                    <input
                      key={i}
                      ref={(el) => {
                        codeRefs.current[i] = el;
                      }}
                      name={`code-${i + 1}`}
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      autoComplete={i === 0 ? "one-time-code" : "off"}
                      autoCapitalize="none"
                      autoCorrect="off"
                      spellCheck={false}
                      aria-label={`Digit ${i + 1} of ${CODE_LENGTH}`}
                      value={digit}
                      onChange={(e) => handleDigitChange(i, e.target.value)}
                      onKeyDown={(e) => handleDigitKeyDown(i, e)}
                      onFocus={(e) => e.target.select()}
                      style={{ fontSize: "24px" }}
                      className="aspect-square w-full min-w-0 rounded-2xl border-[1.5px] border-[#E1E7F0] bg-[#FAFBFC] p-0 text-center text-[24px] leading-none font-semibold text-[#111827] outline-none focus:border-[#1A7431]"
                    />
                  ))}
                </div>

                <button
                  type="submit"
                  disabled={!canVerify}
                  className="mt-6 h-11 w-full touch-manipulation rounded-xl bg-[#1A7431] px-3 text-[14px] font-normal text-white disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Verify Code
                </button>
              </form>

              {errorMsg && (
                <p
                  role="alert"
                  className="mt-3 text-center text-[12px] font-normal text-[#E74C3C]"
                >
                  {errorMsg}
                </p>
              )}

              <p className="mt-6 text-center text-[12px] font-normal text-[#6B7280]">
                Didn't get the code?{" "}
                {secondsLeft > 0 ? (
                  <span aria-live="polite" className="font-medium">
                    Resend in 0:{String(secondsLeft).padStart(2, "0")}
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={handleResend}
                    className="touch-manipulation py-1 font-medium text-[#1A7431]"
                  >
                    Request a new code
                  </button>
                )}
              </p>

              {/* Back pill, pushed to the bottom right of the sheet */}
              <div className="mt-auto flex justify-end pt-8">
                <button
                  type="button"
                  onClick={() => setView("forgot")}
                  className="flex h-10 touch-manipulation items-center gap-2 rounded-xl bg-[#F1F4F8] px-4 text-[13px] font-medium text-[#111827]"
                >
                  <BsChevronLeft size={12} aria-hidden="true" />
                  Back
                </button>
              </div>
            </div>
          ) : isForgot ? (
            /* ---------- Screen 2: Forgot password ---------- */
            <>
              <form
                noValidate
                onSubmit={(e) => {
                  e.preventDefault();
                  handleReset();
                }}
                className="flex flex-col"
              >
                <label
                  htmlFor="reset-email"
                  className="text-[14px] font-medium text-[#111827]"
                >
                  Email Address
                </label>

                <input
                  id="reset-email"
                  name="email"
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  enterKeyHint="send"
                  placeholder="Enter Email Address"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    setErrorMsg("");
                  }}
                  style={{ fontSize: "16px" }}
                  className={`mt-2 ${inputClass}`}
                />

                <button
                  type="submit"
                  disabled={!canReset}
                  className="mt-5 h-11 w-full touch-manipulation rounded-xl bg-[#1A7431] px-3 text-[14px] font-normal text-white disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Send Reset Code
                </button>
              </form>

              {errorMsg && (
                <p
                  role="alert"
                  className="mt-3 text-center text-[12px] font-normal text-[#E74C3C]"
                >
                  {errorMsg}
                </p>
              )}

              <button
                type="button"
                onClick={() => setView("signin")}
                className="mx-auto mt-5 flex touch-manipulation p-2 text-[13px] font-medium text-[#1A7431]"
              >
                Back to Sign In
              </button>
            </>
          ) : (
            /* ---------- Screen 1: Sign in ---------- */
            <>
              <form
                noValidate
                onSubmit={(e) => {
                  e.preventDefault();
                  handleSubmit();
                }}
                className="flex flex-col"
              >
                {/* The email is only asked for when this device doesn't
                    remember who is signing in */}
                {!returningMode && (
                  <div className="mb-4 flex flex-col">
                    <label
                      htmlFor="signin-email"
                      className="text-[14px] font-medium text-[#111827]"
                    >
                      Email Address
                    </label>
                    <input
                      id="signin-email"
                      name="email"
                      type="email"
                      inputMode="email"
                      autoComplete="email"
                      autoCapitalize="none"
                      autoCorrect="off"
                      spellCheck={false}
                      enterKeyHint="next"
                      placeholder="Enter Email Address"
                      value={signInEmail}
                      onChange={(e) => {
                        setSignInEmail(e.target.value);
                        setErrorMsg("");
                      }}
                      style={{ fontSize: "16px" }}
                      className={`mt-2 ${inputClass}`}
                    />
                  </div>
                )}

                <label
                  htmlFor="password"
                  className="text-[14px] font-medium text-[#111827]"
                >
                  Password
                </label>

                <div className="relative mt-2">
                  <input
                    id="password"
                    name="password"
                    type={showPassword ? "text" : "password"}
                    autoComplete="current-password"
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck={false}
                    enterKeyHint="go"
                    placeholder="Enter Password"
                    value={password}
                    onChange={(e) => {
                      setPassword(e.target.value);
                      setErrorMsg("");
                    }}
                    style={{ fontSize: "16px" }}
                    className={`${inputClass} pr-12`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((prev) => !prev)}
                    aria-label={
                      showPassword ? "Hide password" : "Show password"
                    }
                    className="absolute top-0 right-0 flex h-11 w-11 touch-manipulation items-center justify-center text-[#9CA3AF]"
                  >
                    {showPassword ? (
                      <BsEye size={18} />
                    ) : (
                      <BsEyeSlash size={18} />
                    )}
                  </button>
                </div>

                {/* Opens the forgot password screen without leaving the page */}
                <a
                  href="#forgot-password"
                  onClick={(e) => {
                    e.preventDefault();
                    openForgot();
                  }}
                  className="mt-4 w-fit touch-manipulation py-1 text-[12px] font-medium text-[#1A7431]"
                >
                  Forgot Your Password?
                </a>

                <button
                  type="submit"
                  disabled={!canSubmit}
                  className="mt-5 h-11 w-full touch-manipulation rounded-xl bg-[#1A7431] px-3 text-[14px] font-normal text-white disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Continue
                </button>
              </form>

              {successMsg && (
                <p
                  role="status"
                  className="mt-3 text-center text-[12px] font-normal text-[#1A7431]"
                >
                  {successMsg}
                </p>
              )}

              {errorMsg && (
                <p
                  role="alert"
                  className="mt-3 text-center text-[12px] font-normal text-[#E74C3C]"
                >
                  {errorMsg}
                </p>
              )}
            </>
          )}
        </main>
      </div>
    </div>
  );
};

export default WelcomeBack;
