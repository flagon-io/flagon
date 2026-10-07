#!/usr/bin/env node
/**
 * Prove the book: run its labs, where every claim is a lab.prove(...) check
 * that either holds or stops the run with "NOT PROVED: ...".
 *
 *   npm run book:lab                       every lab of every book
 *   npm run book:lab -- 16-btree 18-explain   just these labs
 *   npm run book:lab -- --down             tear the lab down afterwards
 *
 * This runs each book's own `lab` script (content/books/<book>/lab/lab), the
 * same `./lab <chapter>` readers run, so the author and readers take one path:
 * .sql labs run in the book's lab container in a fresh copy of the sample
 * data, and the multi-server .sh labs bring up their own compose files and
 * clean up after themselves.
 *
 * Needs Docker with the compose plugin, and bash on PATH (Git Bash on Windows).
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const down = args.includes("--down");
const wanted = args.filter((a) => !a.startsWith("--"));

function run(cmd, argv, cwd) {
  const r = spawnSync(cmd, argv, { cwd, stdio: "inherit", shell: false });
  return r.status ?? 1;
}

const booksDir = path.join(root, "content", "books");
const labDirs = fs
  .readdirSync(booksDir, { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => path.join(booksDir, d.name, "lab"))
  .filter((d) => fs.existsSync(path.join(d, "compose.yml")) && fs.existsSync(path.join(d, "lab")));

const failed = [];
for (const dir of labDirs) {
  // A lab name is its file name without .sql or .sh; the lab script runs every
  // file of that name, in order.
  const names = [
    ...new Set(
      fs
        .readdirSync(dir)
        .filter((f) => /^\d+-.+\.(sql|sh)$/.test(f))
        .map((f) => f.replace(/\.(sql|sh)$/, "")),
    ),
  ].sort();
  const labs = wanted.length === 0 ? names : names.filter((n) => wanted.includes(n));
  if (labs.length === 0) continue;

  const book = path.basename(path.dirname(dir));
  console.log(`\n# ${path.relative(root, dir)}`);
  const status = run("bash", ["lab", ...(wanted.length === 0 ? ["all"] : labs)], dir);
  if (status !== 0) failed.push(book);

  if (down) run("docker", ["compose", "down", "-v"], dir);
}

if (failed.length) {
  console.log(`\nNOT PROVED in: ${failed.join(", ")} (the lab output above names each failing lab)`);
  process.exit(1);
}
console.log("\nEvery claim proved.");
