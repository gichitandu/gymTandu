import '@angular/compiler';
import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import {createEnvironmentInjector,EnvironmentInjector,runInInjectionContext,signal} from '@angular/core';
import {ActivatedRoute,Router,convertToParamMap} from '@angular/router';
import {afterEach,it,expect,vi} from 'vitest';
import {AuthService} from '../src/app/services/auth';
import {Store} from '../src/app/services/store';
import {ArchiveSyncService} from '../src/app/services/archive-sync';
import {ExcelImportService,excelImportIdentity} from '../src/app/services/excel-import-service';
import {ExcelImportComponent} from '../src/app/features/excel-import.component';
import type {ExcelProgramDraft} from '../src/app/models/excel-import';
const injectors:EnvironmentInjector[]=[];
afterEach(async()=>{for(const injector of injectors.splice(0))injector.destroy();await Dexie.delete('gymtrack-excel-files-v1');vi.unstubAllGlobals();});
function fixture(online=false){
 const navigator={onLine:online};vi.stubGlobal('navigator',navigator);vi.stubGlobal('window',new EventTarget());vi.stubGlobal('document',Object.assign(new EventTarget(),{visibilityState:'visible'}));
 const user=signal<any>({id:'owner'}),plans=signal<any[]>([]),remote:any[]=[];
 const request=vi.fn(async(path:string,body?:any)=>{if(path==='excel-imports')return{imports:remote};if(path.endsWith('/confirm')){const id=path.split('/')[1],plan=plans().find(plan=>plan.program.importId===id)!;remote.push({id,planId:plan.id,sourceName:plan.program.sourceName,fileHash:plan.program.fileHash,planName:plan.name,startDate:plan.program.startDate,endDate:plan.program.endDate,weeks:plan.program.weeks,importedAt:Date.now(),confirmedAt:Date.now(),status:'active'});return{ok:true};}throw Error('Unexpected '+path);});
 const auth={user,offlineMode:()=>false,request},cloud={flush:vi.fn().mockResolvedValue(true),status:signal('saved'),lastErrorCode:signal('')},store={ready:()=>true,data:()=>({plans:plans(),exercises:[]}),error:()=>'',excelProgramConflicts:vi.fn(()=>[] as string[]),importExcelProgram:vi.fn(async(draft:ExcelProgramDraft,id:string)=>{const planId='excel-plan-'+id;plans.update(value=>[...value,{id:planId,name:draft.name,program:{...draft,importId:id,importedAt:Date.now(),sessionCount:draft.sessions.length}}]);return planId;}),removeUnconfirmedExcelImport:vi.fn(async(id:string)=>{plans.update(value=>value.filter(plan=>plan.program?.importId!==id));return true;})};
 const fetch=vi.fn(async(path:string,options:any)=>{if(path.endsWith('/confirm')){await request(path.slice(5),JSON.parse(options.body));}return Response.json({ok:true});});vi.stubGlobal('fetch',fetch);
 const injector=createEnvironmentInjector([{provide:AuthService,useValue:auth},{provide:Store,useValue:store},{provide:ArchiveSyncService,useValue:cloud},ExcelImportService],null as unknown as EnvironmentInjector);injectors.push(injector);
 return{service:injector.get(ExcelImportService),injector,user,plans,store,cloud,request,fetch,navigator};
}
function draft():ExcelProgramDraft{return{name:'Piano',description:'',startDate:'2026-11-02',endDate:'2026-11-02',weeks:1,sourceName:'Piano.xlsx',sourceKind:'GT-1',fileHash:'a'.repeat(64),warnings:[],sessions:[{date:'2026-11-02',week:1,title:'Giorno A',weekday:1,phase:'Programma',notes:'',exercises:[{sourceId:'E1',name:'Panca',order:0,sets:2,repsMin:8,repsMax:10,rest:90,notes:''}]}]};}
it('makes a retry identity specific to account, file and start date',async()=>{
 expect(await excelImportIdentity('a','f','2026-11-02')).toBe(await excelImportIdentity('a','f','2026-11-02'));
 expect(await excelImportIdentity('a','f','2026-11-02')).not.toBe(await excelImportIdentity('b','f','2026-11-02'));
 expect(await excelImportIdentity('a','f','2026-11-02')).not.toBe(await excelImportIdentity('a','f','2026-11-09'));
});
it('blocks an overlapping import before changing the plan or archiving the file',async()=>{
 const t=fixture(true);t.store.excelProgramConflicts.mockReturnValue(['02/11/2026 · Piano esistente']);
 await expect(t.service.import(draft(),new File(['original'],'Piano.xlsx'))).rejects.toThrow('Importazione bloccata');
 await t.service.load();expect(t.store.importExcelProgram).not.toHaveBeenCalled();expect(t.plans()).toEqual([]);expect(t.service.files()).toEqual([]);expect(t.service.pending()).toEqual([]);expect(t.fetch).not.toHaveBeenCalled();
});
it('requires an online authoritative conflict check before confirming any new plan',async()=>{
 const t=fixture(false);await expect(t.service.import(draft(),new File(['source'],'Piano.xlsx'))).rejects.toThrow('Collegati');expect(t.store.importExcelProgram).not.toHaveBeenCalled();expect(t.fetch).not.toHaveBeenCalled();
});
it('rejects a server overlap preflight before committing any local plan',async()=>{
 const t=fixture(true);t.fetch.mockResolvedValueOnce(Response.json({error:'02/11/2026 · Altro piano',code:'PLAN_OVERLAP'},{status:409}));
 await expect(t.service.import(draft(),new File(['source'],'Piano.xlsx'))).rejects.toThrow('Altro piano');expect(t.store.importExcelProgram).not.toHaveBeenCalled();expect(t.store.removeUnconfirmedExcelImport).not.toHaveBeenCalled();expect(t.plans()).toEqual([]);await t.service.load();expect(t.service.files()).toEqual([]);expect(t.service.pending()).toEqual([]);
});
it('rolls back only the unstarted new plan on explicit post-save server overlap, preserving existing plans',async()=>{
 const t=fixture(true),original={id:'keep',name:'Piano precedente'};t.plans.set([original]);
 t.fetch.mockImplementation(async(path:string)=>path.endsWith('/confirm')?Response.json({error:'Sovrapposizione con piano remoto',code:'PLAN_OVERLAP'},{status:409}):Response.json({ok:true}));
 await expect(t.service.import(draft(),new File(['source'],'Piano.xlsx'))).rejects.toThrow('piano remoto');expect(t.store.removeUnconfirmedExcelImport).toHaveBeenCalledOnce();expect(t.plans()).toEqual([original]);expect(t.service.files()).toEqual([]);expect(t.service.pending()).toEqual([]);
});
it('preserves the original offline and lists it only after server confirmation',async()=>{
 const t=fixture(true);t.fetch.mockImplementationOnce(async()=>{t.navigator.onLine=false;return Response.json({ok:true});});const result=await t.service.import(draft(),new File(['original bytes'],'Piano.xlsx'));expect(result.synced).toBe(false);expect(t.plans()).toHaveLength(1);expect(t.service.files()).toEqual([]);expect(t.service.pending()).toHaveLength(1);
 t.navigator.onLine=true;await t.service.completePending();expect(t.service.files()).toHaveLength(1);expect(t.service.pending()).toEqual([]);expect(t.store.importExcelProgram).toHaveBeenCalledOnce();expect(t.request).toHaveBeenCalledWith(expect.stringMatching(/\/confirm$/),{planId:result.planId});
 const payload=JSON.parse(t.fetch.mock.calls[0][1].body);expect(atob(payload.fileBase64)).toBe('original bytes');
});
it('retries a failed original upload without creating a second plan',async()=>{
 const t=fixture(true);t.cloud.flush.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
 const file=new File(['original'],'Piano.xlsx');const first=await t.service.import(draft(),file);expect(first.synced).toBe(false);expect(t.service.files()).toEqual([]);
 const next=await t.service.import(draft(),file);expect(next.planId).toBe(first.planId);expect(next.synced).toBe(true);expect(t.store.importExcelProgram).toHaveBeenCalledOnce();expect(t.plans()).toHaveLength(1);
});
it('does not expose another account’s cached files or pending metadata',async()=>{
 const t=fixture(true);t.fetch.mockImplementationOnce(async()=>{t.navigator.onLine=false;return Response.json({ok:true});});await t.service.import(draft(),new File(['source'],'Piano.xlsx'));expect(t.service.pending()).toHaveLength(1);
 t.user.set({id:'someone-else'});await t.service.load();expect(t.service.files()).toEqual([]);expect(t.service.pending()).toEqual([]);
});
it('requires a valid Monday before enabling file selection in the actual import component',async()=>{
 const t=fixture();const injector=createEnvironmentInjector([{provide:AuthService,useValue:{user:t.user,offlineMode:()=>false}},{provide:Store,useValue:t.store},{provide:ExcelImportService,useValue:{load:vi.fn(),files:()=>[]}},{provide:Router,useValue:{navigate:vi.fn()}},{provide:ActivatedRoute,useValue:{snapshot:{queryParamMap:convertToParamMap({})}}}],null as unknown as EnvironmentInjector);injectors.push(injector);
 const component=runInInjectionContext(injector,()=>new ExcelImportComponent());expect(component.canChooseFile()).toBe(false);await component.chooseDate('2026-11-03');expect(component.dateProblem()).toContain('lunedì');expect(component.canChooseFile()).toBe(false);await component.useNextMonday();expect(component.date()).toBe('2026-11-09');expect(component.canChooseFile()).toBe(true);
 const row={key:'constructor',name:'constructor',sourceIds:['constructor']};expect(component.mapping(row)).toBe('');expect(component.query(row)).toBe('');expect(component.candidates(row)).toEqual([]);
});
