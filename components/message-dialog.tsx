"use client";

import Modal from "@/components/modal";

interface MessageDialogProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  message: string;
  variant?: "info" | "success" | "error";
}

export function MessageDialog({
  isOpen,
  onClose,
  title,
  message,
  variant = "info",
}: MessageDialogProps) {
  const iconColor = {
    info: "text-blue-400",
    success: "text-green-400",
    error: "text-red-400",
  }[variant];

  const bgColor = {
    info: "bg-blue-500/10",
    success: "bg-green-500/10",
    error: "bg-red-500/10",
  }[variant];

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title} maxWidth="md">
      <div className="px-4 sm:px-5 py-4">
        <div className={`${bgColor} rounded-lg p-4 mb-4`}>
          <p className={`${iconColor} text-sm whitespace-pre-line`}>
            {message}
          </p>
        </div>

        <button
          type="button"
          onClick={onClose}
          className="modal-button-primary w-full px-4 py-2 font-medium rounded transition-colors"
        >
          OK
        </button>
      </div>
    </Modal>
  );
}
