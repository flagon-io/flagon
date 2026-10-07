/**
 * Shared by the book PDF scripts: find a browser, start the built site, and
 * stamp PDF metadata. Every failure throws; callers decide what it means.
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

// Box-drawing diagrams need a monospace font that has those glyphs. Desktop
// systems have one; the serverless Chromium has none, so it gets this one.
const DIAGRAM_FONT = "https://cdn.jsdelivr.net/npm/dejavu-fonts-ttf@2.37.3/ttf/DejaVuSansMono.ttf";

/** CHROME_PATH, else a locally installed Chrome or Edge, else null. */
export function localChrome() {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;
  const candidates = {
    win32: [
      "C:/Program Files/Google/Chrome/Application/chrome.exe",
      "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
      "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
    ],
    darwin: [
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
      "/Applications/Chromium.app/Contents/MacOS/Chromium",
    ],
    linux: ["/usr/bin/google-chrome", "/usr/bin/chromium", "/usr/bin/chromium-browser"],
  }[process.platform] ?? [];
  return candidates.find((p) => fs.existsSync(p)) ?? null;
}

/** A local Chrome if there is one, otherwise the serverless Chromium build. */
export async function launchBrowser() {
  const puppeteer = (await import("puppeteer-core")).default;
  const local = localChrome();
  if (local) {
    return puppeteer.launch({ executablePath: local, headless: true, args: ["--no-first-run"] });
  }
  if (process.platform !== "linux") {
    throw new Error("no Chrome found; set CHROME_PATH to a Chrome or Chromium binary");
  }
  const chromium = (await import("@sparticuz/chromium")).default;
  await chromium.font(DIAGRAM_FONT);
  return puppeteer.launch({
    executablePath: await chromium.executablePath(),
    args: chromium.args,
    headless: true,
  });
}

/** Start the built site (next start) on a port and wait until it answers. */
export async function startServer(root, port) {
  const base = `http://127.0.0.1:${port}`;
  const nextBin = path.join(root, "node_modules", "next", "dist", "bin", "next");
  const child = spawn(process.execPath, [nextBin, "start", "-p", String(port), "-H", "127.0.0.1"], {
    cwd: root,
    stdio: ["ignore", "ignore", "inherit"],
    env: { ...process.env, NODE_ENV: "production" },
  });
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`next start exited with code ${child.exitCode}`);
    const ok = await fetch(`${base}/books`).then((r) => r.ok, () => false);
    if (ok) return { child, base };
    await new Promise((r) => setTimeout(r, 500));
  }
  child.kill();
  throw new Error("the built site didn't start within two minutes");
}

/** Title, author, subject and keywords from the book's own frontmatter. */
export async function stampMetadata(doc, meta, edition) {
  const title = meta.subtitle ? `${meta.title}: ${meta.subtitle}` : meta.title;
  doc.setTitle(edition ? `${title} (${edition})` : title, { showInWindowTitleBar: true });
  if (meta.author) doc.setAuthor(meta.author);
  if (meta.description) doc.setSubject(meta.description);
  doc.setKeywords(["PostgreSQL", "Postgres", "database performance", meta.title]);
  if (meta.publisher) doc.setCreator(meta.publisher);
  doc.setProducer("Flagon book pipeline");
  doc.setLanguage("en");
  doc.setModificationDate(new Date());
}

/**
 * Run Ghostscript's pdfwrite on a PDF, in a throwaway Alpine container so
 * nothing needs installing. `color` picks the output color model.
 */
export async function ghostscript(input, output, color) {
  const { spawnSync } = await import("node:child_process");
  const dir = path.dirname(input);
  if (path.dirname(output) !== dir) throw new Error("ghostscript input and output must share a folder");
  const model = color === "gray"
    ? "-sColorConversionStrategy=Gray -dProcessColorModel=/DeviceGray"
    : "-sColorConversionStrategy=CMYK -dProcessColorModel=/DeviceCMYK";
  const gs = [
    "gs -q -dSAFER -dBATCH -dNOPAUSE -sDEVICE=pdfwrite -dCompatibilityLevel=1.4",
    model,
    "-dEmbedAllFonts=true -dSubsetFonts=true -dAutoRotatePages=/None",
    `-sOutputFile=/w/${path.basename(output)} /w/${path.basename(input)}`,
  ].join(" ");
  const run = spawnSync(
    "docker",
    ["run", "--rm", "-v", `${dir}:/w`, "alpine:3.20", "sh", "-c", `apk add --no-cache ghostscript >/dev/null && ${gs}`],
    { stdio: ["ignore", "inherit", "inherit"], env: { ...process.env, MSYS_NO_PATHCONV: "1" } },
  );
  if (run.status !== 0) throw new Error("Ghostscript conversion failed (is Docker running?)");
}
