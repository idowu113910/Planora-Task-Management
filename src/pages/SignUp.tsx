import { useState } from "react";
import {
  BsCheckCircleFill,
  BsCircle,
  BsEyeFill,
  BsEyeSlashFill,
} from "react-icons/bs";
import planora from "../assets/planora.svg";
import { FaApple } from "react-icons/fa6";
import { FcGoogle } from "react-icons/fc";

type Field = {
  id: "email" | "password" | "confirmPassword";
  label: string;
  placeholder: string;
  type: "email" | "password";
  autoComplete: string;
};

// Declare the fields once, then map through them below
const fields: Field[] = [
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
    email: "",
    password: "",
    confirmPassword: "",
  });

  // which password fields are currently visible
  const [visible, setVisible] = useState<Record<Field["id"], boolean>>({
    email: false,
    password: false,
    confirmPassword: false,
  });

  const handleChange = (id: Field["id"], value: string) =>
    setValues((prev) => ({ ...prev, [id]: value }));

  const toggleVisible = (id: Field["id"]) =>
    setVisible((prev) => ({ ...prev, [id]: !prev[id] }));

  // becomes true after the first tap on Sign Up, so errors show only then
  const [submitted, setSubmitted] = useState(false);

  const passwordChecks = passwordRules.map((rule) => ({
    ...rule,
    passed: rule.test(values.password),
  }));
  const isPasswordValid = passwordChecks.every((check) => check.passed);
  // show the checklist as soon as the user starts typing, or after a failed submit
  const showPasswordRules = values.password.length > 0 || submitted;

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
            onSubmit={(e) => {
              e.preventDefault();
              setSubmitted(true);
              if (!isPasswordValid) return; // password must meet every rule
              // TODO: connect to your sign-up endpoint
            }}
            noValidate
            className="relative z-10 mt-5 flex flex-1 flex-col gap-4 px-4 pb-[max(24px,env(safe-area-inset-bottom))] min-[360px]:px-5 min-[414px]:px-6"
          >
            {fields.map((field) => {
              const isPassword = field.type === "password";
              const show = visible[field.id];
              const isPasswordField = field.id === "password";
              const hasError = isPasswordField && submitted && !isPasswordValid;

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
                      autoCapitalize="none"
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

            <button
              type="submit"
              className="mt-2 h-11 w-full touch-manipulation rounded-xl bg-[#1A7431] px-3 text-[14px] font-normal text-white"
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
              className="flex h-11 w-full touch-manipulation items-center justify-center gap-2 rounded-xl bg-[#1A7431] px-3 text-white"
            >
              <FaApple className="h-5 w-5 shrink-0" />
              <span className="text-[14px] font-normal">
                Continue with Apple
              </span>
            </button>

            <button
              type="button"
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
