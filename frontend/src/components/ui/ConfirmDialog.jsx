// components/ui/ConfirmDialog.jsx
import Modal from "./Modal";

export default function ConfirmDialog({ isOpen, title, message, confirmLabel = "Confirm", onConfirm, onCancel, danger = false }) {
  return (
    <Modal isOpen={isOpen} onClose={onCancel} title={title}>
      <p className="text-sm text-gray-600 mb-6">{message}</p>
      <div className="flex gap-3">
        <button onClick={onCancel}
          className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors">
          Cancel
        </button>
        <button onClick={onConfirm}
          className={`flex-1 py-2.5 rounded-xl text-sm font-medium text-white transition-colors ${
            danger ? "bg-red-500 hover:bg-red-600" : "bg-emerald-500 hover:bg-emerald-600"
          }`}>
          {confirmLabel}
        </button>
      </div>
    </Modal>
  );
}
