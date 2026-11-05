#!/usr/bin/env node
/**
 * GymTrack: conservative, dependency-aware Vitest selection.
 * Only development tooling; never changes application files or data.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const slash = value => value.replaceAll('\\', '/');
const exists = file => fs.existsSync(path.join(root, file));
const candidates = file => [
  file, file + '.ts', file + '.tsx', file + '.js', file + '.mjs',
  file + '.html', file + '.css', file + '/index.ts', file + '/index.js'
];
const sourceExtensions = /\.(?:[cm]?[jt]s|html|css)$/;
const ignored = file => /^(?:docs\/|public\/|\.github\/ISSUE_TEMPLATE\/)/.test(file)
  || /^(?:README|AGENTS|QA_CHECKLIST|DEVELOPMENT_PLAN|IPHONE_QA|AUTHENTICATION|STANDALONE)\.md$/.test(file);
const critical = file => /^(?:package(?:-lock)?\.json|angular\.json|tsconfig[^/]*\.json|vitest\.config\.ts|\.nvmrc|\.npmrc|ngsw-config\.json)$/.test(file)
  || /^(?:\.github\/workflows\/|tools\/|worker\/|calendar-relay\/|db\/|drizzle\/|shared\/)/.test(file)
  || /^(?:src\/(?:main\.ts|styles\.css|design-runtime\.css|neon\.css|form-polish\.css|theme-finishes\.css|photo-controls\.css|preview-match\.css))$/.test(file)
  || /^(?:src\/app\/(?:core\/(?:database|seed|routes)\.ts|models\/domain\.ts|repositories\/|services\/(?:store|auth|archive-sync|backup|integrity|pwa|feedback)\.ts|layouts\/|design\/))/.test(file)
  || /^(?:tests\/runtime\/|tests\/fixtures\/)/.test(file);

// Additional tests for template/CSS and behavioral contracts that static imports
// cannot always capture. These add coverage; they never replace dependency matches.
const domains = [
  { files: /^src\/app\/(?:features\/calendar\.component\.(?:ts|html|css)|services\/calendar(?:-[\w-]+)?\.ts|shared\/calendar-[\w.-]+)$/, tests: /^tests\/calendar[\w-]*\.test\.ts$/ },
  { files: /^src\/app\/(?:features\/progress(?:\.component\.ts|-design\.css|-reference\.css)|shared\/progress-chart\.component\.ts|services\/(?:progression|statistics)\.ts)$/, tests: /^tests\/(?:progression|plan-statistics|ui-flows|gym-improvements|client-view)\.test\.ts$/ },
  { files: /^src\/app\/(?:features\/(?:session|workouts|workout-[\w-]+)\.component\.(?:ts|html|css)|services\/(?:workout-[\w-]+|training-flow|weekly-reuse|rest-clock)\.ts|shared\/(?:workout-[\w-]+|active-workout)\.component\.(?:ts|html|css))$/, tests: /^tests\/(?:workout-[\w-]+|recording-flow|training-upgrades|weekly-reuse-and-replacement|ui-flows)\.test\.ts$/ },
  { files: /^src\/app\/(?:features\/(?:nutrition\.component\.ts|nutrition-simple\.css)|services\/(?:nutrition|nutrition-guard|local-ai)\.ts)$/, tests: /^tests\/(?:nutrition-[\w-]+|food-[\w-]+|local-ai|ui-flows)\.test\.ts$/ },
  { files: /^src\/app\/(?:features\/(?:plans|plan-dashboard)\.component\.(?:ts|html|css)|services\/(?:plan-[\w-]+)\.ts)$/, tests: /^tests\/(?:plan-[\w-]+|concluded-plan-recommendations|ui-flows)\.test\.ts$/ },
  { files: /^src\/app\/features\/profile\.component\.ts$/, tests: /^tests\/(?:profile-[\w-]+|ui-flows)\.test\.ts$/ }
];

function git(...args) {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}
function gitFiles(...args) {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8' }).split('\0').filter(Boolean).map(slash);
}
function trackedFiles() {
  return gitFiles('ls-files', '-z').filter(source => sourceExtensions.test(source));
}
function resolveImport(importer, target, fileSet) {
  if (!target.startsWith('.')) return undefined;
  const resolved = slash(path.posix.normalize(path.posix.join(path.posix.dirname(importer), target)));
  return candidates(resolved).find(file => fileSet.has(file));
}
function references(file, fileSet) {
  const code = fs.readFileSync(path.join(root, file), 'utf8');
  const refs = new Set();
  const imports = /(?:\b(?:import|export)\s+(?:[^;'"]*?\s+from\s*)?|\bimport\s*\(|\brequire\s*\()\s*['"]([^'"]+)['"]/g;
  for (const match of code.matchAll(imports)) {
    const dependency = resolveImport(file, match[1], fileSet);
    if (dependency) refs.add(dependency);
  }
  if (file.endsWith('.ts')) {
    for (const match of code.matchAll(/\b(?:templateUrl|styleUrl)\s*:\s*['"]([^'"]+)['"]/g)) {
      const dependency = resolveImport(file, match[1], fileSet);
      if (dependency) refs.add(dependency);
    }
    for (const match of code.matchAll(/\bstyleUrls\s*:\s*\[([^\]]*)\]/g)) {
      for (const url of match[1].matchAll(/['"]([^'"]+)['"]/g)) {
        const dependency = resolveImport(file, url[1], fileSet);
        if (dependency) refs.add(dependency);
      }
    }
  }
  if (file.endsWith('.css')) {
    for (const match of code.matchAll(/@import\s+(?:url\()?['"]([^'"]+)['"]/g)) {
      const dependency = resolveImport(file, match[1], fileSet);
      if (dependency) refs.add(dependency);
    }
  }
  return refs;
}
export function selectTests(changed, files, graph) {
  const tests = files.filter(file => /^tests\/.*\.test\.ts$/.test(file));
  const selected = new Set();
  const sourceChanges = changed.filter(file => !ignored(file) && !/^tests\/.*\.test\.ts$/.test(file));
  if (changed.some(critical) || sourceChanges.some(file => !sourceExtensions.test(file) || !files.includes(file))) {
    return { all: true, tests, reason: 'File trasversale, generato, eliminato o non riconosciuto' };
  }
  const changedSet = new Set(changed);
  const cache = new Map();
  function dependsOnChanged(file, stack = new Set()) {
    if (changedSet.has(file)) return true;
    if (cache.has(file)) return cache.get(file);
    if (stack.has(file)) return false;
    stack.add(file);
    const result = [...(graph.get(file) || [])].some(next => dependsOnChanged(next, stack));
    stack.delete(file);
    cache.set(file, result);
    return result;
  }
  for (const test of tests) {
    if (dependsOnChanged(test)) selected.add(test);
    if (changed.some(file => domains.some(domain => domain.files.test(file) && domain.tests.test(test)))) selected.add(test);
  }
  if (sourceChanges.length && !selected.size) {
    return { all: true, tests, reason: 'Nessun test associato con sufficiente certezza' };
  }
  return { all: false, tests: [...selected].sort(), reason: sourceChanges.length ? 'Dipendenze e contratti funzionali' : 'Solo test modificati o documentazione' };
}

function main() {
  const args = process.argv.slice(2);
  const listOnly = args.includes('--list');
  const baseAt = args.indexOf('--base');
  if (baseAt >= 0 && !args[baseAt + 1]) throw Error('--base richiede un ref Git');
  const requested = baseAt >= 0 ? args[baseAt + 1] : process.env.AFFECTED_BASE;
  let base = requested;
  if (!base) {
    try { base = git('rev-parse', '--verify', 'HEAD^'); }
    catch { base = git('rev-parse', '--verify', 'HEAD'); }
  }
  // Fail closed on invalid base or unavailable history; never silently skip tests.
  git('rev-parse', '--verify', base + '^{commit}');
  const changed = [...new Set([
    ...gitFiles('diff', '--name-only', '-z', '--diff-filter=ACMRD', base, '--'),
    ...gitFiles('ls-files', '--others', '--exclude-standard', '-z')
  ])].sort();
  if (!changed.length) {
    console.log('Nessuna modifica rispetto a ' + base + '.');
    return;
  }
  const files = trackedFiles();
  const allFiles = [...new Set([...files, ...changed.filter(exists)])].filter(source => sourceExtensions.test(source) && exists(source));
  const fileSet = new Set(allFiles);
  const graph = new Map(allFiles.map(file => [file, references(file, fileSet)]));
  const selection = selectTests(changed, allFiles, graph);
  console.log('Base: ' + base);
  console.log('File modificati: ' + changed.join(', '));
  console.log('Selezione: ' + (selection.all ? 'SUITE COMPLETA' : selection.tests.length + ' test file') + ' — ' + selection.reason);
  if (listOnly) {
    console.log(selection.tests.join('\n') || '(nessun test Vitest richiesto)');
    return;
  }
  if (!selection.all && !selection.tests.length) {
    console.log('Nessun test Vitest richiesto. Le verifiche complete restano obbligatorie prima del merge.');
    return;
  }
  const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const command = ['test', ...(selection.all ? [] : ['--', ...selection.tests])];
  const result = spawnSync(npm, command, { cwd: root, stdio: 'inherit' });
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
}
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) {
  try { main(); }
  catch (error) {
    console.error('Impossibile selezionare i test in sicurezza:', error.message);
    console.error('Esegui npm test e controlla la base Git; non considerare il task verificato.');
    process.exitCode = 1;
  }
}
