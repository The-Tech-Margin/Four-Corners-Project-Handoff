"use client";

import Modal from "@/components/modal";

interface ConfirmDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  variant?: "default" | "danger";
}

export function ConfirmDialog({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmText = "Confirm",
  cancelText = "Cancel",
  variant = "default",
}: ConfirmDialogProps) {
  const handleConfirm = () => {
    onConfirm();
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title} maxWidth="md">
      <div className="px-4 sm:px-5 py-4">
        <p className="modal-text text-sm mb-6 whitespace-pre-line">{message}</p>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={onClose}
            className="modal-button-secondary flex-1 px-4 py-2 font-medium rounded transition-colors"
          >
            {cancelText}
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            className={`flex-1 px-4 py-2 font-medium rounded transition-colors ${
              variant === "danger"
                ? "modal-button-danger"
                : "modal-button-primary"
            }`}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </Modal>
  );
}
