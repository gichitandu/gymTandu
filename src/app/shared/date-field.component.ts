import { booleanAttribute, ChangeDetectionStrategy, Component, computed, forwardRef, Input, signal } from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';
import { parseLocalDate } from '../services/calendar';

export function dateFieldLabel(value:string){
  if(!value)return 'gg/mm/aaaa';
  try{const date=parseLocalDate(value);return `${String(date.getDate()).padStart(2,'0')}/${String(date.getMonth()+1).padStart(2,'0')}/${date.getFullYear()}`;}catch{return 'Data non valida';}
}
@Component({selector:'gt-date-field',standalone:true,changeDetection:ChangeDetectionStrategy.OnPush,
 providers:[{provide:NG_VALUE_ACCESSOR,useExisting:forwardRef(()=>DateFieldComponent),multi:true}],
 template:`<span class="date-field" [class.date-disabled]="disabled||formDisabled()"><span class="date-text" [class.date-placeholder]="!value()" aria-hidden="true">{{label()}}</span><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="3"/><path d="M7 3v4m10-4v4M3 11h18"/></svg><input class="date-native" type="date" [value]="value()" [min]="min" [max]="max" [disabled]="disabled||formDisabled()" [required]="required" [attr.aria-label]="ariaLabel||null" (change)="choose($event)" (blur)="touch()"/></span>`,
 styles:[`:host{display:block;box-sizing:border-box;width:100%;min-width:0;max-width:100%;contain:inline-size;margin-top:8px}.date-field{position:relative;display:flex;align-items:center;justify-content:space-between;gap:12px;width:100%;min-width:0;max-width:100%;min-height:48px;box-sizing:border-box;padding:12px 14px;border:1px solid var(--line,#252e3c);border-radius:12px;background:var(--bg,#0b0f17);color:var(--text,#f1f5fc)}.date-text{min-width:0;overflow:hidden;text-overflow:ellipsis;font:500 16px/1.4 system-ui;white-space:nowrap;font-variant-numeric:tabular-nums}.date-placeholder{color:var(--muted,#8e9bad)}svg{flex:none;width:20px;height:20px;fill:none;stroke:var(--muted,#8e9bad);stroke-width:1.6;stroke-linecap:round}.date-field:focus-within{outline:2px solid var(--blue,#367dff);outline-offset:2px}.date-native[type=date]{position:absolute;inset:0;display:block;box-sizing:border-box;width:100%;min-width:0;max-width:100%;height:100%;min-height:0;margin:0;padding:0;border:0;opacity:0;overflow:hidden;cursor:pointer;font-size:16px}:host(.compact){margin-top:0;width:150px;max-width:100%}:host(.compact) .date-field{min-height:40px;padding:8px 10px;gap:8px}:host(.compact) .date-text{font-size:13px}:host(.compact) svg{width:17px;height:17px}.date-disabled{opacity:.55}.date-disabled input{cursor:default}:host.ng-invalid.ng-touched .date-field{border-color:#ff6976}`]})
export class DateFieldComponent implements ControlValueAccessor {
 @Input() min='';@Input() max='';@Input() disabled=false;@Input({transform:booleanAttribute}) required=false;
 @Input('aria-label') ariaLabel='';
 formDisabled=signal(false);value=signal('');label=computed(()=>dateFieldLabel(this.value()));
 private changed:(value:string)=>void=()=>{};touch:()=>void=()=>{};
 writeValue(value:string|null|undefined){this.value.set(typeof value==='string'?value:'');}
 registerOnChange(callback:(value:string)=>void){this.changed=callback;}
 registerOnTouched(callback:()=>void){this.touch=callback;}
 setDisabledState(disabled:boolean){this.formDisabled.set(disabled);}
 choose(event:Event){if(this.disabled||this.formDisabled())return;const value=(event.target as HTMLInputElement).value;this.value.set(value);this.changed(value);this.touch();}
}
