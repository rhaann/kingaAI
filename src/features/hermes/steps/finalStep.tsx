"use client";

type Props = {
  onHome: () => void;
};

export default function FinalStep({ onHome }: Props) {
  return (
    <div className="mx-auto max-w-3xl text-center py-24">
      <h2 className="text-2xl md:text-3xl font-semibold mb-2">Done</h2>
      <p className="text-sm text-muted-foreground">
        All contacts across companies have been processed.
      </p>
      <div className="mt-8 flex justify-center">
        <button
          onClick={onHome}
          className="inline-flex items-center gap-2 px-6 py-3 rounded-xl text-primary-foreground hover:opacity-95"
          style={{ backgroundColor: "var(--color-turquoise)" }}
        >
          Home
        </button>
      </div>
    </div>
  );
}
