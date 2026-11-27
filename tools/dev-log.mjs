#!/usr/bin/env node
// Registro sviluppo dalla riga di comando: lo usa Claude per leggere e aggiornare le voci.
// Configurazione (mai nel repository):
//   DEVLOG_URL    indirizzo dell'app pubblicata, per esempio https://gymtrack.example.workers.dev
//   DEVLOG_TOKEN  segreto DEVLOG_TOKEN del Worker. Nelle sessioni cloud di Claude può mancare:
//                 il proxy dell'ambiente aggiunge da solo la credenziale salvata per l'host.
// Uso: npm run devlog -- <comando> [GT-n] [--opzione valore]
import { mkdir, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';

const HELP = `Comandi:
  pull                         scarica il registro in .cache/dev-log.md e stampa le voci da lavorare
  show GT-n                    dettaglio con cronologia e ultimo caso
  add --title T [--kind bug|improvement|idea|error] [--details D] [--route /pagina] [--priority low|medium|high]
  start GT-n [--note N]        voce in corso
  fixed GT-n --summary S [--commit HEAD|sha] [--tests T]   correzione fatta: diventa «da verificare»
  verify [--apply]             controlla le voci da verificare; con --apply chiude quelle confermate
  resolve GT-n [--note N]      chiude una voce già confermata dalla verifica
  reopen GT-n --note N         riapre una voce
  note GT-n --note N           aggiunge una nota alla cronologia`;

const STATUS = { open: 'Aperto', in_progress: 'In corso', fixed: 'Da verificare', resolved: 'Risolto', dismissed: 'Scartato' };
const KIND = { error: 'Errore', bug: 'Bug', improvement: 'Miglioria', idea: 'Idea' };
const ACTOR = { user: 'Utente', claude: 'Claude', system: 'Automatico' };

function parse(argv) {
  const [command, ...rest] = argv, options = {}, positional = [];
  for (let i = 0; i < rest.length; i++) {
    if (rest[i].startsWith('--')) { const key = rest[i].slice(2); options[key] = rest[i + 1] && !rest[i + 1].startsWith('--') ? rest[++i] : true; }
    else positional.push(rest[i]);
  }
  return { command, options, positional };
}
function itemId(value) {
  const match = /^(?:GT-)?(\d+)$/i.exec(String(value || ''));
  if (!match) throw Error('Indica la voce, per esempio GT-12.');
  return match[1];
}
function base() {
  const url = process.env.DEVLOG_URL;
  if (!url || !/^https?:\/\//.test(url)) throw Error('Imposta DEVLOG_URL con l’indirizzo dell’app pubblicata (vedi docs/REGISTRO_SVILUPPO.md).');
  return url.replace(/\/+$/, '');
}
async function call(path, body) {
  // Senza token locale si invia un segnaposto: nelle sessioni cloud il proxy lo sostituisce con la credenziale salvata.
  const token = process.env.DEVLOG_TOKEN || 'proxy-injected';
  const response = await fetch(base() + '/api/dev-log/agent/' + path, {
    method: body ? 'POST' : 'GET',
    headers: { Authorization: 'Bearer ' + token, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  let data;
  try { data = await response.json(); } catch { throw Error('Risposta non valida dal registro (HTTP ' + response.status + ').'); }
  if (!response.ok) throw Error(data.error || 'HTTP ' + response.status);
  return data;
}
const day = at => at ? new Date(at).toISOString().slice(0, 16).replace('T', ' ') : '—';

function itemMarkdown(item, { history = true } = {}) {
  const lines = [`### ${item.code} · ${item.title}`, `- Tipo: ${item.source === 'auto' ? 'errore automatico' : KIND[item.kind]} · Stato: ${STATUS[item.status]}${item.regression ? ' · REGRESSIONE (una correzione precedente non è bastata)' : ''} · Priorità: ${item.priority}`];
  if (item.route) lines.push(`- Pagina: ${item.route}`);
  if (item.source === 'auto') lines.push(`- Casi: ${item.occurrences} · ultimo ${day(item.lastSeen)} · build ${String(item.lastBuild || '').slice(0, 8)}`);
  if (item.details) lines.push('- Descrizione: ' + item.details.replace(/\n/g, '\n  '));
  if (item.fixSummary) lines.push(`- Ultima correzione: ${item.fixSummary}${item.fixCommit ? ' (commit ' + item.fixCommit + ')' : ''} · ${day(item.fixedAt)}`);
  if (item.verification) lines.push(`- Verifica: ${item.verification.ready ? 'PRONTA' : 'in attesa'} · ${item.verification.reason}`);
  if (history && item.events?.length) {
    lines.push('- Cronologia:');
    for (const event of item.events) lines.push(`  - ${day(event.at)} · ${ACTOR[event.actor] || event.actor} · ${event.kind}${event.note ? ': ' + event.note.replace(/\n/g, ' / ') : ''}`);
  }
  if (item.recent?.length) {
    const last = item.recent[0];
    lines.push('- Ultimo caso:', '```', last.message + (last.stack ? '\n' + last.stack : ''), '```');
  }
  return lines.join('\n');
}
function registryMarkdown(data) {
  const group = statuses => data.items.filter(item => statuses.includes(item.status));
  const section = (title, items, options) => [`## ${title} (${items.length})`, '', ...(items.length ? items.map(item => itemMarkdown(item, options) + '\n') : ['Nessuna voce.', ''])];
  return [
    '# Registro sviluppo GymTrack',
    '',
    `Scaricato: ${day(Date.now())} UTC · build pubblicata: ${String(data.build || '').slice(0, 8) || 'sconosciuta'}`,
    `Regola di chiusura: nuova build aperta almeno ${data.rules?.minAppStarts} volte e pagina interessata visitata almeno ${data.rules?.minRouteVisits} volte, senza ricadute.`,
    '',
    'Prima di correggere leggi la cronologia: non ripetere una soluzione già provata e smentita (REGRESSIONE).',
    '',
    ...section('Da lavorare', group(['open', 'in_progress'])),
    ...section('Da verificare', group(['fixed'])),
    ...section('Risolti (memoria: cosa è già stato fatto)', group(['resolved']), { history: true }),
    ...section('Scartati', group(['dismissed']), { history: false }),
  ].join('\n');
}

async function main() {
  const { command, options, positional } = parse(process.argv.slice(2));
  if (!command || command === 'help' || options.help) { console.log(HELP); return; }
  if (command === 'pull') {
    const data = await call('items');
    await mkdir('.cache', { recursive: true });
    await writeFile('.cache/dev-log.md', registryMarkdown(data));
    const open = data.items.filter(item => ['open', 'in_progress'].includes(item.status));
    const fixed = data.items.filter(item => item.status === 'fixed');
    console.log(`Registro salvato in .cache/dev-log.md · ${open.length} da lavorare · ${fixed.length} da verificare · ${data.items.filter(item => item.status === 'resolved').length} risolti.`);
    for (const item of open) console.log(`- ${item.code} [${item.source === 'auto' ? 'auto' : item.kind}${item.regression ? ', REGRESSIONE' : ''}, ${item.priority}] ${item.title}`);
    for (const item of fixed) console.log(`- ${item.code} [da verificare: ${item.verification?.ready ? 'PRONTA' : 'in attesa'}] ${item.title}`);
    return;
  }
  if (command === 'show') { console.log(itemMarkdown((await call('items/' + itemId(positional[0]))).item)); return; }
  if (command === 'add') {
    const { item } = await call('items', { kind: options.kind || 'bug', title: options.title, details: options.details, route: options.route, priority: options.priority });
    console.log(`${item.code} aggiunto: ${item.title}`); return;
  }
  if (command === 'verify') {
    const data = await call('items');
    const fixed = data.items.filter(item => item.status === 'fixed');
    if (!fixed.length) { console.log('Nessuna voce da verificare.'); return; }
    for (const item of fixed) {
      const check = item.verification;
      if (check?.ready && options.apply) {
        const result = await call('items/' + item.id, { action: 'resolve', note: typeof options.note === 'string' ? options.note : undefined });
        console.log(`${item.code} RISOLTO · ${check.reason}`);
        void result;
      } else console.log(`${item.code} ${check?.ready ? 'PRONTO (usa --apply per chiuderlo)' : 'in attesa'} · ${check?.reason || 'nessuna verifica disponibile'}`);
    }
    return;
  }
  const actions = { start: 'start', fixed: 'fixed', resolve: 'resolve', reopen: 'reopen', note: 'note' };
  if (!actions[command]) { console.log(HELP); process.exitCode = 1; return; }
  const body = { action: actions[command] };
  if (typeof options.note === 'string') body.note = options.note;
  if (command === 'fixed') {
    body.summary = options.summary;
    if (typeof options.tests === 'string') body.tests = options.tests;
    if (options.commit) body.commit = options.commit === 'HEAD' || options.commit === true ? execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim() : options.commit;
  }
  const { item } = await call('items/' + itemId(positional[0]), body);
  console.log(`${item.code} → ${STATUS[item.status]}`);
}

main().catch(error => { console.error('Registro sviluppo: ' + error.message); process.exitCode = 1; });
