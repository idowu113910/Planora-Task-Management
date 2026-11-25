import { useState } from "react";
import first from "../assets/first.svg";
import second from "../assets/second.svg";
import welcome from "../assets/welcome.svg";
import { useNavigate } from "react-router-dom";

type Slide = {
  image: string;
  title: string;
  description: string;
};

const slides: Slide[] = [
  {
    image: first,
    title: "Capture Everything.",
    description:
      "Dump your thoughts into the inbox. Sort them into projects whenever you’re ready.",
  },
  {
    image: second,
    title: "Organize Your Way.",
    description:
      "Turn your captured thoughts into projects and tasks, and keep everything in one place.",
  },
];

const Chevron = () => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 16 16"
    fill="none"
    aria-hidden="true"
  >
    <path
      d="M6 3.5L10.5 8L6 12.5"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const OnBoarding = () => {
  // 0..slides.length-1 = slides, slides.length = welcome screen (same page)
  const [step, setStep] = useState(0);
  const isWelcome = step === slides.length;
  const slide = slides[step];

  const handleNext = () => setStep((prev) => Math.min(prev + 1, slides.length));
  const handleSkip = () => setStep(slides.length);
  const navigate = useNavigate();

  return (
    // Outer layer: paints the background across the WHOLE screen, so nothing
    // else can show through at the bottom or sides. The safe-area padding keeps
    // content clear of notches and the home bar.
    <div className="min-h-dvh w-full overflow-x-hidden bg-[#F1F4F8] pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]">
      {/* Inner column: same layout as before, fills the screen height */}
      <div className="relative mx-auto flex min-h-[calc(100dvh-env(safe-area-inset-top)-env(safe-area-inset-bottom))] w-full max-w-md flex-col overflow-x-hidden bg-[#F1F4F8]">
        {/* Decorative diagonal shape behind the image (top of the design) */}
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

        {isWelcome ? (
          /* ---------- Welcome screen ---------- */
          <>
            {/* Image: bottom-aligned above the title, bleeds past both edges (~118% width) like the design */}
            <div className="relative min-h-37.5 flex-1">
              <div className="absolute inset-x-0 top-4 bottom-5 flex items-end justify-center">
                <img
                  src={welcome}
                  alt=""
                  className="h-auto max-h-full w-[118%] max-w-none shrink-0 object-contain"
                />
              </div>
            </div>

            <div className="relative z-10 flex flex-col gap-4 px-4">
              <h2 className="text-[clamp(26px,8.5vw,32px)] font-medium leading-tight text-[#111827]">
                Welcome to Planora.
              </h2>
              <p className="text-[14px] font-normal leading-5.5 text-[#6B7280]">
                Start managing your tasks in seconds.
              </p>
            </div>

            <div className="h-[clamp(16px,5dvh,42px)] shrink-0" />

            <div className="items-center gap-4 px-4">
              <button
                onClick={() => {
                  navigate("/signup");
                }}
                className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#1A7431] text-[14px] font-normal text-white"
              >
                Create an Account
              </button>
            </div>

            <p className="mt-5 flex items-center justify-center text-center text-[12px] font-normal text-[#6B7280]">
              Already have an account?&nbsp;
              <span
                onClick={() => {
                  navigate("/signin");
                }}
                className="font-semibold text-[#1A7431] underline"
              >
                Sign in
              </span>
            </p>

            <div className="mt-5.5 flex items-center gap-5 px-4">
              <span className="h-[0.5px] flex-1 bg-[#D8E5F3]" />
              <span className="text-[12px] font-normal text-[#6B7280]">OR</span>
              <span className="h-[0.5px] flex-1 bg-[#D8E5F3]" />
            </div>

            <p className="mb-4 mt-5 flex items-center justify-center text-[14px] font-normal text-[#6B7280] underline">
              Continue as Guest
            </p>
          </>
        ) : (
          /* ---------- Onboarding slides ---------- */
          <>
            <div className="relative min-h-37.5 flex-1">
              <div className="absolute inset-x-0 top-[clamp(8px,calc(40dvh-265px),64px)] bottom-4 flex items-center justify-center">
                <img
                  key={step}
                  src={slide.image}
                  alt=""
                  className="h-full w-auto max-w-[122%] shrink-0 object-contain"
                />
              </div>
            </div>

            <div className="relative z-10 flex flex-col gap-3 px-4">
              <h2 className="text-[clamp(26px,8.5vw,32px)] font-medium leading-tight text-[#111827]">
                {slide.title}
              </h2>
              <p className="text-[14px] font-normal leading-5.5 text-[#6B7280]">
                {slide.description}
              </p>
            </div>

            <div className="h-[clamp(16px,8dvh,68px)] shrink-0" />

            <div className="relative z-10 flex items-center justify-center gap-1">
              {slides.map((_, i) => (
                <span
                  key={i}
                  className={`h-1 rounded-full transition-all duration-300 ${
                    i === step ? "w-3 bg-[#1A7431]" : "w-1 bg-[#C6CCD3]"
                  }`}
                />
              ))}
            </div>

            <div className="relative z-10 flex flex-col items-center gap-4 px-4 pb-4 pt-4">
              <button
                onClick={handleNext}
                className="flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-[#1A7431] text-[14px] font-normal text-white"
              >
                Next
                <Chevron />
              </button>

              <button
                onClick={handleSkip}
                className="text-[14px] font-normal leading-5.5 text-[#6B7280] underline"
              >
                Skip
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default OnBoarding;
