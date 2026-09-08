import { cn } from "@/lib/utils";

/**
 * The one star shape used by both the review card and its rating editor.
 * Keeping the fill and edge separate gives the small mark definition without
 * falling back to the harsh outlined/filled split the previous icons had.
 */
export default function ReviewStarIcon({
  active,
  className,
}: {
  active: boolean;
  className?: string;
}) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className={cn("shrink-0", className)}
      data-review-star={active ? "active" : "inactive"}
    >
      <path
        d="M12 3.15 14.73 8.7l6.12.89-4.43 4.31 1.05 6.09L12 17.12 6.53 20l1.05-6.1-4.43-4.31 6.12-.89L12 3.15Z"
        fill={active ? "#E7B641" : "#F3F4F6"}
        stroke={active ? "#C68B18" : "#C5CBD4"}
        strokeWidth="1.1"
        strokeLinejoin="round"
      />
    </svg>
  );
}
