package server

import (
	"log/slog"
	"net/http"
	"strings"

	"github.com/danielgtaylor/huma/v2"

	"github.com/flagon-io/flagon/api/internal/service"
)

// orgPolicyExempt lists org-scoped operations the security policy never blocks.
// Leaving an org must always work, including for a member who doesn't (yet) meet
// the policy: it only removes access, it never exposes anything.
var orgPolicyExempt = map[string]bool{
	"leave-org": true,
}

// withOrgPolicy wraps an auth middleware so that, once the caller is
// authenticated, every operation under /orgs/{slug} is checked against that
// org's security policy (2FA + SSO requirements, service.CheckOrgAccess) before
// the handler runs. It is the REST front door's half of the enforcement; the
// agent/MCP tool runner and the /ai endpoints make the same check. A failure is
// the policy's 403 with a message that says what to fix.
func withOrgPolicy(api huma.API, svc *service.Service, authn func(huma.Context, func(huma.Context))) func(huma.Context, func(huma.Context)) {
	return func(ctx huma.Context, next func(huma.Context)) {
		authn(ctx, func(ctx huma.Context) {
			op := ctx.Operation()
			if op == nil || orgPolicyExempt[op.OperationID] || !isOrgScopedPath(op.Path) {
				next(ctx)
				return
			}
			if err := svc.CheckOrgAccess(ctx.Context(), actor(ctx.Context()), ctx.Param("slug")); err != nil {
				writePolicyErr(api, ctx, err)
				return
			}
			next(ctx)
		})
	}
}

// isOrgScopedPath reports whether an operation path addresses one org by slug.
func isOrgScopedPath(path string) bool {
	return path == "/orgs/{slug}" || strings.HasPrefix(path, "/orgs/{slug}/")
}

// writePolicyErr renders a policy failure the way apiErr would: a classified
// error keeps its status and caller-safe message; anything else is a logged,
// generic 500.
func writePolicyErr(api huma.API, ctx huma.Context, err error) {
	if e, ok := service.Classify(err); ok {
		_ = huma.WriteErr(api, ctx, e.Status, e.Message)
		return
	}
	slog.ErrorContext(ctx.Context(), "org policy check failed", "request_id", RequestID(ctx.Context()), "err", err)
	_ = huma.WriteErr(api, ctx, http.StatusInternalServerError, "could not verify organization access")
}
