package server

import (
	"net/http"
	"sort"
	"testing"
)

// These guardrails enumerate every operation the real server registers (via
// newTestServer's recorder, which also sees Hidden QUERY twins) and hold the
// AGENTS.md rules mechanically:
//
//   - permissions by default: every operation is either scoped in
//     operationScopes or explicitly exempted below with a reason;
//   - golden path step 2: every scoped, user-facing operation has an agent/MCP
//     tool carrying the same scope and the same read/write nature.
//
// Adding an operation without a scope or a tool fails here, in CI, instead of
// silently blinding the agent (or silently opening the op to scoped tokens).

// unscopedOps are the registered operations deliberately absent from
// operationScopes, so NO access token can reach them (fail-closed). Each must be
// public by design or gated by internalAuth (the app's own secret); the test
// below proves the internal ones reject a user token.
var unscopedOps = map[string]string{
	// Public by design: no auth at all.
	"get-user":       "public profile page; exposes only public fields via a definer window",
	"get-invitation": "invite landing page lookup; the unguessable token is the credential",

	// internalAuth only: the app calls these on the user's behalf.
	"accept-invitation":    "the app accepts right after the invitee registers; never token-reachable",
	"set-account-deleted":  "mirror of the app-owned account state (BetterAuth is the writer)",
	"sync-profile":         "mirror of the app-owned profile, username and 2FA/SSO state (the auth layer is the writer); a token must never overwrite it",
	"provision-sso-member": "runs only after the app has verified the SSO assertion for the org's IdP",
	// SSO provider cache: the auth layer reads full provider config (secrets included)
	// before anyone is signed in, and adopts providers that predate API ownership. The
	// internal token is the only credential; the user-facing SSO ops carry scopes.
	"get-sso-provider-configs": "app-only full SSO config (with secrets) for the auth layer's sign-in cache; never token-reachable",
	"import-sso-provider":      "app-only one-time adoption of providers registered before the API owned them",
	"create-pat":               "tokens never manage tokens, so a token can't mint or widen its own access",
	"list-pats":                "tokens never manage tokens",
	"revoke-pat":               "tokens never manage tokens",
	"create-oat":               "tokens never manage tokens",
	"list-oats":                "tokens never manage tokens",
	"revoke-oat":               "tokens never manage tokens",
	"ai-send-message":          "the in-product agent itself (the app's chat surface), not a capability",
	"ai-execute-action":        "the agent's human-in-the-loop confirm step; it runs a tool, it is not one",
}

// publicOps is the subset of unscopedOps that take no auth at all.
var publicOps = map[string]bool{"get-user": true, "get-invitation": true}

// toolExemptOps are scoped operations that intentionally have no agent/MCP tool.
var toolExemptOps = map[string]string{}

func TestEveryOperationIsScopedOrExempt(t *testing.T) {
	s := newTestServer(t, newFakeStore(nil))
	registered := map[string]bool{}
	for _, op := range s.ops {
		registered[op.OperationID] = true
		_, scoped := operationScopes[op.OperationID]
		_, exempt := unscopedOps[op.OperationID]
		switch {
		case scoped && exempt:
			t.Errorf("operation %q is both scoped and listed in unscopedOps; pick one", op.OperationID)
		case !scoped && !exempt:
			t.Errorf("operation %q has no scope in operationScopes (scopes.go) and no documented exemption", op.OperationID)
		}
	}
	for id := range operationScopes {
		if !registered[id] {
			t.Errorf("operationScopes maps %q, but no such operation is registered (stale entry)", id)
		}
	}
	for id := range unscopedOps {
		if !registered[id] {
			t.Errorf("unscopedOps lists %q, but no such operation is registered (stale entry)", id)
		}
	}
	for id := range toolExemptOps {
		if _, scoped := operationScopes[id]; !scoped {
			t.Errorf("toolExemptOps lists %q, which is not a scoped operation", id)
		}
	}
}

// TestUnscopedInternalOpsRejectUserTokens proves the exemptions above are real:
// an internal-only operation turns a user access token away at the door.
func TestUnscopedInternalOpsRejectUserTokens(t *testing.T) {
	s := newTestServer(t, newFakeStore(nil)) // full-access token
	for id := range unscopedOps {
		if publicOps[id] {
			continue
		}
		op := s.op(t, id)
		rec := s.call(op.Method, concretePath(op.Path), "flagon_pat_full", "")
		if rec.Code != http.StatusUnauthorized {
			t.Errorf("%s (%s %s) with a user token = %d, want 401 (internal-only)", id, op.Method, op.Path, rec.Code)
		}
	}
}

// TestEveryScopedOperationHasATool is the golden-path guardrail: the agent and
// MCP can do everything a scoped token can, with the same scope.
func TestEveryScopedOperationHasATool(t *testing.T) {
	s := newTestServer(t, newFakeStore(nil))

	toolsByOp := map[string][]string{}
	for _, tool := range s.registry.Tools() {
		if tool.Public {
			continue
		}
		if tool.Operation == "" {
			t.Errorf("tool %q is user-acting but names no Operation", tool.Def.Name)
			continue
		}
		toolsByOp[tool.Operation] = append(toolsByOp[tool.Operation], tool.Def.Name)
	}

	// A QUERY twin is the same list as its GET sibling (same path), so the GET's
	// tool covers it.
	getAt := map[string]string{}
	for _, op := range s.ops {
		if op.Method == http.MethodGet {
			getAt[op.Path] = op.OperationID
		}
	}

	var missing []string
	for _, op := range s.ops {
		if _, scoped := operationScopes[op.OperationID]; !scoped {
			continue
		}
		if _, exempt := toolExemptOps[op.OperationID]; exempt {
			continue
		}
		covering := op.OperationID
		if op.Method == "QUERY" {
			covering = getAt[op.Path]
		}
		if len(toolsByOp[covering]) == 0 {
			missing = append(missing, op.OperationID)
		}
	}
	sort.Strings(missing)
	for _, id := range missing {
		t.Errorf("scoped operation %q has no agent/MCP tool (add one in internal/ai/tools_*.go with Operation: %q, or document why in toolExemptOps)", id, id)
	}
}

// TestToolsMatchTheirOperations checks each tool against the operation it
// fronts: the operation exists, the scope is identical, and the tool is
// Mutating exactly when the operation writes (so writes are always proposed for
// confirmation, and reads always run freely).
func TestToolsMatchTheirOperations(t *testing.T) {
	s := newTestServer(t, newFakeStore(nil))
	byID := map[string]string{} // op id -> method
	for _, op := range s.ops {
		byID[op.OperationID] = op.Method
	}
	for _, tool := range s.registry.Tools() {
		if tool.Public {
			if tool.Scope != "" || tool.Mutating {
				t.Errorf("public tool %q must be read-only and unscoped", tool.Def.Name)
			}
			continue
		}
		method, ok := byID[tool.Operation]
		if !ok {
			t.Errorf("tool %q names operation %q, which is not registered", tool.Def.Name, tool.Operation)
			continue
		}
		if want := string(operationScopes[tool.Operation]); tool.Scope != want {
			t.Errorf("tool %q has scope %q, but its operation %q requires %q", tool.Def.Name, tool.Scope, tool.Operation, want)
		}
		writes := method != http.MethodGet && method != "QUERY"
		if tool.Mutating != writes {
			t.Errorf("tool %q Mutating=%v, but its operation %q is %s", tool.Def.Name, tool.Mutating, tool.Operation, method)
		}
		if tool.Mutating && tool.Summarize == nil {
			t.Errorf("mutating tool %q has no Summarize for its confirmation prompt", tool.Def.Name)
		}
	}
}
