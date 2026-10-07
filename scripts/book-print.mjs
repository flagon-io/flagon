#!/usr/bin/env node
/**
 * Build a book's print-on-demand interior for Amazon KDP: a black-and-white
 * PDF at the book's trim size, with the front matter numbered in roman, the
 * body from page 1, every part and chapter opening on a right-hand page,
 * running heads, and real page numbers in the contents and cross-references.
 *
 *   npm run book:print -- eight-kilobytes              against a site on :3000
 *   npm run book:print -- eight-kilobytes --serve      start the built site itself
 *   npm run book:print -- eight-kilobytes --trim=8x10
 *
 * Output: .book-print/out/<book>-<trim>-interior.pdf (gitignored), plus the
 * page count and spine width the cover needs.
 *
 * Chrome lays each page out but can't insert blank pages to land a chapter on
 * the right, restart page numbers, or print page numbers it hasn't reached yet.
 * So this prints in passes, reading where everything landed from the PDF's own
 * bookmarks (Chrome builds them from the headings), and feeding that back:
 *
 *   1. body, no blanks          where does each opener land?
 *   2. body, blanks + pages     land every opener on an odd page, print page refs
 *   ...                         repeat until nothing moves
 *   3. front, with the pages    contents with real page numbers, roman folios
 *   4. merge                    front (padded to even) then body
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import matter from "gray-matter";
import { PDFArray, PDFDict, PDFDocument, PDFName, rgb } from "pdf-lib";
import { ghostscript, launchBrowser, startServer, stampMetadata } from "./lib/book-browser.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const hit = args.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};
const book = args.find((a) => !a.startsWith("--")) ?? "eight-kilobytes";
const serve = args.includes("--serve");
const trim = flag("trim", "7x10");
const port = Number(process.env.BOOK_PDF_PORT ?? 3918);
const stateDir = path.join(root, ".book-print");
const outDir = path.join(stateDir, "out");

/**
 * KDP paperback interior margins (no bleed). The inside margin (gutter) grows
 * with page count so text doesn't disappear into the binding. Source: KDP's
 * "Set trim size, bleed, and margins" help page; checked against
 * scratchpad research/print.md. Outside/top/bottom are KDP's minimum 0.25 in
 * raised for comfortable reading and room for folios and running heads.
 */
const KDP_GUTTER = [
  { max: 150, inside: 0.375 },
  { max: 300, inside: 0.5 },
  { max: 500, inside: 0.625 },
  { max: 700, inside: 0.75 },
  { max: 828, inside: 0.875 },
];
const KDP_MAX_PAGES = 828;
/** Spine thickness per page, white paper, black ink (KDP cover help page). */
const KDP_SPINE_PER_PAGE = 0.002252;

function geometryFor(pages) {
  const [w, h] = trim.split("x").map(Number);
  if (!w || !h) throw new Error(`bad --trim ${trim}; use WIDTHxHEIGHT in inches, e.g. 7x10`);
  const row = KDP_GUTTER.find((r) => pages <= r.max) ?? KDP_GUTTER.at(-1);
  // A little more than the minimum inside the binding reads better.
  return { width: w, height: h, top: 0.75, bottom: 0.75, inside: row.inside + 0.125, outside: 0.6 };
}

/**
 * Check the finished interior against KDP's interior rules: every page the
 * trim size, no transparency, no annotations or bookmarks, fonts embedded,
 * under the page maximum, and no run of more than four blank pages.
 */
