import { Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { IconComponent } from '../shared/icon.component';
import { feedbackForContext } from '../services/feedback';
import { HubShareService, InvitePreview } from './hub-share';

/** Pagina aperta dal link di invito: mostra il gruppo e, con un tocco, ci si entra. */
@Component({
  selector: 'gt-hub-invite', standalone: true, imports: [RouterLink, IconComponent],
  template: `<div class="inv">
  @if(loading()){<p class="hb-empty" role="status">Controllo l'invito…</p>}
  @else if(preview();as p){
    <span class="hb-sq lg v"><gt-icon [name]="p.icon"/></span>
    <h1 class="hb-h1">{{p.name}}</h1>
    <p class="hb-sub">{{p.by}} ti ha invitato in questo gruppo di Dividi · {{p.members}} {{p.members===1?'partecipante':'partecipanti'}}.</p>
    @if(error()){<p class="hb-err" role="alert">{{error()}}</p>}
    @if(p.joined){<a class="hb-btn pri" [routerLink]="['/hub/dividi',p.groupId]"><gt-icon name="check"/>Sei già nel gruppo: aprilo</a>}
    @else{<button type="button" class="hb-btn pri" (click)="join()" [disabled]="busy()"><gt-icon name="users"/>{{busy()?'Sto entrando…':'Entra nel gruppo'}}</button>}
    <a class="hb-link" routerLink="/hub/dividi">Non ora</a>
  }@else{
    <span class="hb-sq lg v"><gt-icon name="users"/></span>
    <h1 class="hb-h1">Invito non disponibile</h1>
    <p class="hb-err" role="alert">{{error()}}</p>
    <a class="hb-btn" routerLink="/hub/dividi">Vai a Dividi</a>
  }
</div>`,
  styles: [`.inv{display:grid;gap:14px;justify-items:center;text-align:center;max-width:420px;margin:48px auto 0;padding:0 16px}.inv .hb-btn{width:100%}`],
})
export class HubInviteComponent {
  private share = inject(HubShareService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private feedback = feedbackForContext();
  private params = toSignal(this.route.paramMap);
  private token = computed(() => this.params()?.get('token') ?? '');
  readonly preview = signal<InvitePreview | null>(null);
  readonly loading = signal(true);
  readonly busy = signal(false);
  readonly error = signal('');
  constructor() { void this.load(); }
  private async load() {
    try { this.preview.set(await this.share.preview(this.token())); }
    catch (e) { this.error.set(e instanceof Error ? e.message : 'Invito non valido.'); }
    finally { this.loading.set(false); }
  }
  async join() {
    this.busy.set(true); this.error.set('');
    try {
      const id = await this.share.accept(this.token());
      this.feedback.show('success', 'Sei entrato nel gruppo.');
      await this.router.navigate(['/hub/dividi', id], { replaceUrl: true });
    } catch (e) { this.error.set(e instanceof Error ? e.message : 'Non sono riuscito a farti entrare.'); }
    finally { this.busy.set(false); }
  }
}
