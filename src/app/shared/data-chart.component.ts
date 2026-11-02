import { Component, computed, input } from '@angular/core';
export interface DataPoint {label:string;value:number}
let dataChartCount=0;
@Component({selector:'gt-data-chart',standalone:true,template:`
@if(points().length){
 <div class="spark-chart"><svg viewBox="0 0 340 180" role="img" [attr.aria-label]="title()+', '+points().length+' rilevazioni'">
  <defs><linearGradient [id]="gradientId" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="var(--accent, #be47ff)" stop-opacity=".34"/><stop offset="1" stop-color="var(--accent, #be47ff)" stop-opacity=".01"/></linearGradient></defs>
  @for(tick of [0,1,2,3];track tick){<line x1="32" x2="330" [attr.y1]="20+tick*40" [attr.y2]="20+tick*40" stroke="var(--line, currentColor)" stroke-dasharray="3 4" stroke-width="1" opacity=".7"/>}
  <text x="27" y="24" text-anchor="end" fill="var(--muted, currentColor)" font-size="10">{{axisLabel(bounds().max)}}</text>
  <text x="27" y="144" text-anchor="end" fill="var(--muted, currentColor)" font-size="10">{{axisLabel(bounds().min)}}</text>
  <path [attr.d]="area()" [attr.fill]="'url(#'+gradientId+')'"/>
  <path [attr.d]="curve()" fill="none" stroke="var(--accent-text, var(--accent, #be47ff))" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
  @for(p of plotted();track $index){<circle [attr.cx]="p.x" [attr.cy]="p.y" [attr.r]="$last?4:2.5" fill="var(--accent-text, var(--accent, #be47ff))" stroke="var(--accent-text, var(--accent, #be47ff))" stroke-width="1"><title>{{points()[$index].label}}: {{points()[$index].value.toLocaleString('it-IT',{maximumFractionDigits:1})}} {{unit()}}</title></circle>}
  <text x="32" y="171" fill="var(--muted, currentColor)" font-size="10">{{points()[0].label}}</text>
  <text x="330" y="171" text-anchor="end" fill="var(--muted, currentColor)" font-size="10">{{points()[points().length-1].label}}</text>
  <text x="330" y="11" text-anchor="end" fill="var(--muted, currentColor)" font-size="10">{{points()[points().length-1].value.toLocaleString('it-IT',{maximumFractionDigits:1})}} {{unit()}}</text>
 </svg></div>
 <details class="data-values"><summary class="subtle">Valori registrati</summary><div class="actions">@for(p of points();track $index){<span class="pill">{{p.label}} · {{p.value.toLocaleString('it-IT',{maximumFractionDigits:1})}} {{unit()}}</span>}</div></details>
}@else{<div class="empty"><h3>Il primo dato ti aspetta</h3><p>Il grafico si aggiornerà con le tue registrazioni.</p></div>}
`,styles:[`:host{display:block;min-width:0}.spark-chart svg{width:100%;max-height:260px;display:block;overflow:visible}.data-values summary{min-height:44px;display:flex;align-items:center;font-size:11px;cursor:pointer}.data-values .actions{padding-bottom:8px}.data-values .pill{font-size:11px}`]})
export class DataChartComponent {
 points=input<DataPoint[]>([]);title=input('Andamento');unit=input('');
 readonly gradientId='data-chart-fill-'+(++dataChartCount);
 bounds=computed(()=>this.points().length?{min:Math.min(...this.points().map(p=>p.value)),max:Math.max(...this.points().map(p=>p.value))}:{min:0,max:0});
 plotted=computed(()=>{const points=this.points(),{min,max}=this.bounds(),range=max-min||1;return points.map((p,i)=>({x:points.length===1?180:32+i/(points.length-1)*298,y:max===min?80:140-(p.value-min)/range*120}));});
 curve=computed(()=>{const points=this.plotted();return points.map((p,i)=>{if(i===0)return `M${p.x} ${p.y}`;const previous=points[i-1],middle=(previous.x+p.x)/2;return `C${middle} ${previous.y} ${middle} ${p.y} ${p.x} ${p.y}`;}).join(' ');});
 area=computed(()=>{const points=this.plotted();if(points.length<2)return '';return `${this.curve()} L${points[points.length-1].x} 148 L${points[0].x} 148Z`;});
 axisLabel(value:number){const absolute=Math.abs(value);return absolute>=1000000?(value/1000000).toLocaleString('it-IT',{maximumFractionDigits:1})+'M':absolute>=1000?(value/1000).toLocaleString('it-IT',{maximumFractionDigits:1})+'k':value.toLocaleString('it-IT',{maximumFractionDigits:1});}
}
