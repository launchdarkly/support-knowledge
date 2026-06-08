#!/usr/bin/env python3
"""
ld-netcheck - LaunchDarkly SDK connectivity diagnostic.

Tests whether an environment can reach the LaunchDarkly streaming (init),
polling (init), and events endpoints, and explains how to unblock them when
it cannot. Standard library only - no third-party dependencies.

The checks and remediation mapping are grounded in the LaunchDarkly public
domain list (https://launchdarkly.com/docs/sdk/concepts/domain-list) and the
internal Network Troubleshooting Checklist failure modes:

  401              -> SDK key missing/incorrect (auth, not network)
  403 / Forbidden  -> endpoint not allowlisted in firewall or CSP
  status 0/timeout -> reverse proxy refusing long-lived connections
  invalid PUT data -> reverse proxy injecting/modifying HTTP headers
  SSL/cert error   -> TLS-inspecting proxy or missing/locked-down CA bundle
  relay 503        -> Relay Proxy not ready (SDK backs off and retries)
  idle stream drop -> network/proxy severing the long-lived SSE connection

Usage:
  python3 ld_netcheck.py                       # commercial, server-side defaults
  python3 ld_netcheck.py --instance eu --side client
  python3 ld_netcheck.py --relay https://relay.internal:8030
  python3 ld_netcheck.py --sdk-key-env LD_SDK_KEY --hold 120
  python3 ld_netcheck.py --json
"""

import argparse
import json
import os
import socket
import ssl
import sys
import time
from dataclasses import dataclass, field, asdict
from http.client import HTTPSConnection, HTTPConnection
from urllib.parse import urlsplit

VERSION = "1.0.0"

# --- Endpoint presets -------------------------------------------------------
# Paths used by the real SDKs for the initial flag payload and events.
PATHS = {
    "server": {"stream": "/all", "poll": "/sdk/latest-all", "events": "/bulk"},
    # Client/mobile init paths are context-specific; for a connectivity probe
    # we hit the service root, which is enough to exercise DNS/TCP/TLS/HTTP.
    "client": {"stream": "/eval", "poll": "/sdk/evalx", "events": "/bulk"},
    "mobile": {"stream": "/meval", "poll": "/msdk/evalx", "events": "/mobile"},
}

INSTANCES = {
    "commercial": {
        "server": {"stream": "https://stream.launchdarkly.com",
                   "poll": "https://sdk.launchdarkly.com",
                   "events": "https://events.launchdarkly.com"},
        "client": {"stream": "https://clientstream.launchdarkly.com",
                   "poll": "https://clientsdk.launchdarkly.com",
                   "events": "https://events.launchdarkly.com"},
        "mobile": {"stream": "https://clientstream.launchdarkly.com",
                   "poll": "https://clientsdk.launchdarkly.com",
                   "events": "https://mobile.launchdarkly.com"},
    },
    "eu": {
        "server": {"stream": "https://stream.eu.launchdarkly.com",
                   "poll": "https://sdk.eu.launchdarkly.com",
                   "events": "https://events.eu.launchdarkly.com"},
        "client": {"stream": "https://clientstream.eu.launchdarkly.com",
                   "poll": "https://clientsdk.eu.launchdarkly.com",
                   "events": "https://events.eu.launchdarkly.com"},
        "mobile": {"stream": "https://clientstream.eu.launchdarkly.com",
                   "poll": "https://clientsdk.eu.launchdarkly.com",
                   "events": "https://events.eu.launchdarkly.com"},
    },
    "federal": {
        "server": {"stream": "https://stream.launchdarkly.us",
                   "poll": "https://sdk.launchdarkly.us",
                   "events": "https://events.launchdarkly.us"},
        "client": {"stream": "https://clientstream.launchdarkly.us",
                   "poll": "https://clientsdk.launchdarkly.us",
                   "events": "https://events.launchdarkly.us"},
        "mobile": {"stream": "https://clientstream.launchdarkly.us",
                   "poll": "https://clientsdk.launchdarkly.us",
                   "events": "https://events.launchdarkly.us"},
    },
}

