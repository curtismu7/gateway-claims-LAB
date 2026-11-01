# Safety

- Loopback bind only (`GCLAB_BIND` is the explicit opt-in the container uses); the compose file publishes `127.0.0.1` only (a test pins it).
- Host header must be a loopback name; writes must be same-origin (no environment variable adds another origin).
- Netguard blocks every outbound connection (fetch, socket, DNS, UDP send and UDP connect) with a self-test, and a test asserts zero attempts.
- Settings come from the one shared file `~/Development/.env` (or `STANDALONE_ENV`), parsed with `util.parseEnv`, and only the single key `GCLAB_MODE` is taken; there is no per-app `.env` loader and no bare `MODE`.
- There is no Live engine. `GCLAB_MODE=live` stops the server and fails the doctor with a plain message, and the header Live button shows the same message and changes nothing.
- `POST /api/evaluate` accepts custom JSON but bounds it: body 8 KB, depth 6, 200 claims, 20 array items, 512-character values, 8 required claims, path shape checked by a fixed regex. Walks are iterative; there is no `eval`, `Function` or `vm`. Claim values are rendered as text only.
- Tokens are MOCK-ISSUED by this app and shown raw for education; there is no real credential, signature or key anywhere. No EC keygen is used.
- Story, posture and release-reading text is data; hosts end in `.example`; ARNs use the obviously fake account id 000000000000.
- No tenant, credential or customer identifier ships. `customer.config.json` only sets four display strings and is git-ignored.
