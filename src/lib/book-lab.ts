import "server-only";
import fs from "node:fs";
import path from "node:path";
import { gzipSync } from "node:zlib";

/**
 * A book's lab: the compose file, seed, and one script per chapter that turns
 * the chapter's claims into checks (content/books/<book>/lab). Served file by
 * file at /books/<book>/lab/<path>, and as one download at
 * /books/<book>/lab.tar.gz.
 */

const BOOKS_ROOT = path.join(process.cwd(), "content", "books");

export type LabFile = { path: string; bytes: Buffer; executable: boolean };

/** Every file in a book's lab, with paths relative to the lab folder. */
export function labFiles(book: string): LabFile[] {
  const dir = path.join(BOOKS_ROOT, book, "lab");
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir, { recursive: true, encoding: "utf8" })
    .map((rel) => rel.split(path.sep).join("/"))
    .filter((rel) => fs.statSync(path.join(dir, rel)).isFile())
    .sort()
    .map((rel) => ({
      path: rel,
      bytes: fs.readFileSync(path.join(dir, rel)),
      // Git on Windows doesn't keep the exec bit, so decide it here: the
      // runner and every shell script must be runnable once extracted.
      executable: rel === "lab" || rel.endsWith(".sh"),
    }));
}

export function labFile(book: string, rel: string): LabFile | null {
  return labFiles(book).find((f) => f.path === rel) ?? null;
}

/**
 * A chapter's lab scripts and how many claims each proves. Most chapters have
 * one; a few have a single-server .sql lab and a multi-server .sh lab too.
 */
export function chapterLabs(
  book: string,
  chapterFile: string,
): { name: string; file: string; claims: number }[] {
  const name = chapterFile.replace(/\.mdx$/, "");
  return labFiles(book)
    .filter((f) => f.path === `${name}.sql` || f.path === `${name}.sh`)
    .map((f) => ({
      name,
      file: f.path,
      claims: (f.bytes.toString("utf8").match(/lab\.prove\(|^\s*prove\s/gm) ?? []).length,
    }));
}

/**
 * The whole lab as a .tar.gz, built in memory: plain ustar, one folder named
 * after the book, so `curl ... | tar xz` leaves a ready-to-run directory.
 */
export function labTarball(book: string): Buffer {
  const blocks: Buffer[] = [];
  const mtime = Math.floor(Date.now() / 1000);
  for (const f of labFiles(book)) {
    blocks.push(tarHeader(`${book}-lab/${f.path}`, f.bytes.length, f.executable ? 0o755 : 0o644, mtime));
    blocks.push(f.bytes);
    const pad = (512 - (f.bytes.length % 512)) % 512;
    if (pad) blocks.push(Buffer.alloc(pad));
  }
  blocks.push(Buffer.alloc(1024)); // two empty blocks end the archive
  return gzipSync(Buffer.concat(blocks));
}

function tarHeader(name: string, size: number, mode: number, mtime: number): Buffer {
  const h = Buffer.alloc(512);
  const put = (value: string, offset: number, length: number) =>
    h.write(value.slice(0, length), offset, length, "utf8");
  const octal = (n: number, length: number) => n.toString(8).padStart(length - 1, "0") + "\0";

  // Names over 100 bytes go in the ustar prefix field, split at a slash.
  let prefix = "";
  let base = name;
  if (Buffer.byteLength(name) > 100) {
    const cut = name.lastIndexOf("/", 155);
    prefix = name.slice(0, cut);
    base = name.slice(cut + 1);
  }
  put(base, 0, 100);
  put(octal(mode, 8), 100, 8);
  put(octal(0, 8), 108, 8); // uid
  put(octal(0, 8), 116, 8); // gid
  put(octal(size, 12), 124, 12);
  put(octal(mtime, 12), 136, 12);
  h.fill(" ", 148, 156); // checksum is computed over spaces here
  put("0", 156, 1); // regular file
  put("ustar\0", 257, 6);
  put("00", 263, 2);
  put(prefix, 345, 155);
  let sum = 0;
  for (const byte of h) sum += byte;
  put(sum.toString(8).padStart(6, "0") + "\0 ", 148, 8);
  return h;
}
