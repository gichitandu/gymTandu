import { inject } from "@angular/core";
import { CanActivateFn, Router } from "@angular/router";
import { AppFeaturesService } from "./app-features";

export const nutritionEnabledGuard: CanActivateFn = async () => {
  const features = inject(AppFeaturesService),
    router = inject(Router);
  return (await features.ensureLoaded()) ? true : router.createUrlTree(["/"]);
};
