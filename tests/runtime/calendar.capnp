using Workerd = import "/workerd/workerd.capnp";
const calendarTests :Workerd.Config = (
 services = [(
  name = "calendar-activation-runtime",
  worker = (
   modules = [
    (name = "calendar-runtime.mjs", esModule = embed "calendar-runtime.mjs"),
    (name = "calendar.js", esModule = embed "../../worker/calendar.js"),
   ],
   compatibilityDate = "2026-10-15",
   compatibilityFlags = ["nodejs_compat", "global_fetch_strictly_public"],
  ),
 )],
);
