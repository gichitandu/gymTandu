import { COACH_GATEWAY } from '../coach-ui/coach-gateway';
import { CoachExpertBridge } from '../services/coach-expert-bridge';
import { Routes } from "@angular/router";
import { preserveFormDrafts } from '../services/draft-navigation';
import { nutritionEnabledGuard } from '../services/nutrition-guard';
import { designStudioGuard } from '../design/design-guard';
import { appChooserGuard, garageGuard, hubGuard } from '../hub/hub-access';
const pages: Routes = [
 {path:'coach',canDeactivate:[(page:{canLeave():boolean})=>page.canLeave()],providers:[{provide:COACH_GATEWAY,useExisting:CoachExpertBridge}],loadComponent:()=>import('../coach-ui/coach-page.component').then(m=>m.CoachPageComponent)},
 {path:'recupera-allenamenti',loadComponent:()=>import('../features/workout-recovery.component').then(m=>m.WorkoutRecoveryComponent)},
 {path:'design-studio',canActivate:[designStudioGuard],loadComponent:()=>import('../design/design-studio.component').then(m=>m.DesignStudioComponent)},
 {path:'esercizio/:id',loadComponent:()=>import('../features/exercise-detail.component').then(m=>m.ExerciseDetailComponent)},
 {path:'recupero',data:{mode:'recovery'},loadComponent:()=>import('../features/recovery.component').then(m=>m.RecoveryComponent)},
 // Sonno e riposo confluiscono nel check-in «Come stai oggi?» e nel Calendario.
 {path:'sonno',redirectTo:'recupero'},
 {path:'riposo',redirectTo:'/calendario?add=rest'},
 {path:'focus-muscolare',loadComponent:()=>import('../features/muscle-focus.component').then(m=>m.MuscleFocusComponent)},
 {path:'analisi',loadComponent:()=>import('../features/training-insights.component').then(m=>m.TrainingInsightsComponent)},
 // GT Hub: app separata (agenda, spese, Dividi), solo Super Admin; il Worker lo verifica di nuovo.
 {path:'scegli-app',canActivate:[appChooserGuard],loadComponent:()=>import('../hub/app-chooser.component').then(m=>m.AppChooserComponent)},
 {path:'hub',canActivate:[hubGuard],loadComponent:()=>import('../hub/hub-today.component').then(m=>m.HubTodayComponent)},
 {path:'hub/calendario',canActivate:[hubGuard],loadComponent:()=>import('../hub/hub-calendar.component').then(m=>m.HubCalendarComponent)},
 {path:'hub/spese',canActivate:[hubGuard],loadComponent:()=>import('../hub/hub-expenses.component').then(m=>m.HubExpensesComponent)},
 {path:'hub/spese/importa',canActivate:[hubGuard],loadComponent:()=>import('../hub/hub-import.component').then(m=>m.HubImportComponent)},
 {path:'hub/dividi',canActivate:[hubGuard],loadComponent:()=>import('../hub/hub-split.component').then(m=>m.HubSplitComponent)},
 {path:'hub/dividi/:id',canActivate:[hubGuard],loadComponent:()=>import('../hub/hub-group.component').then(m=>m.HubGroupComponent)},
 // GT Garage: la scheda dell'auto, sullo stesso archivio e con gli stessi permessi del Hub.
 {path:'auto',canActivate:[garageGuard],loadComponent:()=>import('../garage/garage.component').then(m=>m.GarageComponent)},
 {path:'auto/movimenti',canActivate:[garageGuard],loadComponent:()=>import('../garage/garage-moves.component').then(m=>m.GarageMovesComponent)},
 {path:'auto/statistiche',canActivate:[garageGuard],loadComponent:()=>import('../garage/garage-insights.component').then(m=>m.GarageInsightsComponent)},
 {path:'invito/:token',loadComponent:()=>import('../hub/hub-invite.component').then(m=>m.HubInviteComponent)},
 {path:'hub/note',canActivate:[hubGuard],loadComponent:()=>import('../hub/hub-notes.component').then(m=>m.HubNotesComponent)},
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
  {path:'gruppo',loadComponent:()=>import('../features/group-workout.component').then(m=>m.GroupWorkoutComponent)},
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
export const routes: Routes = pages.map(route => route.redirectTo !== undefined ? route : {...route,canDeactivate:[...(route.canDeactivate??[]),preserveFormDrafts]});
