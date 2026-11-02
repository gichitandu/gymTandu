import {exerciseMotionFrames} from '../services/exercise-motion-frames';
import {ExerciseMotionComponent} from '../shared/exercise-motion.component';
import {RouterLink} from '@angular/router';
import { confirmationForContext } from '../services/confirmation';
import { ExerciseThumbComponent } from "../shared/exercise-thumb.component";
import { matchesExercise } from "../services/exercise-search";
import {ExerciseScope,ExerciseScopeComponent} from "../shared/exercise-scope.component";
import {MachineSetupComponent} from "../shared/machine-setup.component";
import { ExerciseFamiliesComponent } from "../shared/exercise-families.component";
import { compressPhoto } from "../services/images";
import { ExerciseVideoComponent } from "../shared/exercise-video.component";
import { A11yModule } from "@angular/cdk/a11y";
import { Component, computed, HostListener, inject, signal } from "@angular/core";
import {
  FormBuilder,
  ReactiveFormsModule,
  FormsModule,
  Validators,
} from "@angular/forms";
import { Store } from "../services/store";
import { Exercise, LoadMode, uid, now } from "../models/domain";
import { IconComponent } from "../shared/icon.component";
import { StatusComponent } from "../shared/status.component";
import { DraftSession, FormDraftService } from "../services/form-drafts";
type CatalogEditorDraft = {
  kind:'exercise'|'group';editId:string;saveId:string;baseline:string;
  value?:ReturnType<CatalogComponent['form']['getRawValue']>;image?:Blob;pendingImage?:Blob;groupName?:string;
};
@Component({
  standalone: true,
  styleUrls: ["./account-polish.css", "./catalog-design.css"],
  imports: [RouterLink,ExerciseMotionComponent, ExerciseThumbComponent,
    A11yModule,ExerciseScopeComponent,MachineSetupComponent,
    ExerciseFamiliesComponent,
    ExerciseVideoComponent,
    FormsModule,
    ReactiveFormsModule,
    IconComponent,
    StatusComponent,
  ],
  template: `<div class="catalog-design-page">
    <header class="catalog-heading"><a class="icon-btn ghost" routerLink="/piani" aria-label="Torna agli allenamenti"><gt-icon name="back"/></a><div><h1>Catalogo esercizi</h1><p>Tecnica, attrezzi e movimenti.</p></div>@if(s.canEditCatalog()){<button type="button" class="primary catalog-add" (click)="open()" [disabled]="!s.ready()" aria-label="Nuovo esercizio"><gt-icon name="plus"/></button>}</header>
    <gt-status />
    @if(draftNotice()){<p class="notice" role="status">{{draftNotice()}}</p>}
    <label class="catalog-search"><gt-icon name="search"/><input type="search" aria-label="Cerca un esercizio" placeholder="Esercizio o attrezzo…" [ngModel]="query()" (ngModelChange)="query.set($event)"/>@if(query()){<button type="button" class="ghost" (click)="query.set('')" aria-label="Cancella ricerca"><gt-icon name="close"/></button>}</label>
    <nav class="catalog-muscle-tabs" aria-label="Zone muscolari"><button type="button" [class.selected]="!group()" [attr.aria-pressed]="!group()" (click)="group.set('')">Tutti</button>@for(g of s.data().muscleGroups;track g.id){<button type="button" [class.selected]="group()===g.id" [attr.aria-pressed]="group()===g.id" (click)="group.set(g.id)">{{g.name}}</button>}</nav>
    <gt-exercise-scope class="catalog-scope" [value]="scope()" (choose)="scope.set($event)"/>
    @if(scope()==='recent'){<p class="catalog-helper">Esercizi delle ultime sessioni, incluse quelle in corso.</p>}
    <details class="catalog-filter-options"><summary><gt-icon name="settings"/><span>Altri filtri</span><gt-icon name="back"/></summary><div class="catalog-filter-fields"><label>Gruppo muscolare<select [ngModel]="group()" (ngModelChange)="group.set($event)"><option value="">Tutti i gruppi</option>@for(g of s.data().muscleGroups;track g.id){<option [value]="g.id">{{g.name}}</option>}</select></label>@if(s.canEditCatalog()){<label>Stato<select [ngModel]="active()" (ngModelChange)="active.set($event)"><option value="active">Attivi</option><option value="all">Tutti, anche disattivati</option><option value="inactive">Solo disattivati</option></select></label>}</div><gt-exercise-families [query]="query()" (choose)="query.set($event);group.set('')"/></details>
    <div class="catalog-count"><span role="status" aria-live="polite">{{filtered().length}} esercizi · {{s.sharedCatalog()?'Catalogo condiviso':'Il tuo catalogo'}}</span>@if(query()||group()||scope()!=='all'||active()!=='active'){<button type="button" class="ghost" (click)="query.set('');group.set('');scope.set('all');active.set('active')">Azzera filtri</button>}</div>
    <div class="catalog-grid catalog-design-list">
      @for(e of filtered();track e.id){
        <article class="card catalog-exercise-card catalog-design-row" [class.catalog-inactive]="!e.active">
          <div class="catalog-row-head"><a class="catalog-exercise-link" [routerLink]="['/esercizio',e.id]"><gt-exercise-thumb [exercise]="e"/><span class="catalog-row-copy"><h3>{{e.name}}</h3><small>{{e.equipment}}</small><span class="catalog-row-tags"><span class="pill">{{s.muscle(e.muscleGroupId)}}</span>@if(!e.active){<span class="catalog-state">Disattivato</span>}</span></span><gt-icon class="catalog-play" [name]="motionFrames(e)?'play':'arrow'"/></a><button type="button" class="ghost favorite-button" [class.favorite-on]="s.isFavorite(e.id)" [attr.aria-pressed]="s.isFavorite(e.id)" [attr.aria-label]="(s.isFavorite(e.id)?'Rimuovi dai preferiti: ':'Aggiungi ai preferiti: ')+e.name" (click)="s.toggleFavorite(e.id)" [disabled]="s.busy()">{{s.isFavorite(e.id)?'★':'☆'}}</button></div>
          @if(motionFrames(e)){<a class="catalog-motion-link" [routerLink]="['/esercizio',e.id]" [queryParams]="{motion:1}"><gt-icon name="play"/>Animazione guidata</a>}
          <details class="catalog-row-options"><summary><span>Dettagli e opzioni</span><gt-icon name="back"/></summary><div class="catalog-row-details"><div class="catalog-detail-heading"><span>{{modeLabel(e.loadMode)}}</span>@if(s.canEditCatalog()){<button type="button" class="ghost" (click)="open(e)"><gt-icon name="edit"/>Modifica</button>}</div>@if(e.description){<p class="catalog-description">{{e.description}}</p>}<gt-exercise-motion [exercise]="e"/><gt-machine-setup [exerciseId]="e.id"/><div class="actions"><gt-exercise-video [exercise]="e"/>@if(s.canEditCatalog()){<label class="active-check"><input type="checkbox" [checked]="e.active" [disabled]="saving()" (change)="toggle(e)"/>Attivo</label>}</div>@if(e.tags.length){<div class="catalog-detail-tags">@for(t of e.tags;track t){<span class="pill">{{t}}</span>}</div>}<a class="button ghost catalog-open-detail" [routerLink]="['/esercizio',e.id]">Apri esercizio<gt-icon name="arrow"/></a></div></details>
        </article>
      }@empty{<div class="card empty catalog-empty"><gt-icon name="search"/><h3>Nessun esercizio trovato</h3><p>{{scope()==='favorites'?'Tocca la stella accanto agli esercizi per ritrovarli qui.':scope()==='recent'?'Qui compariranno gli esercizi delle tue sessioni.':'Prova un altro nome, attrezzo o gruppo muscolare.'}}</p>@if(query()||group()){<button type="button" class="ghost" (click)="query.set('');group.set('')">Rimuovi ricerca e filtri</button>}</div>}
    </div>
    @if(s.canEditCatalog()){<details class="card catalog-group-management"><summary><gt-icon name="settings"/><span>Gestisci gruppi muscolari</span><gt-icon name="back"/></summary><div class="actions">@for(g of s.data().muscleGroups;track g.id){<button type="button" class="ghost" (click)="renameGroup(g.id,g.name)">{{g.name}}<gt-icon name="edit"/></button>}<button type="button" (click)="newGroup()"><gt-icon name="plus"/>Aggiungi gruppo</button></div></details>}
    <p class="catalog-helper catalog-footer">Apri un esercizio per consultarne tecnica e dettagli.</p>
    </div>
    @if (editing() && s.canEditCatalog()) {
      <div class="modal-backdrop" (click)="close($event)">
        <section
          class="modal"
          cdkTrapFocus
          [cdkTrapFocusAutoCapture]="true"
          (keydown.escape)="dismiss()"
          role="dialog"
          aria-modal="true"
          aria-labelledby="exercise-title"
        >
          <div class="modal-head">
            <h2 id="exercise-title">
              {{ editId ? "Modifica esercizio" : "Nuovo esercizio" }}
            </h2>
            <button (click)="dismiss()" [disabled]="saving()" aria-label="Chiudi">×</button>
          </div>
          <form [formGroup]="form" (ngSubmit)="save()">
            <div class="form-grid">
              <label class="wide"
                >Nome<input
                  formControlName="name"
                  maxlength="100"
                  autofocus /></label
              ><label
                >Gruppo principale<select formControlName="muscleGroupId">
                  @for (g of s.data().muscleGroups; track g.id) {
                    <option [value]="g.id">{{ g.name }}</option>
                  }
                </select></label
              ><label
                >Attrezzatura<input
                  formControlName="equipment"
                  maxlength="80" /></label
              ><label class="wide"
                >Gruppi secondari<select
                  formControlName="secondaryMuscleIds"
                  multiple
                  size="3"
                >
                  @for (g of s.data().muscleGroups; track g.id) {
                    <option [value]="g.id">{{ g.name }}</option>
                  }
                </select></label
              ><label class="wide"
                >Modalità di carico<select formControlName="loadMode">
                  <option value="external">
                    Carico esterno (bilanciere, manubri, macchina)
                  </option>
                  <option value="bodyweight">
                    Corpo libero · solo ripetizioni
                  </option>
                  <option value="weighted-bodyweight">
                    Corpo libero con zavorra · peso aggiunto
                  </option>
                  <option value="assisted">
                    Corpo libero assistito · peso di assistenza
                  </option>
                </select></label
              ><label class="wide"
                >Descrizione<textarea
                  formControlName="description"
                  maxlength="2000"
                ></textarea></label
              ><label class="wide">Video dimostrativo (link HTTPS facoltativo)<input type="url" formControlName="videoUrl" maxlength="1000" placeholder="Link video facoltativo" /></label>
              <label class="wide active-check"><input type="checkbox" formControlName="active" />Attivo · visibile ai clienti e selezionabile nelle schede</label>
              <p class="subtle wide">Se la spunta non è selezionata, l’esercizio resta nel catalogo degli admin. Il video è facoltativo: la visibilità dipende soltanto dalla spunta Attivo.</p>
              <label class="wide"
                >Tag, separati da virgola<input
                  formControlName="tags"
                  maxlength="200" /></label
              ><label class="wide"
                >Foto (compressa sul dispositivo prima del salvataggio)<input
                  type="file"
                  [disabled]="saving()"
                  accept="image/*"
                  (change)="image($event)"
              /></label>
              <label class="wide">Scatta una foto<input type="file" accept="image/*" capture="environment" [disabled]="saving()" (change)="image($event)" /></label>
              @if(imageLoading()){<p class="subtle wide" role="status">Preparazione della foto…</p>}
              @if (imageBlob) {
                <div class="wide">
                  <span class="pill green">Immagine selezionata</span>
                  <button
                    type="button"
                    class="ghost"
                    [disabled]="saving()" (click)="removeImage()"
                  >
                    Rimuovi immagine
                  </button>
                </div>
              }
            </div>
            <p class="subtle" style="margin-top:12px">
              Per corpo libero, zavorra e assistenza, volume e 1RM non sono
              calcolati: i carichi non sono confrontabili con quelli esterni.
            </p>
            <div class="actions">
              <button
                class="primary"
                type="submit"
                [disabled]="form.invalid || s.busy() || saving() || imageLoading()"
              >
                Salva esercizio</button
              ><button type="button" (click)="dismiss()" [disabled]="saving()">
                Annulla
              </button>
            </div>
          </form>
        </section>
      </div>
    }
    @if(groupEditing()&&s.canEditCatalog()){
      <div class="modal-backdrop" (click)="close($event)"><section class="modal" cdkTrapFocus [cdkTrapFocusAutoCapture]="true" role="dialog" aria-modal="true" aria-labelledby="group-title" (keydown.escape)="dismiss()">
        <div class="modal-head"><h2 id="group-title">{{editId?'Modifica gruppo muscolare':'Nuovo gruppo muscolare'}}</h2><button type="button" (click)="dismiss()" [disabled]="saving()" aria-label="Chiudi">×</button></div>
        <form #groupForm="ngForm" (ngSubmit)="saveGroup()"><label>Nome del gruppo<input name="group-name" [(ngModel)]="groupName" required maxlength="80" [disabled]="saving()"/></label><div class="actions"><button class="primary" [disabled]="saving()||groupForm.invalid||!groupName.trim()">{{saving()?'Salvataggio…':'Salva gruppo'}}</button><button type="button" (click)="dismiss()" [disabled]="saving()">Annulla</button></div></form>
      </section></div>
    }`,
})
export class CatalogComponent {
  motionFrames=exerciseMotionFrames;
 private confirmation=confirmationForContext();
  s = inject(Store);
  fb = inject(FormBuilder);
  query = signal("");scope=signal<ExerciseScope>("all");
  group = signal("");
  active = signal("active");
  editing = signal(false);
  groupEditing = signal(false);
  groupName = '';
  draftNotice = signal('');
  private drafts = inject(FormDraftService,{optional:true});
  private draftSession?: DraftSession<CatalogEditorDraft>;
  private draftSubscription?: {unsubscribe():void};
  private formBaseline='';
  private imageBaseline?:Blob;
  private pendingImage?:Blob;
  private restoringDraft=false;
  private destroyed=false;
  private editorRequest=0;
  private restoreTimer?:ReturnType<typeof setTimeout>;
  saving = signal(false);
  imageLoading = signal(false);
  private imageRequest = 0;
  editId = "";
  private formSaveId = "";
  imageBlob?: Blob;
  form = this.fb.nonNullable.group({
    name: ["", [Validators.required, Validators.pattern(/\S/)]],
    muscleGroupId: ["", Validators.required],
    secondaryMuscleIds: [[] as string[]],
    equipment: ["", Validators.required],
    loadMode: ["external" as LoadMode],
    description: [""],
    tags: [""],
    videoUrl: [""],
    active: [false],
  });
  ngOnInit(){
    if(!this.drafts)return;
    this.draftSession=this.drafts.bind(this.s.archiveKey(),'catalog-editor',()=>this.captureDraft(),value=>{void this.restoreDraft(value).catch(()=>this.draftNotice.set('La bozza non è stata riaperta. I dati già salvati sono conservati.'));});
    this.draftSubscription=this.form.valueChanges.subscribe(()=>{if(!this.restoringDraft)this.draftSession?.changed();});
  }
  @HostListener('input') @HostListener('change') draftChanged(){if(!this.restoringDraft)this.draftSession?.changed();}
  private hasChanges(){return this.groupEditing()?this.groupName!==this.formBaseline:this.editing()&&(JSON.stringify(this.form.getRawValue())!==this.formBaseline||this.imageBlob!==this.imageBaseline||!!this.pendingImage);}
  private captureDraft():CatalogEditorDraft|null{
    if(!this.hasChanges())return null;
    return this.groupEditing()?{kind:'group',editId:this.editId,saveId:this.formSaveId,baseline:this.formBaseline,groupName:this.groupName}:{kind:'exercise',editId:this.editId,saveId:this.formSaveId,baseline:this.formBaseline,value:this.form.getRawValue(),image:this.imageBlob,pendingImage:this.pendingImage};
  }
  private async samePhoto(first?:Blob,second?:Blob){
    if(first===second)return true;
    if(!first||!second||first.type!==second.type||first.size!==second.size)return false;
    const [a,b]=await Promise.all([first.arrayBuffer(),second.arrayBuffer()]);
    const other=new Uint8Array(b);return new Uint8Array(a).every((byte,index)=>byte===other[index]);
  }
  private async appliedDraft(value:CatalogEditorDraft){
    if(value.kind==='group')return this.s.data().muscleGroups.some(group=>group.id===value.saveId&&group.name===(value.groupName||'').trim());
    const item=this.s.exercise(value.saveId),form=value.value;if(!item||!form||value.pendingImage)return false;
    const tags=[...new Set(form.tags.split(',').map(tag=>tag.trim()).filter(Boolean))];
    return item.name===form.name.trim()&&item.muscleGroupId===form.muscleGroupId&&JSON.stringify(item.secondaryMuscleIds)===JSON.stringify(form.secondaryMuscleIds.filter(id=>id!==form.muscleGroupId))&&item.equipment===form.equipment.trim()&&item.loadMode===form.loadMode&&item.description===form.description.trim()&&JSON.stringify(item.tags)===JSON.stringify(tags)&&item.active===form.active&&(item.videoUrl||'')===form.videoUrl.trim()&&await this.samePhoto(item.image,value.image);
  }
  private async restoreDraft(value:CatalogEditorDraft){
    if(this.destroyed||this.editing()||this.groupEditing())return;
    if(typeof this.s.ready==='function'&&!this.s.ready()){this.restoreTimer=setTimeout(()=>void this.restoreDraft(value),100);return;}
    if(!this.s.canEditCatalog())return;
    const items=value?.kind==='group'?this.s.data().muscleGroups:this.s.data().exercises;
    if(!value||!['exercise','group'].includes(value.kind)||!value.saveId||value.kind==='exercise'&&!value.value||typeof value.baseline!=='string'||value.editId&&!items.some(item=>item.id===value.editId)){
      this.draftNotice.set('La bozza precedente è già stata salvata o si riferiva a un elemento non più disponibile.');this.clearStoredDraft();return;
    }
    const request=this.editorRequest,applied=await this.appliedDraft(value);
    if(this.destroyed||request!==this.editorRequest||this.editing()||this.groupEditing())return;
    if(applied){this.clearStoredDraft();return;}
    this.restoringDraft=true;
    try{
      this.editId=items.some(item=>item.id===value.saveId)?value.saveId:value.editId;this.formSaveId=value.saveId;this.formBaseline=value.baseline;
      if(value.kind==='group'){this.groupName=value.groupName||'';this.groupEditing.set(true);}
      else if(value.value){this.form.reset(value.value);this.imageBlob=value.image;this.imageBaseline=this.s.exercise(value.editId)?.image;this.pendingImage=value.pendingImage;this.editing.set(true);if(value.pendingImage)void this.image({target:{files:[value.pendingImage],value:''}} as unknown as Event);}
      this.draftNotice.set('Bozza recuperata. Controlla i valori e salva quando sei pronto.');
    }finally{this.restoringDraft=false;}
  }
  private beginEditor(retry:()=>void){
    if(this.saving()||!this.s.canEditCatalog())return false;
    if(this.hasChanges()){void this.confirmation.ask('Scartare le modifiche non salvate prima di aprire un altro modulo?').then(ok=>{if(ok&&!this.destroyed&&!this.saving()){this.editorSaved();retry();}});return false;}
    if(this.editing()||this.groupEditing())this.clearStoredDraft();
    clearTimeout(this.restoreTimer);this.editorRequest++;this.imageRequest++;this.imageLoading.set(false);this.pendingImage=undefined;this.editing.set(false);this.groupEditing.set(false);this.draftNotice.set('');return true;
  }
  private clearStoredDraft(){void this.draftSession?.clear().catch(()=>{/* Pending cleanup is retried by the draft service before exit. */});}
  private editorSaved(){this.editorRequest++;this.imageRequest++;this.imageLoading.set(false);this.pendingImage=undefined;this.editing.set(false);this.groupEditing.set(false);this.draftNotice.set('');this.clearStoredDraft();}
  ngOnDestroy(){clearTimeout(this.restoreTimer);void this.draftSession?.destroy();this.destroyed=true;this.editorRequest++;this.imageRequest++;this.draftSubscription?.unsubscribe();}
  filtered = computed(() =>
    this.s
      .data()
      .exercises.filter(
        (e) =>
          (this.scope()==='all'||(this.scope()==='favorites'?this.s.isFavorite(e.id):this.s.recentExerciseIds().includes(e.id))) &&
          (this.s.canEditCatalog() ? this.active() === "all" || (this.active() === "inactive" ? !e.active : e.active) : e.active) &&
          (!this.group() || e.muscleGroupId === this.group()) &&
          matchesExercise(e,this.query()),
      )
      .sort((a, b) => this.scope()==='recent'?this.s.recentExerciseIds().indexOf(a.id)-this.s.recentExerciseIds().indexOf(b.id):this.s.muscle(a.muscleGroupId).localeCompare(this.s.muscle(b.muscleGroupId)) || a.name.localeCompare(b.name)),
  );
  modeLabel(m: LoadMode) {
    return {
      external: "Carico esterno",
      bodyweight: "Corpo libero",
      "weighted-bodyweight": "Con zavorra",
      assisted: "Assistito",
    }[m];
  }
  open(e?: Exercise) {
    if(!this.beginEditor(()=>this.open(e)))return;
    this.editId = e?.id || "";
    this.formSaveId = e?.id || uid();
    this.imageBlob = e?.image;
    this.form.reset({
      name: e?.name || "",
      muscleGroupId:
        e?.muscleGroupId || this.s.data().muscleGroups[0]?.id || "",
      secondaryMuscleIds: e?.secondaryMuscleIds || [],
      equipment: e?.equipment || "",
      loadMode: e?.loadMode || "external",
      description: e?.description || "",
      tags: e?.tags.join(", ") || "",
      videoUrl: e?.videoUrl || "",
      active: e?.active ?? !this.s.sharedCatalog(),
    });
    this.editing.set(true);
    this.formBaseline=JSON.stringify(this.form.getRawValue());this.imageBaseline=this.imageBlob;this.draftSession?.changed();
  }
  close(e: MouseEvent) {
    if (e.target === e.currentTarget) this.dismiss();
  }
  async dismiss(){if(this.saving())return;if(this.hasChanges()&&!await this.confirmation.ask('Scartare le modifiche non salvate?'))return;this.editorSaved();}
  removeImage(){if(this.saving())return;this.imageRequest++;this.imageLoading.set(false);this.imageBlob=undefined;this.pendingImage=undefined;this.draftSession?.changed();}
  async image(event: Event) {
    const input=event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    input.value='';
    if(this.saving())return;
    const request=++this.imageRequest;this.imageLoading.set(true);this.pendingImage=file;this.draftSession?.changed();
    try {const photo=await compressPhoto(file);if(request===this.imageRequest)this.imageBlob=photo;}
    catch(e){if(request===this.imageRequest)this.s.error.set((e as Error).message);}
    finally{if(request===this.imageRequest){this.imageLoading.set(false);this.pendingImage=undefined;this.draftSession?.changed();}}
  }
  async save() {
    if (this.form.invalid || this.saving() || this.imageLoading() || !this.s.canEditCatalog()) return;
    this.saving.set(true);
    this.form.disable({emitEvent:false});
    try {
    const v = this.form.getRawValue();
    const id = this.formSaveId ||= this.editId || uid();
    const old = this.s.exercise(id);
    if (
      await this.s.saveExercise({
        id,
        name: v.name.trim(),
        muscleGroupId: v.muscleGroupId,
        secondaryMuscleIds: v.secondaryMuscleIds.filter(
          (id) => id !== v.muscleGroupId,
        ),
        equipment: v.equipment.trim(),
        description: v.description.trim(),
        loadMode: v.loadMode,
        tags: [
          ...new Set(
            v.tags
              .split(",")
              .map((t) => t.trim())
              .filter(Boolean),
          ),
        ],
        active: v.active,
        videoUrl: v.videoUrl.trim(),
        thumbnailUrl: old?.thumbnailUrl,
        videoTitle: old?.videoTitle,
        videoChannel: old?.videoChannel,
        createdAt: old?.createdAt || now(),
        image: this.imageBlob,
      })
    )
      this.editorSaved();
    } finally { this.form.enable({emitEvent:false});this.saving.set(false); }
  }
  async toggle(e: Exercise) {
    if(this.saving() || !this.s.canEditCatalog())return;
    this.saving.set(true);try{await this.s.saveExercise({...e,active:!e.active});}finally{this.saving.set(false);}
  }
  newGroup() {
    if(!this.beginEditor(()=>this.newGroup()))return;this.editId='';this.formSaveId=uid();this.groupName='';this.formBaseline='';this.groupEditing.set(true);this.draftSession?.changed();
  }
  renameGroup(id:string,current:string) {
    if(!this.beginEditor(()=>this.renameGroup(id,current)))return;this.editId=id;this.formSaveId=id;this.groupName=current;this.formBaseline=current;this.groupEditing.set(true);this.draftSession?.changed();
  }
  async saveGroup(){if(this.saving()||!this.groupEditing()||!this.groupName.trim()||this.groupName.length>80||!this.s.canEditCatalog())return;this.saving.set(true);try{if(await this.s.saveMuscleGroup(this.formSaveId||=this.editId||uid(),this.groupName.trim()))this.editorSaved();}finally{this.saving.set(false);}}
}
