/**
 * The iOS share glyph — a box with an arrow leaving the top — drawn inline so
 * it sits in the sentence at text size and in the current colour. A child
 * recognises the shape long before they can read "share".
 */
export function ShareIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.9}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={className}
    >
      <path d="M12 3.5v10.5" />
      <path d="M8.4 7.1 12 3.5l3.6 3.6" />
      <path d="M7.5 10.2H6.2A2.2 2.2 0 0 0 4 12.4v6.4a2.2 2.2 0 0 0 2.2 2.2h11.6a2.2 2.2 0 0 0 2.2-2.2v-6.4a2.2 2.2 0 0 0-2.2-2.2h-1.3" />
    </svg>
  );
}
