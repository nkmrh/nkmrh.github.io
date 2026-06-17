#!/usr/bin/env node
/*
 * Renders each work to a static thumbnail PNG in vj/works/thumbs/ using headless
 * Chrome. The Works library shows these instead of live iframes.
 *
 *   node vj/build-thumbs.js         # incremental: only new/changed works
 *   node vj/build-thumbs.js --all   # force-regenerate every thumbnail
 *
 * Runs from the pre-commit hook. It is incremental (so most commits do nothing),
 * removes thumbnails for deleted works, and skips gracefully if Chrome is absent
 * so it never blocks a commit.
 */

const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const worksDir = path.join(__dirname, "works");
const thumbsDir = path.join(worksDir, "thumbs");
const W = 640, H = 360;
const BUDGET = 2600; // ms of (virtual) animation before the screenshot
const force = process.argv.includes("--all");

const works = fs
  .readdirSync(worksDir)
  .filter((name) => name.endsWith(".html") && !name.startsWith("_"))
  .map((name) => name.replace(/\.html$/, ""))
  .sort();
const wanted = new Set(works);

fs.mkdirSync(thumbsDir, { recursive: true });

// Remove thumbnails whose work no longer exists.
let removed = 0;
for (const file of fs.readdirSync(thumbsDir)) {
  if (file.endsWith(".png") && !wanted.has(file.replace(/\.png$/, ""))) {
    fs.unlinkSync(path.join(thumbsDir, file));
    console.log(`  − removed ${file} (work deleted)`);
    removed++;
  }
}

function needsRender(base) {
  if (force) return true;
  const out = path.join(thumbsDir, base + ".png");
  if (!fs.existsSync(out)) return true;
  return fs.statSync(path.join(worksDir, base + ".html")).mtimeMs > fs.statSync(out).mtimeMs;
}

const stale = works.filter(needsRender);
if (!stale.length && !removed) {
  console.log("Thumbnails up to date.");
  process.exit(0);
}

if (stale.length && !fs.existsSync(CHROME)) {
  console.warn(`Chrome not found — skipping ${stale.length} thumbnail(s). Install Chrome and run: node vj/build-thumbs.js --all`);
  process.exit(0);
}

let ok = 0;
for (const base of stale) {
  const out = path.join(thumbsDir, base + ".png");
  const url = "file://" + path.join(worksDir, base + ".html");
  try {
    execFileSync(CHROME, [
      "--headless=new",
      "--hide-scrollbars",
      "--use-gl=angle",
      "--use-angle=swiftshader",
      "--enable-unsafe-swiftshader",
      `--window-size=${W},${H}`,
      `--virtual-time-budget=${BUDGET}`,
      "--screenshot=" + out,
      url
    ], { stdio: "ignore", timeout: 40000 });
    const kb = (fs.statSync(out).size / 1024).toFixed(0);
    console.log(`  ✓ ${base}.png (${kb} KB)`);
    ok++;
  } catch (error) {
    console.warn(`  ✗ ${base}: ${error.message}`);
  }
}
console.log(`Thumbnails: ${ok} rendered, ${removed} removed.`);
