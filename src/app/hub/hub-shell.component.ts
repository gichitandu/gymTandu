import { Component, computed, effect, inject, input, signal, untracked, ViewEncapsulation } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { IconComponent } from '../shared/icon.component';
import { AvatarComponent } from '../shared/avatar.component';
import { Store } from '../services/store';
import { HubLaunchMode, HubLaunchService } from './hub-access';
import { HubStore } from './hub-store';
import { HubView } from './hub-view';
import { gymItems } from './hub-calendar';

const TABS = [
  { path: '/hub', label: 'Oggi', icon: 'home' },
  { path: '/hub/calendario', label: 'Calendario', icon: 'calendar' },
  { path: '/hub/spese', label: 'Spese', icon: 'wallet' },
  { path: '/hub/dividi', label: 'Dividi', icon: 'users' },
  { path: '/hub/note', label: 'Note', icon: 'note' },
];

/** Cornice di GT Hub: un'app a sé dentro GymTrack, con barra e selettore app propri. */
@Component({
  selector: 'gt-hub-shell', standalone: true, imports: [RouterLink, IconComponent, AvatarComponent],
  styleUrls: ['./hub.css'], encapsulation: ViewEncapsulation.None,
  template: `<div class="hb" [class.hb-bare]="bare()">
  <div class="hb-mesh" aria-hidden="true"></div>
  <main class="hb-main">
    @if(showTop()){<header class="hb-top">
      <button type="button" class="hb-switch" (click)="switcher.set(true)" aria-haspopup="dialog" aria-label="Cambia app"><span class="hb-mk"><gt-icon name="grid"/></span>GT Hub<gt-icon name="chevron-down"/></button>
      <span class="hb-right"><span class="hb-sync" [attr.data-s]="hub.status()" [attr.title]="hub.syncLabel()" role="status" [attr.aria-label]="hub.syncLabel()"></span>
      <button type="button" class="hb-me" (click)="switcher.set(true)" aria-label="Account e app"><gt-avatar [photo]="gym.profile().photo" [name]="gym.profile().name"/></button></span>
    </header>}
    <ng-content/>
  </main>
  @if(showTabs()){<nav class="hb-tabbar" aria-label="Navigazione GT Hub">
    @for(tab of tabs;track tab.path){<a [routerLink]="tab.path" [class.on]="section()===tab.path" [attr.aria-current]="section()===tab.path?'page':null"><gt-icon [name]="tab.icon"/>{{tab.label}}</a>}
  </nav>}
  @if(switcher()){<div class="hb-dim" (click)="switcher.set(false)"></div>
  <section class="hb-sheet hb-switcher" role="dialog" aria-label="Le tue app">
    <div class="hb-hdl"></div>
    <span class="hb-lab" style="margin-top:4px">Le tue app</span>
    <button type="button" class="hb-li hb-app" (click)="open('/')"><img src="/brand/gt-modern-mark.png" alt=""/><span class="bd"><strong>GymTrack</strong><small>Allenamenti, pasti e progressi</small>
      @if(nextWorkout();as w){<span class="hb-tag p" style="margin-top:6px"><gt-icon name="fire"/>{{w.title}}{{w.time?' alle '+w.time:' oggi'}}</span>}</span><gt-icon name="chevron-right" class="hb-chev"/></button>
    <button type="button" class="hb-li hb-app cur" (click)="switcher.set(false)"><span class="hb-mk lg"><gt-icon name="grid"/></span><span class="bd"><strong>GT Hub</strong><small>Agenda, spese, Dividi e note</small></span><gt-icon name="check" class="hb-chev on"/></button>
    <span class="hb-lab">Dopo l'accesso apri</span>
    <div class="hb-seg" role="radiogroup" aria-label="Dopo l'accesso apri">
      @for(m of modes;track m.id){<button type="button" role="radio" [class.on]="mode()===m.id" [attr.aria-checked]="mode()===m.id" (click)="setMode(m.id)">{{m.label}}</button>}
    </div>
    <p class="hb-sub" style="margin-top:8px">{{modeHelp()}}</p>
    <div class="hb-actions"><a class="hb-btn sm" routerLink="/profilo" (click)="switcher.set(false)"><gt-icon name="settings"/>Impostazioni e account</a></div>
  </section>}
</div>`,
  styles: [`.hb-app{border-radius:18px;padding:12px}.hb-app img,.hb-mk.lg{width:46px;height:46px;border-radius:13px;flex:none}.hb-app.cur{background:rgba(143,124,255,.1);box-shadow:inset 0 0 0 1px rgba(143,124,255,.3)}.hb-chev{width:18px;height:18px;color:var(--hb-m)}.hb-chev.on{color:#b3a6ff}.hb-app .bd strong{font-size:15.5px}`],
})
export class HubShellComponent {
  readonly url = input('/hub');
  readonly hub = inject(HubStore);
  readonly view = inject(HubView);
  readonly gym = inject(Store);
  private launch = inject(HubLaunchService);
  private router = inject(Router);
  readonly tabs = TABS;
  readonly switcher = signal(false);
  readonly path = computed(() => this.url().split(/[?#]/)[0]);
  readonly bare = computed(() => this.path().startsWith('/scegli-app'));
  readonly section = computed(() => { const p = this.path(); return [...TABS].reverse().find(t => p === t.path || p.startsWith(t.path + '/'))?.path ?? '/hub'; });
  readonly showTop = computed(() => !this.bare() && TABS.some(t => t.path === this.path()));
  readonly showTabs = computed(() => !this.bare() && !/^\/hub\/(dividi\/.+|spese\/importa)/.test(this.path()));
  readonly modes: { id: HubLaunchMode; label: string }[] = [{ id: 'ask', label: 'Chiedi' }, { id: 'last', label: 'Ultima usata' }, { id: 'gymtrack', label: 'GymTrack' }];
  readonly mode = computed(() => this.launch.read().mode);
  readonly modeHelp = computed(() => ({ ask: 'Dopo l’accesso scegli ogni volta tra GymTrack e GT Hub.', last: 'Si apre direttamente l’ultima app che hai usato.', gymtrack: 'Si apre sempre GymTrack; il Hub resta qui nel menu.' })[this.mode()]);
  readonly nextWorkout = computed(() => gymItems(this.view.gymData(), this.view.today()).find(i => !i.done));

  constructor() {
    effect(() => { if (!this.bare()) this.launch.remember('hub'); });
    // Il menu delle app si chiude quando cambia pagina (anche con il tasto indietro).
    effect(() => { this.url(); untracked(() => this.switcher.set(false)); });
  }
  setMode(mode: HubLaunchMode) { this.launch.setMode(mode); }
  open(path: string) { this.switcher.set(false); this.launch.remember('gymtrack'); void this.router.navigateByUrl(path); }
}
