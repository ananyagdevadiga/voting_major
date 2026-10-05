import { useEffect, useRef } from "react";
import { Button } from "./ui";

/*
 * Modal confirmation for irreversible admin actions. Uses the native <dialog>
 * element, so focus is trapped and Escape cancels.
 */
function ConfirmDialog({ open, title, children, confirmLabel, busy = false, onConfirm, onCancel }) {
  const ref = useRef(null);

  useEffect(() => {
    const dialog = ref.current;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onCancel();
      }}
      className="m-auto w-[calc(100%-2.5rem)] max-w-md rounded-2xl border border-slate-200 bg-white p-0 shadow-xl backdrop:bg-slate-950/40"
    >
      <div className="p-6 sm:p-7">
        <h2 className="text-lg font-semibold tracking-tight text-slate-900">{title}</h2>
        <div className="mt-2 space-y-2 text-sm leading-relaxed text-slate-600">{children}</div>
        <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <Button variant="secondary" onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={onConfirm} busy={busy} disabled={busy}>
            {confirmLabel}
          </Button>
        </div>
      </div>
    </dialog>
  );
}

export default ConfirmDialog;
