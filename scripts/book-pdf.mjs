#!/usr/bin/env node
/**
 * Build each book's PDF by printing its print edition (/books/<book>/print)
 * with headless Chromium, into public/books/<book>.pdf, then stamp the PDF's
 * metadata (title, author, subject) from the book's index.mdx. Chromium takes
 * the page size and running page numbers from the @page rules in globals.css,
 * and builds the PDF's bookmarks from the headings.
 *
 *   npm run book:pdf                      against a site already running on :3000
 *   npm run book:pdf -- eight-kilobytes   one book
 *   node scripts/book-pdf.mjs --serve     start the built site itself, print, stop
 *
 * `npm run build` runs the --serve form right after `next build`, so every
 * deploy ships a PDF printed from exactly what it deploys. The PDF is a build
 * artifact and isn't committed.
 *
 * Browser: CHROME_PATH, else a locally installed Chrome or Edge, else the
 * serverless Chromium build from @sparticuz/chromium (what runs on Vercel's
 * build machines, which have no browser of their own).
 *
 * If a PDF can't be built, the script fails, which fails the build: a deploy
 * should never serve a stale book. Set BOOK_PDF_OPTIONAL=1 to downgrade that to
 * a warning when you need a deploy out regardless.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import matter from "gray-matter";
import { launchBrowser, startServer, stampMetadata } from "./lib/book-browser.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const serve = args.includes("--serve");
const requested = args.filter((a) => !a.startsWith("--"));
const optional = process.env.BOOK_PDF_OPTIONAL === "1";
const port = Number(process.env.BOOK_PDF_PORT ?? 3917);
let base = (process.env.BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");
const booksDir = path.join(root, "content", "books");
const outDir = path.join(root, "public", "books");

/** Stop with a message; the handler at the bottom cleans up and decides the exit code. */
class Abort extends Error {}
function fail(message) {
  throw new Abort(message);
}

const server = { child: null };
let browser;
try {
  const books = fs
    .readdirSync(booksDir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && fs.existsSync(path.join(booksDir, d.name, "index.mdx")))
    .map((d) => d.name)
    .filter((b) => requested.length === 0 || requested.includes(b));
  if (books.length === 0) fail(requested.length ? `no such book: ${requested.join(", ")}` : "no books found");
  fs.mkdirSync(outDir, { recursive: true });

  if (serve) {
    const started = await startServer(root, port);
    server.child = started.child;
    base = started.base;
  }
  browser = await launchBrowser();
  for (const book of books) {
    const url = `${base}/books/${book}/print`;
    const started = Date.now();
    const page = await browser.newPage();
    const res = await page.goto(url, { waitUntil: "networkidle0", timeout: 300_000 });
    if (!res?.ok()) fail(`couldn't load ${url} (${res ? res.status() : "no response"})`);
    await page.evaluate(() => document.fonts.ready);
    const out = path.join(outDir, `${book}.pdf`);
    await page.pdf({
      path: out,
      preferCSSPageSize: true,
      printBackground: true,
      outline: true,
      tagged: true,
      timeout: 600_000,
    });
    await page.close();
    const meta = matter(fs.readFileSync(path.join(booksDir, book, "index.mdx"), "utf8")).data;
    const { PDFDocument } = await import("pdf-lib");
    const doc = await PDFDocument.load(fs.readFileSync(out), { updateMetadata: false });
    await stampMetadata(doc, meta);
    fs.writeFileSync(out, await doc.save());
    const mb = (fs.statSync(out).size / 1024 / 1024).toFixed(1);
    console.log(`${book}: ${path.relative(root, out)} (${mb} MB, ${Math.round((Date.now() - started) / 1000)} s)`);
  }
} catch (e) {
  const message = e instanceof Error ? e.message : String(e);
  process.exitCode = optional ? 0 : 1;
  if (optional) console.warn(`book-pdf: ${message} (BOOK_PDF_OPTIONAL=1, continuing without a fresh PDF)`);
  else console.error(`book-pdf: ${message}`);
} finally {
  await browser?.close().catch(() => {});
  server.child?.kill();
}
