import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
const root = "dist/gymtrack/browser";
for (const file of [
  "index.html",
  "ngsw-worker.js",
  "ngsw.json",
  "manifest.webmanifest",
  "icons/icon-192.png",
  "icons/icon-512.png",
  "food-ai-worker.js",
  "vendor/tf.min.js",
])
  assert(fs.existsSync(path.join(root, file)), `${file} mancante`);
const sw = JSON.parse(fs.readFileSync(root + "/ngsw.json", "utf8"));
const manifest = JSON.parse(
  fs.readFileSync(root + "/manifest.webmanifest", "utf8"),
);
const html = fs.readFileSync(root + "/index.html", "utf8");
assert(html.includes('lang="it"'));
assert(html.includes("manifest.webmanifest"));
assert.equal(manifest.display, "standalone");
assert.equal(manifest.name, "GymTrack");
assert(html.includes('viewport-fit=cover'));
assert(html.includes('apple-mobile-web-app-capable'));
assert(sw.assetGroups.some(g=>g.name==='local-ai-runtime'&&g.installMode==='lazy'));
assert(sw.assetGroups.find(g=>g.name==='app').urls.includes('/food-ai-worker.js'));
const assets = Object.keys(sw.hashTable);
for (const file of fs.readdirSync('public/exercises'))
  assert(assets.includes('/exercises/' + file), `${file} non disponibile offline`);
const scripts = fs
  .readdirSync(root)
  .filter(
    (f) =>
      f.endsWith(".js") &&
      !["ngsw-worker.js", "safety-worker.js", "worker-basic.min.js"].includes(
        f,
      ),
  );
for (const file of scripts)
  assert(
    assets.some((a) => a.endsWith("/" + file)),
    `${file} escluso dal precache`,
  );
assert(sw.assetGroups.some((g) => g.installMode === "prefetch"));
assert(
  !/https?:\/\//.test(html.replace(/<!--.*?-->/gs, "")),
  "Risorsa remota inattesa",
);
console.log(
  `Build PWA verificata: ${scripts.length} bundle JavaScript in precache, manifest, icone e service worker presenti. Non sostituisce una prova offline in browser.`,
);
