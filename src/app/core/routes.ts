import { Routes } from "@angular/router";
import { preserveFormDrafts } from '../services/draft-navigation';
import { nutritionEnabledGuard } from '../services/nutrition-guard';
import { designStudioGuard } from '../design/design-guard';
const pages: Routes = [
 {path:'recupera-allenamenti',loadComponent:()=>import('../features/workout-recovery.component').then(m=>m.WorkoutRecoveryComponent)},
 {path:'design-studio',canActivate:[designStudioGuard],loadComponent:()=>import('../design/design-studio.component').then(m=>m.DesignStudioComponent)},
 {path:'esercizio/:id',loadComponent:()=>import('../features/exercise-detail.component').then(m=>m.ExerciseDetailComponent)},
 {path:'recupero',data:{mode:'recovery'},loadComponent:()=>import('../features/recovery.component').then(m=>m.RecoveryComponent)},
 {path:'sonno',data:{mode:'sleep'},loadComponent:()=>import('../features/recovery.component').then(m=>m.RecoveryComponent)},
 {path:'riposo',data:{mode:'rest'},loadComponent:()=>import('../features/recovery.component').then(m=>m.RecoveryComponent)},
 {path:'focus-muscolare',loadComponent:()=>import('../features/muscle-focus.component').then(m=>m.MuscleFocusComponent)},
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
  {path:'riepilogo/:id',loadComponent:()=>import('../features/workout-summary.component').then(m=>m.WorkoutSummaryComponent)},
  {path:'anteprima-allenamento',loadComponent:()=>import('../features/workout-preview.component').then(m=>m.WorkoutPreviewComponent)},
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
