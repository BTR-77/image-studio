import { describe, expect, it } from "vitest";
import { dimensionsOf, outputSizeFor, sniffType } from "./imageInfo";
import { fileProblem, utcDay } from "@/shared/options";

function pngHeader(width: number, height: number) {
  const bytes = new Uint8Array(24);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const view = new DataView(bytes.buffer);
  view.setUint32(16, width);
  view.setUint32(20, height);
  return bytes;
}

describe("image files", () => {
  it("are recognised by their bytes, not their names", () => {
    expect(sniffType(pngHeader(10, 10))).toBe("image/png");
    expect(sniffType(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe(
      "image/jpeg",
    );
    expect(sniffType(new TextEncoder().encode("RIFF\0\0\0\0WEBPVP8 "))).toBe(
      "image/webp",
    );
    expect(sniffType(new TextEncoder().encode("GIF89a"))).toBeNull();
  });

  it("give their size, and edits keep their shape", () => {
    expect(dimensionsOf(pngHeader(640, 480))).toEqual({
      width: 640,
      height: 480,
    });
    expect(outputSizeFor({ width: 640, height: 480 })).toEqual({
      width: 1024,
      height: 768,
    });
    expect(outputSizeFor(null)).toEqual({ width: 1024, height: 1024 });
  });

  it("are refused when not JPG, PNG or WebP, or over 10 MB", () => {
    expect(fileProblem({ name: "a.gif", type: "image/gif", size: 10 })).toMatch(
      /isn't a JPG/,
    );
    expect(
      fileProblem({
        name: "a.png",
        type: "image/png",
        size: 10 * 1024 * 1024 + 1,
      }),
    ).toMatch(/larger than 10 MB/);
    expect(
      fileProblem({ name: "a.webp", type: "image/webp", size: 1000 }),
    ).toBeNull();
  });

  it("count against the UTC day", () => {
    expect(utcDay(new Date("2026-11-19T23:59:59-05:00"))).toBe("2026-11-20");
  });
});
