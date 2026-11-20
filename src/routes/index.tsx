import { createFileRoute, useRouter } from "@tanstack/react-router";
import { Sparkles, Undo2 } from "lucide-react";
import { useState } from "react";
import { z } from "zod";
import { PageHeader } from "@/client/components/PageHeader";
import { Choice, COUNT_OPTIONS } from "@/client/components/studio/Choice";
import {
  FileButton,
  Thumbnails,
  pickFiles,
  useRevokeOnUnmount,
  type PickedFile,
} from "@/client/components/studio/ImageFiles";
import { PromptField } from "@/client/components/studio/PromptField";
import { ResultGrid } from "@/client/components/studio/ResultGrid";
import { StudioShell } from "@/client/components/studio/StudioShell";
import { UsageLine } from "@/client/components/studio/UsageLine";
import { Alert, AlertDescription } from "@/client/components/ui/alert";
import { Button } from "@/client/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/client/components/ui/select";
import type { GenerationDetail } from "@/server/generations";
import {
  createImages,
  enhancePrompt,
  getGeneration,
  getUsage,
} from "@/serverFunctions/studio";
import {
  ASPECT_RATIOS,
  MAX_REFERENCES,
  STYLES,
  STYLE_LABELS,
  type AspectRatio,
  type Style,
} from "@/shared/options";

export const Route = createFileRoute("/")({
  validateSearch: z.object({ reuse: z.string().uuid().optional() }),
  loaderDeps: ({ search }) => ({ reuse: search.reuse }),
  loader: async ({ deps }) => {
    const [usage, reused] = await Promise.all([
      getUsage(),
      deps.reuse ? getGeneration({ data: { id: deps.reuse } }) : null,
    ]);
    return { usage, reused };
  },
  head: () => ({ meta: [{ title: "Create · Image Studio" }] }),
  component: CreatePage,
});

const ASPECT_OPTIONS = ASPECT_RATIOS.map((value) => ({ value, label: value }));
const STYLE_ITEMS = STYLES.map((value) => ({
  value,
  label: STYLE_LABELS[value],
}));

function CreatePage() {
  const { usage, reused } = Route.useLoaderData();
  // A new key per reused generation resets the form to its values.
  return <CreateForm key={reused?.id ?? "new"} usage={usage} reused={reused} />;
}

function CreateForm({
  usage,
  reused,
}: {
  usage: Awaited<ReturnType<typeof getUsage>>;
  reused: GenerationDetail | null;
}) {
  const router = useRouter();
  const [prompt, setPrompt] = useState(reused?.prompt ?? "");
  const [beforeEnhance, setBeforeEnhance] = useState<string | null>(null);
  const [enhancing, setEnhancing] = useState(false);
  const [style, setStyle] = useState<Style>(
    (STYLES as readonly string[]).includes(reused?.style ?? "")
      ? (reused!.style as Style)
      : "none",
  );
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>(
    (ASPECT_RATIOS as readonly string[]).includes(reused?.aspectRatio ?? "")
      ? (reused!.aspectRatio as AspectRatio)
      : "1:1",
  );
  const [count, setCount] = useState("1");
  const [references, setReferences] = useState<PickedFile[]>([]);
  const [fileError, setFileError] = useState<string | null>(null);
  const [running, setRunning] = useState(0);
  const [result, setResult] = useState<GenerationDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  useRevokeOnUnmount(references);

  async function enhance() {
    setError(null);
    setEnhancing(true);
    try {
      const answer = await enhancePrompt({ data: { prompt } });
      if (answer.ok) {
        setBeforeEnhance(prompt);
        setPrompt(answer.prompt);
      } else setError(answer.error);
    } catch {
      setError("The prompt couldn't be rewritten. Try again.");
    } finally {
      setEnhancing(false);
    }
  }

  function addReferences(files: FileList | null) {
    const { picked, problem } = pickFiles(
      files,
      MAX_REFERENCES - references.length,
    );
    setFileError(problem);
    setReferences((current) => [...current, ...picked]);
  }

  function removeReference(index: number) {
    setReferences((current) => {
      URL.revokeObjectURL(current[index]!.url);
      return current.filter((_, at) => at !== index);
    });
  }

  async function generate() {
    const form = new FormData();
    form.set("prompt", prompt);
    form.set("style", style);
    form.set("aspectRatio", aspectRatio);
    form.set("count", count);
    for (const reference of references)
      form.append("references", reference.file);
    setError(null);
    setResult(null);
    setRunning(Number(count));
    try {
      const outcome = await createImages({ data: form });
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

  const busy = running > 0;
  return (
    <StudioShell>
      <PageHeader title="Create" description={<UsageLine usage={usage} />} />

      <form
        className="space-y-6"
        onSubmit={(event) => {
          event.preventDefault();
          void generate();
        }}
      >
        <PromptField
          id="prompt"
          label="Prompt"
          testId="prompt"
          value={prompt}
          onChange={setPrompt}
          placeholder="A lighthouse on a cliff at dawn, waves breaking below"
          action={
            <>
              <Button
                type="button"
                variant="outline"
                size="sm"
                data-testid="enhance"
                disabled={!prompt.trim() || busy}
                pending={enhancing}
                onClick={() => void enhance()}
              >
                {enhancing ? null : <Sparkles data-icon="inline-start" />}
                Enhance
              </Button>
              {beforeEnhance !== null ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  data-testid="undo-enhance"
                  onClick={() => {
                    setPrompt(beforeEnhance);
                    setBeforeEnhance(null);
                  }}
                >
                  <Undo2 data-icon="inline-start" />
                  Undo
                </Button>
              ) : null}
            </>
          }
        />

        <div className="flex flex-wrap gap-x-8 gap-y-5">
          <Choice
            label="Aspect ratio"
            testId="aspect"
            options={ASPECT_OPTIONS}
            value={aspectRatio}
            onChange={setAspectRatio}
          />
          <div className="space-y-2">
            <div className="text-sm font-medium" id="style-label">
              Style
            </div>
            <Select
              items={STYLE_ITEMS}
              value={style}
              onValueChange={(value) => value && setStyle(value as Style)}
            >
              <SelectTrigger
                className="w-44"
                data-testid="style"
                aria-labelledby="style-label"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STYLE_ITEMS.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Choice
            label="Images"
            testId="count"
            options={COUNT_OPTIONS}
            value={count}
            onChange={setCount}
          />
        </div>

        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-sm font-medium">Reference images</span>
            <FileButton
              label="Add"
              multiple
              testId="reference-input"
              disabled={busy || references.length >= MAX_REFERENCES}
              onFiles={addReferences}
            />
            <span className="text-xs text-muted-foreground">
              Up to 4 · JPG, PNG or WebP · 10 MB each
            </span>
          </div>
          {fileError ? (
            <p
              className="text-sm text-destructive"
              data-testid="reference-error"
            >
              {fileError}
            </p>
          ) : null}
          <Thumbnails
            files={references}
            onRemove={removeReference}
            testId="reference-thumb"
          />
        </div>

        <Button
          type="submit"
          data-testid="generate"
          disabled={!prompt.trim()}
          pending={busy}
        >
          Generate
        </Button>
      </form>

      {error ? (
        <Alert variant="destructive" data-testid="generation-error">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <ResultGrid
        pending={running}
        aspectRatio={result?.aspectRatio ?? aspectRatio}
        images={result?.images ?? []}
      />
    </StudioShell>
  );
}
