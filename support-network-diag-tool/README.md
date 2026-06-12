# ld-netcheck

A connectivity diagnostic for **server-side SDKs** and **client-side JavaScript**.
It tests whether an environment can reach the **streaming (init)**, **polling
(init)**, and **events** endpoints, and — when it can't — tells you *why* and
*how to fix it*, mapped to the failure modes LaunchDarkly endpoints actually
produce.

**Mobile SDKs (iOS/Android) are out of scope.** This tool runs on a host machine
with Python/curl and cannot exercise the device TLS stack, ATS, or certificate
pinning.

There are two tiers:

| File | Runtime | Use when |
|------|---------|----------|
| `ld_netcheck.py` | Python 3.8+ (standard library only) | The normal case. Full diagnosis, layered checks, JSON output. |
| `ld-netcheck-quick.sh` | POSIX `sh` + `curl` | Locked-down hosts that won't run anything else. First-pass triage. |

Both have **zero third-party dependencies**.

## What it checks

For each of the three endpoints it runs layered checks and stops being useful
to go deeper once a layer fails:

1. **DNS** — does the hostname resolve? (Reports the resolved IPs.)
2. **TCP** — can it open the port (443 by default)?
3. **TLS** — does the handshake succeed against the system trust store, and is
   the certificate issued by a *public* CA? A trusted-but-non-public issuer or
   an outright validation failure is flagged as likely **TLS interception**
   (it scans the certificate for known proxy vendors — Zscaler, Palo Alto,
   Netskope, etc.).
4. **HTTP** — the response status is interpreted into a concrete cause
   (see the table below).
5. **Stream hold** — opens the SSE stream and holds it open for `--hold`
   seconds, watching for a premature close or an idle stall. This is the check
   that catches the single most common hard failure: a load balancer, reverse
   proxy, or firewall silently severing the long-lived streaming connection.

It also reports any `HTTP(S)_PROXY` environment variables, since an SDK that
isn't configured to use the proxy — or a proxy that buffers/modifies SSE — is
a frequent root cause.

### How the diagnosis maps to causes

| Signal | Diagnosis |
|--------|-----------|
| DNS / TCP failure | Egress to the domain/port is blocked; allowlist it |
| TLS validation fails | TLS-inspecting proxy re-signing traffic, or a missing/locked-down CA bundle |
| TLS valid but non-public issuer | A corporate root is installed; an inspecting proxy is in the path |
| HTTP 401 | SDK key missing/incorrect (auth, not network). Without a key, 401 just means *reachable* |
| HTTP 403 / Forbidden | Endpoint not allowlisted in the firewall or the app's Content Security Policy |
| HTTP 404 | Wrong path/instance/SDK side |
| HTTP 405 on events | A proxy permits GET but blocks POST; events silently fail |
| HTTP 503 | Relay Proxy not ready yet (SDKs back off and retry) |
| Status 0 / timeout | A reverse proxy is refusing or dropping the connection |
| Stream closes early | A load balancer/proxy/firewall is severing the long-lived SSE connection |
| Stream stalls (no data/keepalive) | The network is holding/buffering the connection ("received no data, assuming connection is dead") |

These mappings come from the LaunchDarkly public
[domain list](https://launchdarkly.com/docs/sdk/concepts/domain-list) and the
internal Network Troubleshooting Checklist.

## Usage — Python tool

```bash
# Commercial instance, server-side SDK defaults
python3 ld_netcheck.py

# Pick the instance and SDK side
python3 ld_netcheck.py --instance eu --side client
python3 ld_netcheck.py --instance federal --side server

# Test a Relay Proxy (stream/poll/events go through relay; use --side for paths)
python3 ld_netcheck.py --relay https://relay.internal:8030
python3 ld_netcheck.py --relay https://relay.internal:8030 --side client

# Override individual endpoints (e.g. a private instance)
python3 ld_netcheck.py \
  --stream-url https://stream.mycompany.launchdarkly.com \
  --poll-url   https://app.mycompany.launchdarkly.com \
  --events-url https://events.mycompany.launchdarkly.com

# Run the live authenticated stream-hold test (recommended).
# Prefer the env-var form so the key is NOT visible in the process list:
export LD_SDK_KEY=sdk-xxxxxxxx
python3 ld_netcheck.py --sdk-key-env LD_SDK_KEY --hold 120

# Machine-readable output to paste into a ticket (key is redacted):
python3 ld_netcheck.py --json
```

Key flags: `--instance {commercial,eu,federal}`, `--side {server,client}`,
`--relay`, `--stream-url/--poll-url/--poll-app-url/--events-url`,
`--sdk-key-env` (preferred)
or `--sdk-key`, `--hold SECONDS` (0 to skip), `--timeout SECONDS`,
`--allow-insecure` (permit `http://`, e.g. a local relay), `--json`,
`--no-color`.

To exercise the stream-hold the way the SDK experiences it, run with a key and
a `--hold` at or above your SDK's stream read timeout (server-side SDKs default
to roughly 5 minutes / `--hold 300`).

## Usage — curl triage script

Configured entirely through environment variables so the SDK key never lands
in argv:

```bash
LD_SDK_KEY=sdk-xxxxxxxx ./ld-netcheck-quick.sh
LD_INSTANCE=eu LD_SIDE=server ./ld-netcheck-quick.sh
LD_RELAY=https://relay.internal:8030 ./ld-netcheck-quick.sh
LD_HOLD=120 LD_TIMEOUT=15 LD_SDK_KEY=sdk-xxxxxxxx ./ld-netcheck-quick.sh
```

## Exit codes

`0` = all checks passed · `1` = at least one warning · `2` = at least one
failure. Useful for wiring into CI or a health check.

## Endpoints tested (defaults)

| Instance | Server stream / poll / events |
|----------|-------------------------------|
| commercial | `stream` / `sdk` / `events` `.launchdarkly.com` |
| eu | `stream` / `sdk` / `events` `.eu.launchdarkly.com` |
| federal | `stream` / `sdk` / `events` `.launchdarkly.us` |

| Instance | Client-side JS stream / poll / events |
|----------|---------------------------------------|
| commercial | `clientstream` / `clientsdk` + `app` / `events` `.launchdarkly.com` |
| eu | `clientstream` / `clientsdk` + `app` / `events` `.eu.launchdarkly.com` |
| federal | `clientstream` / `clientsdk` + `app` / `events` `.launchdarkly.us` |

Client-side JS (`--side client`) uses `clientstream` for streaming,
`clientsdk` and `app` for polling (both are tested — the JS SDK may use either),
and `events` for event delivery. With `--relay`, stream/poll/events are sent
through the Relay Proxy (v9 uses streaming and polling for init), but the direct
`app` poll check still runs so allowlisting gaps are not missed. The tool does
not hardcode IP ranges
(LaunchDarkly is fronted by Fastly and AWS, and those change); it reports
whatever the host resolves.

### Mobile SDKs

Not supported. Mobile endpoints (`/meval`, `/msdk/evalx`, `mobile.launchdarkly.com`)
require diagnostics that run on or from the device itself. Do not use this tool
for mobile SDK connectivity cases.

## Security

See `SECURITY_REVIEW.md`. In short: standard-library/`curl`-only (no supply
chain), the SDK key is env-preferred, redacted in all output, never logged, and
only ever sent over a fully verified TLS connection. The one place certificate
verification is intentionally relaxed is a read-only diagnostic that inspects
the *presented* certificate to name a likely interception proxy — it never
sends the key or any data over that connection.
