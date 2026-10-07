import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import sharp from "sharp";

const WIDTH = Number(process.env.OUTPUT_WIDTH || 1280);
const HEIGHT = Number(process.env.OUTPUT_HEIGHT || 640);

export async function makePoster(inputPath, logoBuffer) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "jado-"));
  const outputPath = path.join(dir, "poster.jpg");

  const base = sharp(inputPath)
    .resize(WIDTH, HEIGHT, { fit: "cover", position: "centre" })
    .jpeg({ quality: 92, mozjpeg: true });

  if (!logoBuffer) {
    await base.toFile(outputPath);
    return outputPath;
  }

  const logo = sharp(logoBuffer)
    .resize({ width: Math.round(WIDTH * 0.09), height: Math.round(HEIGHT * 0.09), fit: "inside" })
    .png();

  const logoPng = await logo.toBuffer();
  const meta = await sharp(logoPng).metadata();
  const margin = Math.round(WIDTH * 0.025);

  await base.composite([{
    input: logoPng,
    left: margin,
    top: HEIGHT - (meta.height || 50) - margin
  }]).toFile(outputPath);

  return outputPath;
}

export async function cleanupDir(filePath) {
  if (!filePath) return;
  try {
    await fs.rm(path.dirname(filePath), { recursive: true, force: true });
  } catch {}
}
