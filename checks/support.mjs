// Shared by the suites: a local stand-in for the account's Workers AI (the
// one third-party service the app calls), fixtures, and form helpers.
import { deflateSync } from "node:zlib";
import {
  startRuntime,
  expect,
} from "/home/user/oss-new/control/runtime/index.mjs";

export { expect };

// The image model answers with a small painted landscape whose colours come
// from the prompt; a prompt containing "#fail" makes it refuse, as the real
// model does for a flagged prompt. Each call is recorded in KV for the suites.
const FAKE_AI = String.raw`
import { WorkerEntrypoint } from "cloudflare:workers";

const CRC = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(bytes) {
  let c = 0xffffffff;
  for (const b of bytes) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const out = new Uint8Array(12 + data.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, data.length);
  out.set(new TextEncoder().encode(type), 4);
  out.set(data, 8);
  view.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
  return out;
}
async function png(width, height, pixel) {
  const raw = new Uint8Array((width * 3 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 3 + 1)] = 0;
    for (let x = 0; x < width; x++) raw.set(pixel(x, y), y * (width * 3 + 1) + 1 + x * 3);
  }
  const zipped = new Uint8Array(await new Response(new Blob([raw]).stream().pipeThrough(new CompressionStream("deflate"))).arrayBuffer());
  const header = new Uint8Array(13);
  const view = new DataView(header.buffer);
  view.setUint32(0, width); view.setUint32(4, height);
  header.set([8, 2, 0, 0, 0], 8);
  const parts = [new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", header), chunk("IDAT", zipped), chunk("IEND", new Uint8Array())];
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) { out.set(p, at); at += p.length; }
  return out;
}
function hue(h, s, l) {
  const k = (n) => (n + h / 30) % 12, a = s * Math.min(l, 1 - l);
  const f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [f(0) * 255, f(8) * 255, f(4) * 255].map(Math.round);
}
function seedOf(text) { let h = 7; for (const c of text) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h; }
function landscape(prompt, width, height, variant) {
  const seed = seedOf(prompt) + variant * 97 + Math.floor(Math.random() * 1000);
  const base = seed % 360, sunX = 0.25 + ((seed >> 8) % 50) / 100;
  return (x, y) => {
    const u = x / width, v = y / height;
    const ridge1 = 0.55 + 0.08 * Math.sin(u * 7 + seed) + 0.04 * Math.sin(u * 19 + variant);
    const ridge2 = 0.7 + 0.06 * Math.sin(u * 5 + seed / 3) + 0.03 * Math.sin(u * 23);
    if (v > 0.82) return hue(base + 180, 0.35, 0.3 + 0.15 * Math.sin(u * 40 + v * 30) * 0.2 + (1 - v) * 0.6);
    if (v > ridge2) return hue(base + 140, 0.35, 0.22);
    if (v > ridge1) return hue(base + 200, 0.25, 0.38);
    const d = Math.hypot(u - sunX, (v - 0.32) * height / width);
    if (d < 0.07) return hue(base + 40, 0.9, 0.82);
    return hue(base + 20 * v, 0.6, 0.78 - 0.35 * (1 - v));
  };
}
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export default class extends WorkerEntrypoint {
  async run(model, inputs) {
    if (model.includes("llama")) {
      const idea = inputs.messages.at(-1).content;
      await this.env.CALLS.put("text", JSON.stringify({ model, idea }));
      return { response: idea + ", seen at first light with mist drifting low over still water, tall pines framing the shore, soft golden glow on distant peaks, quiet and painterly" };
    }
    const form = await new Response(inputs.multipart.body, { headers: { "content-type": inputs.multipart.contentType } }).formData();
    const prompt = form.get("prompt");
    const width = Number(form.get("width")), height = Number(form.get("height"));
    const images = [...form.keys()].filter((key) => key.startsWith("input_image_"));
    const calls = Number((await this.env.CALLS.get("count")) ?? "0") + 1;
    await this.env.CALLS.put("count", String(calls));
    await this.env.CALLS.put("image", JSON.stringify({ model, prompt, width, height, inputs: images.length }));
    await sleep(1200);
    if (prompt.includes("#fail")) throw new Error("3030: The prompt was flagged by the safety filter");
    return { image: btoa(String.fromCharCode(...await png(Math.round(width / 4), Math.round(height / 4), landscape(prompt, width / 4, height / 4, calls)))) };
  }
}
`;

export async function startStudio() {
  return startRuntime({
    workers: [
      {
        config: {
          name: "fake-workers-ai",
          compatibilityDate: "2026-06-01",
          manifest: {
            mainModule: "ai.mjs",
            modules: { "ai.mjs": { type: "esm", contents: FAKE_AI } },
          },
          env: { CALLS: { type: "kv", id: "fake-ai-calls" } },
        },
      },
    ],
    bindings: { AI: { type: "worker", worker: "fake-workers-ai" } },
  });
}

/** The last image-model call the app made: its prompt, size and number of input images. */
export async function lastImageCall(runtime) {
  const kv = await runtime.mf.getKVNamespace("CALLS", "fake-workers-ai");
  return JSON.parse(await kv.get("image"));
}

/** A real PNG of the given size, for upload fixtures. */
export function pngFile(name, width = 64, height = 48, rgb = [90, 140, 200]) {
  const row = Buffer.alloc(width * 3 + 1);
  for (let x = 0; x < width; x++)
    row.set([rgb[0], (rgb[1] + x * 2) % 256, rgb[2]], 1 + x * 3);
  const raw = Buffer.concat(Array.from({ length: height }, () => row));
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (buf) => {
    let c = 0xffffffff;
    for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type), data]);
    const sum = Buffer.alloc(4);
    sum.writeUInt32BE(crc(body));
    return Buffer.concat([len, body, sum]);
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header.set([8, 2, 0, 0, 0], 8);
  const buffer = Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
  return { name, mimeType: "image/png", buffer };
}

/** Opens a page and waits until it responds to input. */
export async function open(page, path) {
  const response = await page.goto(path);
  await page.locator('html[data-ready="true"]').waitFor();
  return response;
}

/** Picks one option of a labelled toggle group. */
export async function choose(page, group, label) {
  const option = page
    .getByTestId(group)
    .getByRole("button", { name: label, exact: true });
  await option.click();
  await expect(option).toHaveAttribute("aria-pressed", "true");
}

/** Fills the create form and generates, waiting for the pictures. */
export async function generate(page, { prompt, count = "1", aspect, style }) {
  await open(page, "/");
  await page.getByTestId("prompt").fill(prompt);
  if (aspect) await choose(page, "aspect", aspect);
  if (style) {
    await page.getByTestId("style").click();
    await page.getByRole("option", { name: style }).click();
    await expect(page.getByTestId("style")).toContainText(style);
  }
  await choose(page, "count", count);
  await page.getByTestId("generate").click();
  await expect(page.getByTestId("result-image")).toHaveCount(Number(count), {
    timeout: 20000,
  });
}

/** The ids behind the result pictures on screen. */
export async function shownImageIds(page, testId = "result-image") {
  const sources = await page
    .getByTestId(testId)
    .evaluateAll((images) => images.map((image) => image.getAttribute("src")));
  return sources.map((src) => src.match(/\/api\/images\/([0-9a-f-]{36})/)[1]);
}
