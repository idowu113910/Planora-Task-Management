import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { BsChevronLeft } from "react-icons/bs";
import planora from "../assets/planora.svg";
import { markSignedIn } from "../auth";
import { showToast } from "../layout/Toast";

// Which screen is showing. All screens live in this one component.
//   email   - asks for the email address (only if it wasn't passed in)
//   loading - spinner while a code is sent or checked
//   code    - the 4 boxes
type View = "email" | "loading" | "code";

// How many digits the verification code has
const CODE_LENGTH = 4;

// How long to wait before a new code can be requested (seconds)
const RESEND_SECONDS = 30;

// The page users land on once their account is verified
const HOME_PATH = "/home";

// Storage keys shared with SignUp and Home
const EMAIL_KEY = "planora_email";
const FIRST_NAME_KEY = "planora_first_name";

const emptyDigits = () => Array<string>(CODE_LENGTH).fill("");

// Safely reads from localStorage (returns "" if unavailable)
const readStored = (key: string): string => {
  try {
    return localStorage.getItem(key) ?? "";
  } catch {
    return "";
  }
};

// Shared input look (16px text so phones don't zoom in when it is tapped)
const inputClass =
  "h-11 w-full min-w-0 rounded-xl border-[0.5px] border-[#E5EAF1] bg-white px-4 text-[16px] leading-normal font-normal text-[#111827] outline-none placeholder:text-[#C6CCD3] focus:border-[#1A7431]";

// TODO: replace the body with your real "send verification code" request. It
// should email a new 4-digit code to the address, and throw an Error (with a
// readable message) if it couldn't be sent. A browser can't send email by
// itself, so no email goes out until this is connected to your backend.
// The short wait below only stands in for the network call, so the loading
// screen can be seen while you build the backend.
const sendVerificationCode = async (_email: string): Promise<void> => {
  await new Promise((resolve) => setTimeout(resolve, 1500));
};

// TODO: replace the body with your real "check the code" request. It should
// throw an Error (with a readable message) if the code is wrong or expired.
// Until you connect your backend, every code is accepted.
const verifyCode = async (_email: string, _code: string): Promise<void> => {
  await new Promise((resolve) => setTimeout(resolve, 1500));
};

