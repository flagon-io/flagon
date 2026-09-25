package server

import (
	"context"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/hex"
	"encoding/json"
	"math"
	"net"
	"net/http"
	"strconv"
	"strings"
	"sync"
	"time"
)

// Request limits. Both are deliberately generous: they exist to stop abuse (an
// unbounded body, a runaway client), not to shape normal use, and the e2e
// suites must never trip them.
const (
	// DefaultMaxBodyBytes caps every request body. Huma operations additionally
	// keep their own (smaller) per-operation limit; this global cap is what
	// bounds the non-huma routes, the MCP endpoint above all.
	DefaultMaxBodyBytes int64 = 4 << 20 // 4 MiB

	// DefaultRateLimit / DefaultRateBurst are the per-principal token bucket:
	// sustained requests per second, and how many may arrive at once.
	DefaultRateLimit float64 = 50
	DefaultRateBurst int     = 300
)

// Limits configures the request guards installed in New.
type Limits struct {
	// MaxBodyBytes caps request bodies; <= 0 uses DefaultMaxBodyBytes.
	MaxBodyBytes int64
	// RateLimit is the sustained requests/second per principal; <= 0 disables
	// rate limiting entirely.
	RateLimit float64
	// RateBurst is the bucket size; <= 0 uses DefaultRateBurst.
	RateBurst int
	// ClientIPHeader names a proxy header that carries the real client IP (e.g.
	// "Fly-Client-IP" behind Fly's edge). Empty means trust only the TCP peer
	// address. Only set it when every request reaches the API through a proxy
	// that overwrites the header, or any caller could spoof their IP.
	ClientIPHeader string
}

// WithLimits installs the body-size cap, the per-principal rate limiter and the
// trusted client-IP header.
func WithLimits(l Limits) Option {
	return func(o *Options) { o.Limits = l }
}

// --- client IP ----------------------------------------------------------------

type connIPCtxKey struct{}

// withConnIP resolves the caller's network address ONCE per request and binds it
// to the context: the configured trusted proxy header when present, otherwise
// the TCP peer. The rate limiter keys anonymous callers on it and the audit
// trail records it for token callers. Headers the client controls (the
// gateway's X-Flagon-Client-*, X-Forwarded-For, ...) are never consulted here.
func withConnIP(trustedHeader string) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			ip := ""
			if trustedHeader != "" {
				ip = firstHop(r.Header.Get(trustedHeader))
			}
			if ip == "" {
				ip = peerIP(r.RemoteAddr)
			}
			next.ServeHTTP(w, r.WithContext(context.WithValue(r.Context(), connIPCtxKey{}, ip)))
		})
	}
}

// connIP is the address withConnIP resolved for this request ("" outside one).
func connIP(ctx context.Context) string {
	ip, _ := ctx.Value(connIPCtxKey{}).(string)
	return ip
}

// firstHop returns the first entry of a (possibly comma-separated) address
// header, trimmed.
func firstHop(v string) string {
	if i := strings.IndexByte(v, ','); i >= 0 {
		v = v[:i]
	}
	return strings.TrimSpace(v)
}

// peerIP strips the port from a RemoteAddr.
func peerIP(remoteAddr string) string {
	if host, _, err := net.SplitHostPort(remoteAddr); err == nil {
		return host
	}
	return remoteAddr
}

// --- body limit ---------------------------------------------------------------

// withBodyLimit caps every request body at max bytes. A declared oversize body
// is refused up front with 413; an undeclared (chunked) one fails the read once
// it passes the cap, which the handlers report as 413 too.
func withBodyLimit(maxBytes int64) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if r.ContentLength > maxBytes {
				writeProblem(w, http.StatusRequestEntityTooLarge, "request body is too large")
				return
			}
			if r.Body != nil {
				r.Body = http.MaxBytesReader(w, r.Body, maxBytes)
			}
			next.ServeHTTP(w, r)
		})
	}
}

// writeProblem writes an RFC 9457 problem body in the same shape huma uses for
// its own errors, for the guards that run before huma.
func writeProblem(w http.ResponseWriter, status int, detail string) {
	w.Header().Set("Content-Type", "application/problem+json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(map[string]any{
		"title":  http.StatusText(status),
		"status": status,
		"detail": detail,
	})
}

// --- rate limiting ------------------------------------------------------------

