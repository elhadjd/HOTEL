#!/usr/bin/env node
/**
 * Copies the compiled Next.css bundle to public/hotelaria-app.css so production
 * can load styles from a stable URL even when `/_next/static/css/*` is broken
 * by a reverse-proxy / extension location (observed 400 on hotel.sisgesc.net).
 */
import fs from "node:fs";
import path from "node:path";

const cssDir = path.join(process.cwd(), ".next", "static", "css");
const outFile = path.join(process.cwd(), "public", "hotelaria-app.css");

if (!fs.existsSync(cssDir)) {
  console.warn("[copy-css-fallback] no .next/static/css — skip");
  process.exit(0);
}

const files = fs
  .readdirSync(cssDir)
  .filter((f) => f.endsWith(".css"))
  .sort();

if (!files.length) {
  console.warn("[copy-css-fallback] no css files — skip");
  process.exit(0);
}

const source = path.join(cssDir, files[0]);
fs.mkdirSync(path.dirname(outFile), { recursive: true });
fs.copyFileSync(source, outFile);
console.log(`[copy-css-fallback] ${files[0]} → public/hotelaria-app.css`);