# Public CA organizations we recognize. If a cert validates against the system
# trust store but its issuer is NOT one of these, a corporate root is likely
# installed (TLS interception with a trusted root).
PUBLIC_CA_MARKERS = [
    "DigiCert", "Let's Encrypt", "ISRG", "GlobalSign", "Amazon", "Sectigo",
    "Comodo", "GoDaddy", "Google Trust Services", "GTS", "Entrust",
    "Cloudflare", "Fastly", "Apple Public", "Microsoft", "Baltimore",
    "USERTrust", "Starfield", "Certum", "Buypass", "IdenTrust",
]

# Known TLS-interception / forward-proxy vendor signatures.
INTERCEPTION_MARKERS = [
    "Zscaler", "Palo Alto", "PAN-", "Fortinet", "FortiGate", "Forcepoint",
    "Blue Coat", "Symantec Web", "Cisco Umbrella", "Cisco", "Netskope",
    "McAfee Web", "Sophos", "Check Point", "Trend Micro", "Squid",
    "Proxy", "SSL Inspection", "Decrypt", "MITM", "Trustwave", "Barracuda",
]

GREEN, YELLOW, RED, DIM, BOLD, RESET = (
    "\033[32m", "\033[33m", "\033[31m", "\033[2m", "\033[1m", "\033[0m")

PASS, WARN, FAIL, INFO = "PASS", "WARN", "FAIL", "INFO"


@dataclass
class Check:
    name: str
    status: str = INFO
    detail: str = ""
    suggestions: list = field(default_factory=list)


@dataclass
class TargetResult:
    label: str          # e.g. "stream (init)"
    url: str
    host: str = ""
    port: int = 443
    checks: list = field(default_factory=list)

    def add(self, c: Check):
        self.checks.append(c)

    @property
    def worst(self):
        order = {FAIL: 3, WARN: 2, PASS: 1, INFO: 0}
        return max((c.status for c in self.checks), key=lambda s: order[s],
                   default=INFO)


def color_for(status, use_color):
    if not use_color:
        return ""
    return {PASS: GREEN, WARN: YELLOW, FAIL: RED, INFO: DIM}.get(status, "")


def redact_key(key):
    if not key:
        return "(none)"
    if len(key) <= 8:
        return "***"
    return key[:4] + "***" + key[-4:]


# --- Individual checks ------------------------------------------------------

def check_dns(host, timeout):
    c = Check("DNS resolution")
    try:
        socket.setdefaulttimeout(timeout)
        infos = socket.getaddrinfo(host, None, type=socket.SOCK_STREAM)
        ips = sorted({i[4][0] for i in infos})
        c.status = PASS
        c.detail = "resolved to " + ", ".join(ips)
    except Exception as e:  # noqa: BLE001
        c.status = FAIL
        c.detail = f"could not resolve {host}: {e}"
        c.suggestions.append(
            f"DNS for {host} is failing. Confirm the host can reach your "
            "resolver and that {host} (and the rest of the LaunchDarkly "
            "domain list) is not blocked at the DNS layer.".format(host=host))
    finally:
        socket.setdefaulttimeout(None)
    return c, (c.status == PASS)


def check_tcp(host, port, timeout):
    c = Check(f"TCP connect :{port}")
    t0 = time.time()
    try:
        with socket.create_connection((host, port), timeout=timeout):
            pass
        c.status = PASS
        c.detail = f"connected in {int((time.time() - t0) * 1000)} ms"
    except Exception as e:  # noqa: BLE001
        c.status = FAIL
        c.detail = f"cannot open TCP {host}:{port}: {e}"
        c.suggestions.append(
            f"Egress to {host}:{port} is blocked. Allow outbound TCP {port} "
            f"to {host} in the firewall, or route it through your proxy.")
    return c, (c.status == PASS)


def _scan_markers(blob, markers):
    found = []
    low = blob.lower()
    for m in markers:
        if m.lower() in low:
            found.append(m)
    return found