const Verify = () => {
  const navigate = useNavigate();

  // The sign up screen passes email and firstName along:
  //   navigate("/verify", { state: { email, firstName } })
  // Fall back to localStorage in case the page was refreshed.
  const location = useLocation();
  const routeState = location.state as {
    email?: string;
    firstName?: string;
  } | null;

  const startEmail = routeState?.email?.trim() || readStored(EMAIL_KEY).trim();
  const firstName =
    routeState?.firstName?.trim() || readStored(FIRST_NAME_KEY).trim();

  const [email, setEmail] = useState(startEmail);
  // With an address already known, a code is sent as soon as the page opens
  const [view, setView] = useState<View>(startEmail ? "loading" : "email");

  const [digits, setDigits] = useState<string[]>(emptyDigits);
  const codeRefs = useRef<(HTMLInputElement | null)[]>([]);

  const [errorMsg, setErrorMsg] = useState("");
  const [secondsLeft, setSecondsLeft] = useState(0);
  const autoSent = useRef(false);

  const canSend = /^\S+@\S+\.\S+$/.test(email.trim());
  const canVerify = digits.every((d) => d !== "");

  // Shows the loading screen, asks for a code, then opens the code screen.
  // If it fails, goes back to the screen the user was on.
  const requestCode = async (onError: View) => {
    setErrorMsg("");
    setView("loading");
    try {
      await sendVerificationCode(email.trim());
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

  // Send the first code automatically when the address came with the page
  useEffect(() => {
    if (startEmail && !autoSent.current) {
      autoSent.current = true;
      requestCode("email");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Put the cursor in the first box when the code screen opens
  useEffect(() => {
    if (view === "code") codeRefs.current[0]?.focus();
  }, [view]);

  // Counts down until a new code can be requested
  useEffect(() => {
    if (secondsLeft <= 0) return;
    const timer = setTimeout(() => setSecondsLeft((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [secondsLeft]);

  const handleSend = () => {
    if (!canSend) return;
    requestCode("email");
  };

  const handleResend = () => {
    if (secondsLeft > 0) return;
    requestCode("code");
  };

  // Shows the loading screen while the code is checked. If it is right: the
  // person is signed in and sent to the home page with their firstName.
  const handleVerify = async () => {
    if (!canVerify) return;
    setErrorMsg("");
    setView("loading");
    try {
      await verifyCode(email.trim(), digits.join(""));
      // Tell the app someone is signed in, or ProtectedRoute would send them
      // straight back to the sign in page
      markSignedIn();
      showToast(
        "Account Verified Successfully",
        "Please close this alert and get right into Planora",
      );
      navigate(HOME_PATH, {
        replace: true,
        state: { firstName },
      });
    } catch (e) {
      setErrorMsg(
        e instanceof Error && e.message
          ? e.message
          : "That code didn't work. Please try again.",
      );
      setView("code");
    }
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

  const isCode = view === "code";

  // Blank screen with a circular loader, shown while a code is sent or checked
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
    <div className="min-h-dvh w-full touch-manipulation overflow-x-hidden bg-[#F8F9FB] [-webkit-text-size-adjust:100%] [text-size-adjust:100%]">
      <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col">
        {/* Header: tinted area with the logo and title */}
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

          <div className="relative z-10 flex justify-center">
            <img
              src={planora}
              alt="Planora"
              className="h-auto max-h-[clamp(32px,8dvh,64px)] w-auto max-w-[50%] object-contain"
            />
          </div>

          <div className="relative z-10 mt-[clamp(20px,7dvh,56px)] flex flex-col gap-1">
            {isCode ? (
              <>
                <h1 className="text-[clamp(18px,5.5vw,22px)] leading-tight font-semibold break-words text-[#111827]">
                  Enter Verification Code
                </h1>
                <p className="text-[clamp(13px,3.8vw,14px)] font-normal text-[#6B7280]">
                  We sent a {CODE_LENGTH}-digit code to{" "}
                  <span className="break-all">{email.trim()}</span>
                </p>
              </>
            ) : (
              <>
                <h1 className="text-[clamp(18px,5.5vw,22px)] leading-tight font-semibold break-words text-[#111827]">
                  Verify Your Account
                </h1>
                <p className="text-[clamp(13px,3.8vw,14px)] font-normal text-[#6B7280]">
                  Enter your email address to receive a {CODE_LENGTH}-digit
                  code.
                </p>
              </>
            )}
          </div>
        </header>

        {/* Sheet with rounded top corners that overlaps the header */}
        <main className="relative z-10 -mt-4 flex flex-1 flex-col rounded-t-3xl bg-[#F8F9FB] px-4 pt-6 pb-[max(24px,env(safe-area-inset-bottom))] min-[360px]:px-5 min-[414px]:px-6">
          {isCode ? (
            /* ---------- Screen 2: Enter the code ---------- */
            <div className="flex flex-1 flex-col">
              <form
                noValidate
                onSubmit={(e) => {
                  e.preventDefault();
                  handleVerify();
                }}
                className="flex flex-col"
              >
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

              <div className="mt-auto flex justify-end pt-8">
                <button
                  type="button"
                  onClick={() => {
                    setErrorMsg("");
                    setView("email");
                  }}
                  className="flex h-10 touch-manipulation items-center gap-2 rounded-xl bg-[#F1F4F8] px-4 text-[13px] font-medium text-[#111827]"
                >
                  <BsChevronLeft size={12} aria-hidden="true" />
                  Back
                </button>
              </div>
            </div>
          ) : (
            /* ---------- Screen 1: Email address ---------- */
            <>
              <form
                noValidate
                onSubmit={(e) => {
                  e.preventDefault();
                  handleSend();
                }}
                className="flex flex-col"
              >
                <label
                  htmlFor="verify-email"
                  className="text-[14px] font-medium text-[#111827]"
                >
                  Email Address
                </label>

                <input
                  id="verify-email"
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
                  disabled={!canSend}
                  className="mt-5 h-11 w-full touch-manipulation rounded-xl bg-[#1A7431] px-3 text-[14px] font-normal text-white disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Send Code
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
            </>
          )}
        </main>
      </div>
    </div>
  );
};

export default Verify;
