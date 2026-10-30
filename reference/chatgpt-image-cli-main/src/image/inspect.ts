import { access, rename, stat } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import type { ImageResult } from "../types.js";

const formatExtensions: Record<string, string> = {
  jpeg: "jpg",
  jpg: "jpg",
  png: "png",
  webp: "webp",
  gif: "gif",
  avif: "avif",
  tiff: "tiff",
};

export async function finalizeDownloadedImage(
  temporaryPath: string,
  outputDir: string,
  taskId: string,
  index: number,
  sourceUrl?: string,
): Promise<ImageResult> {
  const metadata = await sharp(temporaryPath, { animated: true }).metadata();
  if (!metadata.width || !metadata.height || !metadata.format) {
    throw new Error(`Downloaded file is not a decodable image: ${temporaryPath}`);
  }
  const extension = formatExtensions[metadata.format] ?? metadata.format;
  const base = `${taskId}_${String(index).padStart(3, "0")}`;
  let target = path.join(outputDir, `${base}.${extension}`);
  let suffix = 2;
  while (await exists(target)) {
    target = path.join(outputDir, `${base}_${suffix}.${extension}`);
    suffix += 1;
  }
  await rename(temporaryPath, target);
  const fileStat = await stat(target);
  return {
    path: path.resolve(target),
    width: metadata.width,
    height: metadata.height,
    format: metadata.format,
    bytes: fileStat.size,
    source_url: sourceUrl,
  };
}

async function exists(filename: string): Promise<boolean> {
  try {
    await access(filename);
    return true;
  } catch {
    return false;
  }
}
