import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { z } from "zod";
import { PageHeader } from "@/client/components/PageHeader";
import { Choice, COUNT_OPTIONS } from "@/client/components/studio/Choice";
import {
  FileButton,
  pickFiles,
  useRevokeOnUnmount,
  type PickedFile,
} from "@/client/components/studio/ImageFiles";
import { PromptField } from "@/client/components/studio/PromptField";
import { ResultGrid, imageUrl } from "@/client/components/studio/ResultGrid";
import { StudioShell } from "@/client/components/studio/StudioShell";
import { UsageLine } from "@/client/components/studio/UsageLine";
import { Alert, AlertDescription } from "@/client/components/ui/alert";
import { Button } from "@/client/components/ui/button";
import type { GenerationDetail } from "@/server/generations";
import { editImage, getUsage, hasImage } from "@/serverFunctions/studio";

export const Route = createFileRoute("/edit")({
  validateSearch: z.object({ from: z.string().uuid().optional() }),
  loaderDeps: ({ search }) => ({ from: search.from }),
  loader: async ({ deps }) => {
    const [usage, owned] = await Promise.all([
      getUsage(),
      deps.from ? hasImage({ data: { id: deps.from } }) : false,
    ]);
    return {
      usage,
      from: owned ? deps.from! : null,
      missing: !!deps.from && !owned,
    };
  },
  head: () => ({ meta: [{ title: "Edit · Image Studio" }] }),
  component: EditPage,
});

function EditPage() {
  const { usage, from, missing } = Route.useLoaderData();
  return (
    <EditForm
      key={from ?? "upload"}
      usage={usage}
      from={from}
      missing={missing}
    />
  );
}

function EditForm({
  usage,
  from,
  missing,
}: {
  usage: Awaited<ReturnType<typeof getUsage>>;
  from: string | null;
  missing: boolean;
}) {
  const router = useRouter();
  const [pastImage, setPastImage] = useState(from);
  const [upload, setUpload] = useState<PickedFile | null>(null);
  const [fileError, setFileError] = useState<string | null>(
    missing ? "That image isn't available." : null,
  );
  const [instruction, setInstruction] = useState("");
  const [count, setCount] = useState("1");
  const [running, setRunning] = useState(0);
  const [result, setResult] = useState<GenerationDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  useRevokeOnUnmount(upload ? [upload] : []);

  const preview = upload?.url ?? (pastImage ? imageUrl(pastImage) : null);

  function choose(files: FileList | null) {
    const { picked, problem } = pickFiles(files, 1);
    setFileError(problem);
    if (!picked[0]) return;
    if (upload) URL.revokeObjectURL(upload.url);
    setUpload(picked[0]);
    setPastImage(null);
  }

  async function apply() {
    const form = new FormData();
    form.set("instruction", instruction);
    form.set("count", count);
    if (upload) form.set("source", upload.file);
    else if (pastImage) form.set("sourceImageId", pastImage);
    setError(null);
    setResult(null);
    setRunning(Number(count));
    try {
      const outcome = await editImage({ data: form });
      if (outcome.ok) {
        setResult(outcome.generation);
        if (outcome.generation.status === "failed")
          setError(outcome.generation.error);
      } else setError(outcome.error);
    } catch {
      setError("Something went wrong. Try again.");
    } finally {
      setRunning(0);
      await router.invalidate();
    }
  }

  return (
    <StudioShell>
      <PageHeader title="Edit" description={<UsageLine usage={usage} />} />

      <form
        className="space-y-6"
        onSubmit={(event) => {
          event.preventDefault();
          void apply();
        }}
      >
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-sm font-medium">Image</span>
            <FileButton
              label={preview ? "Replace" : "Upload"}
              testId="source-input"
              disabled={running > 0}
              onFiles={choose}
            />
            <span className="text-xs text-muted-foreground">
              JPG, PNG or WebP · 10 MB
            </span>
          </div>
          {fileError ? (
            <p className="text-sm text-destructive" data-testid="source-error">
              {fileError}
            </p>
          ) : null}
          {preview ? (
            <img
              src={preview}
              alt="Image to edit"
              data-testid="source-preview"
              className="max-h-72 rounded-xl border border-border bg-muted object-contain"
            />
          ) : null}
        </div>

        <PromptField
          id="instruction"
          label="What to change"
          testId="instruction"
          value={instruction}
          onChange={setInstruction}
          placeholder="Replace the background with a snowy forest"
        />

        <Choice
          label="Images"
          testId="count"
          options={COUNT_OPTIONS}
          value={count}
          onChange={setCount}
        />

        <Button
          type="submit"
          data-testid="apply-edit"
          disabled={!preview || !instruction.trim()}
          pending={running > 0}
        >
          Apply edit
        </Button>
      </form>

      {error ? (
        <Alert variant="destructive" data-testid="generation-error">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <ResultGrid
        pending={running}
        aspectRatio="source"
        images={result?.images ?? []}
      />
    </StudioShell>
  );
}
