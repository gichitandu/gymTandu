import {Injectable} from '@angular/core';
import {WorkoutUiState} from '../models/domain';
export function validWorkoutUi(v:any):v is WorkoutUiState {
 return !!v&&typeof v.id==='string'&&v.id.length<=150&&['list','detail','record','rest'].includes(v.step)&&['sets','history','notes'].includes(v.tab)&&['work','warmup'].includes(v.kind)&&typeof v.exerciseId==='string'&&v.exerciseId.length<=150&&typeof v.setId==='string'&&v.setId.length<=150&&typeof v.paused==='boolean'&&typeof v.setNotes==='string'&&v.setNotes.length<=10000&&[v.restEnd,v.restTotal,v.pausedSeconds,v.weight,v.reps].every(n=>Number.isFinite(n)&&n>=0)&&v.restTotal<=7200&&v.pausedSeconds<=7200&&Number.isInteger(v.reps)&&v.reps>=1&&v.reps<=999&&(v.rpe===undefined||Number.isFinite(v.rpe)&&v.rpe>=1&&v.rpe<=10)&&typeof v.updatedAt==='string'&&Number.isFinite(Date.parse(v.updatedAt));
}
@Injectable({providedIn:'root'})
export class WorkoutResumeService {
 private readonly writer=crypto.randomUUID();
 private key(archive:string){return 'gymtrack-resume-v1:'+archive;}
 read(archive:string,id:string,persisted?:WorkoutUiState,revision?:number){let cached:WorkoutUiState|undefined;try{const raw=JSON.parse(localStorage.getItem(this.key(archive))||'null');const compatible=revision===undefined?(raw?.version===1||raw?.version===2):raw?.version===2?raw.revision===revision:raw?.version===1&&revision===0;if(compatible&&validWorkoutUi(raw.state)&&raw.state.id===id)cached=raw.state;}catch{}if(persisted&&!validWorkoutUi(persisted))persisted=undefined;return cached&&(!persisted||cached.updatedAt>=persisted.updatedAt)?cached:persisted?.id===id?persisted:undefined;}
 write(archive:string,state:WorkoutUiState,revision?:number){if(!validWorkoutUi(state))return false;try{localStorage.setItem(this.key(archive),JSON.stringify(revision===undefined?{version:1,state}:{version:2,revision,writer:this.writer,state}));return true;}catch{return false;}}
 // Only this tab may carry its pending inputs across one of its own writes.
 // A different tab's older journal must keep its old revision and be ignored.
 rebase(archive:string,from:number|undefined,to:number|undefined){if(from===undefined||to===undefined)return;try{const raw=JSON.parse(localStorage.getItem(this.key(archive))||'null');if(!validWorkoutUi(raw?.state))return;const ownsCurrent=raw.version===2&&raw.revision===from&&(raw.writer===this.writer||from===to);if(raw.version===1&&from===0||ownsCurrent)localStorage.setItem(this.key(archive),JSON.stringify({version:2,revision:to,writer:this.writer,state:raw.state}));}catch{}}
 invalidate(archive:string,revision:number|undefined){try{const raw=JSON.parse(localStorage.getItem(this.key(archive))||'null');if(raw?.version===2&&typeof raw.revision==='number'&&revision!==undefined&&raw.revision>revision)return;localStorage.removeItem(this.key(archive));}catch{}}
 clear(archive:string){try{localStorage.removeItem(this.key(archive));}catch{}}
}
