import {clearPushBadge} from './app/services/push-device';
import { bootstrapApplication } from "@angular/platform-browser";
import { provideRouter, withHashLocation } from "@angular/router";
import { provideServiceWorker } from "@angular/service-worker";
import { ErrorHandler, inject, isDevMode, provideEnvironmentInitializer } from "@angular/core";
import { DevLogErrorHandler, DevLogReporter } from "./app/services/dev-log";
import { AppComponent } from "./app/layouts/app.component";
import { routes } from "./app/core/routes";
import {restoreOfflineLaunchUrl} from './app/services/launch-url';
restoreOfflineLaunchUrl();
bootstrapApplication(AppComponent, {
  providers: [
    provideRouter(routes, withHashLocation()),
    // Registro sviluppo: errori del Super Admin registrati in automatico (vedi docs/REGISTRO_SVILUPPO.md).
    { provide: ErrorHandler, useClass: DevLogErrorHandler },
    provideEnvironmentInitializer(() => inject(DevLogReporter).start()),
    provideServiceWorker("gymtrack-app-worker-v3.js", {
      enabled: !isDevMode(),
      registrationStrategy: "registerImmediately",
    }),
  ],
}).catch(console.error);

void clearPushBadge();
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')void clearPushBadge();});
