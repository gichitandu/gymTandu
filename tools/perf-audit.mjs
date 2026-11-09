/** Read-only PWA budget report. Run after npm run build. */
import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";
const root = "dist/gymtrack/browser";
const manifest = JSON.parse(readFileSync(join(root, "ngsw.json"), "utf8"));
const format = (bytes) => (bytes / 1048576).toFixed(2) + " MiB";
const rows = [];
for (const group of manifest.assetGroups || []) {
  const files = [];
  for (const url of group.urls || []) {
    try {
      const path = join(root, decodeURIComponent(url).replace(/^\//, ""));
      files.push({ url, bytes: statSync(path).size });
    } catch {
      /* A generated URL can be served by the runtime rather than a disk file. */
    }
  }
  const total = files.reduce((sum, file) => sum + file.bytes, 0);
  rows.push({
    name: group.name,
    mode: group.installMode,
    files: files.length,
    total,
  });
  console.log(
    `${group.name} (${group.installMode}): ${files.length} files, ${format(total)} on disk`,
  );
  console.log(
    "  Largest: " +
      files
        .sort((a, b) => b.bytes - a.bytes)
        .slice(0, 5)
        .map((file) => file.url + " " + format(file.bytes))
        .join(" | "),
  );
}
const prefetch = rows
  .filter((row) => row.mode === "prefetch")
  .reduce((sum, row) => sum + row.total, 0);
console.log(
  "PWA precache budget (uncompressed disk sizes): " + format(prefetch),
);
console.log(
  "Not a measurement of network transfer, load time, memory or iOS Safari performance.",
);
