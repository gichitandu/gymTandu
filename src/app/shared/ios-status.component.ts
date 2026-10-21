import {IphoneChecklistComponent} from "./iphone-checklist.component";
import { DeviceTestsService } from "../services/device-tests";
import { Component, inject } from '@angular/core';
import { PwaService } from '../services/pwa';
import { RouterLink } from '@angular/router';
@Component({selector:'gt-ios-status',standalone:true,imports:[RouterLink,IphoneChecklistComponent],template:`
<section class="card" style="margin-top:20px"><h2>iPhone · Stato dell’app</h2><dl class="device-report"><dt>Modalità</dt><dd>{{pwa.installed()?'PWA dalla schermata Home':'Browser Safari / scheda web'}}</dd><dt>Rete</dt><dd>{{pwa.online()?'Online':'Offline'}}</dd><dt>Risorse offline</dt><dd>{{pwa.offlineReady()?'Service worker attivo; esegui la prova in modalità aereo':'Non ancora pronte. Apri online e attendi il caricamento completo.'}}</dd><dt>Archiviazione</dt><dd>{{pwa.storage()}}</dd><dt>Persistenza</dt><dd>{{pwa.persisted()===true?'Concessa':pwa.persisted()===false?'Non garantita dal browser':'Non rilevabile'}}</dd></dl>
<div class="actions"><button (click)="pwa.measureStorage()">Controlla spazio</button><a class="button" routerLink="/alimentazione">Test AI locale e alimentazione</a>@if(pwa.updateReady()){<button class="primary" (click)="pwa.reload()" [disabled]="pwa.updating()">{{pwa.updating()?'Salvataggio e aggiornamento…':'Aggiorna app in sicurezza'}}</button>}</div>
<div class="actions"><button class="primary" (click)="tests.run()" [disabled]="tests.running()">{{tests.running()?'Test locale in corso…':'Esegui test su questo dispositivo'}}</button></div><div class="list" style="margin-top:16px">@for(test of tests.results();track test.name){<div><span class="pill" [class.green]="test.state==='OK'">{{test.state}}</span><b style="font-size:12px;margin-left:8px">{{test.name}}</b><p class="subtle">{{test.detail}}</p></div>}</div>
<p class="subtle" style="margin-top:16px">Installazione: in Safari apri Condividi → Aggiungi alla schermata Home → apri GymTrack dall’icona. Prima del passaggio esporta un backup nell’app File: se l’archivio della PWA è vuoto, importalo da File. Safari e l’app installata possono usare archivi distinti.</p>
<p class="subtle" style="margin-top:12px">Prima prova: apri tutte le sezioni online, abilita l’archivio offline se usi un account, poi attiva modalità aereo e riapri dall’icona. Prova una serie, un pasto e un backup. Video esterni e funzioni condivise richiedono la rete.</p>
<p class="subtle" style="margin-top:12px">Foto, memoria e velocità AI vanno provate su questo dispositivo: nessun test automatico equivale a una certificazione su Safari iOS. Conserva una copia JSON in File, anche se il browser concede la persistenza.</p>
</section><gt-iphone-checklist/>
`})
export class IosStatusComponent {pwa=inject(PwaService);tests=inject(DeviceTestsService);}
