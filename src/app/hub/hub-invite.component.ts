import { Component, effect, input, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { IconComponent } from '../shared/icon.component';
import { HubInviteGroup, inviteApi } from './hub-invites';

const JOINED_KEY = 'gymtrack-hub-invite-joined:';

/** Pagina aperta dal link d'invito di Dividi: chi la riceve scrive il nome ed entra nel gruppo, senza account. */
@Component({
  selector: 'gt-hub-invite', standalone: true, imports: [FormsModule, IconComponent],
  template: `<main class="inv-page">
<section class="inv-card" aria-live="polite">
  <div class="inv-brand"><img src="/brand/gt-modern-mark.png" alt=""/><span>GymTrack · Dividi</span></div>
  @if(loading()){<p class="inv-status" role="status">Apertura dell’invito…</p>}
  @else if(group(); as g){
    <span class="inv-icon"><gt-icon [name]="g.icon"/></span>
    <p class="inv-eyebrow">Invito al gruppo</p>
    <h1>{{g.name}}</h1>
    @if(g.members.length){<p class="inv-members">{{g.members.join(' · ')}}</p>}
    @if(joined(); as who){
      <div class="inv-done" role="status"><gt-icon name="check"/><div><strong>Ci sei, {{who}}!</strong><span>Chi ti ha invitato ti vedrà nel gruppo e potrà dividere le spese con te, mandandoti i riepiloghi dei saldi.</span></div></div>
    } @else {
      <form (ngSubmit)="join()">
        <label class="inv-label" for="inv-name">Il tuo nome</label>
        <div class="inv-field"><input id="inv-name" name="name" [(ngModel)]="name" maxlength="40" autocomplete="given-name" placeholder="Es. Giulia" required/></div>
        @if(error()){<p class="inv-err" role="alert">{{error()}}</p>}
        <button class="inv-btn" type="submit" [disabled]="busy()||!name.trim()"><gt-icon name="check"/>{{busy()?'Invio…':'Entra nel gruppo'}}</button>
      </form>
      <p class="inv-note">Non serve un account: il tuo nome viene aggiunto alle persone del gruppo.</p>
    }
  } @else {
    <span class="inv-icon off"><gt-icon name="close"/></span>
    <h1>Invito non disponibile</h1>
    <p class="inv-note">{{error() || 'Questo link d’invito non è più attivo.'}} Chiedi un nuovo link a chi ti ha invitato.</p>
    @if(retry()){<button class="inv-btn" type="button" (click)="load()">Riprova</button>}
  }
  <a class="inv-home" href="#/">Apri GymTrack</a>
</section>
</main>`,
  styles: [`:host{display:block}
.inv-page{min-height:100dvh;display:grid;place-items:center;padding:calc(env(safe-area-inset-top,0px) + 24px) 16px calc(env(safe-area-inset-bottom,0px) + 24px);background:var(--bg,#09090d);color:var(--text,#f2f2f7)}
.inv-card{width:100%;max-width:420px;padding:26px 22px;border-radius:28px;background:var(--card,#16161d);border:1px solid var(--line,rgba(255,255,255,.08));box-shadow:0 24px 60px rgba(0,0,0,.25);text-align:center}
.inv-brand{display:flex;align-items:center;justify-content:center;gap:8px;font-size:13px;font-weight:650;color:var(--muted,#9a9aab)}.inv-brand img{width:26px;height:26px;border-radius:8px}
.inv-icon{display:grid;place-items:center;width:58px;height:58px;margin:22px auto 12px;border-radius:19px;background:color-mix(in srgb,#8f7cff 18%,transparent);color:#8f7cff}.inv-icon gt-icon{width:26px;height:26px}.inv-icon.off{background:color-mix(in srgb,#ff6b81 16%,transparent);color:#ff6b81}
.inv-eyebrow{margin:0;font-size:13px;color:var(--muted,#9a9aab)}
h1{margin:4px 0 0;font-size:26px;font-weight:700;letter-spacing:-.03em;line-height:1.15;overflow-wrap:anywhere}
.inv-members{margin:8px 0 0;font-size:13.5px;color:var(--muted,#9a9aab);overflow-wrap:anywhere}
form{margin-top:22px;text-align:left}
.inv-label{display:block;margin:0 2px 8px;font-size:11.5px;font-weight:700;letter-spacing:1.1px;text-transform:uppercase;color:var(--muted,#9a9aab)}
.inv-field{display:flex;align-items:center;min-height:52px;padding:0 14px;border-radius:16px;border:1px solid var(--line,rgba(255,255,255,.1));background:color-mix(in srgb,var(--text,#fff) 5%,transparent)}
.inv-field:focus-within{border-color:rgba(143,124,255,.6);box-shadow:0 0 0 3px rgba(143,124,255,.15)}
.inv-field input{flex:1;min-width:0;width:100%;min-height:48px;margin:0;padding:0;border:0;border-radius:0;outline:0;box-shadow:none;background:none;color:inherit;font:inherit;font-size:16px;font-weight:600}
.inv-field input:focus,.inv-field input:focus-visible{outline:0;box-shadow:none;border:0}
.inv-btn{display:flex;align-items:center;justify-content:center;gap:8px;width:100%;min-height:52px;margin-top:14px;border:0;border-radius:999px;background:var(--text,#f2f2f7);color:var(--bg,#09090d);font:inherit;font-size:16px;font-weight:700;cursor:pointer}.inv-btn:disabled{opacity:.5;cursor:default}.inv-btn gt-icon{width:18px;height:18px}
.inv-err{margin:10px 2px 0;font-size:13px;color:#ff6b81}
.inv-note{margin:14px 0 0;font-size:12.5px;line-height:1.45;color:var(--muted,#9a9aab)}
.inv-status{margin:28px 0 8px;color:var(--muted,#9a9aab)}
.inv-done{display:flex;gap:12px;align-items:flex-start;margin-top:22px;padding:14px;border-radius:18px;text-align:left;background:color-mix(in srgb,#4fd1a5 14%,transparent);border:1px solid color-mix(in srgb,#4fd1a5 32%,transparent)}.inv-done gt-icon{flex:none;width:22px;height:22px;color:#4fd1a5}.inv-done strong{display:block;font-size:15px}.inv-done span{display:block;margin-top:3px;font-size:13px;line-height:1.45;color:var(--muted,#9a9aab)}
.inv-home{display:inline-block;margin-top:20px;font-size:13px;font-weight:600;color:var(--muted,#9a9aab);text-decoration:underline}`],
})
export class HubInviteComponent {
  readonly token = input.required<string>();
  readonly group = signal<HubInviteGroup | null>(null);
  readonly loading = signal(true);
  readonly busy = signal(false);
  readonly error = signal('');
  readonly retry = signal(false);
  readonly joined = signal('');
  name = '';
  constructor() { effect(() => { this.token(); untracked(() => void this.load()); }); }
  async load() {
    const token = this.token();
    this.loading.set(true); this.error.set(''); this.retry.set(false);
    try { this.joined.set(localStorage.getItem(JOINED_KEY + token) ?? ''); } catch { this.joined.set(''); }
    try { this.group.set((await inviteApi.read(token)).group); }
    catch (e) {
      this.group.set(null);
      const status = (e as { status?: number })?.status ?? 0;
      this.error.set(status === 404 ? '' : e instanceof Error ? e.message : 'Invito non disponibile.');
      this.retry.set(status !== 404);
    } finally { if (this.token() === token) this.loading.set(false); }
  }
  async join() {
    const name = this.name.trim(); if (!name || this.busy()) return;
    this.busy.set(true); this.error.set('');
    try {
      const result = await inviteApi.join(this.token(), name);
      this.group.set(result.group); this.joined.set(result.name);
      try { localStorage.setItem(JOINED_KEY + this.token(), result.name); } catch { /* facoltativo */ }
    } catch (e) { this.error.set(e instanceof Error ? e.message : 'Non è stato possibile entrare nel gruppo. Riprova.'); }
    finally { this.busy.set(false); }
  }
}
