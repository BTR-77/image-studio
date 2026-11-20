import type { Usage } from "@/server/usage";

/** Today's images against the daily limit. */
export function UsageLine({ usage }: { usage: Usage }) {
  return (
    <span data-testid="usage">
      {usage.used} of {usage.limit} images used today · {usage.remaining} left
    </span>
  );
}
