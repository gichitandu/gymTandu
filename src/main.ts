import {clearPushBadge} from './app/services/push-device';
import { bootstrapApplication } from "@angular/platform-browser";
import { provideRouter, withHashLocation } from "@angular/router";
import { provideServiceWorker } from "@angular/service-worker";
import { isDevMode } from "@angular/core";
import { AppComponent } from "./app/layouts/app.component";
import { routes } from "./app/core/routes";
bootstrapApplication(AppComponent, {
  providers: [
    provideRouter(routes, withHashLocation()),
    provideServiceWorker("gymtrack-sw.js", {
      enabled: !isDevMode(),
      registrationStrategy: "registerWhenStable:3000",
    }),
  ],
}).catch(console.error);

void clearPushBadge();
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')void clearPushBadge();});
