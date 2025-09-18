"use client";

type NoteModalProps = {
  open: boolean;
  action: "hold" | "delete" | null;
  note: string;
  onNoteChange: (v: string) => void;
  onCancel: () => void;
  onSubmit: () => void;
};

export default function NoteModal({
  open,
  action,
  note,
  onNoteChange,
  onCancel,
  onSubmit,
}: NoteModalProps) {
  if (!open) return null;

  const placeholder =
    action === "hold" ? "Why is this on hold?" : "Why is this being deleted?";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onCancel} />
      <div className="relative w-full max-w-lg rounded-2xl bg-background ring-1 ring-border/40 p-6 space-y-4">
        <div className="text-lg font-medium">Add a note ({action})</div>
        <textarea
          value={note}
          onChange={(e) => onNoteChange(e.target.value)}
          rows={6}
          placeholder={placeholder}
          className="w-full rounded-xl bg-secondary/60 border border-transparent p-3 text-sm"
        />
        <div className="flex justify-end gap-3 pt-2">
          <button
            onClick={onCancel}
            className="px-4 py-2 rounded-xl border hover:bg-secondary"
            style={{ borderColor: "#0077D1", color: "#0077D1" }}
          >
            Cancel
          </button>
          <button
            onClick={onSubmit}
            disabled={!note.trim()}
            className="group relative overflow-hidden px-5 py-2.5 rounded-xl text-primary-foreground hover:opacity-95 disabled:opacity-50 transition-transform active:scale-[0.98]"
            style={{ backgroundColor: "var(--color-turquoise)" }}
          >
            Continue
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
