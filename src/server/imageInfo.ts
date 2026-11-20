// Reads an image's type and size from its first bytes, so the server never
// trusts what a browser says a file is.

export type ImageType = "image/png" | "image/jpeg" | "image/webp";

export function sniffType(bytes: Uint8Array): ImageType | null {
  if (
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  )
    return "image/png";
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff)
    return "image/jpeg";
  if (ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 4) === "WEBP")
    return "image/webp";
  return null;
}

export function dimensionsOf(
  bytes: Uint8Array,
): { width: number; height: number } | null {
  const type = sniffType(bytes);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  try {
    if (type === "image/png") {
      return { width: view.getUint32(16), height: view.getUint32(20) };
    }
    if (type === "image/webp") {
      const chunk = ascii(bytes, 12, 4);
      if (chunk === "VP8 ")
        return {
          width: view.getUint16(26, true) & 0x3fff,
          height: view.getUint16(28, true) & 0x3fff,
        };
      if (chunk === "VP8L") {
        const bits = view.getUint32(21, true);
        return {
          width: (bits & 0x3fff) + 1,
          height: ((bits >> 14) & 0x3fff) + 1,
        };
      }
      if (chunk === "VP8X")
        return {
          width: 1 + (bytes[24]! | (bytes[25]! << 8) | (bytes[26]! << 16)),
          height: 1 + (bytes[27]! | (bytes[28]! << 8) | (bytes[29]! << 16)),
        };
      return null;
    }
    if (type === "image/jpeg") {
      let offset = 2;
      while (offset + 9 < bytes.length) {
        if (bytes[offset] !== 0xff) return null;
        const marker = bytes[offset + 1]!;
        const length = view.getUint16(offset + 2);
        const isFrame =
          marker >= 0xc0 &&
          marker <= 0xcf &&
          ![0xc4, 0xc8, 0xcc].includes(marker);
        if (isFrame)
          return {
            height: view.getUint16(offset + 5),
            width: view.getUint16(offset + 7),
          };
        offset += 2 + length;
      }
    }
  } catch {
    return null;
  }
  return null;
}

/** An output size with the input's shape: at most 1024 on the long side, in steps of 16. */
export function outputSizeFor(
  source: { width: number; height: number } | null,
) {
  if (!source || source.width <= 0 || source.height <= 0)
    return { width: 1024, height: 1024 };
  const scale = 1024 / Math.max(source.width, source.height);
  const round = (value: number) =>
    Math.max(256, Math.round((value * scale) / 16) * 16);
  return { width: round(source.width), height: round(source.height) };
}

function ascii(bytes: Uint8Array, start: number, length: number) {
  return String.fromCharCode(...bytes.subarray(start, start + length));
}
