import { ReactNode, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  maxWidth?: "sm" | "md" | "lg" | "xl" | "2xl" | "4xl" | "5xl" | "6xl";
  showCloseButton?: boolean;
  /** When false, backdrop click and close button are disabled */
  dismissible?: boolean;
  /** When false, hides the title bar header entirely */
  showHeader?: boolean;
}

// SSR-safe mounted check: snapshot returns false on the server, true on the client.
const subscribe = () => () => {};
const getSnapshot = () => true;
const getServerSnapshot = () => false;

export default function Modal({
  isOpen,
  onClose,
  title,
  children,
  maxWidth = "md",
  showCloseButton = true,
  dismissible = true,
  showHeader = true,
}: ModalProps) {
  const mounted = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  if (!isOpen || !mounted) return null;

  const maxWidthClasses = {
    sm: "max-w-sm",
    md: "max-w-md",
    lg: "max-w-lg",
    xl: "max-w-xl",
    "2xl": "max-w-2xl",
    "4xl": "max-w-4xl",
    "5xl": "max-w-5xl",
    "6xl": "max-w-6xl",
  };

  const canClose = dismissible && showCloseButton;

  const modalContent = (
    <div
      className="modal-overlay fixed inset-0 flex items-center justify-center z-[9999] p-4"
      onClick={dismissible ? onClose : undefined}
      role="dialog"
      aria-modal="true"
      aria-label={showHeader ? undefined : title}
    >
      <div
        className={`modal-content rounded-xl sm:rounded-2xl w-full ${maxWidthClasses[maxWidth]} border overflow-hidden max-h-[90vh] flex flex-col`}
        onClick={(e) => e.stopPropagation()}
      >
        {showHeader && (
          <div className="modal-header flex items-center justify-center relative px-4 sm:px-5 py-4 border-b">
            <h2 className="modal-title text-lg font-semibold text-center">
              {title}
            </h2>
            {canClose && (
              <button
                onClick={onClose}
                className="absolute right-4 w-8 h-8 flex items-center justify-center rounded-lg modal-text-muted hover:modal-text hover:bg-surface-alt transition-colors"
                aria-label="Close"
              >
                <svg
                  className="w-5 h-5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            )}
          </div>
        )}
        <div className="flex-1 overflow-y-auto">{children}</div>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
}
