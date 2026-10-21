import { Injectable, signal } from '@angular/core';
import { GymDatabase } from '../core/database';
import { seed } from '../core/seed';
import { exportBackup, importBackup } from './backup';
import { compressPhoto } from './images';
export interface DeviceTest {name:string;state:'OK'|'DA PROVARE'|'ERRORE';detail:string}
@Injectable({providedIn:'root'})
export class DeviceTestsService {
 running=signal(false);results=signal<DeviceTest[]>([]);
 async run(){
  if(this.running())return;this.running.set(true);this.results.set([]);
  const record=(name:string,state:DeviceTest['state'],detail:string)=>this.results.update(r=>[...r,{name,state,detail}]);
  const db=new GymDatabase('gymtrack-device-test-'+crypto.randomUUID());
  try {
   const canvas=document.createElement('canvas');canvas.width=640;canvas.height=480;canvas.getContext('2d')!.fillRect(0,0,640,480);
   const initial=await new Promise<Blob>((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(Error('JPEG non disponibile.')),'image/jpeg'));
   const photo=await compressPhoto(initial);record('Compressione foto JPEG',photo.size<=500*1024?'OK':'ERRORE',`${Math.round(photo.size/1024)} KB. Fotocamera e HEIC richiedono una prova separata.`);
   canvas.width=1;canvas.height=1;
   const d=seed();d.meals.push({id:'device-test',name:'Pasto di prova',date:'2026-10-21',grams:100,calories:100,protein:5,carbs:10,fat:4,notes:'Test isolato',photo,source:'manual',createdAt:new Date().toISOString()});
   await db.replace(d);db.close();await db.open();const read=await db.snapshot();
   if(read.meals[0]?.photo?.size!==photo.size)throw Error('La foto non è stata riletta correttamente.');
   record('Dexie / IndexedDB e riapertura','OK','Pasto e foto riletti da un database di prova, separato dai dati personali.');
   const restored=await importBackup(await exportBackup(read));if(restored.meals[0]?.photo?.size!==photo.size)throw Error('Backup non coerente.');
   record('Backup JSON con foto e pasti','OK','Esportazione e ripristino verificati in memoria. Salva e riapri un file reale dall’app File per completare la prova.');
  }catch(e){record('Archiviazione / immagini','ERRORE',(e as Error).message);}
  finally{db.close();await db.delete().catch(()=>{});this.running.set(false);}
  record('PWA Home',matchMedia('(display-mode:standalone)').matches||(navigator as Navigator&{standalone?:boolean}).standalone?'OK':'DA PROVARE','Esegui questa prova anche aprendo l’app dalla sua icona Home.');
  record('Offline reale','DA PROVARE','Modalità aereo: riapri, registra una serie e un pasto, esporta il backup.');
  record('Dynamic Island, tastiera e foto','DA PROVARE','Prova verticale e orizzontale, fotocamera, galleria, negazione accesso e app File.');
  record('Velocità AI su questo iPhone','DA PROVARE','In Alimentazione avvia “Scarica e prova il modello”: vengono misurati tempi CPU reali sul dispositivo.');
 }
}
