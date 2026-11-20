import { env } from "cloudflare:workers";
import { getEveryAppUser } from "@every-app/sdk/server";
import { findFile } from "@/server/generations";

const EXTENSIONS: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
};

/**
 * Streams one of the caller's stored files. Anyone else's id, or an id that
 * doesn't exist, is the same 404. `?download=1` saves it instead of showing it.
 */
export async function serveFile(
  request: Request,
  table: "images" | "inputs",
  id: string,
): Promise<Response> {
  const user = await getEveryAppUser(request, env);
  if (!user) return new Response("Unauthorized", { status: 401 });
  const file = await findFile(user.id, table, id);
  const object = file ? await env.images.get(file.key) : null;
  if (!file || !object) return new Response("Not found", { status: 404 });
  const headers = new Headers({
    "content-type": file.contentType,
    "cache-control": "private, max-age=86400",
    "x-content-type-options": "nosniff",
  });
  if (new URL(request.url).searchParams.get("download") === "1") {
    const extension = EXTENSIONS[file.contentType] ?? "img";
    headers.set(
      "content-disposition",
      `attachment; filename="image-${id.slice(0, 8)}.${extension}"`,
    );
  }
  return new Response(object.body, { headers });
}
