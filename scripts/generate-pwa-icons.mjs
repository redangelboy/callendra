/**
 * One-time / dev: generates PWA icons from the project root logo.
 * Run: npm run generate:pwa-icons
 */
import sharp from "sharp";
import { mkdir } from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { existsSync } from "fs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const candidates = [
  path.join(root, "Callendra-Logo_-_Editado.png"),
  path.join(root, "Callendra-Logo - Editado.png"),
];
const src = candidates.find((p) => existsSync(p));
if (!src) {
  console.error("Logo not found. Expected one of:", candidates.join(", "));
  process.exit(1);
}

const outDir = path.join(root, "public", "icons");
await mkdir(outDir, { recursive: true });

const base = sharp(src).ensureAlpha();

await base.clone().resize(192, 192, { fit: "cover" }).png().toFile(path.join(outDir, "icon-192.png"));
await base.clone().resize(512, 512, { fit: "cover" }).png().toFile(path.join(outDir, "icon-512.png"));
await base.clone().resize(180, 180, { fit: "cover" }).png().toFile(path.join(outDir, "apple-touch-icon.png"));

console.log("Wrote public/icons/icon-192.png, icon-512.png, apple-touch-icon.png from", path.basename(src));