def check_tls(host, port, timeout):
    """Verified handshake plus an unverified inspection pass for MITM hints."""
    c = Check("TLS handshake")
    issuer_org = ""
    try:
        ctx = ssl.create_default_context()
        with socket.create_connection((host, port), timeout=timeout) as sock:
            with ctx.wrap_socket(sock, server_hostname=host) as ss:
                cert = ss.getpeercert() or {}
                version = ss.version()
                issuer = dict(x[0] for x in cert.get("issuer", ()))
                issuer_org = issuer.get("organizationName", "") or \
                    issuer.get("commonName", "")
        c.status = PASS
        c.detail = f"{version}, cert issued by '{issuer_org or 'unknown'}'"
        if version and version < "TLSv1.2":
            c.status = WARN
            c.detail += " (below TLS 1.2)"
            c.suggestions.append(
                "Negotiated TLS version is below 1.2. LaunchDarkly requires "
                "modern TLS; update the client/proxy TLS configuration.")
        # Trusted, but issued by something we don't recognize as a public CA?
        if issuer_org and not _scan_markers(issuer_org, PUBLIC_CA_MARKERS):
            vendor = _scan_markers(issuer_org, INTERCEPTION_MARKERS)
            c.status = WARN
            hint = f" ({vendor[0]})" if vendor else ""
            c.detail += " - non-public issuer; TLS interception likely" + hint
            c.suggestions.append(
                "The certificate validated but was issued by a non-public CA "
                f"('{issuer_org}'). A TLS-inspecting proxy{hint} is almost "
                "certainly in the path. Inspecting proxies often rewrite or "
                "buffer the streaming response and break the 'put' event. "
                "Either exempt the LaunchDarkly domains from TLS inspection, "
                "or ensure the proxy passes Server-Sent Events through "
                "unbuffered and unmodified.")
        return c, True
    except ssl.SSLCertVerificationError as e:
        c.status = FAIL
        c.detail = f"certificate did not validate: {e.verify_message or e}"
        # Inspect the presented cert without verifying, for a vendor hint.
        vendor_hint = _unverified_issuer_hint(host, port, timeout)
        c.suggestions.append(
            "TLS verification failed. This is the classic signature of a "
            "TLS-inspecting proxy presenting a certificate your trust store "
            "does not recognize, or a missing/locked-down CA bundle." +
            (f" Presented certificate looks like: {vendor_hint}." if vendor_hint
             else "") +
            " Fix by installing the corporate root CA into the client trust "
            "store, or exempt the LaunchDarkly domains from TLS interception.")
        return c, False
    except Exception as e:  # noqa: BLE001
        c.status = FAIL
        c.detail = f"TLS handshake failed: {e}"
        c.suggestions.append(
            f"TLS to {host}:{port} failed before validation. A firewall or "
            "proxy may be resetting the connection. Confirm outbound 443 and "
            "that the proxy supports TLS to this host.")
        return c, False


def _unverified_issuer_hint(host, port, timeout):
    """Diagnostic only: peek at the presented cert without trusting it."""
    try:
        uctx = ssl.SSLContext(ssl.PROTOCOL_TLS_CLIENT)
        uctx.check_hostname = False
        uctx.verify_mode = ssl.CERT_NONE
        with socket.create_connection((host, port), timeout=timeout) as sock:
            with uctx.wrap_socket(sock, server_hostname=host) as ss:
                der = ss.getpeercert(binary_form=True) or b""
        text = der.decode("latin-1", "ignore")
        vendor = _scan_markers(text, INTERCEPTION_MARKERS)
        if vendor:
            return vendor[0]
        return "an untrusted / unknown issuer"
    except Exception:  # noqa: BLE001
        return ""


def _new_connection(url, timeout, allow_insecure):
    parts = urlsplit(url)
    host = parts.hostname
    port = parts.port or (443 if parts.scheme == "https" else 80)
    if parts.scheme == "https":
        ctx = ssl.create_default_context()
        return HTTPSConnection(host, port, timeout=timeout, context=ctx), parts
    if not allow_insecure:
        raise ValueError("refusing plaintext HTTP without --allow-insecure")
    return HTTPConnection(host, port, timeout=timeout), parts


