import { createFileRoute } from "@tanstack/react-router";
import { serveFile } from "@/server/files";

// A picture a member made. Private: only its owner gets it.
export const Route = createFileRoute("/api/images/$imageId")({
  server: {
    handlers: {
      GET: ({ request, params }) =>
        serveFile(request, "images", params.imageId),
    },
  },
});
