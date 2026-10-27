import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

// A portable artifact for reviewing this browser-local prototype without a server.
// Run after `npm run build`; the normal Vite output remains unchanged.
const dist = resolve("dist");
let html = await readFile(resolve(dist, "index.html"), "utf8");
const script = html.match(/<script[^>]*src="([^"]+)"[^>]*><\/script>/);
const style = html.match(/<link[^>]*href="([^"]+\.css)"[^>]*>/);
if (!script || !style)
  throw new Error("Expected one Vite script and stylesheet");
const asset = (path) => resolve(dist, path.replace(/^\//, ""));
const js = (await readFile(asset(script[1]), "utf8")).replace(
  /<\/script/gi,
  "<\\/script",
);
const css = await readFile(asset(style[1]), "utf8");
html = html.replace(script[0], () => `<script type="module">${js}</script>`);
html = html.replace(style[0], () => `<style>${css}</style>`);
const target = resolve(process.argv[2] || "dist/abyss-lab-preview.html");
await writeFile(target, html);
console.log(`Standalone preview: ${target}`);
