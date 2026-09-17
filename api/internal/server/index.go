package server

import (
	"encoding/json"
	"net/http"
	"strings"

	"github.com/danielgtaylor/huma/v2"
	"github.com/go-chi/chi/v5"
)

// registerIndex serves a JSON index of the API at the root path, in the style
// of https://api.github.com/ : a flat map of "<name>_url" keys to absolute URL
// templates, so a caller hitting the root can discover what the API offers.
//
// The resource entries are built from the live OpenAPI definition, so every
// endpoint registered with huma.Register shows up here automatically as the
// API grows - there is no separate list to keep in sync (the same principle
// that keeps the OpenAPI spec honest). Registered directly on the chi router,
// like the health checks, so the index itself stays out of the documented spec.
func registerIndex(router chi.Router, api huma.API) {
	router.Get("/", func(w http.ResponseWriter, r *http.Request) {
		base := baseURL(r)

		// Discovery links that always exist (huma serves the spec regardless of
		// which operations are registered).
		index := map[string]string{
			"openapi_url":      base + "/openapi.json",
			"openapi_yaml_url": base + "/openapi.yaml",
		}

		for path, item := range api.OpenAPI().Paths {
			for _, op := range operations(item) {
				index[urlKey(op, path)] = base + path
			}
		}

		w.Header().Set("Content-Type", "application/json")
		enc := json.NewEncoder(w)
		enc.SetIndent("", "  ")
		_ = enc.Encode(index)
	})
}

// operations returns the operations defined on a path item, in a stable order.
func operations(item *huma.PathItem) []*huma.Operation {
	candidates := []*huma.Operation{
		item.Get, item.Post, item.Put, item.Patch,
		item.Delete, item.Head, item.Options,
	}
	ops := make([]*huma.Operation, 0, len(candidates))
	for _, op := range candidates {
		if op != nil {
			ops = append(ops, op)
		}
	}
	return ops
}

// urlKey derives the "<name>_url" index key for an operation. It prefers the
// operation ID (unique by construction - huma panics on duplicates) and falls
// back to the method+path when an operation was registered without one.
func urlKey(op *huma.Operation, path string) string {
	name := op.OperationID
	if name == "" {
		name = op.Method + " " + path
	}
	key := sanitize(name)
	if !strings.HasSuffix(key, "_url") {
		key += "_url"
	}
	return key
}

// sanitize lowercases s and collapses every run of non-alphanumeric characters
// into a single underscore, trimming underscores from the ends. So
// "list-projects" -> "list_projects" and "GET /projects/{id}" -> "get_projects_id".
func sanitize(s string) string {
	var b strings.Builder
	pendingUnderscore := false
	for _, r := range strings.ToLower(s) {
		switch {
		case (r >= 'a' && r <= 'z') || (r >= '0' && r <= '9'):
			if pendingUnderscore && b.Len() > 0 {
				b.WriteByte('_')
			}
			pendingUnderscore = false
			b.WriteRune(r)
		default:
			pendingUnderscore = true
		}
	}
	return b.String()
}

// baseURL reconstructs the externally visible origin (scheme://host) of the
// request. Behind Fly's proxy TLS is terminated upstream, so the forwarded
// proto header is the source of truth for the scheme.
func baseURL(r *http.Request) string {
	scheme := "https"
	if proto := r.Header.Get("X-Forwarded-Proto"); proto != "" {
		// May be a comma-separated list ("https,http"); the first hop wins.
		if i := strings.IndexByte(proto, ','); i >= 0 {
			proto = proto[:i]
		}
		scheme = strings.TrimSpace(proto)
	} else if r.TLS == nil {
		scheme = "http"
	}
	return scheme + "://" + r.Host
}
