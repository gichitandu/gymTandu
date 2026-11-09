// Hook PostToolUse (Edit/Write/MultiEdit): formatta con Prettier il file appena modificato.
// Agisce solo sul codice delle cartelle formattate; rispetta .prettierrc.json e .prettierignore
// (template Angular esclusi). Non blocca mai Claude: in caso di errore esce senza segnalarlo.
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const CARTELLE = [
  "src",
  "tests",
  "tools",
  "worker",
  "shared",
  "calendar-relay",
];
const ESTENSIONI = /\.(ts|js|mjs|cjs|css|json|jsonc)$/;

try {
  const input = JSON.parse(readFileSync(0, "utf8"));
  const file = input?.tool_input?.file_path;
  if (!file) process.exit(0);
  const root = process.env.CLAUDE_PROJECT_DIR || process.cwd();
  const relative = path
    .relative(root, path.resolve(root, file))
    .split(path.sep)
    .join("/");
  if (relative.startsWith("..") || !CARTELLE.includes(relative.split("/")[0]))
    process.exit(0);
  if (!ESTENSIONI.test(relative)) process.exit(0);
  const prettier = path.join(
    root,
    "node_modules",
    "prettier",
    "bin",
    "prettier.cjs",
  );
  if (!existsSync(prettier)) process.exit(0);
  execFileSync(
    process.execPath,
    [prettier, "--write", "--log-level", "silent", relative],
    {
      cwd: root,
      stdio: "ignore",
      timeout: 20000,
    },
  );
} catch {
  // File con errori di sintassi o Prettier assente: si lascia il file com'è.
}
process.exit(0);