def _proxy_response_hint(headers):
    hints = []
    for h in ("via", "x-cache", "x-forwarded-for", "proxy-connection",
              "x-served-by", "server"):
        v = headers.get(h)
        if v:
            hints.append(f"{h}={v}")
    return "; ".join(hints)


def interpret_status(c, code, label, key, proxy):
    """Map an HTTP status to a check status + remediation, per the internal
    Network Troubleshooting Checklist failure modes."""
    detail = f"HTTP {code}"
    if proxy:
        detail += f"  [{proxy}]"
    c.detail = detail

    if code in (200, 202):
        c.status = PASS
    elif code == 401:
        c.status = PASS if not key else FAIL
        if not key:
            c.detail += "  (endpoint reachable; pass an SDK key to test auth)"
        else:
            c.suggestions.append(
                "401 with a key supplied means the SDK key is wrong for this "
                "environment/instance. Verify the key against the dashboard.")
    elif code == 403:
        c.status = FAIL
        c.suggestions.append(
            f"403/Forbidden on {label} means the endpoint is not allowlisted "
            "in the network firewall and/or the application Content Security "
            "Policy. Allowlist the LaunchDarkly domain list for this instance.")
    elif code == 404:
        c.status = WARN
        c.suggestions.append(
            f"404 on {label}. The path or instance may be wrong for this SDK "
            "type. Confirm you are testing the correct instance "
            "(commercial/EU/federal) and SDK side (server/client/mobile).")
    elif code == 405:
        c.status = FAIL
        c.suggestions.append(
            f"405 Method Not Allowed on {label}. A firewall/proxy may permit "
            "GET but block POST; events are sent with POST and will silently "
            "fail. Allow POST to the events endpoint.")
    elif code == 503:
        c.status = WARN
        c.suggestions.append(
            "503 - if this is a Relay Proxy it is not in a ready state yet; "
            "SDKs back off and retry. If it persists, check Relay health.")
    elif 500 <= code < 600:
        c.status = WARN
        c.suggestions.append(
            f"{code} from the endpoint directly (not a Relay Proxy) should be "
            "rare. If it persists, capture the response and contact Support.")
    else:
        c.status = WARN
    if proxy and ("via=" in proxy or "proxy-connection=" in proxy):
        c.suggestions.append(
            "A proxy was detected in the response headers. Ensure it does not "
            "modify or add HTTP headers on the stream (a known cause of "
            "'invalid data in PUT' / 'malformed JSON in event stream').")
    return c


def check_http(label, url, path, method, key, timeout, allow_insecure):
    c = Check(f"HTTP {method} {label}")
    body = b"[]" if method == "POST" else None
    hdrs = {"User-Agent": f"ld-netcheck/{VERSION}", "Accept": "*/*"}
    if key:
        hdrs["Authorization"] = key
    if method == "POST":
        hdrs["Content-Type"] = "application/json"
    try:
        conn, parts = _new_connection(url, timeout, allow_insecure)
        full = (parts.path.rstrip("/") + path) if parts.path not in ("", "/") \
            else path
        conn.request(method, full or "/", body=body, headers=hdrs)
        resp = conn.getresponse()
        code = resp.status
        proxy = _proxy_response_hint(
            {k.lower(): v for k, v in resp.getheaders()})
        resp.read(2048)  # bounded read; these are short responses
        conn.close()
    except socket.timeout:
        c.status = FAIL
        c.detail = "request timed out (no response)"
        c.suggestions.append(
            f"No HTTP response from {label}. A reverse proxy/web server in the "
            "path may be refusing or silently dropping the connection. Confirm "
            "it permits long-lived connections to LaunchDarkly and is not "
            "buffering the response.")
        return c
    except Exception as e:  # noqa: BLE001
        c.status = FAIL
        c.detail = f"request failed: {e}"
        c.suggestions.append(
            f"HTTP to {label} failed: {e}. Check firewall, proxy and TLS path.")
        return c
    return interpret_status(c, code, label, key, proxy)


