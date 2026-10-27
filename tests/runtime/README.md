# Calendar activation in the production runtime

Run from the repository root:

```sh
npm exec --yes --package=workerd -- workerd test tests/runtime/calendar.capnp
```

This backend test starts no HTTP listener and uses only synthetic keys and an in-memory database stub. It imports the real calendar service, constructs real workerd Requests and Responses, checks verified configuration/status, and rejects redirects without forwarding credentials. It does not connect to the production app, Cloudflare account, archives, or external calendar.

Node's Request accepts `redirect: 'error'`; workerd rejects it before a network request is sent. This regression produced the observed `relay_network`/502 activation failure. The test was reproduced failing on the previous code and passing with `redirect: 'manual'`, using workerd 2026-10-27. Keep explicit 3xx rejection alongside manual mode; never switch to automatic redirect following when carrying the shared relay key.

Push signing and request compatibility use the same engine:

```sh
npm exec --yes --package=workerd -- workerd test tests/runtime/push.capnp
```

This covers actual P-256/ES256 VAPID signing, timezone conversion and constructing
an empty Web Push POST with manual redirects. It uses a synthetic subscription
and does not deliver any notification. Real iPhone delivery requires an updated
external Worker, an installed Home Screen app, and user permission.
