# Security review — ld-netcheck

Scope: `ld_netcheck.py` (v1.0.0) and `ld-netcheck-quick.sh`. This tool is meant
to be handed to customers and run inside their networks, often by people who
will read it before running it, so the bar is "safe to run, and obviously so."

Summary: **no high or medium findings.** One low item was fixed during review.
The design choices below were made specifically to keep the attack surface and
the trust required to run it small.

## Dependencies / supply chain

- `ld_netcheck.py` imports only the Python standard library (`argparse`, `json`,
  `os`, `socket`, `ssl`, `sys`, `dataclasses`, `http.client`, `urllib.parse`,
  `time`). **Zero third-party packages**, so there is no dependency tree to pin
  or audit and nothing to resolve at install time. This is the strongest form
  of "latest published version": there is no version surface.
- `ld-netcheck-quick.sh` uses only POSIX `sh` builtins and `curl`, both already
  present on the hosts this targets.
- No build step, no package manager, no network fetch of code. The files are
  the whole tool.

## SDK key handling

The SDK key is the only secret the tool touches. Controls:

- **Input.** Preferred path is `--sdk-key-env NAME` (Python) / `LD_SDK_KEY`
  (shell), which keeps the key out of `argv`. `--sdk-key` exists for
  convenience but its help text warns that argv is visible in the process list
  and shell history. The key is optional; without it the tool still runs every
  connectivity check (a 401 is treated as "endpoint reachable").
- **In transit.** The key is sent only as an `Authorization` header, and only
  over a TLS connection built with `ssl.create_default_context()` (full
  verification, hostname checking on). The tool refuses to send to a plaintext
  `http://` target unless `--allow-insecure` is explicitly passed (intended for
  a local Relay Proxy on a trusted network), and even then only the user's
  chosen target is contacted.
- **In output.** The key is never printed or logged. Every code path that
  surfaces it — the text header and the JSON `sdk_key` field — passes it
  through `redact_key()`, which emits `sdk-***-xxxx`. Verified by test: the raw
  key does not appear anywhere in `--json` output.
- **At rest.** Nothing is written to disk.

## TLS verification

This is the subtlety worth being explicit about, because the tool both *relies
on* TLS verification and *deliberately bypasses it in one narrow spot*.

- All connections that send the key or read endpoint responses
  (`check_http`, `check_stream` → `_open_raw`) use the **verified** default
  context. A verification failure there is reported as a finding (probable TLS
  interception or a missing CA bundle), never silently ignored.
- `_unverified_issuer_hint()` is the **only** place verification is disabled
  (`CERT_NONE`, `check_hostname=False`). It is reached only *after* a verified
  handshake has already failed, and it does exactly one thing: read the
  certificate the server presented so the tool can name the likely interception
  vendor in its advice. **It sends no request, no Authorization header, and no
  data** — it performs the handshake, reads the peer certificate bytes, and
  closes. This is diagnostic-only and cannot leak the key.

This split was confirmed by static check: the only `CERT_NONE`/`check_hostname`
usage is inside that one helper, and the only `Authorization` sends are on the
two verified paths.

## Injection / unsafe execution

- Python: no `eval`, `exec`, `os.system`, `subprocess`, `shell=True`,
  `pickle`, or `input()`. The tool never shells out and never interprets remote
  content as code — response bodies are only scanned as bytes for marker
  strings.
- Shell: no `eval`. All URL and header values are passed to `curl` as quoted
  arguments. The one intentional unquoted expansion (`$HDR`) is the standard
  POSIX idiom for conditionally adding an argument and is annotated for
  shellcheck; the value is a fixed `-H Authorization:<key>` token with no
  attacker-controlled content.

## Network behavior / abuse potential

- Outbound only. The tool connects exclusively to the targets the user
  specifies; defaults are the published LaunchDarkly domains for the chosen
  instance. It opens no listening socket.
- All network operations have timeouts (`--timeout`, and `--max-time` in the
  shell script), so it cannot hang indefinitely — verified against a
  never-closing stream and against a fully blocked egress path.
- The stream-hold test holds a single connection open for a bounded,
  user-specified duration. It is not a load generator.
- Because endpoints are user-suppliable (`--stream-url`, `--relay`, etc.), the
  tool *can* be pointed at an arbitrary host. That is required for Relay/private
  instances and is the operator's choice; it sends only a benign GET/POST and,
  if supplied, the LaunchDarkly SDK key — so do not point it at an untrusted
  host while supplying a key.

## Information disclosure

- Output includes resolved IPs, the negotiated TLS version, and the
  certificate issuer/subject — all of which the operator already has access to
  by virtue of being on the host. No private key material, no full certificate
  dumps, no response bodies are printed.
- The `--json` output is safe to paste into a ticket: the key is redacted and
  no response payloads are included.

## Items addressed during review

- **(Low) Predictable temp file.** An earlier draft of the shell script
  redirected `curl` stderr to `/tmp/ldnc_err.$$`, a predictable name that it
  never actually read. Removed entirely — stderr now goes to `/dev/null`, so
  there is no temp file to race against.

## Residual notes (accept / operator awareness)

- The interception-vendor list and public-CA list are heuristics for *naming*
  the cause; they affect wording, not the pass/fail verdict (which is driven by
  real TLS verification). A novel proxy will still be flagged as "non-public
  issuer," just without a vendor name.
- `--allow-insecure` exists for local Relay testing. It is off by default and
  the only way to send anything over plaintext; the operator opts in knowingly.
