import { Routes } from "@angular/router";
import { preserveFormDrafts } from '../services/draft-navigation';
import { nutritionEnabledGuard } from '../services/nutrition-guard';
const pages: Routes = [
  {
    path: "",
    loadComponent: () =>
      import("../features/home.component").then((m) => m.HomeComponent),
  },
  {
    path: "piani",
    loadComponent: () =>
      import("../features/plans.component").then((m) => m.PlansComponent),
  },
  {path:'importa-excel',loadComponent:()=>import('../features/excel-import.component').then(m=>m.ExcelImportComponent)},
  {path:'piano/:id',loadComponent:()=>import('../features/plan-dashboard.component').then(m=>m.PlanDashboardComponent)},
  {
    path: "allenamenti",
    loadComponent: () =>
      import("../features/workouts.component").then((m) => m.WorkoutsComponent),
  },
  {
    path: "sessione",
    loadComponent: () =>
      import("../features/session.component").then((m) => m.SessionComponent),
  },
  {
    path: "progressi",
    loadComponent: () =>
      import("../features/progress.component").then((m) => m.ProgressComponent),
  },
  {
    path: "profilo",
    loadComponent: () =>
      import("../features/profile.component").then((m) => m.ProfileComponent),
  },
  {
    path: "catalogo",
    loadComponent: () =>
      import("../features/catalog.component").then((m) => m.CatalogComponent),
  },
  { path: "calendario", loadComponent: () => import("../features/calendar.component").then(m=>m.CalendarComponent) },
  { path: "alimentazione", canActivate:[nutritionEnabledGuard], loadComponent: () => import("../features/nutrition.component").then(m => m.NutritionComponent) },
  { path: "utenti", loadComponent: () => import("../features/users.component").then(m => m.UsersComponent) },
  { path: "**", redirectTo: "" },
];
export const routes: Routes = pages.map(route => route.redirectTo !== undefined ? route : {...route,canDeactivate:[preserveFormDrafts]});
