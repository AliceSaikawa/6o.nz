#!/usr/bin/env node
/**
 * Verifies SUCCESS.md criteria against the local static site.
 * Usage: node scripts/verify.mjs [baseUrl]
 * Default baseUrl: http://127.0.0.1:4173
 */
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const root = join(__dirname, "..", "site");
const PORT = Number(process.env.VERIFY_PORT || 4173);
const baseUrl = process.argv[2] || `http://127.0.0.1:${PORT}`;

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
};

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function startStaticServer() {
  const server = createServer(async (req, res) => {
    try {
      const urlPath = decodeURIComponent((req.url || "/").split("?")[0]);
      const safe = normalize(urlPath).replace(/^(\.\.[/\\])+/, "");
      let filePath = join(root, safe === "/" ? "index.html" : safe.slice(1));
      if (!filePath.startsWith(root)) {
        res.writeHead(403).end("Forbidden");
        return;
      }
      const data = await readFile(filePath);
      res.writeHead(200, { "Content-Type": MIME[extname(filePath)] || "application/octet-stream" });
      res.end(data);
    } catch {
      res.writeHead(404).end("Not found");
    }
  });

  await new Promise((resolve, reject) => {
    server.listen(PORT, "127.0.0.1", resolve);
    server.on("error", reject);
  });
  return server;
}

async function runChecks(page) {
  const results = [];

  const brandJa = page.getByText("斎川有栖", { exact: false });
  const brandEn = page.getByText("Alice Saikawa", { exact: false });
  await brandJa.first().waitFor({ state: "visible", timeout: 5000 });
  await brandEn.first().waitFor({ state: "visible", timeout: 5000 });

  const inViewport = await page.evaluate(() => {
    const visible = (text) => {
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      const hits = [];
      while (walker.nextNode()) {
        if (walker.currentNode.textContent.includes(text)) {
          const el = walker.currentNode.parentElement;
          if (!el) continue;
          const r = el.getBoundingClientRect();
          if (r.bottom > 0 && r.top < window.innerHeight && r.width > 0 && r.height > 0) {
            hits.push(true);
          }
        }
      }
      return hits.length > 0;
    };
    return {
      ja: visible("斎川有栖"),
      en: visible("Alice Saikawa"),
    };
  });
  assert(inViewport.ja && inViewport.en, "Criterion 1: both names must be in the first mobile viewport");
  results.push("✓ 1 identity in first viewport");

  const bodyText = await page.locator("body").innerText();
  assert(/ジュニア/.test(bodyText), "Criterion 2: Japanese junior role missing");
  assert(/Junior/i.test(bodyText), "Criterion 2: English junior role missing");
  assert(/Java/i.test(bodyText), "Criterion 2: Java missing");
  assert(/TypeScript/i.test(bodyText), "Criterion 2: TypeScript missing");
  results.push("✓ 2 bilingual junior Java/TypeScript role");

  const github = page.locator('a[href*="github.com/AliceSaikawa" i], a[href*="github.com/alicesaikawa" i]');
  const x = page.locator('a[href*="x.com/realme_ramirisu" i], a[href*="twitter.com/realme_ramirisu" i]');
  assert((await github.count()) >= 1, "Criterion 3: GitHub link missing");
  assert((await x.count()) >= 1, "Criterion 3: X link missing");
  const githubHref = await github.first().getAttribute("href");
  const xHref = await x.first().getAttribute("href");
  assert(
    /^https:\/\/github\.com\/AliceSaikawa\/?$/i.test(githubHref || ""),
    `Criterion 3: GitHub href unexpected: ${githubHref}`,
  );
  assert(
    /^https:\/\/(x|twitter)\.com\/realme_ramirisu\/?$/i.test(xHref || ""),
    `Criterion 3: X href unexpected: ${xHref}`,
  );
  results.push("✓ 3 GitHub and X links");

  const overflow = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  assert(
    overflow.scrollWidth <= overflow.clientWidth + 1,
    `Criterion 4: horizontal overflow ${overflow.scrollWidth} > ${overflow.clientWidth}`,
  );
  results.push("✓ 4 no horizontal overflow at 390px");

  for (const [label, locator] of [
    ["GitHub", github.first()],
    ["X", x.first()],
  ]) {
    const box = await locator.boundingBox();
    assert(box, `Criterion 5: ${label} not visible`);
    assert(
      box.width >= 44 && box.height >= 44,
      `Criterion 5: ${label} tap target ${box.width}×${box.height} < 44×44`,
    );
  }
  results.push("✓ 5 tap targets ≥ 44×44");

  return results;
}

async function main() {
  let server;
  const managed = !process.argv[2];
  if (managed) {
    server = await startStaticServer();
  }

  const browser = await chromium.launch({
    executablePath: process.env.CHROME_PATH || "/usr/bin/google-chrome-stable",
    headless: true,
  });

  try {
    const page = await browser.newPage({
      viewport: { width: 390, height: 844 },
      deviceScaleFactor: 2,
      isMobile: true,
      hasTouch: true,
    });
    await page.goto(baseUrl, { waitUntil: "networkidle" });
    const results = await runChecks(page);
    await page.screenshot({
      path: "/opt/cursor/artifacts/verify-mobile.png",
      fullPage: true,
    });
    console.log(results.join("\n"));
    console.log("\nAll success criteria passed.");
    console.log("Screenshot: /opt/cursor/artifacts/verify-mobile.png");
  } finally {
    await browser.close();
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
  }
}

main().catch((err) => {
  console.error("VERIFY FAILED:", err.message);
  process.exit(1);
});
