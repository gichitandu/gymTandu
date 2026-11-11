import { Component, computed, inject } from '@angular/core';
import { Router } from '@angular/router';
import { IconComponent } from '../shared/icon.component';
import { ExerciseThumbComponent } from '../shared/exercise-thumb.component';
import { Store } from '../services/store';
import { AuthService } from '../services/auth';
import { Exercise, localDate } from '../models/domain';
import { HubLaunchService } from './hub-access';
import { HubView } from './hub-view';
import { HubStore } from './hub-store';
import { dayItems, gymItems, upcoming } from './hub-calendar';
import { euro, shortDay } from './hub-model';
import { GarageView, num } from '../garage/garage-view';

/** Dopo l'accesso (solo Super Admin): scegli tra GymTrack, GT Hub e GT Garage. */
@Component({
  selector: 'gt-app-chooser', standalone: true, imports: [IconComponent, ExerciseThumbComponent],
  template: `<div class="glow" aria-hidden="true"></div>
<main class="wrap">
  <div class="xtop"><span class="brand"><img src="/brand/gt-modern-mark.png" alt=""/>GymTrack</span><span class="me">{{initial()}}</span></div>
  <h1 class="x"><span>Bentornato</span><span>{{firstName()}},</span><span class="g">dove vuoi andare?</span></h1>
  <div class="apps">
    <button type="button" class="app a-gt" (click)="go('gymtrack')">
      <span class="ah"><img src="/brand/gt-modern-mark.png" alt=""/><span class="t"><b>GymTrack</b><small>Allenamenti, pasti e progressi</small></span><span class="open"><gt-icon name="arrow"/></span></span>
      <span class="wd">
        <span class="ring" [style.--p]="weekPct()"><b>{{weekCount()}}@if(goal()){<small>/{{goal()}}</small>}</b></span>
        <span class="tx">@if(workout();as w){<em>Oggi{{w.time?' · '+w.time:''}}</em><strong>{{w.title}}</strong><small>{{w.done?'Completato':'Allenamento in programma'}}</small>}@else{<em>Oggi</em><strong>Nessuna seduta</strong><small>Apri il calendario o una scheda</small>}</span>
        @if(thumbs().length){<span class="strip">@for(e of thumbs();track e.id){<gt-exercise-thumb [exercise]="e"/>}</span>}
      </span>
    </button>
    <button type="button" class="app a-hub" (click)="go('hub')">
      <span class="ah"><span class="mk"><gt-icon name="grid"/></span><span class="t"><b>GT Hub <i class="adm"><gt-icon name="lock"/>admin</i></b><small>Agenda, spese e Dividi</small></span><span class="open"><gt-icon name="arrow"/></span></span>
      <span class="stats">
        <span><small><gt-icon name="clock"/>Prossimo</small><b>{{next()?.time||'—'}}</b><em>{{next()?.title||'Nessun impegno'}}</em></span>
        <span><small><gt-icon name="wallet"/>Oggi</small><b>{{budgetLabel()}}</b><em>{{budgetNote()}}</em></span>
        <span><small><gt-icon name="users"/>Dividi</small><b [class.pos]="view.position().net>0" [class.neg]="view.position().net<0">{{short(view.position().net,true)}} €</b><em>{{view.position().net>0?'ti devono':view.position().net<0?'devi':'in pari'}}</em></span>
      </span>
    </button>
    <button type="button" class="app a-car" (click)="go('auto')">
      <span class="ah"><span class="mk car"><gt-icon name="car"/></span><span class="t"><b>GT Garage <i class="adm"><gt-icon name="lock"/>admin</i></b><small>{{garage.car()?.name||'La tua auto, carburante e costi'}}</small></span><span class="open"><gt-icon name="arrow"/></span></span>
      <span class="stats">
        <span><small><gt-icon name="fuel"/>Livello</small><b>{{garage.status().fuelPct!==null?garage.status().fuelPct+' %':'—'}}</b><em>stimato</em></span>
        <span><small><gt-icon name="road"/>Residui</small><b>{{garage.status().rangeKm!==null?n(garage.status().rangeKm!)+' km':'—'}}</b><em>stimati</em></span>
        <span><small><gt-icon name="wallet"/>Mese</small><b>{{short(garage.totals().byType.fuel)}} €</b><em>carburante</em></span>
      </span>
    </button>
  </div>
  <div class="rem"><span><strong>Apri subito l'ultima app usata</strong><small>Salti questa scelta. Cambi app dal logo in alto.</small></span>
    <button type="button" class="tog" role="switch" [attr.aria-checked]="launch.read().mode==='last'" (click)="toggleLast()" aria-label="Apri subito l'ultima app usata"></button></div>
</main>`,
  styles: [`:host{position:fixed;inset:0;z-index:40;overflow-y:auto;background:var(--bg);color:var(--text);isolation:isolate;font-family:Inter,ui-sans-serif,-apple-system,sans-serif}
.glow{position:fixed;inset:-10%;z-index:-1;background:radial-gradient(closest-side at 82% 6%,color-mix(in srgb,var(--accent) 22%,transparent),transparent),radial-gradient(closest-side at 4% 42%,color-mix(in srgb,var(--theme-secondary,var(--accent)) 16%,transparent),transparent);animation:drift 14s ease-in-out infinite}
@keyframes drift{50%{transform:translate3d(20px,12px,0)}}
.wrap{max-width:560px;margin:0 auto;padding:calc(var(--safe-top,0px) + 14px) 18px calc(28px + var(--safe-bottom,0px))}
.xtop{display:flex;align-items:center;justify-content:space-between}.brand{display:flex;align-items:center;gap:11px;font-size:19px;font-weight:750;letter-spacing:-.4px}.brand img{width:34px;height:34px;border-radius:10px}
.me{display:grid;place-items:center;width:36px;height:36px;border-radius:50%;background:linear-gradient(140deg,var(--accent),var(--theme-secondary,#8abdfb));color:var(--accent-ink,#211326);font-weight:800}
h1.x{margin:24px 0 0;font-size:40px;font-weight:750;letter-spacing:-.055em;line-height:1.02}
h1.x span{display:block;color:color-mix(in srgb,var(--text) 34%,var(--bg));animation:rise .7s cubic-bezier(.2,.8,.2,1) both}
h1.x span:nth-child(2){animation-delay:.08s}
h1.x span.g{animation-delay:.16s;color:transparent;background:linear-gradient(95deg,var(--accent-text,var(--accent)),var(--theme-secondary,var(--accent)) 62%,#b9a4ff);-webkit-background-clip:text;background-clip:text;padding-bottom:.06em}
@keyframes rise{from{opacity:0;transform:translateY(18px)}to{opacity:1;transform:none}}
.apps{display:flex;flex-direction:column;gap:14px;margin-top:22px}
.app{position:relative;display:block;width:100%;overflow:hidden;border-radius:30px;padding:16px;text-align:left;font:inherit;color:inherit;cursor:pointer;isolation:isolate;animation:rise .6s .2s cubic-bezier(.2,.8,.2,1) both;transition:transform .15s}
.app:active{transform:scale(.985)}.app+.app{animation-delay:.28s}
.ah{display:flex;align-items:center;gap:13px}.ah img,.ah .mk{width:54px;height:54px;border-radius:16px;flex:none}
.mk{display:grid;place-items:center;color:#fff;background:linear-gradient(140deg,#b3a6ff,#6e6bff 60%,#5b8cff);box-shadow:inset 0 1px rgba(255,255,255,.45),0 8px 20px rgba(110,107,255,.4)}.mk gt-icon{width:28px;height:28px}
.t{flex:1;min-width:0}.t b{display:flex;align-items:center;gap:7px;font-size:21px;font-weight:800;letter-spacing:-.6px}.t small{display:block;margin-top:2px;font-size:12.5px;opacity:.75}
.open{display:grid;place-items:center;flex:none;width:42px;height:42px;border-radius:50%}.open gt-icon{width:19px;height:19px}
.adm{display:inline-flex;align-items:center;gap:4px;padding:2px 6px;border-radius:6px;font-size:9.5px;font-weight:800;font-style:normal;letter-spacing:.5px;text-transform:uppercase;background:rgba(255,255,255,.14)}.adm gt-icon{width:10px;height:10px}
.a-gt{background:radial-gradient(120% 100% at 0% 0%,color-mix(in srgb,var(--accent) 45%,transparent),transparent 60%),radial-gradient(90% 90% at 100% 100%,color-mix(in srgb,var(--theme-secondary,#8abdfb) 32%,transparent),transparent 60%),var(--card);border:1px solid color-mix(in srgb,var(--accent) 38%,transparent);box-shadow:0 24px 50px color-mix(in srgb,var(--accent) 16%,transparent),inset 0 1px rgba(255,255,255,.18)}
.a-gt .open{background:linear-gradient(95deg,var(--accent),color-mix(in srgb,var(--accent) 50%,#a9cdfd));color:var(--accent-ink,#211326)}
.wd{display:flex;align-items:center;gap:14px;margin-top:14px;padding:12px;border-radius:20px;background:rgba(10,8,22,.38);border:1px solid rgba(255,255,255,.1)}
.ring{--p:0;position:relative;display:grid;place-items:center;flex:none;width:58px;height:58px;border-radius:50%;background:conic-gradient(from -90deg,var(--accent) calc(var(--p)*1%),rgba(255,255,255,.14) 0)}
.ring::before{content:"";position:absolute;inset:7px;border-radius:50%;background:#15131f}.ring b{position:relative;font-size:17px;font-weight:800}.ring small{font-size:11px;opacity:.6}
.tx{flex:1;min-width:0;white-space:nowrap}.tx em{display:block;font-style:normal;font-size:11.5px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:var(--accent-text,var(--accent))}
.tx strong{display:block;font-size:17px;font-weight:800;letter-spacing:-.3px;overflow:hidden;text-overflow:ellipsis}.tx small{display:block;font-size:12px;opacity:.7;margin-top:2px}
.strip{display:flex;gap:5px}.strip gt-exercise-thumb{--thumb-width:40px;--thumb-height:34px;border-radius:8px}
.a-hub{color:#fff;background:radial-gradient(120% 100% at 0% 0%,rgba(124,107,255,.55),transparent 60%),radial-gradient(90% 90% at 100% 100%,rgba(58,123,255,.35),transparent 60%),#15132e;border:1px solid rgba(143,124,255,.4);box-shadow:0 24px 50px rgba(110,107,255,.22),inset 0 1px rgba(255,255,255,.2)}
.a-hub .open{background:#fff;color:#17142b}
.a-car{color:#fff;background:radial-gradient(120% 100% at 0% 0%,rgba(55,201,139,.4),transparent 60%),radial-gradient(90% 90% at 100% 100%,rgba(120,140,160,.28),transparent 60%),#121a18;border:1px solid rgba(79,209,165,.36);box-shadow:0 24px 50px rgba(55,201,139,.16),inset 0 1px rgba(255,255,255,.18)}
.a-car .open{background:#fff;color:#06281c}.mk.car{color:#06281c;background:linear-gradient(140deg,#8ff0c0,#37c98b 60%,#1f9d7a);box-shadow:inset 0 1px rgba(255,255,255,.45),0 8px 20px rgba(55,201,139,.35)}
.app:nth-child(3){animation-delay:.36s}
.stats{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin-top:14px}
.stats>span{padding:11px 11px 10px;border-radius:18px;background:rgba(10,8,22,.4);border:1px solid rgba(255,255,255,.1);min-width:0}
.stats small{display:flex;align-items:center;gap:5px;font-size:10.5px;font-weight:700;letter-spacing:.4px;text-transform:uppercase;opacity:.65}.stats small gt-icon{width:12px;height:12px}
.stats b{display:block;margin-top:6px;font-size:17px;font-weight:800;letter-spacing:-.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.stats b.pos{color:#7ff0c8}.stats b.neg{color:#ff9fb0}
.stats em{display:block;font-style:normal;font-size:11.5px;opacity:.65;margin-top:1px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.rem{display:flex;align-items:center;gap:12px;margin-top:16px;padding:13px 14px;border-radius:20px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.08)}
.rem strong{display:block;font-size:13.5px;font-weight:700}.rem small{display:block;margin-top:2px;font-size:11.5px;color:var(--muted);line-height:1.35}
.tog{position:relative;flex:none;margin-left:auto;width:46px;height:28px;padding:0;border:0;border-radius:20px;background:rgba(255,255,255,.16);cursor:pointer}
.tog::before{content:"";position:absolute;width:24px;height:24px;left:2px;top:2px;border-radius:50%;background:#fff;box-shadow:0 1px 4px rgba(0,0,0,.4);transition:transform .2s}
.tog[aria-checked=true]{background:linear-gradient(90deg,var(--accent),#a9cdfd)}.tog[aria-checked=true]::before{transform:translateX(18px)}
@media(prefers-reduced-motion:reduce){*{animation:none!important}}`],
})
export class AppChooserComponent {
  readonly launch = inject(HubLaunchService);
  readonly view = inject(HubView);
  readonly garage = inject(GarageView);
  private hub = inject(HubStore);
  private gym = inject(Store);
  private auth = inject(AuthService);
  private router = inject(Router);
  readonly euro = euro;
  readonly firstName = computed(() => (this.gym.profile().name || this.auth.user()?.name || '').split(' ')[0] || 'di nuovo');
  readonly initial = computed(() => this.firstName().slice(0, 1).toUpperCase());
  readonly workout = computed(() => gymItems(this.view.gymData(), this.view.today())[0]);
  readonly thumbs = computed<Exercise[]>(() => {
    const ref = this.workout()?.ref, event = this.gym.data().scheduledWorkouts.find(e => e.id === ref);
    if (!event?.dayId) return [];
    return this.gym.planExercises(event.dayId).map(r => this.gym.data().exercises.find(e => e.id === r.exerciseId)).filter((e): e is Exercise => !!e).slice(0, 2);
  });
  readonly goal = computed(() => this.gym.settings().goals?.workoutsPerWeek ?? 0);
  readonly weekCount = computed(() => {
    const now = new Date(), monday = new Date(now); monday.setDate(now.getDate() - ((now.getDay() + 6) % 7));
    const from = localDate(monday);
    return this.gym.completed().filter(w => w.date >= from && w.date <= localDate(now)).length;
  });
  readonly weekPct = computed(() => this.goal() ? Math.min(100, Math.round(this.weekCount() / this.goal() * 100)) : (this.weekCount() ? 100 : 0));
  readonly next = computed((): { time: string; title: string } | undefined => {
    const now = new Date(), clock = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`, today = this.view.today();
    const todays = dayItems(this.hub.doc(), undefined, today, [], []).find(i => i.kind === 'event' && i.time && i.time >= clock && !i.done);
    if (todays) return { time: todays.time!, title: todays.title };
    const later = upcoming(this.hub.doc(), today, []).find(u => u.item.kind === 'event');
    return later ? { time: later.item.time ? `${shortDay(later.day)} ${later.item.time}` : shortDay(later.day), title: later.item.title } : undefined;
  });
  readonly budgetLabel = computed(() => { const b = this.view.budget(); return this.short(b ? Math.abs(b.left) : this.view.spentToday()) + ' €'; });
  readonly budgetNote = computed(() => { const b = this.view.budget(); return !b ? 'uscite' : b.left < 0 ? 'oltre il budget' : 'da spendere'; });
  /** Importi compatti per le mini schede: senza centesimi da 100 € in su. */
  short(cents: number, sign = false) { return euro(cents, { sign, decimals: Math.abs(cents) < 10000 }); }

  n(value: number) { return num(value); }
  go(app: 'gymtrack' | 'hub' | 'auto') { this.launch.remember(app); void this.router.navigateByUrl(app === 'hub' ? '/hub' : app === 'auto' ? '/auto' : '/'); }
  toggleLast() { this.launch.setMode(this.launch.read().mode === 'last' ? 'ask' : 'last'); }
}
