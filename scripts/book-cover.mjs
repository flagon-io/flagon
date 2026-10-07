#!/usr/bin/env node
/**
 * Build the printed book's full-wrap cover for Amazon KDP: back, spine and
 * front on one PDF, sized from the interior's real page count, in CMYK.
 *
 *   npm run book:cover -- eight-kilobytes                    paperback, from the interior PDF
 *   npm run book:cover -- eight-kilobytes --serve            start the built site itself
 *   npm run book:cover -- eight-kilobytes --hardcover --spine=1.42 --wrap=0.51 --hinge=0.4
 *
 * Paperback: spine = pages x 0.002252 in (white paper, black ink), bleed
 * 0.125 in on every side (KDP's cover help page). Hardcover: KDP publishes no
 * formula, so take spine, wrap and hinge from KDP's cover calculator
 * (kdp.amazon.com/cover-calculator) and pass them in.
 *
 * Run `npm run book:print` first: the page count comes from its interior PDF.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import matter from "gray-matter";
import { PDFDocument } from "pdf-lib";
import { ghostscript, launchBrowser, startServer, stampMetadata } from "./lib/book-browser.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const hit = args.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};
const book = args.find((a) => !a.startsWith("--")) ?? "eight-kilobytes";
const trim = flag("trim", "7x10");
const hardcover = args.includes("--hardcover");
const outDir = path.join(root, ".book-print", "out");
const SPINE_PER_PAGE = 0.002252; // white paper, black ink
const BLEED = 0.125;

async function main() {
  const interior = path.join(outDir, `${book}-${trim}-interior.pdf`);
  if (!fs.existsSync(interior)) throw new Error(`no interior at ${path.relative(root, interior)}; run npm run book:print first`);
  const pages = (await PDFDocument.load(fs.readFileSync(interior), { updateMetadata: false })).getPageCount();
  const [trimW, trimH] = trim.split("x").map(Number);

  const spine = hardcover ? Number(flag("spine", "")) : pages * SPINE_PER_PAGE;
  if (!Number.isFinite(spine) || spine <= 0) throw new Error("hardcover needs --spine from KDP's cover calculator");
  const wrap = Number(flag("wrap", "0.51"));
  const hinge = Number(flag("hinge", "0.4"));
  const edge = hardcover ? wrap : BLEED;
  const width = edge * 2 + trimW * 2 + (hardcover ? hinge * 2 : 0) + spine;
  const height = edge * 2 + trimH;

  const query = new URLSearchParams({ spine: spine.toFixed(4), trim, pages: String(pages) });
  if (hardcover) {
    query.set("wrap", String(wrap));
    query.set("hinge", String(hinge));
  } else {
    query.set("bleed", String(BLEED));
  }

  let server = null;
  let base = (process.env.BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");
  if (args.includes("--serve")) {
    server = await startServer(root, Number(process.env.BOOK_PDF_PORT ?? 3919));
    base = server.base;
  }
  const browser = await launchBrowser();
  try {
    const page = await browser.newPage();
    const res = await page.goto(`${base}/books/${book}/print/cover?${query}`, { waitUntil: "networkidle0", timeout: 120_000 });
    if (!res?.ok()) throw new Error(`couldn't load the cover (${res?.status()})`);
    await page.evaluate(() => document.fonts.ready);
    const bytes = await page.pdf({ width: `${width}in`, height: `${height}in`, printBackground: true, preferCSSPageSize: true });
    await page.close();

    const kind = hardcover ? "hardcover" : "paperback";
    const raw = path.join(outDir, `${book}-${trim}-${kind}-cover.raw.pdf`);
    const out = path.join(outDir, `${book}-${trim}-${kind}-cover.pdf`);
    const meta = matter(fs.readFileSync(path.join(root, "content", "books", book, "index.mdx"), "utf8")).data;
    const doc = await PDFDocument.load(bytes, { updateMetadata: false });
    if (doc.getPageCount() !== 1) throw new Error(`the cover came out as ${doc.getPageCount()} pages, expected 1`);
    await stampMetadata(doc, meta, `${kind} cover`);
    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(raw, await doc.save());
    await ghostscript(raw, out, "cmyk");
    fs.rmSync(raw);

    // The one check that matters most: the sheet is exactly the size KDP expects.
    const done = await PDFDocument.load(fs.readFileSync(out), { updateMetadata: false });
    const { width: w, height: h } = done.getPage(0).getSize();
    const off = Math.max(Math.abs(w / 72 - width), Math.abs(h / 72 - height));
    if (off > 0.01) throw new Error(`cover is ${(w / 72).toFixed(3)} x ${(h / 72).toFixed(3)} in, expected ${width.toFixed(3)} x ${height.toFixed(3)}`);

    console.log(path.relative(root, out));
    console.log(`${kind}: ${width.toFixed(3)} x ${height.toFixed(3)} in, spine ${spine.toFixed(3)} in for ${pages} pages`);
  } finally {
    await browser.close().catch(() => {});
    server?.child.kill();
  }
}

main().catch((e) => {
  console.error(`book-cover: ${e instanceof Error ? e.message : e}`);
  process.exit(1);
});
