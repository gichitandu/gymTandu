import { Component, computed, inject, OnDestroy } from '@angular/core';
import { RouterLink } from '@angular/router';
import { GroupSessionService } from '../services/group-session';
import { memberProgress } from '../services/group-workout';
import { Store } from '../services/store';
import { IconComponent } from './icon.component';

/** Durante la seduta: cosa stanno facendo gli altri del gruppo, senza lasciare la registrazione. */
@Component({
  selector: 'gt-group-strip',
  standalone: true,
  imports: [RouterLink, IconComponent],
  template: `@if(group.active()){<a class="group-strip" routerLink="/gruppo" aria-label="Allenamento in gruppo: apri i dettagli">
    <gt-icon name="users"/>
    <span class="group-strip-body">@for(row of rows();track row.id){<span><b>{{row.name}}</b> {{row.text}}</span>}@empty{<span>In gruppo · in attesa degli altri</span>}</span>
    <gt-icon name="chevron-right"/>
  </a>}`,
  styles: [`
    :host{display:block}
    .group-strip{display:flex;align-items:center;gap:10px;margin:8px 0 12px;padding:10px 12px;border-radius:14px;border:1px solid var(--line);background:var(--raised);color:inherit;text-decoration:none;font-size:13px;line-height:1.4}
    .group-strip-body{display:grid;gap:2px;flex:1;min-width:0}
    .group-strip-body span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  `],
})
export class GroupStripComponent implements OnDestroy {
  group = inject(GroupSessionService);
  private s = inject(Store);
  private stop = this.group.watch();
  rows = computed(() => this.group.others().map(m => {
    const progress = memberProgress(m), current = m.exercises.find(e => e.exerciseId === m.current);
    const last = current?.last ? ` · ${this.s.formatWeight(current.last.weight)} ${this.s.settings().unit}×${current.last.reps}` : '';
    const text = m.mode === '' ? 'sta entrando…' : m.finished ? `ha concluso · ${progress.done}/${progress.total} serie` : current ? `${current.name} ${current.done}/${current.total}${last}` : `${progress.done}/${progress.total} serie`;
    return { id: m.id, name: m.name, text };
  }));
  ngOnDestroy() { this.stop(); }
}
