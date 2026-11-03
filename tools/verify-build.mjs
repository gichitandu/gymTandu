import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
const root = "dist/gymtrack/browser";
for (const file of [
  "index.html",
  "ngsw-worker.js",
  "gymtrack-app-worker-v3.js",
  "gymtrack-offline-engine-v3.js",
  "gymtrack-worker-migration.js",
  "ngsw.json",
  "manifest.webmanifest",
  "icons/icon-192.png",
  "icons/icon-512.png",
  "brand/gt-modern-mark.png",
  "icons/gt-modern-180.png",
  "icons/gt-modern-192.png",
  "icons/gt-modern-512.png",
  "apple-touch-icon.png",
  "apple-touch-icon-precomposed.png",
  "favicon.ico",
  "training/dumbbell.png",
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
assert(sw.assetGroups.find(group => group.name === 'app').urls.includes('/training/dumbbell.png'), 'Immagine iniziale Home esclusa dal precache offline');
for (const file of ['brand/gt-modern-mark.png', 'icons/gt-modern-180.png', 'icons/gt-modern-192.png', 'icons/gt-modern-512.png', 'apple-touch-icon.png', 'apple-touch-icon-precomposed.png', 'favicon.ico']) {
  assert(sw.assetGroups.find(group => group.name === 'app').urls.includes('/' + file), file + ' escluso dal precache');
  assert.equal(sw.hashTable['/' + file], createHash('sha1').update(fs.readFileSync(root + '/' + file)).digest('hex'), file + ' senza hash coerente');
}
assert.equal(manifest.id, './', 'Identità PWA esistente modificata');
assert.deepEqual(manifest.icons.map(icon => icon.src), ['icons/gt-modern-192.png', 'icons/gt-modern-512.png']);
assert(html.includes('rel="apple-touch-icon" sizes="180x180" href="/icons/gt-modern-180.png"'));
assert(html.includes('rel="apple-touch-icon-precomposed" sizes="180x180" href="/icons/gt-modern-180.png"'));
const buildText = fs.readFileSync(root + '/app-build.json','utf8');
const appBuild = JSON.parse(buildText);
assert(/^[a-f0-9]{64}$/.test(appBuild.buildId), 'Identità della versione mancante');
assert.equal(sw.appData?.buildId, appBuild.buildId, 'Versione diversa nel service worker');
assert.equal(sw.hashTable['/app-build.json'],createHash('sha1').update(buildText).digest('hex'),'Descrittore versione non verificato dalla cache');
assert(sw.assetGroups.find(g=>g.name==='app').urls.includes('/app-build.json'),'Versione esclusa dalla cache offline');
assert(fs.readFileSync('dist/server/index.js','utf8').includes('const APP_BUILD_ID = '+JSON.stringify(appBuild.buildId)), 'Versione server diversa dagli asset pubblicati');
for (const file of fs.readdirSync('public/exercises'))
  assert(assets.includes('/exercises/' + file), `${file} non disponibile offline`);
// Every mannequin family stays available offline after the app cache is ready.
for (const file of fs.readdirSync('public/training/figures').filter(file => file.endsWith('.png'))) {
  const url = '/training/figures/' + file;
  assert(assets.includes(url), `${file} senza hash offline`);
  assert(sw.assetGroups.find(group => group.name === 'app').urls.includes(url), `${file} escluso dal precache delle illustrazioni`);
}
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

const serverConfig=JSON.parse(fs.readFileSync('dist/server/wrangler.json','utf8'));
assert(serverConfig.compatibility_flags.includes('global_fetch_strictly_public'),'Collegamento pubblico tra Workers non abilitato');

for(const file of ['gymtrack-sw.js','ngsw-worker.js','gymtrack-app-worker-v3.js','gymtrack-offline-engine-v3.js','gymtrack-worker-migration.js']){
 const source=fs.readFileSync(root+'/'+file,'utf8');
 assert.equal(sw.hashTable['/'+file],createHash('sha1').update(source).digest('hex'),file+' differs from its offline hash');
 assert(sw.assetGroups.find(g=>g.name==='app').urls.includes('/'+file),file+' excluded from offline precache');
}
assert(fs.readFileSync(root+'/gymtrack-sw.js','utf8').includes("importScripts('/gymtrack-worker-migration.js')"),'Legacy push registration not retired');
assert(fs.readFileSync(root+'/ngsw-worker.js','utf8').includes("importScripts('/gymtrack-worker-migration.js')"),'Legacy Angular registration not retired');
assert(fs.readFileSync(root+'/gymtrack-app-worker-v3.js','utf8').includes("importScripts('/gymtrack-offline-engine-v3.js')"),'Canonical worker does not retain Angular offline engine');
const engine=fs.readFileSync(root+'/gymtrack-offline-engine-v3.js','utf8');
assert(engine.includes('ngsw:')&&engine.includes('skipWaiting'),'Real Angular offline engine missing');
assert(!engine.includes("importScripts('/gymtrack-session-recovery.js')"),'Retired API recovery still active in canonical worker');
assert(html.includes('name="gymtrack-worker" content="/gymtrack-app-worker-v3.js"'),'Canonical HTML bootstrap marker missing');
assert(fs.readFileSync('src/main.ts','utf8').includes('provideServiceWorker("gymtrack-app-worker-v3.js"'),'Application still registers retired worker');
