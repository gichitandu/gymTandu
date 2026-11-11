import { Component, input } from '@angular/core';

export const CAR_COLORS: { id: string; label: string }[] = [
  { id: '#7d838c', label: 'Grigio' }, { id: '#b9bec6', label: 'Argento' }, { id: '#e6e9ee', label: 'Bianco' }, { id: '#23252a', label: 'Nero' },
  { id: '#2f5fa8', label: 'Blu' }, { id: '#b3262e', label: 'Rosso' }, { id: '#2f6b55', label: 'Verde' },
];
export const CAR_DEFAULT_COLOR = CAR_COLORS[0].id;

/** Illustrazione originale di una compatta a cinque porte (nessun marchio), nel colore scelto. */
@Component({
  selector: 'gt-car-art', standalone: true,
  template: `<svg viewBox="0 0 640 250" role="img" aria-label="Illustrazione dell'auto" [style.--car]="color()">
  <defs>
    <linearGradient id="ca-body" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" style="stop-color:color-mix(in srgb,var(--car) 62%,#fff)"/>
      <stop offset=".34" style="stop-color:var(--car)"/>
      <stop offset=".62" style="stop-color:color-mix(in srgb,var(--car) 72%,#000)"/>
      <stop offset="1" style="stop-color:color-mix(in srgb,var(--car) 38%,#000)"/>
    </linearGradient>
    <linearGradient id="ca-glass" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#3b4654"/><stop offset=".5" stop-color="#11161d"/><stop offset="1" stop-color="#05070a"/>
    </linearGradient>
    <linearGradient id="ca-shine" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset=".3" stop-color="#fff" stop-opacity=".55"/><stop offset=".75" stop-color="#fff" stop-opacity=".25"/><stop offset="1" stop-color="#fff" stop-opacity="0"/>
    </linearGradient>
    <radialGradient id="ca-rim" cx=".5" cy=".42" r=".6">
      <stop offset="0" stop-color="#f4f6f9"/><stop offset=".6" stop-color="#aab1bb"/><stop offset="1" stop-color="#5d646e"/>
    </radialGradient>
    <radialGradient id="ca-floor" cx=".5" cy=".5" r=".5">
      <stop offset="0" stop-color="#000" stop-opacity=".75"/><stop offset=".7" stop-color="#000" stop-opacity=".35"/><stop offset="1" stop-color="#000" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="ca-lamp" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#fff"/><stop offset="1" stop-color="#bfe3ff"/>
    </linearGradient>
    <g id="ca-wheel">
      <circle r="37" fill="#0b0c0f"/><circle r="36" fill="none" stroke="#2a2d33" stroke-width="2"/>
      <circle r="26.5" fill="url(#ca-rim)"/>
      <g fill="#16181c"><path d="M-4-23h8l3 15h-14z"/><path d="M-4-23h8l3 15h-14z" transform="rotate(72)"/><path d="M-4-23h8l3 15h-14z" transform="rotate(144)"/><path d="M-4-23h8l3 15h-14z" transform="rotate(216)"/><path d="M-4-23h8l3 15h-14z" transform="rotate(288)"/></g>
      <circle r="26.5" fill="none" stroke="#e9edf2" stroke-opacity=".7" stroke-width="1.6"/>
      <circle r="7" fill="#2b2e34" stroke="#cfd4db" stroke-width="1.5"/>
    </g>
  </defs>
  <ellipse cx="320" cy="212" rx="278" ry="15" fill="url(#ca-floor)"/>
  <circle cx="160" cy="174" r="43" fill="#060709"/><circle cx="472" cy="174" r="43" fill="#060709"/>
  <path fill="url(#ca-body)" d="M64 190c-11-1-15-9-15-22 0-15 4-25 17-30 34-12 78-21 128-29 26-21 52-36 86-44 62-10 150-10 204 0l14 4c20 14 36 31 46 49 9 6 14 16 15 30l1 24c0 11-5 18-15 18h-30a44 44 0 1 0-86 0H203a44 44 0 1 0-86 0z"/>
  <path fill="#0e1013" fill-opacity=".72" d="M205 180h222l-4 10H203zM64 190c-9-1-13-6-14-14h66l-2 14zM516 176h44l-1 4c-1 7-6 10-13 10h-31z"/>
  <path fill="url(#ca-glass)" d="M214 108c22-18 44-31 72-37l52-3v40z"/>
  <path fill="url(#ca-glass)" d="M348 68h78l12 40h-90z"/>
  <path fill="url(#ca-glass)" d="M436 69l40 3c12 10 21 22 27 36h-55z"/>
  <path fill="#fff" fill-opacity=".1" d="M236 104c16-12 32-20 52-25l22-2-34 27zM356 74h30l-22 30h-8z"/>
  <g fill="none" stroke="#000" stroke-opacity=".38" stroke-width="1.4" stroke-linecap="round">
    <path d="M343 110v72M222 112c-8 22-10 46-8 68M438 110c6 10 4 20-2 28"/>
    <path d="M200 110l-22 4"/>
  </g>
  <path fill="none" stroke="url(#ca-shine)" stroke-width="2.2" stroke-linecap="round" d="M78 139c120-22 300-27 466-12"/>
  <path fill="none" stroke="#fff" stroke-opacity=".28" stroke-width="1.6" stroke-linecap="round" d="M286 63c60-9 142-9 196 1"/>
  <rect x="306" y="121" width="24" height="5" rx="2.5" fill="#000" fill-opacity=".35"/><rect x="402" y="121" width="24" height="5" rx="2.5" fill="#000" fill-opacity=".35"/>
  <path fill="url(#ca-body)" stroke="#000" stroke-opacity=".3" d="M212 100c6-5 16-5 22 0v8h-20z"/>
  <path fill="url(#ca-lamp)" d="M56 150c8-9 26-13 46-14l-6 11c-14 2-28 5-41 9z"/>
  <path fill="#fff" fill-opacity=".9" d="M52 164h22l-2 5H51z"/>
  <path fill="#ff4d5e" d="M540 124c9 3 15 10 18 20l-20-3c-3-6-4-11-2-17z"/>
  <path fill="#0c0d10" d="M50 172h30l-2 8H52z"/>
  <use href="#ca-wheel" x="160" y="174"/><use href="#ca-wheel" x="472" y="174"/>
</svg>`,
  styles: [`:host{display:block;width:100%}svg{display:block;width:100%;height:auto;overflow:visible}`],
})
export class CarArtComponent {
  readonly color = input(CAR_DEFAULT_COLOR);
}
