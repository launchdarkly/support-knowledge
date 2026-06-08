#!/bin/sh
# ld-netcheck-quick.sh - zero-dependency LaunchDarkly connectivity triage.
#
# Uses only POSIX sh + curl. Intended as the first thing to hand a customer in
# a locked-down environment that will not run an unknown binary or interpreter.
# It checks DNS, TCP/TLS, and HTTP reachability for the streaming (init),
# polling (init), and events endpoints, plus a short streaming hold test.
#
# It never prints the SDK key. Provide it via the LD_SDK_KEY environment
# variable (NOT on the command line, which is visible in the process list and
# shell history):
#
#   LD_SDK_KEY=sdk-xxxx ./ld-netcheck-quick.sh
#
# Options (environment variables):
#   LD_INSTANCE   commercial | eu | federal     (default: commercial)
#   LD_SIDE       server | client               (default: server)
#   LD_HOLD       stream hold seconds           (default: 10)
#   LD_TIMEOUT    per-request timeout seconds   (default: 10)
#   Overrides:    LD_STREAM_URL  LD_POLL_URL  LD_EVENTS_URL  (or LD_RELAY)
#
# Reference: https://launchdarkly.com/docs/sdk/concepts/domain-list

set -u

INSTANCE="${LD_INSTANCE:-commercial}"
SIDE="${LD_SIDE:-server}"
HOLD="${LD_HOLD:-10}"
TIMEOUT="${LD_TIMEOUT:-10}"
KEY="${LD_SDK_KEY:-}"

if ! command -v curl >/dev/null 2>&1; then
  echo "curl is required but was not found in PATH." >&2
  exit 3
fi

# --- Resolve endpoints ------------------------------------------------------
case "$INSTANCE" in
  commercial) DOM="launchdarkly.com" ;;
  eu)         DOM="eu.launchdarkly.com" ;;
  federal)    DOM="launchdarkly.us" ;;
  *) echo "Unknown LD_INSTANCE: $INSTANCE" >&2; exit 3 ;;
esac

if [ "$SIDE" = "server" ]; then
  STREAM_HOST="stream.$DOM";       STREAM_PATH="/all"
  POLL_HOST="sdk.$DOM";            POLL_PATH="/sdk/latest-all"
else
  STREAM_HOST="clientstream.$DOM"; STREAM_PATH="/eval"
  POLL_HOST="clientsdk.$DOM";      POLL_PATH="/sdk/evalx"
fi
# events host: mobile uses mobile.<dom> for commercial/federal; we default to
# the events host, which is correct for server and client-side JS.
EVENTS_HOST="events.$DOM";         EVENTS_PATH="/bulk"

STREAM_URL="https://$STREAM_HOST$STREAM_PATH"
POLL_URL="https://$POLL_HOST$POLL_PATH"
EVENTS_URL="https://$EVENTS_HOST$EVENTS_PATH"

# Overrides
[ -n "${LD_RELAY:-}" ] && { STREAM_URL="${LD_RELAY%/}$STREAM_PATH"; POLL_URL="${LD_RELAY%/}$POLL_PATH"; EVENTS_URL="${LD_RELAY%/}$EVENTS_PATH"; }
[ -n "${LD_STREAM_URL:-}" ] && STREAM_URL="$LD_STREAM_URL"
[ -n "${LD_POLL_URL:-}" ]   && POLL_URL="$LD_POLL_URL"
[ -n "${LD_EVENTS_URL:-}" ] && EVENTS_URL="$LD_EVENTS_URL"

AUTH=""
[ -n "$KEY" ] && AUTH="$KEY"

echo "ld-netcheck-quick  instance=$INSTANCE side=$SIDE hold=${HOLD}s"
if [ -n "$KEY" ]; then echo "sdk-key: [provided]"; else echo "sdk-key: (none - 401 means reachable)"; fi
echo "------------------------------------------------------------------------"

curl_code_to_text() {
  case "$1" in
    6)  echo "DNS resolution failed (host could not be resolved)" ;;
    7)  echo "TCP connect failed (firewall likely blocking egress)" ;;
    28) echo "timed out (no response - proxy may be dropping the connection)" ;;
    35) echo "TLS connect error (handshake reset)" ;;
    60) echo "TLS certificate not trusted (inspecting proxy or missing CA bundle)" ;;
    *)  echo "curl error $1" ;;
  esac
}

