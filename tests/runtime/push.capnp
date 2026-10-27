using Workerd = import "/workerd/workerd.capnp";
const pushTests :Workerd.Config = (
 services = [(
  name = "push-runtime",
  worker = (
   modules = [
    (name = "push-runtime.mjs", esModule = embed "push-runtime.mjs"),
    (name = "push.js", esModule = embed "../../calendar-relay/push.js"),
   ],
   compatibilityDate = "2026-10-27",
   compatibilityFlags = ["global_fetch_strictly_public"],
  ),
 )],
);
