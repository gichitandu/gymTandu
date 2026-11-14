import { Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { IconComponent } from '../shared/icon.component';
import { feedbackForContext } from '../services/feedback';
import { computePlan, cumulativeByDay, monthIncome, monthSpending, planInsights, PlanLevel, PlanRow } from './hub-finance';
import { addMonths, cap, daysInMonth, euro, euroParts, hubBankShort, HUB_CATEGORIES, hubCategory, hubId, HubTransaction, monthKey, monthName, shortDay, addDays, dayLabel } from './hub-model';
import { HubStore } from './hub-store';
import { HubView } from './hub-view';
import { HubSpendSheetComponent } from './hub-spend-sheet.component';
import { HubSplitSheetComponent } from './hub-split-sheet.component';

type Vista = 'panoramica' | 'piano' | 'movimenti';
type Filter = 'tutti' | 'uscite' | 'entrate' | 'scegli' | 'divise';

@Component({
  selector: 'gt-hub-expenses', standalone: true, imports: [FormsModule, RouterLink, IconComponent, HubSpendSheetComponent, HubSplitSheetComponent],
  template: `<div class="th"><h1 class="hb-h1" style="margin:0">Spese</h1>
  <span class="hb-right"><span class="mo"><button type="button" (click)="moveMonth(-1)" aria-label="Mese precedente"><gt-icon name="back"/></button>{{cap(monthName(month()))}}<button type="button" (click)="moveMonth(1)" [disabled]="month()>=view.month()" aria-label="Mese successivo"><gt-icon name="chevron-right"/></button></span>
  <a class="hb-ib" routerLink="/hub/spese/importa" aria-label="Importa estratto conto"><gt-icon name="upload"/></a></span></div>
<div class="hb-seg">@for(v of vistas;track v.id){<button type="button" [class.on]="vista()===v.id" (click)="setVista(v.id)">{{v.label}}</button>}</div>

@if(!hub.transactions().length&&!view.spend().length){
  <section class="hb-c hb-empty" style="margin-top:16px"><span class="hb-sq lg v"><gt-icon name="wallet"/></span><strong>Nessun movimento</strong>Importa l’estratto conto di Intesa Sanpaolo, Revolut o Monte dei Paschi, oppure aggiungi una spesa a mano.
    <div class="hb-actions two" style="margin-top:14px"><a class="hb-btn sm pri" routerLink="/hub/spese/importa"><gt-icon name="upload"/>Importa</a><button type="button" class="hb-btn sm" (click)="newSpend()"><gt-icon name="plus"/>Spesa a mano</button></div></section>
}@else{
@switch(vista()){
@case('panoramica'){
  <div class="hb-cols" style="margin-top:14px">
  <section class="hb-c sh">
    <div class="hb-between" style="align-items:flex-start"><div><span class="hb-eb" style="letter-spacing:1px">Uscite · la tua parte</span>
      <div class="hb-money" style="margin-top:8px"><b>{{parts(monthTotal()).whole}}</b><small>,{{parts(monthTotal()).dec}} €</small></div></div>
      @if(pace();as p){<span class="hb-tag" [class.g]="p<=0" [class.r]="p>0" style="margin-top:2px"><gt-icon [name]="p<=0?'trend-down':'out'"/>{{euro(abs(p),{decimals:false})}} € {{p<=0?'sotto':'sopra'}} il ritmo</span>}
      @else if(prevDelta();as d){<span class="hb-tag" [class.y]="d>0" [class.g]="d<=0" style="margin-top:2px">{{d>0?'+':''}}{{d}}% su {{monthName(prevMonth())}}</span>}</div>
    <svg class="chart" viewBox="0 0 330 124" preserveAspectRatio="none" aria-hidden="true">
      <defs><linearGradient id="hbar" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#8F7CFF" stop-opacity=".55"/><stop offset="1" stop-color="#8F7CFF" stop-opacity="0"/></linearGradient>
      <linearGradient id="hbln" x1="0" x2="1"><stop offset="0" stop-color="#B3A6FF"/><stop offset="1" stop-color="#F39AC7"/></linearGradient></defs>
      @if(chart().cap!==null){<line x1="0" x2="330" [attr.y1]="chart().cap" [attr.y2]="chart().cap" stroke="rgba(255,255,255,.18)" stroke-dasharray="2 4"/>}
      @if(chart().pace){<polyline [attr.points]="chart().pace" fill="none" stroke="rgba(255,255,255,.32)" stroke-width="1.6" stroke-dasharray="4 4" vector-effect="non-scaling-stroke"/>}
      <polygon [attr.points]="chart().area" fill="url(#hbar)"/>
      <polyline [attr.points]="chart().line" fill="none" stroke="url(#hbln)" stroke-width="2.6" stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke"/>
    </svg>
    <div class="axis"><span>1 {{monthName(month()).slice(0,3)}}</span>@if(chart().capLabel){<span>tetto {{chart().capLabel}} €</span>}<span>{{dim()}} {{monthName(month()).slice(0,3)}}</span></div>
    <div class="io"><span>Entrate<b class="hb-num hb-pos">+{{euro(income())}} €</b></span><span>Rimane nel mese<b class="hb-num">{{euro(income()-monthTotal(),{sign:true})}} €</b></span></div>
  </section>
  <div>
    <div class="hb-sec" style="margin-top:4px"><h2>Per ambito</h2><button type="button" class="hb-link" (click)="setVista('piano')">Piano ›</button></div>
    <div class="cats hb-stagger">@for(c of categoryTiles();track c.id){<button type="button" class="hb-c ct" (click)="filterCategory(c.id)">
      <span class="hb-between"><span [class]="'hb-sq sm '+c.tone"><gt-icon [name]="c.icon"/></span><span class="p">{{c.capped?c.pct+'%':c.type==='fisso'?'Fisso':''}}</span></span>
      <strong>{{c.label}}</strong><b class="hb-num">{{euro(c.spent)}} € @if(c.capped){<small>di {{euro(c.cap,{decimals:false})}} €</small>}</b>
      <span class="hb-bar"><i [style.width.%]="c.capped?min100(c.pct):100" [style.background]="c.color" [style.opacity]="c.capped?1:.35"></i></span></button>}
    </div>
  </div>
  @if(view.recurring().length){<div>
    <div class="hb-sec"><h2>Pagamenti ricorrenti</h2><span class="hb-muted" style="font-size:12.5px">{{view.recurring().length}} rilevati</span></div>
    <section class="hb-c hb-pad"><b class="hb-num" style="display:block;font-size:24px;font-weight:750;letter-spacing:-.6px">{{euro(recurringTotal())}} €<small class="hb-muted" style="font-size:12px;font-weight:600"> al mese</small></b>
      <span class="hb-muted" style="display:block;margin-top:2px;font-size:12.5px">Trovati confrontando i mesi importati</span>
      <div class="subs">@for(r of view.recurring().slice(0,8);track r.key){<span>{{r.label}} <em>{{euro(r.amount)}}</em></span>}</div></section></div>}
  @if(costPerWorkout();as c){<div>
    <div class="hb-sec"><h2>Spese × allenamenti</h2></div>
    <section class="fun"><span class="big"><b>{{euro(c.each)}} €</b></span><span><strong>Costo per allenamento</strong><p>Palestra e sport {{euro(c.total)}} € ÷ {{c.workouts}} sedute di {{monthName(month())}} (da GymTrack).@if(c.next){ Con altre {{c.workouts}} sedute scendi a {{euro(c.next)}} €.}</p></span></section></div>}
  </div>
}
@case('piano'){
  @if(!draftPlan()){<section class="hb-c hb-empty" style="margin-top:16px"><span class="hb-sq lg v"><gt-icon name="piggy"/></span><strong>Serve almeno un mese completo</strong>Il piano parte dalla media dei mesi passati: importa i movimenti del mese scorso (meglio gli ultimi 3).<a class="hb-btn sm pri" routerLink="/hub/spese/importa" style="margin-top:14px"><gt-icon name="upload"/>Importa estratto conto</a></section>}
  @else{
  <div class="hb-cols" style="margin-top:14px">
  <section class="hb-hero goal"><span class="q">Quanto vuoi risparmiare al mese?</span>
    <div class="val"><button type="button" class="pm" (click)="stepGoal(-2500)" aria-label="Meno"><gt-icon name="minus"/></button><span class="big hb-num">{{euro(goal(),{decimals:false})}}<small> €</small></span><button type="button" class="pm" (click)="stepGoal(2500)" aria-label="Più"><gt-icon name="plus"/></button></div>
    <div class="per">{{euro(goal()*12,{decimals:false})}} € in un anno</div>
    <input class="range" type="range" min="0" [max]="sliderMax()" step="500" [ngModel]="goal()" (ngModelChange)="goal.set(+$event)" aria-label="Risparmio mensile"/>
    <div class="ticks"><span>0</span><span>{{euro(sliderMax()/2,{decimals:false})}}</span><span>{{euro(sliderMax(),{decimals:false})}}</span></div></section>
  @if(draftPlan();as plan){
  <section class="hb-c feas">
    <div class="hb-row"><span class="hb-sq" [class.g]="plan.level!=='troppo'" [class.r]="plan.level==='troppo'"><gt-icon [name]="plan.level==='troppo'?'info':'check'"/></span><span><strong class="lvl">{{levelTitle(plan.level)}}</strong><span class="hb-muted" style="font-size:12.5px">{{levelText(plan)}}</span></span></div>
    <div class="meter">@for(l of levels;track l){<i [class.on]="levelIndex(plan.level)>=$index" [class.bad]="plan.level==='troppo'"></i>}</div>
    <div class="ml">@for(l of levels;track l){<span [class.on]="plan.level===l">{{cap(l)}}</span>}</div>
    <div class="nums"><div><small>Spendi in media</small><b class="hb-num">{{euro(plan.avgTotal,{decimals:false})}} €</b></div><gt-icon name="arrow"/><div style="text-align:right"><small>Nuovo tetto al mese</small><b class="hb-num" style="color:#b3a6ff">{{euro(plan.capTotal,{decimals:false})}} €</b></div></div>
    <p class="hb-sub" style="margin:10px 0 0;font-size:12px">Media di {{plan.months.length===1?monthName(plan.months[0]):plan.months.length+' mesi ('+monthsLabel(plan.months)+')'}}.</p>
    @if(hasOverrides() && plan.achieved>plan.goal+100){<p class="ovr">Con le tue scelte risparmi {{euro(plan.achieved,{decimals:false})}} € al mese, più dell’obiettivo. <button type="button" class="hb-link" (click)="goal.set(roundGoal(plan.achieved))">Usa {{euro(roundGoal(plan.achieved),{decimals:false})}} € come obiettivo</button></p>}
  </section>
  <div>
    <div class="hb-sec" style="margin-top:4px"><h2>Il piano per ambito</h2>@if(hasOverrides()){<button type="button" class="hb-link" (click)="resetOverrides()">Tutto automatico</button>}</div>
    <p class="hb-sub pl-hint">Tocca un ambito per decidere tu quanto tagliare, o per segnarlo come non riducibile: il resto dell’obiettivo si sposta sugli altri.</p>
    <section class="hb-c hb-list pl">
      @for(r of variableRows(plan);track r.category){<div class="prow" [class.open]="planEdit()===r.category">
        <button type="button" class="hb-li" (click)="toggleEdit(r.category)" [attr.aria-expanded]="planEdit()===r.category"><span [class]="'hb-sq sm '+tone(r.category)"><gt-icon [name]="icon(r.category)"/></span>
        <span class="bd"><strong>{{label(r.category)}} @if(r.manual){<span [class]="'hb-tag '+(r.cut?'v':'r')">{{r.cut?'Scelto da te':'Non riducibile'}}</span>}@else{<span class="hb-tag n">{{typeLabel(r.type)}}</span>}</strong><span class="two"><span class="old" [style.width.%]="r.avg/maxAvg(plan)*100"></span><span class="new" [style.width.%]="r.cap/maxAvg(plan)*100" [style.background]="color(r.category)"></span></span></span>
        <span class="rt2"><b class="hb-num" [class.zero]="!r.cut">{{r.cut?'−'+euro(r.cut,{decimals:false}):'0'}} €</b><small>{{euro(r.avg,{decimals:false})}} → {{euro(r.cap,{decimals:false})}} €</small></span></button>
        @if(planEdit()===r.category){<div class="ed">
          <div class="stp"><button type="button" class="pm2" (click)="stepCut(r,-500)" [disabled]="!r.cut" aria-label="Taglia 5 € in meno"><gt-icon name="minus"/></button>
            <span><b class="hb-num">{{r.cut?'−'+euro(r.cut,{decimals:false}):'0'}} €</b><small>tetto {{euro(r.cap,{decimals:false})}} € al mese</small></span>
            <button type="button" class="pm2" (click)="stepCut(r,500)" [disabled]="r.cap<=0" aria-label="Taglia 5 € in più"><gt-icon name="plus"/></button></div>
          <div class="opts"><button type="button" class="hb-btn sm" [class.on]="r.manual&&!r.cut" (click)="setCut(r,0)">Non riducibile</button>@if(r.manual){<button type="button" class="hb-btn sm" (click)="setAuto(r.category)">Automatico</button>}</div>
        </div>}
      </div>}
      @if(fixedTotal(plan)){<div class="hb-li fix"><span class="hb-sq sm b"><gt-icon name="house"/></span><span class="bd"><strong>Spese fisse</strong><small>{{fixedLabels(plan)}} · non toccate</small></span><span class="rt2"><b style="color:var(--hb-m)">0 €</b><small>{{euro(fixedTotal(plan),{decimals:false})}} €</small></span></div>}
    </section>
  </div>
  <section class="hb-c wk"><span class="hb-sq v"><gt-icon name="calendar"/></span><span><span class="hb-muted" style="display:block;font-size:12.5px">Per le spese di tutti i giorni hai</span><b class="hb-num">{{euro(weekly(plan),{decimals:false})}} €</b><span class="hb-muted" style="font-size:13px"> a settimana · {{euro(weekly(plan)/7,{decimals:false})}} € al giorno</span></span></section>
  @if(insights(plan).length){<div><div class="hb-sec"><h2>Dove si risparmia di più</h2></div>
    <section class="hb-c hb-list why">@for(w of insights(plan);track w.category){<div class="hb-li"><span [class]="'hb-sq sm '+tone(w.category)"><gt-icon [name]="icon(w.category)"/></span><span class="bd"><strong>{{w.title}}</strong><p>{{w.text}}</p></span></div>}</section></div>}
  <div>
    <p class="hb-note"><gt-icon name="info"/><span><b>Come lo calcolo, senza AI:</b> media dei mesi completi importati (fino a 3) · spese fisse escluse · il taglio è più forte sulle spese flessibili e dove l’ultimo mese ha superato la media · essenziali al massimo −10%, ricorrenti −35%, flessibili −45%.</span></p>
    <section class="hb-c hb-row act2"><span class="hb-sq sm v"><gt-icon name="bell"/></span><span style="flex:1"><strong>Avvisami all’80% di ogni tetto</strong><small>Notifica sul telefono, anche ad app chiusa</small></span><button type="button" class="hb-tog" role="switch" [attr.aria-checked]="alert80()" (click)="alert80.set(!alert80())" aria-label="Avviso all'80%"></button></section>
    <button type="button" class="hb-btn pri" style="margin-top:14px" (click)="activate(plan)"><gt-icon name="check"/>{{hub.plan()?.active?'Aggiorna il piano':'Attiva il piano'}}</button>
    @if(hub.plan()?.active){<button type="button" class="hb-btn sm" style="margin-top:8px" (click)="deactivate()">Sospendi il piano</button>}
  </div>
  }
  </div>
  }
}
@case('movimenti'){
  <label class="hb-field search" style="margin-top:14px"><gt-icon name="search"/><input name="q" [ngModel]="query()" (ngModelChange)="query.set($event)" placeholder="Cerca descrizione o importo" autocomplete="off"/></label>
  <div class="hb-chips scroll" style="margin-top:10px">@for(f of filters;track f.id){<button type="button" class="hb-ch" [class.on]="filter()===f.id" (click)="filter.set(f.id)">{{f.label}}@if(f.id==='scegli'&&toCategorize()){<span class="hb-tag y">{{toCategorize()}}</span>}</button>}
    @if(categoryFilter();as c){<button type="button" class="hb-ch on" (click)="categoryFilter.set('')">{{label(c)}}<gt-icon name="close"/></button>}</div>
  <div class="hb-between" style="margin:14px 4px 8px"><span class="hb-muted" style="font-size:12.5px">{{rows().length}} movimenti · {{cap(monthName(month()))}}</span><button type="button" class="hb-link plus" (click)="newSpend()"><gt-icon name="plus"/>Spesa a mano</button></div>
  <section class="hb-c hb-list">
    @for(g of grouped();track g.day){<div class="hb-dh">{{g.label}}</div>
      @for(t of g.items;track t.id){<div class="hb-li txr">
        <button type="button" class="main" (click)="edit(t)"><span [class]="'hb-sq sm '+(t.category?tone(t.category):'y')"><gt-icon [name]="t.category?icon(t.category):'tag'"/></span>
        <span class="bd"><strong>{{t.description.split(' · ')[0]}}</strong><small><span [class]="'hb-bank '+t.bank">{{short(t.bank)}}</span>@if(t.expenseId){<span class="hb-tag v"><gt-icon name="users"/>Diviso</span>}@if(!t.category){<span class="hb-tag y">Scegli categoria</span>}@else{<span>{{label(t.category)}}</span>}</small></span>
        <span class="amt" [class.hb-pos]="t.amount>0" [class.hb-muted]="t.kind==='transfer'">{{euro(t.amount,{sign:true})}} €@if(share(t);as s){<small>tua parte {{euro(s)}}</small>}</span></button>
        @if(t.kind==='expense'&&!t.expenseId){<button type="button" class="div" (click)="divide(t)" aria-label="Dividi"><gt-icon name="users"/></button>}
      </div>}
    }@empty{<div class="hb-empty">Nessun movimento con questi filtri.</div>}
  </section>
  @if(limit()<rowsAll().length){<button type="button" class="hb-btn sm" style="margin-top:10px" (click)="limit.set(limit()+150)">Mostra altri</button>}
}
}
}
@if(sheet()==='spend'){<gt-hub-spend-sheet [tx]="editing()" (closed)="sheet.set('')" (split)="splitTx.set($event);sheet.set('split')"/>}
@if(sheet()==='split'){<gt-hub-split-sheet [tx]="splitTx()" (closed)="sheet.set('')"/>}`,
  styles: [`.th{display:flex;align-items:center;justify-content:space-between;gap:10px;margin:0 2px 12px}
.mo{display:flex;align-items:center;gap:2px;height:40px;padding:0 4px;border-radius:14px;background:rgba(255,255,255,.06);border:1px solid var(--hb-ln);font-size:13px;font-weight:650;color:var(--hb-m)}
.mo button{display:grid;place-items:center;width:30px;height:30px;border-radius:10px;cursor:pointer}.mo button:disabled{opacity:.3}.mo gt-icon{width:15px;height:15px}
.sh{padding:18px 18px 14px}.chart{display:block;width:100%;height:124px;margin-top:14px;overflow:visible}
.axis{display:flex;justify-content:space-between;margin-top:6px;font-size:10.5px;color:var(--hb-f)}
.io{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:14px}.io span{padding:10px 12px;border-radius:14px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.07);font-size:11.5px;color:var(--hb-m)}.io b{display:block;font-size:16px;color:var(--hb-t);font-weight:750;margin-top:2px}
.cats{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.ct{display:block;padding:14px;text-align:left;cursor:pointer;width:100%}
.ct .p{font-size:11.5px;font-weight:700;color:var(--hb-m)}.ct strong{display:block;margin-top:12px;font-size:13px;font-weight:600;color:var(--hb-m);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.ct b{display:block;margin-top:2px;font-size:19px;font-weight:750;letter-spacing:-.6px;white-space:nowrap}.ct b small{font-size:12px;font-weight:600;color:var(--hb-f);letter-spacing:0}.ct .hb-bar{margin-top:10px}
.subs{display:flex;flex-wrap:wrap;gap:6px;margin-top:12px}.subs span{display:inline-flex;gap:6px;align-items:center;padding:6px 10px;border-radius:11px;font-size:12px;font-weight:700;background:rgba(181,140,255,.12);border:1px solid rgba(181,140,255,.28)}.subs em{font-style:normal;color:var(--hb-m);font-weight:650}
.fun{display:flex;gap:14px;align-items:center;padding:16px;border-radius:22px;background:linear-gradient(150deg,rgba(79,209,165,.18),#121218 80%);border:1px solid rgba(79,209,165,.32)}
.fun .big{flex:none;display:grid;place-items:center;width:78px;height:74px;border-radius:22px;background:rgba(79,209,165,.16);border:1px solid rgba(79,209,165,.4)}.fun .big b{font-size:18px;font-weight:850;color:var(--hb-g);white-space:nowrap}
.fun strong{display:block;font-size:15px;font-weight:800}.fun p{margin:4px 0 0;font-size:12.5px;line-height:1.45;color:var(--hb-m)}
.goal{text-align:center}.goal .q{font-size:13.5px;opacity:.85}.goal .val{display:flex;align-items:center;justify-content:center;gap:18px;margin-top:10px}
.pm{display:grid;place-items:center;width:44px;height:44px;border-radius:50%;background:rgba(255,255,255,.16)!important;border:1px solid rgba(255,255,255,.22)!important;cursor:pointer}.pm gt-icon{width:20px;height:20px}
.big{font-size:56px;font-weight:800;letter-spacing:-2.5px;line-height:1}.big small{font-size:22px;font-weight:650;opacity:.7;letter-spacing:-.5px}.per{font-size:13px;opacity:.75;margin-top:4px}
.range{display:block;width:100%!important;margin:16px 0 0;accent-color:#fff;height:28px}.ticks{display:flex;justify-content:space-between;font-size:10.5px;opacity:.6}
.feas{padding:15px}.lvl{display:block;font-size:15.5px;font-weight:700}
.meter{display:grid;grid-template-columns:repeat(4,1fr);gap:4px;margin-top:12px}.meter i{height:6px;border-radius:3px;background:rgba(255,255,255,.08)}.meter i.on{background:var(--hb-g)}.meter i.on.bad{background:var(--hb-r)}
.ml{display:grid;grid-template-columns:repeat(4,1fr);gap:4px;margin-top:6px;font-size:10.5px;color:var(--hb-f);font-weight:600}.ml .on{color:var(--hb-g)}
.nums{display:grid;grid-template-columns:1fr auto 1fr;align-items:center;gap:8px;margin-top:14px;padding-top:14px;border-top:1px solid rgba(255,255,255,.06)}.nums small{display:block;font-size:11.5px;color:var(--hb-m)}.nums b{display:block;margin-top:3px;font-size:19px;font-weight:750;letter-spacing:-.6px}.nums gt-icon{width:18px;height:18px;color:var(--hb-f)}
.pl .hb-li{align-items:flex-start;cursor:default}.pl .bd strong{display:flex;align-items:center;gap:8px}
.two{position:relative;display:block;height:8px;margin-top:9px;border-radius:5px;background:rgba(255,255,255,.06)}.two .old{position:absolute;left:0;top:0;bottom:0;border-radius:5px;background:repeating-linear-gradient(135deg,rgba(255,255,255,.14) 0 3px,transparent 3px 6px)}.two .new{position:absolute;left:0;top:0;bottom:0;border-radius:5px}
.prow+.prow{border-top:1px solid rgba(255,255,255,.05)}.prow.open{background:rgba(255,255,255,.03)}.pl .prow .hb-li{cursor:pointer}
.pl-hint{margin:-4px 2px 10px;font-size:12.5px;line-height:1.45}
.ed{padding:0 14px 14px 60px}.stp{display:flex;align-items:center;justify-content:space-between;gap:10px}.stp span{text-align:center;flex:1}.stp b{display:block;font-size:20px;font-weight:750;color:var(--hb-g)}.stp small{display:block;font-size:11.5px;color:var(--hb-m);margin-top:2px}
.pm2{display:grid;place-items:center;flex:none;width:44px;height:44px;border-radius:50%;border:1px solid var(--hb-ln)!important;background:rgba(255,255,255,.05)!important;cursor:pointer}.pm2:disabled{opacity:.35;cursor:default}.pm2 gt-icon{width:18px;height:18px}
.opts{display:flex;flex-wrap:wrap;gap:8px;margin-top:12px}.opts .hb-btn{width:auto;flex:1}.opts .hb-btn.on{border-color:rgba(255,107,129,.45)!important;color:var(--hb-r)}
.rt2 b.zero{color:var(--hb-m)}.ovr{margin:10px 0 0;font-size:12.5px;line-height:1.45;color:var(--hb-m)}.ovr .hb-link{padding:0;border:0;background:none;color:var(--hb-v);font:inherit;font-weight:650;text-decoration:underline;cursor:pointer}
.rt2{text-align:right;flex:none}.rt2 b{display:block;font-size:15px;font-weight:750;color:var(--hb-g)}.rt2 small{display:block;margin-top:2px;font-size:11.5px;color:var(--hb-m);font-variant-numeric:tabular-nums}.fix{opacity:.6}
.wk{display:flex;align-items:center;gap:14px;padding:15px}.wk b{font-size:24px;font-weight:750;letter-spacing:-.8px}
.why .hb-li{align-items:flex-start;cursor:default}.why .bd strong{white-space:normal}.why p{margin:3px 0 0;font-size:12.5px;line-height:1.45;color:var(--hb-m)}
.act2{padding:13px 14px;margin-top:12px}.act2 strong{display:block;font-size:14px;font-weight:650}.act2 small{display:block;font-size:11.5px;color:var(--hb-m);margin-top:2px}
.search{min-height:48px}.plus{display:inline-flex;align-items:center;gap:4px}.plus gt-icon{width:14px;height:14px}
.txr{padding:0;gap:0}.txr .main{display:flex;align-items:center;gap:12px;flex:1;min-width:0;padding:12px 6px 12px 14px;text-align:left;cursor:pointer}
.div{display:grid;place-items:center;flex:none;width:40px;height:40px;margin-right:8px;border-radius:12px;color:#b3a6ff;background:rgba(143,124,255,.1)!important;cursor:pointer}.div gt-icon{width:17px;height:17px}`],
})
export class HubExpensesComponent {
  readonly hub = inject(HubStore);
  readonly view = inject(HubView);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private feedback = feedbackForContext();
  readonly euro = euro; readonly cap = cap; readonly monthName = monthName; readonly short = hubBankShort;
  readonly vistas: { id: Vista; label: string }[] = [{ id: 'panoramica', label: 'Panoramica' }, { id: 'piano', label: 'Piano' }, { id: 'movimenti', label: 'Movimenti' }];
  readonly filters: { id: Filter; label: string }[] = [{ id: 'tutti', label: 'Tutti' }, { id: 'uscite', label: 'Uscite' }, { id: 'entrate', label: 'Entrate' }, { id: 'scegli', label: 'Da categorizzare' }, { id: 'divise', label: 'Divise' }];
  readonly levels: PlanLevel[] = ['facile', 'realistico', 'impegnativo', 'troppo'];
  private qp = toSignal(this.route.queryParamMap);
  readonly vista = computed<Vista>(() => { const v = this.qp()?.get('vista'); return v === 'piano' || v === 'movimenti' ? v : 'panoramica'; });
  readonly month = signal(this.view.month());
  readonly dim = computed(() => daysInMonth(this.month()));
  readonly prevMonth = computed(() => addMonths(this.month(), -1));
  readonly sheet = signal<'' | 'spend' | 'split'>('');
  readonly editing = signal<HubTransaction | null>(null);
  readonly splitTx = signal<HubTransaction | null>(null);
  readonly query = signal('');
  readonly filter = signal<Filter>('tutti');
  readonly categoryFilter = signal('');
  readonly limit = signal(150);

  readonly spending = computed(() => monthSpending(this.view.spend(), this.month()));
  readonly monthTotal = computed(() => this.spending().total);
  readonly income = computed(() => monthIncome(this.hub.transactions(), this.month()));
  readonly prevDelta = computed(() => { const prev = monthSpending(this.view.spend(), this.prevMonth()).total; return prev ? Math.round((this.monthTotal() - prev) / prev * 100) : null; });
  readonly caps = computed(() => this.view.activePlan()?.caps ?? {});
  readonly capTotal = computed(() => Object.values(this.caps()).reduce((s, v) => s + v, 0));
  readonly pace = computed(() => {
    const total = this.capTotal(); if (!total || this.month() !== this.view.month()) return null;
    const day = Number(this.view.today().slice(8)), fixed = Object.entries(this.caps()).filter(([c]) => hubCategory(c).type === 'fisso').reduce((s, [, v]) => s + v, 0);
    return this.monthTotal() - Math.round(fixed + (total - fixed) * day / this.dim());
  });
  readonly chart = computed(() => {
    const W = 330, H = 116, cum = cumulativeByDay(this.view.spend(), this.month()), dim = this.dim();
    const lastDay = this.month() === this.view.month() ? Number(this.view.today().slice(8)) : dim;
    const total = this.capTotal(), max = Math.max(total, ...cum, 1) * 1.08;
    const x = (d: number) => (d / dim) * W, y = (v: number) => H - (v / max) * H + 4;
    const pts = [`0,${y(0).toFixed(1)}`, ...cum.slice(0, lastDay).map((v, i) => `${x(i + 1).toFixed(1)},${y(v).toFixed(1)}`)].join(' ');
    const fixed = Object.entries(this.caps()).filter(([c]) => hubCategory(c).type === 'fisso').reduce((s, [, v]) => s + v, 0);
    const pace = total ? Array.from({ length: dim }, (_, i) => `${x(i + 1).toFixed(1)},${y(fixed + (total - fixed) * (i + 1) / dim).toFixed(1)}`).join(' ') : '';
    return { line: pts, area: `0,${H + 4} ${pts} ${x(lastDay).toFixed(1)},${H + 4}`, pace, cap: total ? y(total) : null, capLabel: total ? euro(total, { decimals: false }) : '' };
  });
  readonly categoryTiles = computed(() => {
    const spent = this.spending().byCategory, caps = this.caps();
    const ids = [...new Set([...Object.keys(spent), ...Object.keys(caps)])].filter(id => hubCategory(id).type !== 'entrata' && hubCategory(id).type !== 'giroconto');
    return ids.map(id => {
      const c = hubCategory(id), cap = caps[id] ?? 0, s = spent[id] ?? 0;
      return { id, label: c.label, icon: c.icon, tone: c.tone, type: c.type, spent: s, cap, capped: cap > 0 && c.type !== 'fisso', pct: cap ? Math.round(s / cap * 100) : 0, color: this.color(id) };
    }).sort((a, b) => b.spent - a.spent || b.cap - a.cap).slice(0, 10);
  });
  readonly recurringTotal = computed(() => this.view.recurring().reduce((s, r) => s + r.amount, 0));
  readonly costPerWorkout = computed(() => {
    const total = this.spending().byCategory['palestra'] ?? 0, data = this.view.gymData();
    const workouts = data?.workouts.filter(w => w.status === 'completed' && monthKey(w.date) === this.month()).length ?? 0;
    if (!total || !workouts) return null;
    return { total, workouts, each: Math.round(total / workouts), next: this.month() === this.view.month() ? Math.round(total / (workouts * 2)) : 0 };
  });

  readonly goal = signal(0);
  readonly alert80 = signal(true);
  /** Tagli scelti a mano per ambito (centesimi; 0 = non riducibile). Salvati con “Attiva/Aggiorna il piano”. */
  readonly overrides = signal<Record<string, number>>({});
  readonly planEdit = signal('');
  readonly hasOverrides = computed(() => Object.keys(this.overrides()).length > 0);
  readonly draftPlan = computed(() => computePlan(this.view.spend(), this.goal(), this.view.today(), this.overrides()));
  readonly sliderMax = computed(() => { const p = computePlan(this.view.spend(), 0, this.view.today()); return Math.max(10000, Math.ceil((p?.reducible ?? 50000) * 0.5 / 5000) * 5000); });

  readonly rowsAll = computed(() => {
    const q = this.query().trim().toLowerCase(), f = this.filter(), cat = this.categoryFilter(), month = this.month();
    return this.hub.transactions().filter(t => {
      if (!q && monthKey(t.date) !== month) return false;
      if (q && !(t.description.toLowerCase().includes(q) || euro(t.amount).includes(q))) return false;
      if (cat && t.category !== cat) return false;
      if (f === 'uscite') return t.amount < 0 && t.kind !== 'transfer';
      if (f === 'entrate') return t.amount > 0 && t.kind !== 'transfer';
      if (f === 'scegli') return !t.category;
      if (f === 'divise') return !!t.expenseId;
      return true;
    });
  });
  readonly rows = computed(() => this.rowsAll().slice(0, this.limit()));
  readonly toCategorize = computed(() => this.hub.transactions().filter(t => !t.category).length);
  readonly grouped = computed(() => {
    const out: { day: string; label: string; items: HubTransaction[] }[] = [], today = this.view.today();
    for (const t of this.rows()) {
      const last = out.at(-1);
      if (last?.day === t.date) last.items.push(t);
      else out.push({ day: t.date, label: t.date === today ? 'Oggi' : t.date === addDays(today, -1) ? 'Ieri' : dayLabel(t.date), items: [t] });
    }
    return out;
  });
  private expenseShare = computed(() => new Map(this.hub.expenses().map(e => [e.id, e])));

  constructor() {
    effect(() => {
      const plan = this.hub.plan();
      untracked(() => {
        if (plan) { this.goal.set(plan.goal); this.alert80.set(plan.alert80); this.overrides.set({ ...(plan.overrides ?? {}) }); }
        else if (!this.goal()) { const p = computePlan(this.view.spend(), 0, this.view.today()); this.goal.set(p ? Math.max(5000, Math.round(p.reducible * 0.2 / 2500) * 2500) : 20000); }
      });
    });
  }
  parts(c: number) { return euroParts(c); }
  abs(n: number) { return Math.abs(n); }
  min100(n: number) { return Math.min(100, n); }
  label(id: string) { return hubCategory(id).label; }
  icon(id: string) { return hubCategory(id).icon; }
  tone(id: string) { return hubCategory(id).tone; }
  color(id: string) { return ({ b: 'var(--hb-b)', g: 'var(--hb-g)', o: 'var(--hb-o)', y: 'var(--hb-y)', c: 'var(--hb-c)', p: 'var(--hb-p)', r: 'var(--hb-r)', l: 'var(--hb-l)', n: 'var(--hb-n)', v: 'var(--hb-v)' } as Record<string, string>)[hubCategory(id).tone] ?? 'var(--hb-n)'; }
  typeLabel(t: string) { return ({ essenziale: 'Essenziale', flessibile: 'Flessibile', ricorrente: 'Ricorrente', fisso: 'Fisso' } as Record<string, string>)[t] ?? t; }
  share(t: HubTransaction) { if (!t.expenseId) return 0; const e = this.expenseShare().get(t.expenseId); if (!e) return 0; return (this.view.spend().find(i => i.id === t.id)?.amount) ?? 0; }
  setVista(v: Vista) { void this.router.navigate([], { relativeTo: this.route, queryParams: { vista: v === 'panoramica' ? null : v }, queryParamsHandling: 'merge', replaceUrl: true }); }
  moveMonth(n: number) { const m = addMonths(this.month(), n); if (m <= this.view.month()) this.month.set(m); }
  filterCategory(id: string) { this.categoryFilter.set(id); this.filter.set('tutti'); this.setVista('movimenti'); }
  newSpend() { this.editing.set(null); this.sheet.set('spend'); }
  edit(t: HubTransaction) { this.editing.set(t); this.sheet.set('spend'); }
  divide(t: HubTransaction) { this.splitTx.set(t); this.sheet.set('split'); }
  stepGoal(delta: number) { this.goal.set(Math.max(0, Math.min(this.sliderMax(), this.goal() + delta))); }
  levelIndex(l: PlanLevel) { return this.levels.indexOf(l); }
  levelTitle(l: PlanLevel) { return ({ facile: 'Obiettivo facile', realistico: 'Obiettivo realistico', impegnativo: 'Obiettivo impegnativo', troppo: 'Fuori portata' })[l]; }
  levelText(p: { level: PlanLevel; avgCutPct: number; maxPossible: number }) { return p.level === 'troppo' ? `Con i limiti per ambito arrivi al massimo a ${euro(p.maxPossible, { decimals: false })} € al mese.` : `Tagli in media il ${p.avgCutPct}% delle spese che puoi ridurre.`; }
  monthsLabel(months: string[]) { return months.map(m => monthName(m).slice(0, 3)).reverse().join('–'); }
  variableRows(p: { rows: PlanRow[] }) { return p.rows.filter(r => r.type !== 'fisso'); }
  fixedTotal(p: { rows: { type: string; avg: number }[] }) { return p.rows.filter(r => r.type === 'fisso').reduce((s, r) => s + r.avg, 0); }
  fixedLabels(p: { rows: { type: string; category: string }[] }) { return p.rows.filter(r => r.type === 'fisso').map(r => this.label(r.category)).join(', '); }
  maxAvg(p: { rows: { avg: number; type: string }[] }) { return Math.max(1, ...p.rows.filter(r => r.type !== 'fisso').map(r => r.avg)); }
  weekly(p: { rows: { category: string; cap: number; type: string }[] }) { const v = p.rows.filter(r => r.type === 'essenziale' || r.type === 'flessibile').reduce((s, r) => s + r.cap, 0); return Math.round(v / (30.4 / 7)); }
  insights(p: NonNullable<ReturnType<typeof computePlan>>) { return planInsights(p, this.view.spend(), this.view.recurring()); }
  activate(p: NonNullable<ReturnType<typeof computePlan>>) {
    const current = this.hub.plan();
    this.hub.upsert('plans', { id: current?.id ?? hubId(), updatedAt: current?.updatedAt ?? 0, goal: this.goal(), active: true, alert80: this.alert80(), caps: Object.fromEntries(p.rows.map(r => [r.category, r.cap])), basedOn: p.months, overrides: { ...this.overrides() } });
    this.feedback.show('success', 'Piano attivo: trovi il budget di oggi nella schermata Oggi.');
  }
  toggleEdit(category: string) { this.planEdit.set(this.planEdit() === category ? '' : category); }
  /** Più taglio su un ambito: l'obiettivo resta lo stesso, quindi gli ambiti automatici tagliano di meno (e viceversa). */
  stepCut(r: { category: string; cut: number; avg: number }, delta: number) { this.setCut(r, delta > 0 ? Math.floor(r.cut / 500) * 500 + delta : Math.ceil(r.cut / 500) * 500 + delta); }
  setCut(r: { category: string; avg: number }, cut: number) { this.overrides.update(o => ({ ...o, [r.category]: Math.max(0, Math.min(r.avg, cut)) })); }
  setAuto(category: string) { this.overrides.update(o => { const { [category]: _removed, ...rest } = o; return rest; }); }
  resetOverrides() { this.overrides.set({}); this.planEdit.set(''); }
  roundGoal(cents: number) { return Math.floor(cents / 500) * 500; }
  deactivate() { const p = this.hub.plan(); if (p) this.hub.upsert('plans', { ...p, active: false }); }
  protected readonly categories = HUB_CATEGORIES;
  protected readonly shortDay = shortDay;
}
