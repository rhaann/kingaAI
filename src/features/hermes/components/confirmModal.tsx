"use client";

type ConfirmModalProps = {
  open: boolean;
  action: "hold" | "delete" | null;
  companyName: string;
  onCancel: () => void;
  onConfirm: () => void;
};

export default function ConfirmModal({
  open,
  action,
  companyName,
  onCancel,
  onConfirm,
}: ConfirmModalProps) {
  if (!open) return null;

  const title = action === "hold" ? "Put company on hold?" : "Delete company?";
  const verb = action === "hold" ? "hold" : "delete";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onCancel} />
      <div className="relative w-full max-w-md rounded-2xl bg-background ring-1 ring-border/40 p-6 space-y-4">
        <div className="text-lg font-medium">{title}</div>
        <p className="text-sm text-muted-foreground">
          Are you sure you want to {verb} {companyName || "this company"}?
        </p>
        <div className="flex justify-end gap-3 pt-2">
          <button
            onClick={onCancel}
            className="px-4 py-2 rounded-xl border hover:bg-secondary"
            style={{ borderColor: "#0077D1", color: "#0077D1" }}
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="group relative overflow-hidden px-5 py-2.5 rounded-xl text-primary-foreground hover:opacity-95 transition-transform active:scale-[0.98]"
            style={{ backgroundColor: "var(--color-turquoise)" }}
          >
            Yes
            <span
              className="pointer-events-none absolute left-[-120%] top-0 h-full w-1/2
                         bg-white/10 blur-md transform transition-transform duration-500
                         group-hover:translate-x-[260%]"
            />
          </button>
        </div>
      </div>
    </div>
  );
}
