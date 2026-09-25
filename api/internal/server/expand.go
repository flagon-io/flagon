package server

import "strings"

// ExpandSet is the set of related objects a client asked to inline on a response,
// via `expand[]` query params. By default the API returns a
// reference (e.g. `org_id`); when the caller opts in with `expand[]=organization`
// the full object is embedded alongside it. This keeps responses lean while
// letting a client fetch a whole graph in one round trip.
//
// Parsing is permissive: `expand[]=a&expand[]=b`, `expand=a,b`, and mixed forms
// all work; values are trimmed and lower-cased. Dotted paths (`data.actor`) are
// preserved for list endpoints that expand inside a collection.
type ExpandSet map[string]bool

// parseExpand builds an ExpandSet from the raw query values of the expand params.
func parseExpand(raw []string) ExpandSet {
	set := ExpandSet{}
	for _, v := range raw {
		for _, part := range strings.Split(v, ",") {
			if p := strings.ToLower(strings.TrimSpace(part)); p != "" {
				set[p] = true
			}
		}
	}
	return set
}

// Has reports whether the given relation was requested.
func (e ExpandSet) Has(path string) bool { return e[path] }