async function preflight(file, g, pageCount) {
  const problems = [];
  const doc = await PDFDocument.load(fs.readFileSync(file), { updateMetadata: false });
  const want = [g.width * 72, g.height * 72];
  doc.getPages().forEach((p, i) => {
    const { width, height } = p.getSize();
    if (Math.abs(width - want[0]) > 0.5 || Math.abs(height - want[1]) > 0.5) {
      problems.push(`page ${i + 1} is ${(width / 72).toFixed(3)} x ${(height / 72).toFixed(3)} in, not the trim size`);
    }
    if (p.node.get(PDFName.of("Annots"))) problems.push(`page ${i + 1} has annotations`);
  });
  if (doc.catalog.get(PDFName.of("Outlines"))) problems.push("the PDF still has bookmarks");
  // Walk every object once for transparency, color, and unembedded fonts.
  for (const [, obj] of doc.context.enumerateIndirectObjects()) {
    if (!(obj instanceof PDFDict) && !(obj?.dict instanceof PDFDict)) continue;
    const dict = obj instanceof PDFDict ? obj : obj.dict;
    const type = dict.get(PDFName.of("Type"))?.toString();
    if (type === "/ExtGState") {
      for (const key of ["CA", "ca"]) {
        const v = dict.get(PDFName.of(key));
        if (v && Number(v.toString()) < 1) problems.push(`transparency: an ExtGState sets ${key} ${v}`);
      }
      const smask = dict.get(PDFName.of("SMask"))?.toString();
      if (smask && smask !== "/None") problems.push("transparency: a soft mask (SMask) is in use");
    }
    const group = dict.get(PDFName.of("Group"));
    if (group instanceof PDFDict && group.get(PDFName.of("S"))?.toString() === "/Transparency") {
      problems.push("transparency: a transparency group is in use");
    }
    if (type === "/FontDescriptor") {
      const embedded = ["FontFile", "FontFile2", "FontFile3"].some((k) => dict.get(PDFName.of(k)));
      if (!embedded) problems.push(`font not embedded: ${dict.get(PDFName.of("FontName"))}`);
    }
    const cs = dict.get(PDFName.of("ColorSpace"))?.toString();
    if (cs && /DeviceRGB|DeviceCMYK|ICCBased/.test(cs)) problems.push(`color content: ${cs}`);
  }
  if (pageCount > KDP_MAX_PAGES) problems.push(`${pageCount} pages is over KDP's ${KDP_MAX_PAGES}-page paperback maximum`);
  return [...new Set(problems)].slice(0, 25);
}

function writeState(name, state) {
  fs.mkdirSync(stateDir, { recursive: true });
  fs.writeFileSync(path.join(stateDir, `${name}.json`), JSON.stringify(state));
}

/**
 * Print one half and return the PDF plus where every heading landed: heading
 * ids in document order, zipped with the bookmarks in the same order.
 */
async function renderPass(browser, base, name, state) {
  writeState(name, state);
  const page = await browser.newPage();
  const res = await page.goto(`${base}/books/${book}/print/book?state=${name}`, {
    waitUntil: "networkidle0",
    timeout: 300_000,
  });
  if (!res?.ok()) throw new Error(`couldn't load the ${state.section} pass (${res?.status()})`);
  await page.evaluate(() => document.fonts.ready);
  const ids = await page.$$eval("main h1, main h2, main h3, main h4, main h5, main h6", (els) =>
    els.map((e) => e.id || e.closest("[id]")?.id || ""),
  );
  const bytes = Buffer.from(
    await page.pdf({ preferCSSPageSize: true, printBackground: true, outline: true, tagged: true, timeout: 600_000 }),
  );
  await page.close();

  const doc = await PDFDocument.load(bytes, { updateMetadata: false });
  const landed = outlinePages(doc);
  if (landed.length !== ids.length) {
    throw new Error(`${state.section}: ${ids.length} headings but ${landed.length} bookmarks; can't map pages`);
  }
  const pages = {};
  ids.forEach((id, i) => {
    if (id && !(id in pages)) pages[id] = landed[i];
  });
  return { bytes, doc, pages, count: doc.getPageCount() };
}

/** 1-based page of every bookmark, depth first (document order). */
function outlinePages(doc) {
  const index = new Map(doc.getPages().map((p, i) => [p.ref.toString(), i + 1]));
  const out = [];
  const outlines = doc.catalog.lookup(PDFName.of("Outlines"), PDFDict);
  const walk = (ref) => {
    let item = ref;
    while (item) {
      const dict = doc.context.lookup(item, PDFDict);
      const dest = dict.lookup(PDFName.of("Dest"));
      if (dest instanceof PDFArray) {
        out.push(index.get(dest.get(0).toString()) ?? 0);
      } else {
        out.push(0);
      }
      const first = dict.get(PDFName.of("First"));
      if (first) walk(first);
      item = dict.get(PDFName.of("Next"));
    }
  };
  if (outlines) walk(outlines.get(PDFName.of("First")));
  return out;
}

const isOpener = (id) => /^(part|ch)-/.test(id);

/** Openers that need a blank page before them so they land on odd pages. */
function blanksFor(pages, blanks) {
  const openers = Object.entries(pages)
    .filter(([id]) => isOpener(id))
    .sort((a, b) => a[1] - b[1]);
  // Undo the blanks this layout already has, then place them again in order.
  const next = new Set();
  let removed = 0;
  let added = 0;
  for (const [id, page] of openers) {
    if (blanks.has(id)) removed++;
    const natural = page - removed;
    if ((natural + added) % 2 === 0) {
      next.add(id);
      added++;
    }
  }
  return next;
}

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

