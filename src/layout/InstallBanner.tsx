import { useState } from "react";
import { FiDownload, FiX, FiShare } from "react-icons/fi";
import { useInstallPrompt } from "../hooks/UseInstallPrompt";

const InstallBanner = () => {
  const { canShow, canPromptNatively, ios, install, dismiss } =
    useInstallPrompt();
  const [showIOSHelp, setShowIOSHelp] = useState(false);

  if (!canShow) return null;

  return (
    <div className="mx-auto mt-3 w-full max-w-md rounded-2xl bg-white p-3 shadow-[0_4px_16px_rgba(17,24,39,0.08)]">
      <div className="flex items-center gap-3">
        <span
          aria-hidden="true"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#1A7431] text-white"
        >
          <FiDownload size={18} />
        </span>

        <div className="min-w-0 flex-1">
          <p className="text-[14px] font-medium text-[#111827]">
            Install Planora
          </p>
          <p className="text-[12px] font-normal text-[#6B7280]">
            Add it to your home screen for quick access.
          </p>
        </div>

        {canPromptNatively ? (
          <button
            type="button"
            onClick={install}
            className="min-h-11 shrink-0 touch-manipulation rounded-xl bg-[#1A7431] px-4 text-[13px] text-white"
          >
            Install
          </button>
        ) : (
          ios && (
            <button
              type="button"
              onClick={() => setShowIOSHelp((v) => !v)}
              className="min-h-11 shrink-0 touch-manipulation rounded-xl bg-[#1A7431] px-4 text-[13px] text-white"
            >
              How?
            </button>
          )
        )}

        <button
          type="button"
          onClick={dismiss}
          aria-label="Dismiss"
          className="flex h-11 w-8 shrink-0 touch-manipulation items-center justify-center text-[#6B7280]"
        >
          <FiX size={16} aria-hidden="true" />
        </button>
      </div>

      {showIOSHelp && (
        <p className="mt-2 flex flex-wrap items-center gap-1 rounded-xl bg-[#F8FAFC] p-3 text-[12px] text-[#4B5563]">
          In Safari, tap <FiShare aria-label="Share" /> then
          <b>Add to Home Screen</b>.
        </p>
      )}
    </div>
  );
};

export default InstallBanner;
