"use client";

type HeaderProps = {
  onKingaClick: () => void;
  title?: string;
  ctaLabel?: string;
  ctaAriaLabel?: string;
};

export default function Header({
  onKingaClick,
  title = "Agent Hermes",
  ctaLabel = "Kinga",
  ctaAriaLabel = "Back to chat",
}: HeaderProps) {
  return (
    <div className="flex items-center justify-between mb-8">
      <h1 className="text-3xl md:text-4xl font-semibold tracking-tight">{title}</h1>
      <button
        type="button"
        onClick={onKingaClick}
        className="px-6 py-3 rounded-2xl text-lg text-primary-foreground hover:opacity-90 transition-colors"
        style={{ backgroundColor: "#0b1526" }}
        aria-label={ctaAriaLabel}
      >
        {ctaLabel}
      </button>
    </div>
  );
}