async function main() {
  const meta = matter(fs.readFileSync(path.join(root, "content", "books", book, "index.mdx"), "utf8")).data;

  let server = null;
  let base = (process.env.BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");
  if (serve) {
    server = await startServer(root, port);
    base = server.base;
  }
  const browser = await launchBrowser();
  try {
    // Body: iterate until every opener is on an odd page and no page moves.
    let geometry = geometryFor(600);
    let blanks = new Set();
    let pages = {};
    let body;
    for (let pass = 1; pass <= 8; pass++) {
      body = await renderPass(browser, base, `${book}-body`, {
        section: "body",
        geometry,
        blanks: [...blanks],
        pages,
      });
      const nextGeometry = geometryFor(body.count + 40);
      const nextBlanks = blanksFor(body.pages, blanks);
      const settled =
        same(body.pages, pages) && same([...nextBlanks].sort(), [...blanks].sort()) && same(nextGeometry, geometry);
      console.log(`body pass ${pass}: ${body.count} pages, ${nextBlanks.size} blank openers${settled ? ", settled" : ""}`);
      if (settled) break;
      geometry = nextGeometry;
      blanks = nextBlanks;
      pages = body.pages;
      if (pass === 8) throw new Error("page numbers never settled after 8 passes");
    }
    const odd = Object.entries(body.pages).filter(([id, p]) => isOpener(id) && p % 2 === 0);
    if (odd.length) throw new Error(`openers on left-hand pages: ${odd.map(([id]) => id).join(", ")}`);

    // Front: contents gets the body's page numbers; the preface its roman one.
    let frontPages = {};
    let front;
    for (let pass = 1; pass <= 3; pass++) {
      front = await renderPass(browser, base, `${book}-front`, {
        section: "front",
        geometry,
        blanks: [],
        pages: { ...body.pages, ...frontPages },
      });
      const prefaceish = Object.fromEntries(Object.entries(front.pages).filter(([id]) => isOpener(id)));
      if (same(prefaceish, frontPages)) break;
      frontPages = prefaceish;
    }

    // Merge: front (padded to an even count, so page 1 is a right-hand page),
    // then body. Chapter openers lose their running head.
    const doc = await PDFDocument.create();
    const frontPagesCopied = await doc.copyPages(front.doc, front.doc.getPageIndices());
    frontPagesCopied.forEach((p) => doc.addPage(p));
    const pt = (inches) => inches * 72;
    if (front.count % 2 === 1) doc.addPage([pt(geometry.width), pt(geometry.height)]);
    const frontCount = doc.getPageCount();
    const bodyPages = await doc.copyPages(body.doc, body.doc.getPageIndices());
    bodyPages.forEach((p) => doc.addPage(p));
    for (const [id, page] of Object.entries(body.pages)) {
      if (!id.startsWith("ch-")) continue;
      const p = doc.getPage(frontCount + page - 1);
      // Cover the running head band on the opener with paper white.
      p.drawRectangle({
        x: 0,
        y: pt(geometry.height - geometry.top),
        width: pt(geometry.width),
        height: pt(geometry.top),
        color: rgb(1, 1, 1),
      });
    }

    const total = doc.getPageCount();
    // KDP wants no links, annotations, or bookmarks in a print interior; the
    // passes needed them only to find page numbers.
    for (const p of doc.getPages()) p.node.delete(PDFName.of("Annots"));
    doc.catalog.delete(PDFName.of("Outlines"));
    await stampMetadata(doc, meta, "print edition");
    fs.mkdirSync(outDir, { recursive: true });
    const raw = path.join(outDir, `${book}-${trim}-interior.raw.pdf`);
    const out = path.join(outDir, `${book}-${trim}-interior.pdf`);
    fs.writeFileSync(raw, await doc.save());
    await ghostscript(raw, out, "gray");
    fs.rmSync(raw);
    const problems = await preflight(out, geometry, total);
    const spine = (total * KDP_SPINE_PER_PAGE).toFixed(3);
    console.log(`\n${path.relative(root, out)}`);
    console.log(`${total} pages (${frontCount} front + ${body.count} body), trim ${trim} in, gutter ${geometry.inside} in`);
    console.log(`spine for the cover: ${spine} in (white paper, black ink)`);
    if (problems.length) {
      throw new Error(`KDP preflight failed:\n  - ${problems.join("\n  - ")}`);
    }
    console.log("KDP preflight: passed");
  } finally {
    await browser.close().catch(() => {});
    server?.child.kill();
  }
}

main().catch((e) => {
  console.error(`book-print: ${e instanceof Error ? e.message : e}`);
  process.exit(1);
});
