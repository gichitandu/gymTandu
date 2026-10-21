import { Routes } from "@angular/router";
export const routes: Routes = [
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
  { path: "alimentazione", loadComponent: () => import("../features/nutrition.component").then(m => m.NutritionComponent) },
  { path: "utenti", loadComponent: () => import("../features/users.component").then(m => m.UsersComponent) },
  { path: "**", redirectTo: "" },
];
