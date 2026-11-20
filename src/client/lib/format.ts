/** A stored UTC timestamp as "Nov 19, 2026, 14:03 UTC", the same on server and browser. */
export function formatWhen(iso: string): string {
  const date = new Date(iso.includes("T") ? iso : `${iso.replace(" ", "T")}Z`);
  return `${date.toLocaleString("en-US", {
    timeZone: "UTC",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  })} UTC`;
}

export const KIND_LABELS = { generate: "Created", edit: "Edited" } as const;
