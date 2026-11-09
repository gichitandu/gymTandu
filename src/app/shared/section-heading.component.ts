import { Component, input } from "@angular/core";
@Component({
  selector: "gt-section-heading",
  standalone: true,
  template: `<header class="section-heading"><h1>{{title()}}</h1><div class="heading-actions"><ng-content/></div></header>`,
  styles: [
    `
:host{display:block;min-width:0;margin-bottom:20px}.section-heading{display:flex;align-items:center;justify-content:space-between;gap:12px;min-width:0}.section-heading h1{font-size:clamp(26px,4vw,34px);line-height:1.2;letter-spacing:-.8px;margin:0;min-width:0;overflow-wrap:anywhere}.heading-actions{display:flex;align-items:center;gap:8px;flex-wrap:wrap;flex:none;max-width:60%}.heading-actions:empty{display:none}@media(max-width:360px){.section-heading h1{font-size:24px}.heading-actions{max-width:55%}}
`,
  ],
})
export class SectionHeadingComponent {
  index = input("");
  eyebrow = input("");
  title = input("");
  description = input("");
}
