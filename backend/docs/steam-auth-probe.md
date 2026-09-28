# Temporary participant authorization diagnostic

Not a delivery provider or settlement mechanism. This probe reads only offer
9391832342 and receipt 744938690018752002 for the explicitly consenting test seller
76561198195181115. It never changes order, inventory, wallet or payment state.

Version 0.6.66 also supports the explicitly consenting buyer 76561198655632881
with its existing ACTIVE BUYER role. Buyer access requires the separate
STEAM_BUYER_PROBE_UNTIL window; the seller window cannot authorize it. Preflight
returns the allowed owner Steam ID, which the extension binds to the cookie
before transmission. Only these two fixed owners are accepted. The buyer result
reports incoming-offer and assets_received predicates, including comparison to
the previously observed destination asset, without returning any raw values.
Those comparisons are diagnostic hypotheses, never new settlement evidence.

The endpoint is disabled unless STEAM_AUTH_PROBE_UNTIL is a future ISO timestamp
no more than one hour away. An expired/missing/malformed window is rejected.
Both preflight and execution require a valid signed extension session and an
ACTIVE ADMIN user with that exact Steam ID. Normal signed-request nonce storage
continues, but contains no Steam credential. Requests are limited to one attempt
per minute per process. This in-memory limit is not a distributed rate limiter.

The extension popup requires an unchecked-by-default explicit consent control.
Only the extension's own popup can invoke this background command; website and
content-script messages cannot. Preflight must succeed before the cookie is read.
The extension checks the cookie owner, extracts only its access token, and posts
to the fixed HTTPS p2pcs.ru endpoint. It does not persist or return the token.
The backend contacts only the two fixed api.steampowered.com methods over direct
HTTPS, rejecting redirects, with a 15-second deadline per request and 256 KiB
response limit. It does not use the configured third-party proxy.

Returned diagnostics contain only whitelisted booleans and HTTP status numbers.
Raw upstream text, exceptions, tokens and unrelated history are never returned.
The current application request logger logs paths/status but not bodies; deployment
must also retain body-free proxy/APM logging. Do not enable request-body capture.
No code can guarantee immediate erasure of JavaScript strings from process memory;
references are dropped, not cryptographically wiped. No refresh token or password
is used. Steam has not granted this credential read-only scope.

Operator procedure: deploy the reviewed backend and extension, verify seller's
existing ADMIN role (do not widen roles merely for this probe), enable a short
window, reconnect extension 0.6.66 in the authorized profile, expand Support / emergency
access, explicitly consent, and invoke the diagnostic. Remove the temporary window
after the result; it also expires automatically. Do not enable real settlement.
The runtime must be restarted if its environment is changed. Deployment and
temporary-window activation are separate steps; this source does not enable it.

An exact receipt with new_contextid=16 remains protected and does not satisfy the
existing unprotected receipt validator. Even a successful diagnostic is not proof
that automatic settlement, reversal handling or a new end-to-end trade is ready.