def _open_raw(url, path, key, timeout, allow_insecure):
    """Open a raw (optionally TLS) socket and send a streaming GET. Returns
    (sock, status_code, headers_dict, leftover_body_bytes)."""
    parts = urlsplit(url)
    host = parts.hostname
    port = parts.port or (443 if parts.scheme == "https" else 80)
    raw = socket.create_connection((host, port), timeout=timeout)
    if parts.scheme == "https":
        ctx = ssl.create_default_context()
        sock = ctx.wrap_socket(raw, server_hostname=host)
    else:
        if not allow_insecure:
            raw.close()
            raise ValueError("refusing plaintext HTTP without --allow-insecure")
        sock = raw
    base = parts.path.rstrip("/") if parts.path not in ("", "/") else ""
    req_path = (base + path) or "/"
    lines = [f"GET {req_path} HTTP/1.1",
             f"Host: {host}",
             f"User-Agent: ld-netcheck/{VERSION}",
             "Accept: text/event-stream",
             "Cache-Control: no-cache",
             "Connection: keep-alive"]
    if key:
        lines.append(f"Authorization: {key}")
    sock.sendall(("\r\n".join(lines) + "\r\n\r\n").encode())

    sock.settimeout(timeout)
    buf = b""
    while b"\r\n\r\n" not in buf:
        chunk = sock.recv(4096)
        if not chunk:
            break
        buf += chunk
    head, _, leftover = buf.partition(b"\r\n\r\n")
    head_lines = head.decode("latin-1", "ignore").split("\r\n")
    status_line = head_lines[0] if head_lines else ""
    parts_sl = status_line.split(" ", 2)
    code = int(parts_sl[1]) if len(parts_sl) > 1 and parts_sl[1].isdigit() else 0
    headers = {}
    for hl in head_lines[1:]:
        if ":" in hl:
            k, v = hl.split(":", 1)
            headers[k.strip().lower()] = v.strip()
    return sock, code, headers, leftover


def check_stream(url, path, key, hold, timeout, allow_insecure):
    """Open the SSE stream, interpret status, and (if 200 and hold>0) hold the
    connection open to detect premature close or idle drop. Returns a list of
    Check objects."""
    status_c = Check("HTTP GET stream (init)")
    try:
        sock, code, headers, leftover = _open_raw(
            url, path, key, timeout, allow_insecure)
    except socket.timeout:
        status_c.status = FAIL
        status_c.detail = "stream request timed out (no response)"
        status_c.suggestions.append(
            "No response opening the stream. A reverse proxy/web server may be "
            "refusing or silently dropping the long-lived connection. Confirm "
            "it allows long-lived connections to LaunchDarkly and does not "
            "buffer the response.")
        return [status_c]
    except Exception as e:  # noqa: BLE001
        status_c.status = FAIL
        status_c.detail = f"stream request failed: {e}"
        status_c.suggestions.append(
            f"Opening the stream failed: {e}. Check firewall, proxy and TLS.")
        return [status_c]

    proxy = _proxy_response_hint(headers)
    interpret_status(status_c, code, "stream", key, proxy)

    if code != 200 or hold <= 0:
        try:
            sock.close()
        except Exception:  # noqa: BLE001
            pass
        return [status_c]

    # 200 OK: hold the connection and watch for premature close / idle stall.
    hold_c = Check(f"Stream hold {hold}s")
    start = time.time()
    deadline = start + hold
    first_data_at = None
    last_data = start
    closed = False
    stalled = False
    read_timeout = max(1.0, min(timeout, hold))
    sock.settimeout(read_timeout)

    def note(chunk):
        nonlocal first_data_at, last_data
        last_data = time.time()
        if first_data_at is None and (b"data:" in chunk or b"event:" in chunk):
            first_data_at = time.time()

    if leftover:
        note(leftover)

    while time.time() < deadline:
        try:
            chunk = sock.recv(1024)
        except socket.timeout:
            if time.time() - last_data > read_timeout * 2:
                stalled = True
                break
            continue
        except Exception:  # noqa: BLE001
            closed = True
            break
        if chunk == b"":
            closed = True
            break
        note(chunk)
    try:
        sock.close()
    except Exception:  # noqa: BLE001
        pass

    held = time.time() - start
    if closed and held < hold - 0.5:
        hold_c.status = FAIL
        hold_c.detail = f"connection closed after ~{int(held)}s (< {hold}s)"
        hold_c.suggestions.append(
            "The streaming connection was severed early. A load balancer, "
            "reverse proxy, or firewall is closing the long-lived SSE "
            "connection. Raise idle/connection timeouts above the stream "
            "heartbeat interval and ensure SSE is passed through unbuffered.")
    elif stalled:
        hold_c.status = WARN
        hold_c.detail = "no data/keepalive received for an extended period"
        hold_c.suggestions.append(
            "The stream stalled with no data or keepalive. This matches "
            "'received no data, assuming connection is dead'. The network is "
            "likely holding or buffering the connection. Disable response "
            "buffering for SSE on the proxy/load balancer.")
    else:
        hold_c.status = PASS
        ttfd = (f", first data in {int((first_data_at - start) * 1000)} ms"
                if first_data_at else "")
        hold_c.detail = f"held {int(held)}s without interruption{ttfd}"
    return [status_c, hold_c]


