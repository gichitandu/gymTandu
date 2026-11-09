import { Component, inject } from "@angular/core";
import { AuthService } from "../services/auth";
import { AppFeaturesService } from "../services/app-features";

@Component({
  selector: "gt-app-features",
  standalone: true,
  template: `
@if(auth.uiRole()==='SuperAdmin'&&!auth.offlineMode()){
 <section class="card feature-settings">
  <h2>Sezioni dell’app</h2>
  <label class="feature-switch"><span><strong>Mostra sezione Pasti</strong><small>I dati già registrati restano conservati.</small></span><input type="checkbox" role="switch" aria-label="Mostra sezione Pasti a tutti gli utenti" [checked]="features.nutritionEnabled()" [disabled]="features.loading()||features.saving()" (change)="features.setNutritionEnabled($any($event.target).checked)"/></label>
  <p role="status">{{features.status()}}</p>
 </section>
}`,
  styles: [
    `.feature-settings{margin-top:20px}.feature-settings h2{font-size:18px;margin:0 0 16px}.feature-switch{display:flex;align-items:center;justify-content:space-between;gap:18px;min-height:52px;cursor:pointer}.feature-switch span{min-width:0}.feature-switch strong{display:block;font-size:14px}.feature-switch small{display:block;font-size:12px;line-height:1.6;margin-top:5px;color:var(--muted)}.feature-switch input{width:24px;height:24px;min-width:24px;accent-color:var(--blue)}.feature-settings p{font-size:12px;color:var(--muted);line-height:1.6;margin-top:14px}`,
  ],
})
export class AppFeaturesComponent {
  auth = inject(AuthService);
  features = inject(AppFeaturesService);
}
