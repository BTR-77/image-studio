import { ImagePlus, X } from "lucide-react";
import { useEffect, useRef } from "react";
import { Button } from "@/client/components/ui/button";
import { IMAGE_TYPES, fileProblem } from "@/shared/options";

export interface PickedFile {
  file: File;
  url: string;
}

/** Splits picked files into usable ones and the first reason one was refused. */
export function pickFiles(files: FileList | null, room: number) {
  const picked: PickedFile[] = [];
  let problem: string | null = null;
  for (const file of Array.from(files ?? [])) {
    const reason = fileProblem(file);
    if (reason) {
      problem ??= reason;
      continue;
    }
    if (picked.length >= room) {
      problem ??= "You can attach up to 4 reference images.";
      continue;
    }
    picked.push({ file, url: URL.createObjectURL(file) });
  }
  return { picked, problem };
}

/** Releases the previews' object URLs when they leave the page. */
export function useRevokeOnUnmount(files: PickedFile[]) {
  const latest = useRef(files);
  latest.current = files;
  useEffect(
    () => () => latest.current.forEach((file) => URL.revokeObjectURL(file.url)),
    [],
  );
}

/** A button that opens the file chooser for JPG, PNG and WebP images. */
export function FileButton({
  label,
  multiple = false,
  disabled,
  testId,
  onFiles,
}: {
  label: string;
  multiple?: boolean;
  disabled?: boolean;
  testId: string;
  onFiles: (files: FileList | null) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <>
      <input
        ref={input}
        type="file"
        className="sr-only"
        tabIndex={-1}
        accept={IMAGE_TYPES.join(",")}
        multiple={multiple}
        data-testid={testId}
        onChange={(event) => {
          onFiles(event.target.files);
          event.target.value = "";
        }}
      />
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={disabled}
        onClick={() => input.current?.click()}
      >
        <ImagePlus data-icon="inline-start" />
        {label}
      </Button>
    </>
  );
}

/** Small previews of picked files, each removable. */
export function Thumbnails({
  files,
  onRemove,
  testId,
}: {
  files: PickedFile[];
  onRemove: (index: number) => void;
  testId: string;
}) {
  if (!files.length) return null;
  return (
    <ul className="flex flex-wrap gap-3">
      {files.map((file, index) => (
        <li key={file.url} className="relative" data-testid={testId}>
          <img
            src={file.url}
            alt={file.file.name}
            className="size-20 rounded-lg border border-border object-cover"
          />
          <Button
            type="button"
            variant="secondary"
            size="icon-xs"
            className="absolute -top-2 -right-2 rounded-full"
            aria-label={`Remove ${file.file.name}`}
            onClick={() => onRemove(index)}
          >
            <X />
          </Button>
        </li>
      ))}
    </ul>
  );
}