def check_env_proxy():
    c = Check("Proxy environment")
    found = {}
    for var in ("HTTP_PROXY", "HTTPS_PROXY", "NO_PROXY", "http_proxy",
                "https_proxy", "no_proxy"):
        v = os.environ.get(var)
        if v:
            found[var] = v
    if not found:
        c.status = INFO
        c.detail = "no proxy environment variables set"
    else:
        c.status = INFO
        c.detail = "; ".join(f"{k}={v}" for k, v in found.items())
        c.suggestions.append(
            "Proxy environment variables are set. Confirm your SDK is "
            "configured to use the proxy (many SDKs do not read these "
            "automatically), that the proxy permits long-lived SSE streaming, "
            "and that it does not modify HTTP headers on the stream.")
    return c


# --- Orchestration ----------------------------------------------------------

def build_targets(args):
    targets = {}
    if args.relay:
        base = args.relay.rstrip("/")
        targets = {"stream": base, "poll": base, "events": base}
        side = "server"
    else:
        side = args.side
        if args.stream_url or args.poll_url or args.events_url:
            preset = INSTANCES[args.instance][side]
            targets = {
                "stream": args.stream_url or preset["stream"],
                "poll": args.poll_url or preset["poll"],
                "events": args.events_url or preset["events"],
            }
        else:
            targets = dict(INSTANCES[args.instance][side])
    return targets, side


def run(args):
    key = None
    if args.sdk_key_env:
        key = os.environ.get(args.sdk_key_env)
        if not key:
            print(f"warning: env var {args.sdk_key_env} is empty/unset",
                  file=sys.stderr)
    elif args.sdk_key:
        key = args.sdk_key

    targets, side = build_targets(args)
    paths = PATHS[side]
    results = []

    for kind in ("stream", "poll", "events"):
        url = targets[kind]
        parts = urlsplit(url)
        host = parts.hostname
        port = parts.port or (443 if parts.scheme == "https" else 80)
        label = {"stream": "stream (init)", "poll": "poll (init)",
                 "events": "events"}[kind]
        tr = TargetResult(label=label, url=url, host=host, port=port)

        dns_c, ok = check_dns(host, args.timeout)
        tr.add(dns_c)
        if ok:
            tcp_c, ok = check_tcp(host, port, args.timeout)
            tr.add(tcp_c)
        if ok and parts.scheme == "https":
            tls_c, ok = check_tls(host, port, args.timeout)
            tr.add(tls_c)
        if ok:
            if kind == "stream":
                for sc in check_stream(url, paths[kind], key, args.hold,
                                       args.timeout, args.allow_insecure):
                    tr.add(sc)
            else:
                method = "POST" if kind == "events" else "GET"
                tr.add(check_http(kind, url, paths[kind], method, key,
                                  args.timeout, args.allow_insecure))
        results.append(tr)

    env_c = check_env_proxy()
    return results, env_c, key, side


# --- Reporting --------------------------------------------------------------

