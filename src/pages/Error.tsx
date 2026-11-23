import { Link, useNavigate } from "react-router-dom";
import { FiCompass } from "react-icons/fi";
import { isSignedIn } from "../auth";

// Shown for any address that doesn't exist. Signed-in people are offered the
// home page, everyone else the sign in page.
const NotFound = () => {
  const navigate = useNavigate();

  const signedIn = isSignedIn();
  const target = signedIn ? "/home" : "/signin";
  const targetLabel = signedIn ? "Go to Home" : "Go to Sign In";

  // Go back one page, or to the target if there is no page to go back to
  const goBack = () => {
    if (window.history.length > 1) navigate(-1);
    else navigate(target, { replace: true });
  };

  return (
    // Same page background and notch padding as the other screens
    <div className="flex min-h-dvh touch-manipulation items-center justify-center bg-[#F1F4F8] px-[max(clamp(12px,4vw,24px),env(safe-area-inset-left))] py-[max(1rem,env(safe-area-inset-top))] [-webkit-text-size-adjust:100%] [text-size-adjust:100%]">
      <main className="w-full max-w-md rounded-3xl bg-[#F8FAFC] p-3 min-[360px]:p-4">
        <div className="flex flex-col items-center rounded-2xl bg-white px-4 py-10 text-center min-[360px]:px-5">
          <div
            aria-hidden="true"
            className="flex h-16 w-16 items-center justify-center rounded-2xl bg-[#EEF3F9] text-[#1A7431]"
          >
            <FiCompass size={28} />
          </div>

          <p className="mt-6 text-[clamp(3rem,16vw,4.5rem)] leading-none font-semibold text-[#1A7431]">
            404
          </p>

          <h1 className="mt-4 text-[1rem] font-medium text-[#111827]">
            Page not found
          </h1>
          <p className="mt-2 max-w-xs text-[0.875rem] font-normal text-[#6B7280]">
            The page you're looking for doesn't exist or may have been moved.
          </p>

          <div className="mt-8 flex w-full flex-col gap-3">
            <Link
              to={target}
              replace
              className="flex min-h-11 touch-manipulation items-center justify-center rounded-xl bg-[#1A7431] px-4 text-[0.875rem] font-normal text-white"
            >
              {targetLabel}
            </Link>

            <button
              type="button"
              onClick={goBack}
              className="min-h-11 touch-manipulation rounded-xl border border-[#D8E5F3] bg-white px-4 text-[0.875rem] font-normal text-[#6B7280]"
            >
              Go back
            </button>
          </div>
        </div>
      </main>
    </div>
  );
};

export default NotFound;
