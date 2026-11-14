import { Component, computed, effect, inject, OnDestroy, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import qrcode from 'qrcode-generator';
import { confirmationForContext } from '../services/confirmation';
import { GroupSessionService } from '../services/group-session';
import { GroupExercise, GroupMember, inviteLink, inviteTokenFromUrl, memberProgress, sharedExercises } from '../services/group-workout';
import { Store } from '../services/store';
import { localDate } from '../models/domain';
import { IconComponent } from '../shared/icon.component';
import { ProfileLinkComponent } from '../shared/profile-link.component';
import { StatusComponent } from '../shared/status.component';
import { GroupDayOption, GroupDayPickerComponent } from './group-day-picker.component';


@Component({
  standalone: true,
  imports: [FormsModule, RouterLink, IconComponent, ProfileLinkComponent, StatusComponent, GroupDayPickerComponent],
  template: `<header class="su-head"><h1>Allenamento in gruppo</h1><div class="su-actions"><gt-profile-link/></div></header>
<a class="group-back" routerLink="/piani"><gt-icon name="back"/>Schede</a>
<gt-status/>
@if(group.error()){<p class="notice" role="alert">{{group.error()}}</p>}
@if(!group.available()){
  <section class="card group-card"><h2>Serve un account online</h2><p class="subtle">L’allenamento in gruppo collega più account: accedi con il tuo nome utente e riapri questa pagina. Lo spazio «Sul dispositivo» resta personale e non può essere condiviso.</p></section>
}@else if(!group.loaded()||!s.ready()){
  <p class="subtle" role="status">Caricamento…</p>
}@else if(session();as g){
  @if(g.ended){
    <section class="card group-card"><h2>Gruppo chiuso</h2><p class="subtle">Questo allenamento in gruppo è terminato. La tua seduta resta nel tuo archivio: puoi continuarla o concluderla normalmente.</p><div class="group-actions">@if(s.draft()){<a class="button primary" routerLink="/sessione">Vai alla seduta</a>}<button type="button" class="ghost" (click)="group.forget()">Chiudi</button></div></section>
  }@else if(me()?.mode===''){
    <section class="card group-card"><span class="pill">Invito di {{host()?.name}}</span><h2>{{g.dayName}}</h2>
      <p class="subtle">{{host()?.name}} oggi fa {{hostExercises().length}} esercizi. Scegli come allenarti insieme.</p>
      <ol class="group-list">@for(e of hostExercises();track $index){<li><span>{{e.name}}</span><small>{{e.sets}} × {{repRange(e)}}</small></li>}</ol>
    </section>
    <section class="card group-card"><h3>1 · Stessi esercizi</h3><p class="subtle">Apri una seduta identica a quella di {{host()?.name}}: stessi esercizi, stesso ordine, stesse serie. I carichi partono dal tuo storico.</p>
      @if(s.draft();as d){<p class="notice" role="status">Hai già una seduta aperta ({{d.dayName}}): concludila per usare questa opzione, oppure usala con l’opzione 2.</p>}
      <button type="button" class="primary" [disabled]="working()||!!s.draft()||!hostExercises().length" (click)="chooseSame()">Faccio gli stessi esercizi</button>
    </section>
    <section class="card group-card"><h3>2 · Il mio allenamento</h3><p class="subtle">Tieni la tua scheda: gli esercizi che avete in comune vengono spostati nello stesso momento della seduta di {{host()?.name}}, gli altri restano tuoi.</p>
      @if(s.draft();as d){
        <p><strong>{{d.dayName}}</strong> · {{draftShared()}} in comune su {{s.workoutExercises(d.id).length}}</p>
        <button type="button" class="primary" [disabled]="working()" (click)="chooseMatch()">Uso la seduta aperta</button>
      }@else if(dayOptions().length){
        <gt-group-day-picker title="Il mio allenamento" [options]="dayOptions()" [value]="dayId()" (valueChange)="dayId.set($event)" [showShared]="true" [initialDate]="initialDate()"/>
        <button type="button" class="primary" [disabled]="working()||!dayId()" (click)="chooseMatch()">Inizio il mio allenamento</button>
      }@else{<p class="subtle">Non hai ancora una scheda con esercizi. <a routerLink="/piani">Creane una</a> oppure usa l’opzione 1.</p>}
    </section>
    <button type="button" class="ghost danger group-leave" [disabled]="working()" (click)="leave()">Rifiuta l’invito</button>
  }@else{
    @if(group.stale()){<p class="notice" role="status">Connessione assente: l’avanzamento degli altri potrebbe non essere aggiornato.</p>}
    @if(g.code&&g.inviteToken){
      <section class="card group-card group-invite" aria-label="Invita un amico"><h2>Invita un amico</h2>
        <p class="subtle">Chi ha già GymTrack apre Schede → Allenamento in gruppo e inserisce il codice. Chi non ce l’ha apre il link (o inquadra il QR) e crea il suo account.</p>
        <p class="group-code" [attr.aria-label]="'Codice del gruppo: '+g.code">@for(digit of g.code.split('');track $index){<b>{{digit}}</b>}</p>
        <svg class="group-qr" [attr.viewBox]="'0 0 '+qr().size+' '+qr().size" role="img" aria-label="Codice QR del link di invito" shape-rendering="crispEdges"><rect width="100%" height="100%" fill="#fff"/><path [attr.d]="qr().path" fill="#000"/></svg>
        <div class="group-actions"><a class="button primary" [href]="whatsappUrl()" target="_blank" rel="noopener"><gt-icon name="share"/>Invia su WhatsApp</a>@if(canShare){<button type="button" class="ghost" (click)="share()"><gt-icon name="upload"/>Condividi…</button>}<button type="button" class="ghost" (click)="copy()"><gt-icon name="copy"/>{{copied()?'Link copiato':'Copia link'}}</button></div>
        <small class="subtle">Codice e link valgono finché il gruppo è aperto (al massimo 8 ore).</small>
      </section>
    }
    <section class="card group-card" aria-label="Partecipanti"><h2>{{g.dayName}}</h2>
      @for(m of g.members;track m.id){<div class="group-member">
        <div class="group-member-top"><strong>{{m.me?'Tu':m.name}}</strong><span class="pill">{{badge(m)}}</span></div>
        @if(m.mode===''){<small class="subtle">Sta scegliendo come allenarsi…</small>}@else{
          <div class="group-bar" role="progressbar" [attr.aria-label]="'Serie completate da '+(m.me?'te':m.name)" aria-valuemin="0" [attr.aria-valuemax]="progress(m).total" [attr.aria-valuenow]="progress(m).done"><i [style.width.%]="progress(m).total?progress(m).done/progress(m).total*100:0"></i></div>
          <small class="subtle">{{progress(m).done}}/{{progress(m).total}} serie@if(m.finished){ · allenamento concluso}@else if(currentName(m)){ · ora: {{currentName(m)}}}</small>
        }
      </div>}
      @if(g.members.length===1){<p class="subtle">Nessun altro è ancora entrato. Condividi il codice o il link qui sopra.</p>}
    </section>
    @for(row of comparisons();track row.member.id){
      <section class="card group-card" [attr.aria-label]="'Esercizi in comune con '+row.member.name"><h3>In comune con {{row.member.name}} · {{row.pairs.length}}</h3>
        @if(row.pairs.length){<table class="group-table"><thead><tr><th scope="col">Esercizio</th><th scope="col">Tu</th><th scope="col">{{row.member.name}}</th></tr></thead><tbody>
          @for(p of row.pairs;track $index){<tr><th scope="row">{{p.mine.name}}</th><td>{{cell(p.mine)}}</td><td>{{cell(p.theirs)}}</td></tr>}
        </tbody></table>}@else{<p class="subtle">Oggi non avete esercizi uguali: vi allenate insieme, ognuno con la sua scheda.</p>}
      </section>
    }
    <div class="group-actions">@if(s.draft()){<a class="button primary" routerLink="/sessione"><gt-icon name="weight"/>Vai alla seduta</a>}<button type="button" class="ghost danger" [disabled]="working()" (click)="leave()">{{me()?.host?'Chiudi il gruppo':'Esci dal gruppo'}}</button></div>
  }
}@else{
  <section class="card group-card"><h2>Crea un gruppo</h2><p class="subtle">Parti dal tuo allenamento di oggi: ricevi un codice di 6 cifre, un QR e un link da mandare al tuo amico.</p>
    @if(s.draft();as d){
      <p><strong>{{d.dayName}}</strong> · {{s.workoutExercises(d.id).length}} esercizi</p>
      <button type="button" class="primary" [disabled]="working()" (click)="create()"><gt-icon name="users"/>Crea il gruppo</button>
    }@else if(dayOptions().length){
      <gt-group-day-picker title="Scegli l’allenamento da condividere" [options]="dayOptions()" [value]="dayId()" (valueChange)="dayId.set($event)" [initialDate]="initialDate()"/>
      <button type="button" class="primary" [disabled]="working()||!dayId()" (click)="create()"><gt-icon name="users"/>Inizia e crea il gruppo</button>
    }@else{<p class="subtle">Per creare un gruppo serve una scheda con almeno un esercizio. <a routerLink="/piani">Vai alle schede</a></p>}
  </section>
  <section class="card group-card"><h2>Entra in un gruppo</h2><p class="subtle">Inserisci il codice di 6 cifre che ti mostra il tuo amico.</p>
    <form class="group-join" (ngSubmit)="joinCode()"><input name="group-code" aria-label="Codice del gruppo" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6}" maxlength="6" placeholder="000000" [ngModel]="code()" (ngModelChange)="code.set(digits($event))"/><button class="primary" [disabled]="working()||code().length!==6">Entra</button></form>
  </section>
}`,
  styles: [`
    :host{display:block;padding-bottom:24px}
    .group-back{display:inline-flex;align-items:center;gap:6px;min-height:44px;color:var(--muted);text-decoration:none;font-size:14px}
    .group-card{display:grid;gap:12px;padding:18px;margin-bottom:14px}
    .group-card h2,.group-card h3,.group-card p{margin:0}
    .group-card h2{font-size:19px}.group-card h3{font-size:16px}
    .group-card label{display:grid;gap:6px;font-size:13px}
    .group-card .pill{justify-self:start}
    .group-list{margin:0;padding:0;list-style:none;display:grid;gap:6px}
    .group-list li{display:flex;justify-content:space-between;gap:12px;font-size:14px}
    .group-list small{color:var(--muted);white-space:nowrap}
    .group-actions{display:flex;flex-wrap:wrap;gap:10px;align-items:center}
    .group-actions .button,.group-actions button{display:inline-flex;align-items:center;gap:8px;min-height:44px}
    .group-leave{margin-top:4px}
    .group-invite{justify-items:center;text-align:center}
    .group-code{display:flex;gap:6px;justify-content:center}
    .group-code b{min-width:38px;padding:10px 0;border-radius:10px;background:var(--raised);border:1px solid var(--line);font-size:26px;font-variant-numeric:tabular-nums}
    .group-qr{width:min(220px,70vw);height:auto;border-radius:12px;padding:10px;background:#fff}
    .group-join{display:flex;gap:10px}
    .group-join input{flex:1;min-width:0;font-size:22px;letter-spacing:.3em;text-align:center;font-variant-numeric:tabular-nums}
    .group-member{display:grid;gap:6px;padding:10px 0;border-top:1px solid var(--line)}
    .group-member-top{display:flex;justify-content:space-between;align-items:center;gap:10px}
    .group-bar{height:8px;border-radius:99px;background:var(--raised);overflow:hidden}
    .group-bar i{display:block;height:100%;border-radius:99px;background:var(--accent)}
    .group-table{width:100%;border-collapse:collapse;font-size:13px}
    .group-table th,.group-table td{padding:8px 6px;text-align:left;border-top:1px solid var(--line);vertical-align:top}
    .group-table thead th{border-top:0;color:var(--muted);font-weight:600}
    .group-table tbody th{font-weight:600;overflow-wrap:anywhere}
    .group-table td{white-space:nowrap;font-variant-numeric:tabular-nums}
  `],
})
export class GroupWorkoutComponent implements OnDestroy {
  s = inject(Store);
  group = inject(GroupSessionService);
  private router = inject(Router);
  private confirmation = confirmationForContext();
  private stop = this.group.watch();
  private invite = inject(ActivatedRoute).snapshot.queryParamMap.get('invito') || '';
  private inviteUsed = false;
  session = this.group.session;
  me = this.group.me;
  host = this.group.host;
  working = computed(() => this.group.busy() || this.s.busy() || this.acting());
  private acting = signal(false);
  code = signal('');
  dayId = signal('');
  copied = signal(false);
  canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';
  hostExercises = computed(() => this.host()?.exercises || []);
  draftShared = computed(() => { const draft = this.s.draft(); return draft ? sharedExercises(this.s.workoutExercises(draft.id), this.hostExercises()).length : 0; });
  /** Giorno chiesto dal calendario (`?giorno=`): preselezionato con la sua data come filtro. */
  private requestedDay = inject(ActivatedRoute).snapshot.queryParamMap.get('giorno') || '';
  readonly initialDate = signal('');
  private initialized = false;
  /**
   * Giorni tra cui scegliere (prima il piano attivo), con le date in cui sono programmati: nei programmi
   * a calendario il filtro parte da oggi, poi si cerca per nome, esercizio, scheda, settimana o data.
   */
  dayOptions = computed<GroupDayOption[]>(() => {
    const data = this.s.data(), reference = this.me()?.host === false ? this.hostExercises() : [];
    const plans = data.plans.filter(p => !p.archived && !p.completedAt).sort((a, b) => Number(b.active) - Number(a.active));
    const scheduled = new Map<string, string[]>();
    for (const e of data.scheduledWorkouts) if ((e.kind || 'workout') === 'workout' && e.dayId) scheduled.set(e.dayId, [...(scheduled.get(e.dayId) ?? []), e.date]);
    const out: GroupDayOption[] = [];
    for (const plan of plans) {
      const days = data.days.filter(d => d.planId === plan.id).sort((a, b) => a.order - b.order);
      for (const day of days) {
        const rows = data.planExercises.filter(e => e.dayId === day.id).sort((a, b) => a.order - b.order).map(e => ({ exerciseId: e.exerciseId, name: data.exercises.find(x => x.id === e.exerciseId)?.name || '' }));
        if (!rows.length) continue;
        const dates = [...new Set([...(day.sessionDate ? [day.sessionDate] : []), ...(scheduled.get(day.id) ?? [])])].sort();
        out.push({ id: day.id, label: plans.length > 1 ? plan.name + ' · ' + day.name : day.name, planId: plan.id, planName: plan.name, dayName: day.name, week: day.week, dates, exercises: rows.map(r => r.name), shared: sharedExercises(rows, reference).length, total: rows.length });
      }
    }
    // Con un invito in mano conviene partire dal giorno con più esercizi in comune.
    return reference.length ? out.map((o, i) => ({ o, i })).sort((a, b) => b.o.shared - a.o.shared || a.i - b.i).map(x => x.o) : out;
  });
  comparisons = computed(() => { const mine = this.me()?.exercises || []; return this.group.others().filter(m => m.mode !== '').map(member => ({ member, pairs: sharedExercises(mine, member.exercises) })); });
  link = computed(() => inviteLink(location.origin, this.session()?.inviteToken || ''));
  qr = computed(() => {
    const code = qrcode(0, 'M'); code.addData(this.link()); code.make();
    const count = code.getModuleCount(), margin = 2; let path = '';
    for (let row = 0; row < count; row++) for (let col = 0; col < count; col++) if (code.isDark(row, col)) path += `M${col + margin} ${row + margin}h1v1h-1z`;
    return { size: count + margin * 2, path };
  });

  constructor() {
    effect(() => {
      const options = this.dayOptions();
      untracked(() => {
        if (!this.initialized && options.length) {
          // Dal calendario: quel giorno e la sua data; altrimenti, se c'è una seduta programmata oggi, si parte da lì.
          this.initialized = true;
          const today = localDate(), requested = options.find(o => o.id === this.requestedDay), todays = options.find(o => o.dates.includes(today));
          this.initialDate.set(requested ? (requested.dates.find(d => d >= today) ?? '') : todays ? today : '');
          if (requested ?? todays) this.dayId.set((requested ?? todays)!.id);
        }
        if (!options.some(o => o.id === this.dayId())) this.dayId.set(options[0]?.id || '');
      });
    });
    // Link di invito: appena account e stato sono pronti si entra nel gruppo, una sola volta.
    effect(() => {
      if (!inviteTokenFromUrl('?invito=' + this.invite) || this.inviteUsed || !this.group.available() || !this.group.loaded()) return;
      this.inviteUsed = true;
      untracked(() => void this.useInvite());
    });
  }
  ngOnDestroy() { this.stop(); }
  private async useInvite() {
    const current = this.session();
    if (!current || current.ended || current.inviteToken !== this.invite) await this.group.join({ token: this.invite });
    void this.router.navigate([], { queryParams: {}, replaceUrl: true });
  }
  digits(value: string) { return String(value || '').replace(/\D/g, '').slice(0, 6); }
  repRange(e: GroupExercise) { return e.repsMin === e.repsMax ? String(e.repsMin) : e.repsMin + '–' + e.repsMax; }
  progress(m: GroupMember) { return memberProgress(m); }
  currentName(m: GroupMember) { return m.exercises.find(e => e.exerciseId === m.current)?.name || ''; }
  badge(m: GroupMember) { return m.host ? 'Ha creato il gruppo' : m.mode === 'same' ? 'Stessi esercizi' : m.mode === 'match' ? 'La sua scheda' : 'In arrivo'; }
  cell(e: { done?: number; total?: number; last?: { weight: number; reps: number } }) {
    if (e.total === undefined) return '';
    return `${e.done}/${e.total}` + (e.last ? ` · ${this.s.formatWeight(e.last.weight)} ${this.s.settings().unit}×${e.last.reps}` : '');
  }
  private async run(job: () => Promise<void>) {
    if (this.working()) return;
    this.acting.set(true);
    try { await job(); } finally { this.acting.set(false); }
  }
  /** Apre il giorno scelto se non c'è già una seduta in corso. */
  private async ensureDraft() {
    if (!this.s.draft() && (!this.dayId() || !await this.s.start(this.dayId()))) return undefined;
    return this.s.draft();
  }
  create() { return this.run(async () => { if (await this.ensureDraft()) await this.group.create(); }); }
  joinCode() { return this.run(async () => { if (await this.group.join({ code: this.code() })) this.code.set(''); }); }
  chooseSame() {
    return this.run(async () => {
      const session = this.session(), exercises = this.hostExercises();
      if (!session || !await this.s.startGroupWorkout({ sessionId: session.id, dayName: session.dayName, exercises })) return;
      const draft = this.s.draft();
      if (draft && await this.group.choose('same', draft.id)) await this.router.navigateByUrl('/sessione');
    });
  }
  chooseMatch() {
    return this.run(async () => {
      const draft = await this.ensureDraft();
      if (!draft || !await this.s.alignGroupWorkout(draft.id, this.hostExercises())) return;
      if (await this.group.choose('match', draft.id)) await this.router.navigateByUrl('/sessione');
    });
  }
  async leave() {
    const host = !!this.me()?.host, pending = this.me()?.mode === '';
    if (!pending && !await this.confirmation.ask({ title: host ? 'Chiudere il gruppo?' : 'Uscire dal gruppo?', message: host ? 'Il gruppo si chiude per tutti e codice e link smettono di funzionare. Le sedute di ognuno restano aperte nel proprio archivio.' : 'Gli altri non vedranno più il tuo avanzamento. La tua seduta resta aperta nel tuo archivio.', confirmLabel: host ? 'Chiudi il gruppo' : 'Esci dal gruppo', tone: 'info' })) return;
    await this.run(async () => { await this.group.leave(); });
  }
  private shareText() { return `Allenati con me su GymTrack 💪 Apri il link ed entra nel mio allenamento in gruppo: ${this.link()}\nHai già l’app? Schede → Allenamento in gruppo e inserisci il codice ${this.session()?.code}.`; }
  whatsappUrl() { return 'https://wa.me/?text=' + encodeURIComponent(this.shareText()); }
  async share() { try { await navigator.share({ title: 'Allenamento in gruppo · GymTrack', text: this.shareText() }); } catch { /* condivisione annullata */ } }
  async copy() {
    try { await navigator.clipboard.writeText(this.link()); this.copied.set(true); setTimeout(() => this.copied.set(false), 2500); }
    catch { this.group.error.set('Copia non riuscita: tieni premuto sul QR o usa «Invia su WhatsApp».'); }
  }
}
