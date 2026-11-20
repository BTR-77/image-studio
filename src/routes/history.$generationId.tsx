import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { RotateCcw, SearchX, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/client/components/ConfirmDialog";
import { EmptyState } from "@/client/components/EmptyState";
import { BackLink, PageHeader } from "@/client/components/PageHeader";
import { ResultGrid } from "@/client/components/studio/ResultGrid";
import { StudioShell } from "@/client/components/studio/StudioShell";
import { Alert, AlertDescription } from "@/client/components/ui/alert";
import { Button } from "@/client/components/ui/button";
import { KIND_LABELS, formatWhen } from "@/client/lib/format";
import { deleteGeneration, getGeneration } from "@/serverFunctions/studio";
import { STYLE_LABELS, type Style } from "@/shared/options";

export const Route = createFileRoute("/history/$generationId")({
  loader: ({ params }) =>
    /^[0-9a-f-]{36}$/i.test(params.generationId)
      ? getGeneration({ data: { id: params.generationId } })
      : null,
  head: () => ({ meta: [{ title: "History · Image Studio" }] }),
  component: GenerationPage,
});

function GenerationPage() {
  const generation = Route.useLoaderData();
  const navigate = useNavigate();
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const back = <BackLink to="/history">History</BackLink>;

  if (!generation) {
    return (
      <StudioShell>
        <PageHeader title="Not found" backLink={back} />
        <div data-testid="not-found">
          <EmptyState
            kind="filtered"
            icon={SearchX}
            title="This run doesn't exist"
          />
        </div>
      </StudioShell>
    );
  }

  async function remove() {
    setDeleting(true);
    try {
      const deleted = await deleteGeneration({ data: { id: generation!.id } });
      if (deleted) toast.success("Deleted.");
      else toast.error("It was already deleted.");
      await navigate({ to: "/history" });
    } catch {
      toast.error("It couldn't be deleted. Try again.");
      setDeleting(false);
      setConfirming(false);
    }
  }

  const options =
    generation.kind === "generate"
      ? [
          [
            "Style",
            STYLE_LABELS[generation.style as Style] ?? generation.style,
          ],
          ["Aspect ratio", generation.aspectRatio],
          ["Images", String(generation.count)],
        ]
      : [["Images", String(generation.count)]];
  const references = generation.inputs.filter(
    (input) => input.role === "reference",
  );
  const source = generation.inputs.find((input) => input.role === "source");

  return (
    <StudioShell>
      <PageHeader
        backLink={back}
        title={KIND_LABELS[generation.kind]}
        description={formatWhen(generation.createdAt)}
        actions={
          <>
            <Button
              variant="outline"
              size="sm"
              data-testid="reuse-prompt"
              render={<Link to="/" search={{ reuse: generation.id }} />}
            >
              <RotateCcw data-icon="inline-start" />
              Reuse prompt
            </Button>
            <Button
              variant="outline"
              size="sm"
              data-testid="delete-generation"
              onClick={() => setConfirming(true)}
            >
              <Trash2 data-icon="inline-start" />
              Delete
            </Button>
          </>
        }
      />

      {generation.error ? (
        <Alert variant="destructive" data-testid="generation-error">
          <AlertDescription>{generation.error}</AlertDescription>
        </Alert>
      ) : null}

      <ResultGrid
        pending={0}
        aspectRatio={generation.aspectRatio}
        images={generation.images}
        testId="detail-image"
      />

      <dl className="grid gap-4 text-sm sm:grid-cols-[8rem_1fr]">
        <dt className="text-muted-foreground">
          {generation.kind === "edit" ? "Instruction" : "Prompt"}
        </dt>
        <dd className="whitespace-pre-wrap" data-testid="detail-prompt">
          {generation.prompt}
        </dd>
        {options.map(([label, value]) => (
          <div key={label} className="contents">
            <dt className="text-muted-foreground">{label}</dt>
            <dd
              data-testid={`detail-${label!.toLowerCase().replace(" ", "-")}`}
            >
              {value}
            </dd>
          </div>
        ))}
        {source ? (
          <>
            <dt className="text-muted-foreground">Original</dt>
            <dd>
              <img
                src={`/api/inputs/${source.id}`}
                alt="Original"
                data-testid="detail-source"
                className="max-h-40 rounded-lg border border-border bg-muted object-contain"
              />
            </dd>
          </>
        ) : null}
        {references.length ? (
          <>
            <dt className="text-muted-foreground">References</dt>
            <dd className="flex flex-wrap gap-3">
              {references.map((reference, index) => (
                <img
                  key={reference.id}
                  src={`/api/inputs/${reference.id}`}
                  alt={`Reference ${index + 1}`}
                  data-testid="detail-reference"
                  className="size-20 rounded-lg border border-border bg-muted object-cover"
                />
              ))}
            </dd>
          </>
        ) : null}
      </dl>

      {confirming ? (
        <ConfirmDialog
          title="Delete this run?"
          confirmLabel="Delete"
          destructive
          pending={deleting}
          onConfirm={() => void remove()}
          onClose={() => setConfirming(false)}
        >
          Its images are deleted for good.
        </ConfirmDialog>
      ) : null}
    </StudioShell>
  );
}
