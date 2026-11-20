import { Download, Pencil } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { Button } from "@/client/components/ui/button";
import { Skeleton } from "@/client/components/ui/skeleton";

const RATIO_CLASS: Record<string, string> = {
  "1:1": "aspect-square",
  "4:3": "aspect-[4/3]",
  "3:4": "aspect-[3/4]",
  "16:9": "aspect-video",
  "9:16": "aspect-[9/16]",
};

export function imageUrl(id: string, download = false) {
  return `/api/images/${id}${download ? "?download=1" : ""}`;
}

/** Placeholders while a run is going, then its pictures with their actions. */
export function ResultGrid({
  pending,
  aspectRatio,
  images,
  testId = "result-image",
}: {
  /** How many placeholders to show while a run is going; 0 when idle. */
  pending: number;
  aspectRatio: string;
  images: { id: string }[];
  testId?: string;
}) {
  const ratio = RATIO_CLASS[aspectRatio] ?? "aspect-square";
  const count = pending || images.length;
  if (!count) return null;
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      {pending
        ? Array.from({ length: pending }, (_, index) => (
            <Skeleton
              key={index}
              data-testid="result-placeholder"
              className={`${ratio} w-full rounded-xl`}
            />
          ))
        : images.map((image, index) => (
            <figure key={image.id} className="space-y-2">
              <img
                src={imageUrl(image.id)}
                alt={`Result ${index + 1}`}
                data-testid={testId}
                className="w-full rounded-xl border border-border bg-muted object-contain"
              />
              <figcaption className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  render={
                    <a
                      href={imageUrl(image.id, true)}
                      download
                      data-testid="download"
                    />
                  }
                >
                  <Download data-icon="inline-start" />
                  Download
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  render={
                    <Link
                      to="/edit"
                      search={{ from: image.id }}
                      data-testid="edit-image"
                    />
                  }
                >
                  <Pencil data-icon="inline-start" />
                  Edit
                </Button>
              </figcaption>
            </figure>
          ))}
    </div>
  );
}