def print_text(results, env_c, key, side, args):
    use_color = (not args.no_color) and sys.stdout.isatty()
    b = BOLD if use_color else ""
    r = RESET if use_color else ""

    print(f"{b}ld-netcheck {VERSION}{r}  "
          f"instance={args.instance if not args.relay else 'relay'} "
          f"side={side} sdk-key={redact_key(key)} hold={args.hold}s")
    print("=" * 72)

    suggestions = []
    for tr in results:
        wc = color_for(tr.worst, use_color)
        print(f"\n{wc}[{tr.worst}]{r} {b}{tr.label}{r}  {DIM if use_color else ''}{tr.url}{r}")
        for c in tr.checks:
            cc = color_for(c.status, use_color)
            print(f"    {cc}{c.status:<4}{r} {c.name}: {c.detail}")
            for s in c.suggestions:
                suggestions.append(s)

    cc = color_for(env_c.status, use_color)
    print(f"\n{cc}{env_c.status:<4}{r} {env_c.name}: {env_c.detail}")
    for s in env_c.suggestions:
        suggestions.append(s)

    if suggestions:
        print(f"\n{b}Suggestions to unblock:{r}")
        seen = set()
        n = 1
        for s in suggestions:
            if s in seen:
                continue
            seen.add(s)
            print(f"  {n}. {s}")
            n += 1
    else:
        print(f"\n{GREEN if use_color else ''}All checks passed - no action "
              f"needed.{r}")

    print("\nReference: LaunchDarkly domain list - "
          "https://launchdarkly.com/docs/sdk/concepts/domain-list")


def print_json(results, env_c, key, side, args):
    out = {
        "tool": "ld-netcheck",
        "version": VERSION,
        "instance": args.instance if not args.relay else "relay",
        "side": side,
        "sdk_key": redact_key(key),
        "hold_seconds": args.hold,
        "targets": [],
    }
    for tr in results:
        out["targets"].append({
            "label": tr.label, "url": tr.url, "host": tr.host,
            "port": tr.port, "result": tr.worst,
            "checks": [asdict(c) for c in tr.checks],
        })
    out["proxy_environment"] = asdict(env_c)
    print(json.dumps(out, indent=2))


def exit_code(results):
    for tr in results:
        if tr.worst == FAIL:
            return 2
    for tr in results:
        if tr.worst == WARN:
            return 1
    return 0


def main(argv=None):
    p = argparse.ArgumentParser(
        prog="ld-netcheck",
        description="Diagnose LaunchDarkly SDK connectivity (init + events).")
    p.add_argument("--instance", choices=list(INSTANCES),
                   default="commercial", help="LaunchDarkly instance preset")
    p.add_argument("--side", choices=["server", "client", "mobile"],
                   default="server", help="SDK side to test")
    p.add_argument("--relay", help="Relay Proxy base URI (overrides instance)")
    p.add_argument("--stream-url", help="Override the streaming base URI")
    p.add_argument("--poll-url", help="Override the polling base URI")
    p.add_argument("--events-url", help="Override the events base URI")
    p.add_argument("--sdk-key", help="SDK key (prefer --sdk-key-env; argv is "
                   "visible in the process list and shell history)")
    p.add_argument("--sdk-key-env", help="Name of env var holding the SDK key")
    p.add_argument("--hold", type=int, default=30,
                   help="Seconds to hold the stream open (0 to skip)")
    p.add_argument("--timeout", type=float, default=10.0,
                   help="Per-operation network timeout in seconds")
    p.add_argument("--allow-insecure", action="store_true",
                   help="Permit plaintext http:// targets (e.g. local relay)")
    p.add_argument("--json", action="store_true", help="Emit JSON output")
    p.add_argument("--no-color", action="store_true", help="Disable color")
    p.add_argument("--version", action="version",
                   version=f"ld-netcheck {VERSION}")
    args = p.parse_args(argv)

    results, env_c, key, side = run(args)
    if args.json:
        print_json(results, env_c, key, side, args)
    else:
        print_text(results, env_c, key, side, args)
    return exit_code(results)


if __name__ == "__main__":
    sys.exit(main())