probe() { # name method url path
  name="$1"; method="$2"; url="$3"
  set -- -sS -o /dev/null -w '%{http_code}' --max-time "$TIMEOUT" -A "ld-netcheck-quick"
  [ -n "$AUTH" ] && set -- "$@" -H "Authorization: $AUTH"
  if [ "$method" = "POST" ]; then set -- "$@" -X POST -H "Content-Type: application/json" --data '[]'; fi
  code=$(curl "$@" "$url" 2>/dev/null); rc=$?
  if [ "$rc" -ne 0 ]; then
    echo "FAIL  $name: $(curl_code_to_text "$rc")"
    return
  fi
  case "$code" in
    200|202) echo "PASS  $name: HTTP $code" ;;
    401) if [ -n "$AUTH" ]; then echo "FAIL  $name: HTTP 401 (SDK key wrong for this environment/instance)";
         else echo "PASS  $name: HTTP 401 (endpoint reachable; set LD_SDK_KEY to test auth)"; fi ;;
    403) echo "FAIL  $name: HTTP 403 (endpoint not allowlisted in firewall/CSP)" ;;
    404) echo "WARN  $name: HTTP 404 (wrong path/instance/side?)" ;;
    405) echo "FAIL  $name: HTTP 405 (POST blocked - events will silently fail)" ;;
    503) echo "WARN  $name: HTTP 503 (Relay not ready / retrying)" ;;
    5*)  echo "WARN  $name: HTTP $code (server-side error; capture and contact Support)" ;;
    *)   echo "WARN  $name: HTTP $code" ;;
  esac
}

probe "poll (init)"   GET  "$POLL_URL"
probe "events"        POST "$EVENTS_URL"

# --- Stream status + hold (single request) ----------------------------------
# The streaming endpoint is a long-lived SSE connection, so a normal status
# probe never returns. Instead we open it and hold for $HOLD seconds:
#   - curl aborted by --max-time (rc 28) with HTTP 200 = stayed open (good)
#   - clean close (rc 0) before the hold elapsed = something severed it (bad)
#   - 401/403/etc. come back immediately and are interpreted as usual
echo "------------------------------------------------------------------------"
echo "Opening stream and holding for ${HOLD}s ..."
HDR=""
[ -n "$AUTH" ] && HDR="-H Authorization:$AUTH"
start=$(date +%s)
# shellcheck disable=SC2086
code=$(curl -sS -N --max-time "$HOLD" -A "ld-netcheck-quick" -H "Accept: text/event-stream" $HDR \
  -o /dev/null -w '%{http_code}' "$STREAM_URL" 2>/dev/null)
rc=$?
end=$(date +%s)
elapsed=$((end - start))
case "$code" in
  200)
    if [ "$rc" -eq 28 ]; then
      echo "PASS  stream (init): HTTP 200, held ${HOLD}s without interruption"
    elif [ "$rc" -eq 0 ] && [ "$elapsed" -lt "$HOLD" ]; then
      echo "FAIL  stream (init): HTTP 200 but connection closed after ~${elapsed}s (< ${HOLD}s) - a load balancer/proxy/firewall is severing the long-lived SSE connection"
    else
      echo "PASS  stream (init): HTTP 200 (held ~${elapsed}s)"
    fi ;;
  401) if [ -n "$AUTH" ]; then echo "FAIL  stream (init): HTTP 401 (SDK key wrong for this environment/instance)";
       else echo "PASS  stream (init): HTTP 401 (endpoint reachable; set LD_SDK_KEY to test the live stream)"; fi ;;
  403) echo "FAIL  stream (init): HTTP 403 (endpoint not allowlisted in firewall/CSP)" ;;
  000) echo "FAIL  stream (init): $(curl_code_to_text "$rc")" ;;
  5*)  echo "WARN  stream (init): HTTP $code (server-side error; capture and contact Support)" ;;
  *)   echo "WARN  stream (init): HTTP $code" ;;
esac

echo "------------------------------------------------------------------------"
echo "If you saw FAIL on TLS: a TLS-inspecting proxy is likely re-signing"
echo "traffic. Exempt the LaunchDarkly domains from inspection, or install the"
echo "corporate root CA into the client trust store."
echo "If you saw 403 / connect failures: allowlist the LaunchDarkly domain list"
echo "for the $INSTANCE instance: https://launchdarkly.com/docs/sdk/concepts/domain-list"
