import { Component, computed, DestroyRef, effect, inject, input, output, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { IconComponent } from '../shared/icon.component';
import { feedbackForContext, feedbackSignal } from '../services/feedback';
import { confirmationForContext } from '../services/confirmation';
import { euro, HubGroup, hubId, HubPerson, HUB_PERSON_COLORS, initials, parseEuroInput, hubToday } from './hub-model';
import { Debt } from './hub-split';
import { HUB_ME, HubStore } from './hub-store';
import { HubInviteService, inviteMessage, inviteUrl } from './hub-invites';

export const GROUP_ICONS = ['house', 'users', 'pin', 'car', 'cart', 'coffee', 'ticket', 'weight', 'heart', 'bag'];

/** Testo da condividere (WhatsApp, Messaggi…) con chi deve a chi. */
export function shareSummary(title: string, debts: readonly Debt[], name: (id: string) => string) {
  const lines = debts.length ? debts.map(d => `• ${name(d.from)} → ${name(d.to)}: ${euro(d.amount)} €`) : ['Tutti in pari ✓'];
  return `${title}\n${lines.join('\n')}\n\nDa GymTrack · Dividi`;
}
export async function shareText(text: string, title: string) {
  const nav = navigator as Navigator & { share?: (data: ShareData) => Promise<void> };
  if (nav.share) { try { await nav.share({ title, text }); return 'shared'; } catch (e) { if ((e as Error)?.name === 'AbortError') return 'cancelled'; } }
  try { await navigator.clipboard.writeText(text); return 'copied'; } catch { return 'failed'; }
}

/** Nuovo gruppo o modifica: nome, icona e persone. */
@Component({
  selector: 'gt-hub-group-sheet', standalone: true, imports: [FormsModule, IconComponent],
  template: `<div class="hb-dim" (click)="closed.emit()"></div>
<form class="hb-sheet" role="dialog" aria-label="Gruppo" (ngSubmit)="save()">
  <div class="hb-hdl"></div>
  <div class="hb-shh"><h2>{{group()?'Modifica gruppo':'Nuovo gruppo'}}</h2><button type="button" class="hb-ib" (click)="closed.emit()" aria-label="Chiudi"><gt-icon name="close"/></button></div>
  <label class="hb-field"><input name="name" [(ngModel)]="name" maxlength="60" placeholder="Es. Casa via Roma, Weekend Torino" aria-label="Nome del gruppo"/></label>
  <span class="hb-lab">Icona</span>
  <div class="hb-chips">@for(i of icons;track i){<button type="button" class="ic" [class.on]="icon()===i" (click)="icon.set(i)" [attr.aria-label]="i"><gt-icon [name]="i"/></button>}</div>
  <span class="hb-lab">Persone</span>
  <div class="hb-chips">
    <span class="hb-ch on me"><span class="hb-av" [style.background]="meColor">Tu</span>Tu</span>
    @for(p of others();track p.id){<button type="button" class="hb-ch" [class.on]="members().includes(p.id)" (click)="toggle(p.id)"><span class="hb-av" [style.background]="p.color">{{initials(p.name)}}</span>{{p.name}}</button>}
  </div>
  <div class="add"><label class="hb-field"><input name="newp" [(ngModel)]="newName" maxlength="40" placeholder="Aggiungi una persona" (keydown.enter)="$event.preventDefault();addPerson()" aria-label="Nome della nuova persona"/></label><button type="button" class="hb-btn sm" (click)="addPerson()" [disabled]="!newName.trim()"><gt-icon name="plus"/></button></div>
  <p class="hb-sub" style="font-size:12px;margin-top:8px">Le persone non hanno bisogno di un account: aggiungile per nome oppure invitale con un link. Per avvisarle dei saldi usa “Invia riepilogo”.</p>
  <button type="button" class="hb-btn sm inv" (click)="invite()" [disabled]="inviting()"><gt-icon name="share"/>{{inviteLabel()}}</button>
  @if(token()){<p class="inv-on"><gt-icon name="check"/><span>{{group() ? 'Link attivo: chi lo apre entra nel gruppo.' : 'Link pronto: tocca “Crea gruppo” per salvare il gruppo.'}}</span><button type="button" class="inv-off" (click)="revokeInvite()" [disabled]="inviting()">Disattiva</button></p>}
  @if(error()){<p class="hb-err" role="alert">{{error()}}</p>}
  <div class="hb-actions"><button class="hb-btn pri" type="submit"><gt-icon name="check"/>{{group()?'Salva':'Crea gruppo'}}</button>
    @if(group();as g){<button type="button" class="hb-btn sm danger" (click)="remove(g)"><gt-icon name="trash"/>{{hasActivity()?'Archivia gruppo':'Elimina gruppo'}}</button>}</div>
</form>`,
  styles: [`.ic{display:grid;place-items:center;width:42px;height:42px;border-radius:13px;background:rgba(255,255,255,.05)!important;border:1px solid var(--hb-ln)!important;color:var(--hb-m);cursor:pointer}.ic.on{background:rgba(143,124,255,.18)!important;border-color:rgba(143,124,255,.55)!important;color:var(--hb-v)}.ic gt-icon{width:19px;height:19px}
.hb-ch .hb-av{width:24px;height:24px;font-size:9.5px;box-shadow:none;margin-left:-6px}.me{cursor:default}
.add{display:flex;gap:8px;margin-top:10px}.add .hb-field{flex:1}.add .hb-btn{width:52px}
.inv{width:100%;margin-top:12px;gap:8px}
.inv-on{display:flex;align-items:center;gap:8px;margin:8px 2px 0;font-size:12.5px;line-height:1.35;color:var(--hb-m)}.inv-on>gt-icon{flex:none;width:15px;height:15px;color:var(--hb-g)}.inv-on span{flex:1;min-width:0}
.inv-off{flex:none;min-height:32px;padding:0 6px;color:var(--hb-r);font-size:12.5px;font-weight:650;cursor:pointer}`],
})
export class HubGroupSheetComponent {
  readonly group = input<HubGroup | null>(null);
  readonly closed = output<void>();
  readonly saved = output<string>();
  private hub = inject(HubStore);
  private feedback = feedbackForContext();
  private confirm = confirmationForContext();
  readonly error = feedbackSignal('error', this.feedback);
  readonly icons = GROUP_ICONS; readonly initials = initials; readonly meColor = 'linear-gradient(140deg,#F39AC7,#8ABDFB)';
  name = ''; newName = '';
  readonly icon = signal('house');
  readonly members = signal<string[]>([]);
  /** Persone scritte qui ma non ancora salvate: entrano nell'archivio solo con “Crea gruppo”/“Salva”. */
  private readonly draftPeople = signal<HubPerson[]>([]);
  readonly others = computed(() => [...this.hub.people().filter(p => p.id !== HUB_ME), ...this.draftPeople()]);
  private invites = inject(HubInviteService);
  readonly inviting = signal(false);
  /** Gruppo nuovo: id riservato e link già creato, salvati solo premendo “Crea gruppo”. */
  private readonly draftId = hubId();
  private readonly draftToken = signal('');
  private created = false;
  readonly token = computed(() => this.group()?.invite ?? this.draftToken());
  readonly inviteLabel = computed(() => this.inviting() ? 'Preparazione del link…' : this.token() ? 'Condividi link d’invito' : 'Invita con un link');
  readonly hasActivity = computed(() => { const g = this.group(); return !!g && (this.hub.expenses().some(e => e.groupId === g.id) || this.hub.settlements().some(s => s.groupId === g.id)); });
  constructor() {
    effect(() => { const g = this.group(); untracked(() => { if (g) { this.name = g.name; this.icon.set(g.icon); this.members.set(g.members.filter(m => m !== HUB_ME)); } }); });
    // Foglio chiuso senza creare il gruppo: il link preparato per lui viene disattivato.
    inject(DestroyRef).onDestroy(() => { const token = this.draftToken(); if (token && !this.created) void this.invites.discard(token); });
  }
  toggle(id: string) {
    const g = this.group();
    if (g && this.members().includes(id) && this.hub.expenses().some(e => e.groupId === g.id && (e.paidBy === id || (e.parts[id] ?? 0) > 0))) { this.error.set('Questa persona ha spese nel gruppo: non può essere tolta.'); return; }
    this.members.update(list => list.includes(id) ? list.filter(x => x !== id) : [...list, id]);
  }
  addPerson() {
    const name = this.newName.trim(); if (!name) return;
    const existing = this.others().find(p => p.name.toLowerCase() === name.toLowerCase());
    const id = existing?.id ?? hubId();
    if (!existing) this.draftPeople.update(l => [...l, { id, updatedAt: 0, name, color: HUB_PERSON_COLORS[this.others().length % HUB_PERSON_COLORS.length] }]);
    if (!this.members().includes(id)) this.members.update(l => [...l, id]);
    this.newName = '';
  }
  save() {
    this.error.set('');
    const g = this.write(!!this.token()); if (!g) return;
    this.created = true;
    this.saved.emit(g.id); this.closed.emit();
  }
  /** Salva nome, icona e persone. Con un link d'invito il gruppo può partire anche solo con te. */
  private write(viaLink: boolean): HubGroup | null {
    const name = this.name.trim();
    if (!name) { this.error.set('Dai un nome al gruppo.'); return null; }
    if (!this.members().length && !viaLink) { this.error.set('Aggiungi almeno una persona oltre a te, oppure invitala con un link.'); return null; }
    const g = this.group(), id = g?.id ?? this.draftId;
    // I membri entrati dal link mentre il foglio era aperto restano nel gruppo.
    const current = this.hub.groups().find(x => x.id === id);
    const joined = (current?.members ?? []).filter(m => m !== HUB_ME && !(g?.members ?? []).includes(m));
    const members = [HUB_ME, ...new Set([...this.members(), ...joined])];
    const invite = current?.invite ?? g?.invite ?? (this.draftToken() || undefined);
    const next: HubGroup = { id, updatedAt: current?.updatedAt ?? g?.updatedAt ?? 0, name, icon: this.icon(), members, archived: g?.archived, ...(invite ? { invite } : {}) };
    const newPeople = this.draftPeople().filter(p => members.includes(p.id));
    if (newPeople.length) this.hub.upsert('people', ...newPeople);
    this.draftPeople.set([]);
    this.hub.upsert('groups', next);
    return this.hub.groups().find(x => x.id === id) ?? next;
  }
  /** Crea (se serve) il link d'invito e apre la condivisione. Non salva il gruppo: per quello c'è “Crea gruppo”/“Salva”. */
  async invite() {
    if (this.inviting()) return;
    this.error.set('');
    const stored = this.group();
    const name = this.name.trim() || stored?.name || '';
    if (!name) { this.error.set('Dai un nome al gruppo prima di invitare.'); return; }
    this.inviting.set(true);
    try {
      let token = this.token();
      if (!token || stored) {
        const draft: HubGroup = stored ?? { id: this.draftId, updatedAt: 0, name, icon: this.icon(), members: [HUB_ME, ...this.members()], invite: this.draftToken() || undefined };
        token = await this.invites.sync(draft, true, !!stored);
        if (!stored) this.draftToken.set(token);
      }
      const result = await shareText(inviteMessage(name, inviteUrl(token)), 'Invito al gruppo');
      if (result === 'copied') this.feedback.show('success', 'Link d’invito copiato: incollalo in un messaggio.');
      else if (result === 'failed') this.error.set('Link pronto, ma la condivisione non è riuscita. Riprova da “Condividi link d’invito”.');
    } catch (e) {
      this.error.set(e instanceof Error ? e.message : 'Link d’invito non creato. Riprova.');
    } finally { this.inviting.set(false); }
  }
  async revokeInvite() {
    if (!this.token() || this.inviting()) return;
    if (!await this.confirm.ask({ title: 'Disattivare il link?', message: 'Chi ha già il link non potrà più entrare nel gruppo. Le persone già aggiunte restano.', confirmLabel: 'Disattiva', tone: 'danger' })) return;
    this.inviting.set(true); this.error.set('');
    try {
      const g = this.group();
      await this.invites.revoke(g ?? { id: this.draftId, updatedAt: 0, name: '', icon: '', members: [], invite: this.draftToken() });
      if (!g) this.draftToken.set('');
      this.feedback.show('success', 'Link d’invito disattivato.');
    }
    catch (e) { this.error.set(e instanceof Error ? e.message : 'Link non disattivato. Riprova.'); }
    finally { this.inviting.set(false); }
  }
  async remove(g: HubGroup) {
    const archive = this.hasActivity();
    if (!await this.confirm.ask({ title: archive ? 'Archiviare il gruppo?' : 'Eliminare il gruppo?', message: archive ? 'Spese e saldi restano conservati; il gruppo non compare più tra quelli attivi.' : `“${g.name}” verrà eliminato.`, confirmLabel: archive ? 'Archivia' : 'Elimina', tone: 'danger' })) return;
    // Un gruppo archiviato o eliminato non accetta più persone dal link.
    if (g.invite) void this.invites.discard(g.invite);
    const { invite: _link, ...rest } = g;
    if (archive) this.hub.upsert('groups', { ...rest, archived: true }); else this.hub.remove('groups', g.id);
    this.closed.emit();
  }
}

/** Registra un pagamento tra due persone (salda un debito). */
@Component({
  selector: 'gt-hub-settle-sheet', standalone: true, imports: [FormsModule, IconComponent],
  template: `<div class="hb-dim" (click)="closed.emit()"></div>
<section class="hb-sheet" role="dialog" aria-label="Salda">
  <div class="hb-hdl"></div>
  <div class="hb-shh"><h2>Salda</h2><button type="button" class="hb-ib" (click)="closed.emit()" aria-label="Chiudi"><gt-icon name="close"/></button></div>
  @if(!debts().length){<div class="hb-empty"><span class="hb-sq lg g"><gt-icon name="check"/></span><strong>Tutti in pari</strong>Non ci sono debiti da saldare.</div>}
  @for(d of debts();track $index){<div class="hb-c row">
    <span class="flow"><span class="hb-av" [style.background]="color(d.from)">{{ini(d.from)}}</span><gt-icon name="arrow"/><span class="hb-av" [style.background]="color(d.to)">{{ini(d.to)}}</span></span>
    <span class="bd"><strong>{{label(d)}}</strong><small>{{groupName(d.groupId)}}</small></span>
    <input inputmode="decimal" [ngModel]="amountText(d)" (ngModelChange)="setAmount(d,$event)" [attr.aria-label]="'Importo pagato da '+name(d.from)"/>
    <button type="button" class="hb-btn sm mark" (click)="settle(d)">Pagato</button></div>}
  <p class="hb-sub" style="font-size:12px;margin-top:10px">Registra solo il pagamento: GymTrack non sposta soldi.</p>
</section>`,
  styles: [`.row{display:flex;align-items:center;gap:10px;padding:12px;margin-top:8px}.flow{display:flex;align-items:center;gap:4px}.flow gt-icon{width:14px;height:14px;color:var(--hb-f)}.flow .hb-av{width:30px;height:30px;font-size:11px}
.bd{flex:1;min-width:0}.bd strong{display:block;font-size:13.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.bd small{display:block;font-size:11.5px;color:var(--hb-m)}
.row input{width:76px;height:36px;padding:0 8px;border-radius:10px;border:1px solid var(--hb-ln);background:rgba(255,255,255,.06);text-align:right;font-size:14px}
.mark{width:auto;min-height:36px;padding:0 12px;font-size:12.5px;background:rgba(79,209,165,.14)!important;color:var(--hb-g);border-color:rgba(79,209,165,.3)!important}`],
})
export class HubSettleSheetComponent {
  readonly debts = input<(Debt & { groupId: string })[]>([]);
  readonly closed = output<void>();
  private hub = inject(HubStore);
  private feedback = feedbackForContext();
  private amounts = new Map<string, number>();
  private key(d: Debt & { groupId: string }) { return `${d.groupId}|${d.from}|${d.to}`; }
  name(id: string) { return this.hub.personName(id); }
  ini(id: string) { return id === HUB_ME ? 'Tu' : initials(this.name(id)); }
  color(id: string) { return this.hub.person(id)?.color ?? '#8a8a9a'; }
  groupName(id: string) { return this.hub.groups().find(g => g.id === id)?.name ?? ''; }
  label(d: Debt) { return d.to === HUB_ME ? `${this.name(d.from)} ti deve ${euro(d.amount)} €` : d.from === HUB_ME ? `Devi ${euro(d.amount)} € a ${this.name(d.to)}` : `${this.name(d.from)} deve ${euro(d.amount)} € a ${this.name(d.to)}`; }
  amountText(d: Debt & { groupId: string }) { return euro(this.amounts.get(this.key(d)) ?? d.amount); }
  setAmount(d: Debt & { groupId: string }, text: string) { const v = parseEuroInput(text); if (v && v > 0) this.amounts.set(this.key(d), Math.min(v, d.amount)); }
  settle(d: Debt & { groupId: string }) {
    const amount = this.amounts.get(this.key(d)) ?? d.amount;
    this.hub.upsert('settlements', { id: hubId(), updatedAt: 0, groupId: d.groupId, from: d.from, to: d.to, amount, date: hubToday() });
    this.feedback.show('success', `Pagamento di ${euro(amount)} € registrato.`);
    if (this.debts().length <= 1) this.closed.emit();
  }
}
