import { Component, input } from "@angular/core";
@Component({
  selector: "gt-muscle-map",
  standalone: true,
  template: `<div class="muscle-overview"><svg viewBox="0 0 150 180" role="img" [attr.aria-label]="'Schema indicativo dei muscoli: '+primary()"><g fill="#365063" stroke="#527186" stroke-width="1"><circle cx="42" cy="16" r="11"/><path d="M32 30 18 36 8 76 17 80 29 51 30 91 25 139 26 171 37 171 43 111 48 171 60 171 59 139 53 91 55 51 66 80 75 76 65 36 52 30Z"/><circle cx="111" cy="16" r="11"/><path d="M101 30 87 36 77 76 86 80 98 51 99 91 94 139 95 171 106 171 112 111 117 171 129 171 128 139 122 91 124 51 135 80 144 76 134 36 121 30Z"/></g><g stroke="#050E17" stroke-width="1.5"><path d="M30 37 42 40 43 54 30 57Z M44 40 54 37 55 57 44 54Z" [attr.fill]="fill('Petto')"/><path d="M30 34 22 36 18 48 28 48Z M54 34 62 36 67 48 57 48Z" [attr.fill]="fill('Spalle')"/><path d="M18 50 27 51 22 65 14 63Z M59 51 67 50 71 63 63 65Z" [attr.fill]="fill('Braccia Bicipiti')"/><path d="M32 59 52 59 51 89 44 95 33 88Z" [attr.fill]="fill('Addome Core')"/><path d="M32 96 42 101 37 137 27 137Z M45 101 53 96 58 137 48 137Z" [attr.fill]="fill('Gambe Quadricipiti')"/><path d="M100 36 111 40 123 36 121 78 112 89 101 78Z" [attr.fill]="fill('Schiena')"/><path d="M88 49 97 51 92 67 84 64Z M128 51 136 49 140 64 132 67Z" [attr.fill]="fill('Braccia Tricipiti')"/><path d="M100 84 111 88 122 84 125 104 113 109 97 104Z" [attr.fill]="fill('Glutei')"/><path d="M97 108 109 111 106 139 95 139Z M114 111 125 108 129 139 118 139Z" [attr.fill]="fill('Gambe Femorali')"/><path d="M95 141 106 141 104 166 97 166Z M118 141 128 141 126 166 120 166Z" [attr.fill]="fill('Polpacci')"/></g></svg><div><span class="muscle-label">Muscoli coinvolti</span><strong>{{primary()||'Non specificati'}}</strong>@if(secondary().length){<span>{{secondary().join(' · ')}}</span>}<small>Schema indicativo per zona muscolare</small></div></div>`,
  styles: [
    `:host{display:block}.muscle-overview{display:flex;align-items:center;gap:16px;background:var(--card);border:1px solid var(--line);border-radius:12px;padding:12px;margin:12px 0}.muscle-overview svg{width:90px;height:108px;flex-shrink:0}.muscle-overview>div{display:grid;gap:6px;min-width:0}.muscle-label,small{font-size:11px;color:var(--muted)}strong{font-size:14px}span{font-size:12px}`,
  ],
})
export class MuscleMapComponent {
  primary = input("");
  secondary = input<string[]>([]);
  fill(zone: string) {
    const matches = (name: string) =>
      name
        .toLowerCase()
        .split(/\s+/)
        .some((word) => zone.toLowerCase().includes(word));
    return this.primary() && matches(this.primary())
      ? "#FF704C"
      : this.secondary().some(matches)
        ? "#DEAD48"
        : "#203C50";
  }
}
