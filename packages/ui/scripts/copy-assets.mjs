// Copies the non-TS build assets (the token/theme stylesheet) into dist so the
// published package is self-contained. tsc emits the JS + .d.ts; the CSS is not a
// module, so it is copied here. Cross-platform (no shell dependency).
import { copyFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
mkdirSync(resolve(root, "dist"), { recursive: true });
copyFileSync(resolve(root, "src/styles.css"), resolve(root, "dist/styles.css"));
console.log("copied src/styles.css -> dist/styles.css");
