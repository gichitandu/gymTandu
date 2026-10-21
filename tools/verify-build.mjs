import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
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
const aiAssets = sw.assetGroups.find(g=>g.name==='local-ai-runtime').urls;
for (const file of ['/vendor/food-model/model.json','/vendor/food-model/weights.bin']) {
  assert(fs.existsSync(root + file), `${file} mancante`);
  assert(aiAssets.includes(file), `${file} escluso dalla cache offline del riconoscimento`);
  assert(sw.hashTable[file], `${file} senza hash di aggiornamento`);
}
const aiModel = JSON.parse(fs.readFileSync(root + '/vendor/food-model/model.json','utf8'));
for (const group of aiModel.weightsManifest) for (const file of group.paths)
  assert(fs.existsSync(root + '/vendor/food-model/' + file), `Pesi AI mancanti: ${file}`);
assert(sw.assetGroups.find(g=>g.name==='app').urls.includes('/food-ai-worker.js'));
const assets = Object.keys(sw.hashTable);
const buildText = fs.readFileSync(root + '/app-build.json','utf8');
const appBuild = JSON.parse(buildText);
assert(/^[a-f0-9]{64}$/.test(appBuild.buildId), 'Identità della versione mancante');
assert.equal(sw.appData?.buildId, appBuild.buildId, 'Versione diversa nel service worker');
assert.equal(sw.hashTable['/app-build.json'],createHash('sha1').update(buildText).digest('hex'),'Descrittore versione non verificato dalla cache');
assert(sw.assetGroups.find(g=>g.name==='app').urls.includes('/app-build.json'),'Versione esclusa dalla cache offline');
assert(fs.readFileSync('dist/server/index.js','utf8').includes('const APP_BUILD_ID = '+JSON.stringify(appBuild.buildId)), 'Versione server diversa dagli asset pubblicati');
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
