import { Component, computed, effect, inject, input, signal, untracked, ViewEncapsulation } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { IconComponent } from '../shared/icon.component';
import { AvatarComponent } from '../shared/avatar.component';
import { Store } from '../services/store';
import { PwaService } from '../services/pwa';
import { AppUpdatesComponent } from '../shared/app-updates.component';
import { AppSwitcherService, HubLaunchMode, HubLaunchService } from './hub-access';
import { HubStore } from './hub-store';
import { HubView } from './hub-view';
import { gymItems } from './hub-calendar';

const HUB_TABS = [
  { path: '/hub', label: 'Oggi', icon: 'home' },
  { path: '/hub/calendario', label: 'Calendario', icon: 'calendar' },
  { path: '/hub/spese', label: 'Spese', icon: 'wallet' },
  { path: '/hub/dividi', label: 'Dividi', icon: 'users' },
  { path: '/hub/note', label: 'Note', icon: 'note' },
];
const AUTO_TABS = [
  { path: '/auto', label: 'Garage', icon: 'car' },
  { path: '/auto/movimenti', label: 'Movimenti', icon: 'fuel' },
  { path: '/auto/statistiche', label: 'Statistiche', icon: 'chart' },
];

/** Cornice di GT Hub e GT Garage: app a sé dentro GymTrack, con barra e selettore app propri. */
@Component({
  selector: 'gt-hub-shell', standalone: true, imports: [RouterLink, IconComponent, AvatarComponent, AppUpdatesComponent],
  styleUrls: ['./hub.css'], encapsulation: ViewEncapsulation.None,
  template: `<div class="hb" [class.hb-bare]="bare()" [class.hb-auto]="app()==='auto'">
  <div class="hb-mesh" aria-hidden="true"></div>
  <main class="hb-main">
    @if(showTop()){<header class="hb-top">
      <button type="button" class="hb-switch" (click)="switcher.set(true)" aria-haspopup="dialog" aria-label="Cambia app"><img class="hb-mk" [src]="app()==='auto'?'/brand/gt-garage-mark.svg':'/brand/gt-hub-mark.svg'" alt=""/>{{app()==='auto'?'GT Garage':'GT Hub'}}<gt-icon name="chevron-down"/></button>
      <span class="hb-right"><span class="hb-sync" [attr.data-s]="hub.status()" [attr.title]="hub.syncLabel()" role="status" [attr.aria-label]="hub.syncLabel()"></span>
      <button type="button" class="hb-me" (click)="switcher.set(true)" aria-label="Account e app"><gt-avatar [photo]="gym.profile().photo" [name]="gym.profile().name"/></button></span>
    </header>}
    @if(!bare()&&(pwa.updateReady()||pwa.releases.updateReady())){<aside class="hb-c hb-update" role="status"><span class="hb-sq v"><gt-icon name="download"/></span><span class="bd"><strong>Aggiornamento pronto</strong><small>I dati di GymTrack, Hub e Garage restano conservati.</small></span><button type="button" class="hb-btn sm pri" (click)="pwa.reload()" [disabled]="pwa.updating()">{{pwa.updating()?'Aggiornamento…':'Aggiorna ora'}}</button></aside>}
    <ng-content/>
  </main>
  @if(showTabs()){<nav class="hb-tabbar" [attr.aria-label]="app()==='auto'?'Navigazione GT Garage':'Navigazione GT Hub'" [style.grid-template-columns]="'repeat('+tabs().length+',1fr)'">
    @for(tab of tabs();track tab.path){<a [routerLink]="tab.path" [class.on]="section()===tab.path" [attr.aria-current]="section()===tab.path?'page':null"><gt-icon [name]="tab.icon"/>{{tab.label}}</a>}
  </nav>}
  @if(switcher()){<div class="hb-dim" (click)="switcher.set(false)"></div>
  <section class="hb-sheet hb-switcher" role="dialog" aria-label="Le tue app">
    <div class="hb-hdl"></div>
    <span class="hb-lab" style="margin-top:4px">Le tue app</span>
    <button type="button" class="hb-li hb-app" (click)="open('/')"><img src="/brand/gt-modern-mark.png" alt=""/><span class="bd"><strong>GymTrack</strong><small>Allenamenti, pasti e progressi</small>
      @if(nextWorkout();as w){<span class="hb-tag p" style="margin-top:6px"><gt-icon name="fire"/>{{w.title}}{{w.time?' alle '+w.time:' oggi'}}</span>}</span><gt-icon name="chevron-right" class="hb-chev"/></button>
    @if(access.allowed('hub')){<button type="button" class="hb-li hb-app" [class.cur]="app()==='hub'" (click)="app()==='hub'?switcher.set(false):open('/hub')"><img class="hb-mk lg" src="/brand/gt-hub-mark.svg" alt=""/><span class="bd"><strong>GT Hub</strong><small>Agenda, spese, Dividi e note</small></span><gt-icon [name]="app()==='hub'?'check':'chevron-right'" class="hb-chev" [class.on]="app()==='hub'"/></button>}
    @if(access.allowed('auto')){<button type="button" class="hb-li hb-app" [class.cur]="app()==='auto'" (click)="app()==='auto'?switcher.set(false):open('/auto')"><img class="hb-mk lg" src="/brand/gt-garage-mark.svg" alt=""/><span class="bd"><strong>GT Garage</strong><small>La tua auto, carburante e costi</small></span><gt-icon [name]="app()==='auto'?'check':'chevron-right'" class="hb-chev" [class.on]="app()==='auto'"/></button>}
    <span class="hb-lab">Dopo l'accesso apri</span>
    <div class="hb-seg" role="radiogroup" aria-label="Dopo l'accesso apri">
      @for(m of modes;track m.id){<button type="button" role="radio" [class.on]="mode()===m.id" [attr.aria-checked]="mode()===m.id" (click)="setMode(m.id)">{{m.label}}</button>}
    </div>
    <p class="hb-sub" style="margin-top:8px">{{modeHelp()}}</p>
    <details class="hb-upd"><summary><gt-icon name="download"/><span><strong>Aggiornamenti dell’app</strong><small>Versione installata e disponibilità</small></span><gt-icon name="chevron-down" class="hb-chev"/></summary><gt-app-updates/></details>
    <div class="hb-actions"><a class="hb-btn sm" routerLink="/profilo" (click)="switcher.set(false)"><gt-icon name="settings"/>Impostazioni e account</a></div>
  </section>}
</div>`,
  styles: [`.hb-update{display:flex;align-items:center;gap:12px;margin:0 0 14px;padding:12px 14px}.hb-update .bd{flex:1;min-width:0}.hb-update strong{display:block;font-size:14px}.hb-update small{display:block;font-size:12px;color:var(--hb-m);line-height:1.4}.hb-update .hb-btn{flex:none}
.hb-upd{margin-top:16px;border-radius:18px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.1);--muted:var(--hb-m);--line:rgba(255,255,255,.12);--text:var(--hb-t)}.hb-upd summary{display:flex;align-items:center;gap:12px;padding:12px 14px;cursor:pointer;list-style:none}.hb-upd summary::-webkit-details-marker{display:none}.hb-upd summary>span{flex:1;min-width:0}.hb-upd summary strong{display:block;font-size:14.5px}.hb-upd summary small{display:block;font-size:12px;color:var(--hb-m)}.hb-upd[open] summary .hb-chev{transform:rotate(180deg)}.hb-upd .app-updates{margin:0;padding:0 14px 14px;background:none;border:0;box-shadow:none;color:var(--hb-t)}.hb-upd .app-updates h3{display:none}
.hb-app{border-radius:18px;padding:12px}.hb-app img,.hb-mk.lg{width:46px;height:46px;border-radius:13px;flex:none}.hb-app.cur{background:rgba(143,124,255,.1);box-shadow:inset 0 0 0 1px rgba(143,124,255,.3)}.hb-chev{width:18px;height:18px;color:var(--hb-m)}.hb-chev.on{color:#b3a6ff}.hb-app .bd strong{font-size:15.5px}`],
})
export class HubShellComponent {
  readonly url = input('/hub');
  readonly hub = inject(HubStore);
  readonly view = inject(HubView);
  readonly gym = inject(Store);
  private launch = inject(HubLaunchService);
  private router = inject(Router);
  readonly access = inject(AppSwitcherService);
  readonly pwa = inject(PwaService);
  readonly switcher = signal(false);
  readonly path = computed(() => this.url().split(/[?#]/)[0]);
  readonly bare = computed(() => this.path().startsWith('/scegli-app'));
  readonly app = computed<'hub' | 'auto'>(() => /^\/auto(?=$|\/)/.test(this.path()) ? 'auto' : 'hub');
  readonly tabs = computed(() => this.app() === 'auto' ? AUTO_TABS : HUB_TABS);
  readonly section = computed(() => { const p = this.path(), tabs = this.tabs(); return [...tabs].reverse().find(t => p === t.path || p.startsWith(t.path + '/'))?.path ?? tabs[0].path; });
  readonly showTop = computed(() => !this.bare() && this.tabs().some(t => t.path === this.path()));
  readonly showTabs = computed(() => !this.bare() && !/^\/hub\/(dividi\/.+|spese\/importa)/.test(this.path()));
  readonly modes: { id: HubLaunchMode; label: string }[] = [{ id: 'ask', label: 'Chiedi' }, { id: 'last', label: 'Ultima usata' }, { id: 'gymtrack', label: 'GymTrack' }];
  readonly mode = computed(() => this.launch.read().mode);
  readonly modeHelp = computed(() => ({ ask: 'Dopo l’accesso scegli ogni volta quale app aprire.', last: 'Si apre direttamente l’ultima app che hai usato.', gymtrack: 'Si apre sempre GymTrack; le altre app restano qui nel menu.' })[this.mode()]);
  readonly nextWorkout = computed(() => gymItems(this.view.gymData(), this.view.today()).find(i => !i.done));

  constructor() {
    effect(() => { if (!this.bare()) this.launch.remember(this.app()); });
    // Il menu delle app si chiude quando cambia pagina (anche con il tasto indietro).
    effect(() => { this.url(); untracked(() => this.switcher.set(false)); });
  }
  setMode(mode: HubLaunchMode) { this.launch.setMode(mode); }
  open(path: string) { this.switcher.set(false); if (path === '/') this.launch.remember('gymtrack'); void this.router.navigateByUrl(path); }
}
