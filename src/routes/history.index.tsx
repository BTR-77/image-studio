import { Link, createFileRoute } from "@tanstack/react-router";
import { ChevronLeft, ChevronRight, ImageOff, Images } from "lucide-react";
import { z } from "zod";
import { EmptyState } from "@/client/components/EmptyState";
import { PageHeader } from "@/client/components/PageHeader";
import { imageUrl } from "@/client/components/studio/ResultGrid";
import { StudioShell } from "@/client/components/studio/StudioShell";
import { Badge } from "@/client/components/ui/badge";
import { Button } from "@/client/components/ui/button";
import { KIND_LABELS, formatWhen } from "@/client/lib/format";
import { listGenerations } from "@/serverFunctions/studio";

export const Route = createFileRoute("/history/")({
  validateSearch: z.object({ page: z.number().int().min(1).optional() }),
  loaderDeps: ({ search }) => ({ page: search.page ?? 1 }),
  loader: ({ deps }) => listGenerations({ data: { page: deps.page } }),
  head: () => ({ meta: [{ title: "History · Image Studio" }] }),
  component: HistoryPage,
});

function HistoryPage() {
  const { items, page, pages, total } = Route.useLoaderData();
  return (
    <StudioShell>
      <PageHeader
        title="History"
        description={
          total ? `${total} ${total === 1 ? "run" : "runs"}` : undefined
        }
      />
      {items.length === 0 ? (
        <div data-testid="history-empty">
          <EmptyState
            icon={Images}
            title="Nothing here yet"
            description="Images you create or edit will appear here."
            action={
              <Button render={<Link to="/" />} size="sm">
                Create an image
              </Button>
            }
          />
        </div>
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
          {items.map((item) => (
            <li key={item.id}>
              <Link
                to="/history/$generationId"
                params={{ generationId: item.id }}
                data-testid="history-item"
                className="flex items-center gap-4 px-4 py-3 transition-colors hover:bg-muted/50"
              >
                {item.thumbnailId ? (
                  <img
                    src={imageUrl(item.thumbnailId)}
                    alt=""
                    className="size-16 shrink-0 rounded-lg border border-border bg-muted object-cover"
                  />
                ) : (
                  <span className="flex size-16 shrink-0 items-center justify-center rounded-lg border border-border bg-muted text-muted-foreground">
                    <ImageOff className="size-5" aria-hidden />
                  </span>
                )}
                <span className="min-w-0 flex-1 space-y-1">
                  <span className="line-clamp-2 text-sm">{item.prompt}</span>
                  <span className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <Badge variant="secondary">{KIND_LABELS[item.kind]}</Badge>
                    {item.status === "failed" ? (
                      <Badge variant="destructive">Failed</Badge>
                    ) : item.status === "running" ? (
                      <Badge variant="outline">Running</Badge>
                    ) : null}
                    <span>{formatWhen(item.createdAt)}</span>
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      {pages > 1 ? (
        <div className="flex items-center justify-between gap-3">
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1}
            data-testid="previous-page"
            render={<Link to="/history" search={{ page: page - 1 }} />}
          >
            <ChevronLeft data-icon="inline-start" />
            Newer
          </Button>
          <span
            className="text-sm text-muted-foreground"
            data-testid="page-label"
          >
            Page {page} of {pages}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= pages}
            data-testid="next-page"
            render={<Link to="/history" search={{ page: page + 1 }} />}
          >
            Older
            <ChevronRight data-icon="inline-end" />
          </Button>
        </div>
      ) : null}
    </StudioShell>
  );
}
