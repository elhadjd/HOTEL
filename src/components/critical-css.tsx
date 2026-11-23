import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

/**
 * Inlines the compiled Tailwind bundle into HTML.
 * Production at hotel.sisgesc.net returns HTTP 400 for `/_next/static/css/*`,
 * so a <link> to that path never applies styles. Reading the post-build
 * `public/hotelaria-app.css` and embedding it avoids that broken asset route.
 */
export function CriticalCss() {
  const candidates = [
    join(process.cwd(), "public", "hotelaria-app.css"),
    // Standalone / alternate cwd layouts
    join(process.cwd(), "hotelaria-app.css"),
  ];

  let css = "";
  for (const file of candidates) {
    if (!existsSync(file)) continue;
    try {
      css = readFileSync(file, "utf8");
      break;
    } catch {
      // try next candidate
    }
  }

  if (!css) return null;

  return (
    <style id="hotelaria-critical-css" dangerouslySetInnerHTML={{ __html: css }} />
  );
}
