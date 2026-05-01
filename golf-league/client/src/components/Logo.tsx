// Golf flag logo — simple geometric SVG mark.
export function Logo({ className = "h-6 w-6" }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 32 32"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-label="Golf League logo"
    >
      {/* Flagpole */}
      <line x1="9" y1="4" x2="9" y2="28" />
      {/* Flag */}
      <path d="M9 5 L23 9 L9 13 Z" fill="currentColor" />
      {/* Ground */}
      <line x1="4" y1="28" x2="28" y2="28" />
      {/* Ball */}
      <circle cx="22" cy="26" r="2" fill="currentColor" />
    </svg>
  );
}
