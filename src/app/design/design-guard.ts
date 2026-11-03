import { inject } from "@angular/core";
import { CanActivateFn, Router } from "@angular/router";
import { AuthService } from "../services/auth";
import { canUseDesignStudio } from "./design-runtime";

export const designStudioGuard: CanActivateFn = async () => {
  const auth = inject(AuthService),
    router = inject(Router);
  // The router starts before the cookie-backed account refresh on a deep link.
  if (auth.loading()) await auth.refresh();
  if (!canUseDesignStudio(auth)) return router.createUrlTree(["/profilo"]);
  try {
    await auth.request("design/studio");
    return canUseDesignStudio(auth) || router.createUrlTree(["/profilo"]);
  } catch {
    return router.createUrlTree(["/profilo"]);
  }
};
