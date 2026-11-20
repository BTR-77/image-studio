import { createFileRoute } from "@tanstack/react-router";
import { serveFile } from "@/server/files";

// A reference image or edit source a member uploaded. Private: only its owner gets it.
export const Route = createFileRoute("/api/inputs/$inputId")({
  server: {
    handlers: {
      GET: ({ request, params }) =>
        serveFile(request, "inputs", params.inputId),
    },
  },
});