// rateLimitExempt are the paths the limiter never touches: liveness/readiness
// probes must answer regardless of load. (Metrics are served on their own port
// and never pass through this router.)
var rateLimitExempt = map[string]bool{"/healthz": true, "/readyz": true}

// withRateLimit applies a per-principal token bucket. The principal is resolved
// cheaply from the request, before (and without) a database lookup:
//
//   - the app gateway (internal token) is keyed by the forwarded user id, so each
//     signed-in user has their own budget; gateway service calls that carry no
//     user are not limited (they are the trusted app itself);
//   - a Flagon access token is keyed by a hash of the token (one budget per
//     token, whether or not it turns out to be valid);
//   - everything else is keyed by client IP (see withConnIP).
//
// The limiter is IN-MEMORY and PER INSTANCE: with N API machines a principal's
// effective ceiling is up to N times the configured rate. It is an abuse guard,
// not a billing-grade quota (AI usage has its own DB-backed per-org meter).
func withRateLimit(l *rateLimiter, internalToken string) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if rateLimitExempt[r.URL.Path] {
				next.ServeHTTP(w, r)
				return
			}
			key, limited := principalKey(r, internalToken)
			if limited {
				if ok, wait := l.allow(key, time.Now()); !ok {
					secs := int(math.Ceil(wait.Seconds()))
					if secs < 1 {
						secs = 1
					}
					w.Header().Set("Retry-After", strconv.Itoa(secs))
					writeProblem(w, http.StatusTooManyRequests,
						"rate limit exceeded; retry after "+strconv.Itoa(secs)+"s")
					return
				}
			}
			next.ServeHTTP(w, r)
		})
	}
}

// principalKey names the bucket a request draws from. limited=false exempts it.
func principalKey(r *http.Request, internalToken string) (key string, limited bool) {
	presented := strings.TrimPrefix(r.Header.Get("Authorization"), "Bearer ")
	switch {
	case presented != "" && internalToken != "" &&
		subtle.ConstantTimeCompare([]byte(presented), []byte(internalToken)) == 1:
		if uid := strings.TrimSpace(r.Header.Get("X-Flagon-User-Id")); uid != "" {
			return "user:" + uid, true
		}
		return "", false
	case strings.HasPrefix(presented, "flagon_"):
		sum := sha256.Sum256([]byte(presented))
		return "token:" + hex.EncodeToString(sum[:16]), true
	default:
		return "ip:" + connIP(r.Context()), true
	}
}

// rateLimiter is a map of token buckets keyed by principal. Idle buckets (ones
// that would have refilled completely) are swept periodically so the map stays
// bounded by the set of recently active principals.
type rateLimiter struct {
	rate  float64 // tokens per second
	burst float64

	mu        sync.Mutex
	buckets   map[string]*bucket
	lastSweep time.Time
}

type bucket struct {
	tokens float64
	last   time.Time
}

// sweepEvery is how often allow prunes idle buckets.
const sweepEvery = time.Minute

func newRateLimiter(rate float64, burst int) *rateLimiter {
	if burst <= 0 {
		burst = DefaultRateBurst
	}
	return &rateLimiter{rate: rate, burst: float64(burst), buckets: map[string]*bucket{}}
}

// allow spends one token from key's bucket. When the bucket is empty it reports
// how long until a token is available.
func (l *rateLimiter) allow(key string, now time.Time) (bool, time.Duration) {
	l.mu.Lock()
	defer l.mu.Unlock()

	if now.Sub(l.lastSweep) >= sweepEvery {
		l.sweep(now)
		l.lastSweep = now
	}

	b, ok := l.buckets[key]
	if !ok {
		b = &bucket{tokens: l.burst, last: now}
		l.buckets[key] = b
	} else {
		b.tokens = math.Min(l.burst, b.tokens+now.Sub(b.last).Seconds()*l.rate)
		b.last = now
	}
	if b.tokens >= 1 {
		b.tokens--
		return true, 0
	}
	need := (1 - b.tokens) / l.rate
	return false, time.Duration(need * float64(time.Second))
}

// sweep drops buckets that have been idle long enough to be full again; they
// carry no state a fresh bucket would not.
func (l *rateLimiter) sweep(now time.Time) {
	full := time.Duration(l.burst / l.rate * float64(time.Second))
	for k, b := range l.buckets {
		if now.Sub(b.last) >= full {
			delete(l.buckets, k)
		}
	}
}
