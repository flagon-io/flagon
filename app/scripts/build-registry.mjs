// Generates a shadcn-compatible registry from @flagon-io/ui source into
// app/public/r/, so consumers can `npx shadcn@latest add <host>/r/<name>.json`.
// The cn import is rewritten to shadcn's `@/lib/utils` convention; each item's
// npm dependencies are detected from its bare imports.
import { readFileSync, readdirSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const componentsDir = join(here, "..", "..", "packages", "ui", "src", "components");
const outDir = join(here, "..", "public", "r");

mkdirSync(outDir, { recursive: true });

const REGISTRY_BASE = "https://ui.flagon.io/r";

function detectDependencies(source) {
  const deps = new Set();
  const registry = new Set();
  const re = /from\s+["']([^"']+)["']/g;
  let m;
  while ((m = re.exec(source))) {
    const spec = m[1];
    if (spec.startsWith("./")) {
      // Sibling component (e.g. "./button") -> a registry dependency.
      registry.add(spec.slice(2));
      continue;
    }
    if (spec.startsWith("@/") || spec.startsWith("../")) continue; // alias / lib
    if (spec === "react" || spec === "react-dom") continue; // peer deps
    const pkg = spec.startsWith("@") ? spec.split("/").slice(0, 2).join("/") : spec.split("/")[0];
    deps.add(pkg);
  }
  return {
    dependencies: [...deps].sort(),
    registryDependencies: [...registry].sort().map((name) => `${REGISTRY_BASE}/${name}.json`),
  };
}

const files = readdirSync(componentsDir).filter((f) => f.endsWith(".tsx")).sort();
const index = [];

for (const file of files) {
  const name = file.replace(/\.tsx$/, "");
  const raw = readFileSync(join(componentsDir, file), "utf8");
  // shadcn projects keep cn in @/lib/utils.
  const content = raw.replace(/from\s+["']\.\.\/lib\/cn["']/g, 'from "@/lib/utils"');
  const { dependencies, registryDependencies } = detectDependencies(content);

  const item = {
    $schema: "https://ui.shadcn.com/schema/registry-item.json",
    name,
    type: "registry:ui",
    dependencies,
    registryDependencies,
    files: [
      {
        path: `ui/${name}.tsx`,
        content,
        type: "registry:ui",
        target: `components/ui/${name}.tsx`,
      },
    ],
  };

  writeFileSync(join(outDir, `${name}.json`), JSON.stringify(item, null, 2) + "\n");
  index.push({ name, type: "registry:ui", dependencies });
}

const registry = {
  $schema: "https://ui.shadcn.com/schema/registry.json",
  name: "flagon-ui",
  homepage: "https://ui.flagon.io",
  items: index,
};
writeFileSync(join(outDir, "registry.json"), JSON.stringify(registry, null, 2) + "\n");

console.log(`Built ${index.length} registry items -> app/public/r/`);
