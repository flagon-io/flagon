// Command flagon-server is the Flagon API server. It owns everything that talks
// to Postgres: running the HTTP API and applying migrations. The user-facing
// client lives in cmd/flagon and speaks to this server over HTTP - keeping the
// two apart means the CLI binary never links pgx, huma, or the AI providers.
//
// Usage:
//
//	flagon-server serve      run the HTTP API (migrates on boot, then serves)
//	flagon-server migrate    provision the app role + run migrations, then exit
//
// Every setting is a flag backed by an environment variable and a sane
// local-dev default, so `go run ./cmd/flagon-server serve` works against the
// compose Postgres with no setup: with FLAGON_HOST unset (and off Fly) it binds
// loopback only, which counts as development and enables the local defaults.
// Anything bound to a routable interface (FLAGON_HOST=0.0.0.0, as the container
// image sets) or running on Fly is production unless FLAGON_ENV says otherwise,
// and production refuses to start without real secrets. For persistent local overrides, drop a `.env`
// (or `.env.local`) next to where you run it - both are gitignored and loaded on
// startup; a real environment variable always wins over a dotfile, which wins
// over the default.
//
// Migrations run on boot: serving machines apply them, serialized by an advisory
// lock so concurrent boots never race (see internal/db). Fly Managed Postgres is
// not reachable from a release_command machine, so we cannot use that for
// migrations; a regular serving machine reaches it fine.
package main

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/joho/godotenv"
	"github.com/urfave/cli/v3"

	"github.com/flagon-io/flagon/api/internal/ai"
	"github.com/flagon-io/flagon/api/internal/audit"
	"github.com/flagon-io/flagon/api/internal/changelog"
	"github.com/flagon-io/flagon/api/internal/db"
	"github.com/flagon-io/flagon/api/internal/docs"
	"github.com/flagon-io/flagon/api/internal/mail"
	"github.com/flagon-io/flagon/api/internal/metrics"
	"github.com/flagon-io/flagon/api/internal/roadmap"
	"github.com/flagon-io/flagon/api/internal/secrets"
	"github.com/flagon-io/flagon/api/internal/server"
	"github.com/flagon-io/flagon/api/internal/service"
)

func main() {
	slog.SetDefault(slog.New(slog.NewJSONHandler(os.Stdout, nil)))

	// Load local dotfiles before the CLI resolves its env sources. godotenv
	// never overrides an already-set variable, so precedence is: real env >
	// .env.local > .env > flag default. Missing files are fine (ignored).
	_ = godotenv.Load(".env.local")
	_ = godotenv.Load(".env")

	cmd := &cli.Command{
		Name:  "flagon-server",
		Usage: "Flagon API server (serve + migrate)",
		// Global flags: the two-role database URLs are shared by every command
		// (they propagate to subcommands), so serve and migrate read the same
		// connection config.
		Flags: []cli.Flag{
			&cli.StringFlag{
				Name:    "database-url",
				Usage:   "migrator/owner Postgres URL - schema owner, used only to migrate and provision the app role. Required in production; development defaults to the local compose database",
				Sources: cli.EnvVars("DATABASE_URL"),
			},
			&cli.StringFlag{
				Name:    "app-database-url",
				Usage:   "RLS runtime Postgres URL - the NOBYPASSRLS app role used for every request. Required in production (the server refuses to run runtime queries as the migrator); development defaults to the local compose app role",
				Sources: cli.EnvVars("FLAGON_APP_DATABASE_URL"),
			},
		},
		Commands: []*cli.Command{
			{
				Name:  "serve",
				Usage: "run the HTTP API (migrates on boot, then serves)",
				Flags: []cli.Flag{
					&cli.StringFlag{
						Name:    "internal-token",
						Usage:   "shared secret the app authenticates to the API with (must match the app's FLAGON_INTERNAL_TOKEN). Required in production; development falls back to the public value dev-internal-token",
						Sources: cli.EnvVars("FLAGON_INTERNAL_TOKEN"),
					},
					&cli.StringFlag{
						Name:    "host",
						Usage:   "interface to bind. Unset = 127.0.0.1 (loopback only, development) off Fly, all interfaces on Fly. Containers set 0.0.0.0 to bind all interfaces, which counts as production unless FLAGON_ENV=development",
						Sources: cli.EnvVars("FLAGON_HOST"),
					},
					&cli.IntFlag{
						Name:    "port",
						Usage:   "port for the public HTTP API",
						Sources: cli.EnvVars("PORT"),
						Value:   8080,
					},
					&cli.IntFlag{
						Name:    "metrics-port",
						Usage:   "private port for Prometheus metrics (never exposed publicly)",
						Sources: cli.EnvVars("METRICS_PORT"),
						Value:   9091,
					},
					&cli.StringFlag{
						Name:    "ai-provider",
						Usage:   "AI provider: auto (default), anthropic, openai, or mock. auto picks anthropic, then an OpenAI-compatible endpoint, then the offline mock",
						Sources: cli.EnvVars("FLAGON_AI_PROVIDER"),
					},
					&cli.StringFlag{
						Name:    "anthropic-api-key",
						Usage:   "Anthropic API key for the agent; when set (and ai-provider is auto or anthropic) the agent uses Anthropic",
						Sources: cli.EnvVars("ANTHROPIC_API_KEY"),
					},
					&cli.StringFlag{
						Name:    "anthropic-workspace-id",
						Usage:   "Anthropic workspace id the agent's usage is attributed to (optional)",
						Sources: cli.EnvVars("ANTHROPIC_WORKSPACE_ID"),
					},
					&cli.StringFlag{
						Name:    "ai-base-url",
						Usage:   "base URL for an OpenAI-compatible endpoint (OpenAI, OpenRouter, Together, Groq, vLLM, Ollama at http://localhost:11434/v1, ...)",
						Sources: cli.EnvVars("FLAGON_AI_BASE_URL", "OPENAI_BASE_URL"),
					},
					&cli.StringFlag{
						Name:    "ai-api-key",
						Usage:   "API key for the OpenAI-compatible endpoint (leave empty for keyless local servers like Ollama)",
						Sources: cli.EnvVars("FLAGON_AI_API_KEY", "OPENAI_API_KEY"),
					},
					&cli.StringFlag{
						Name:    "ai-model",
						Usage:   "AI model for the agent (empty = provider default; e.g. llama3.2:3b or qwen2.5:3b for a local model)",
						Sources: cli.EnvVars("FLAGON_AI_MODEL"),
					},
					&cli.StringFlag{
						Name:    "ai-system-prompt-file",
						Usage:   "path to a SKILL file that replaces the built-in system prompt (iterate agent behavior without recompiling)",
						Sources: cli.EnvVars("FLAGON_AI_SYSTEM_PROMPT_FILE"),
					},
					&cli.IntFlag{
						Name:    "ai-daily-limit",
						Usage:   "max AI calls per organization per rolling 24h (0 = unlimited)",
						Sources: cli.EnvVars("FLAGON_AI_DAILY_LIMIT"),
						Value:   100,
					},
					&cli.StringFlag{
						Name:    "mcp-host",
						Usage:   "dedicated hostname for the public MCP endpoint (e.g. mcp.flagon.io); on that host the endpoint is served at the root and all other paths 404. Empty = only the /mcp path is mounted",
						Sources: cli.EnvVars("FLAGON_MCP_HOST"),
					},
					&cli.StringFlag{
						Name:    "environment",
						Usage:   "deployment environment: development or production. Empty = production on Fly (FLY_APP_NAME is set) or whenever the server binds a non-loopback interface (e.g. FLAGON_HOST=0.0.0.0); development when bound to loopback (the default off Fly). Production refuses insecure development fallbacks (a missing internal-token, app-database-url or secrets-key)",
						Sources: cli.EnvVars("FLAGON_ENV"),
					},
					&cli.StringFlag{
						Name:    "secrets-key",
						Usage:   "base64-encoded 32-byte AES-256 key that encrypts stored credentials (SSO client secrets, SAML keys) at rest; generate with `openssl rand -base64 32`. Required in production; development falls back to a fixed, publicly known key",
						Sources: cli.EnvVars("FLAGON_SECRETS_KEY"),
					},
					&cli.StringFlag{
						Name:    "secrets-keys-retired",
						Usage:   "comma-separated base64 keys that USED to be the secrets-key, kept only to decrypt during a rotation. On boot every stored credential sealed under one of them is re-sealed under the current secrets-key (idempotent); once the boot log says nothing is left to re-seal (and warns of no row it could not open), remove them",
						Sources: cli.EnvVars("FLAGON_SECRETS_KEYS_RETIRED"),
					},
					&cli.Int64Flag{
						Name:    "max-body-bytes",
						Usage:   "maximum request body size in bytes, for every route including MCP (huma operations also keep their own 1 MiB default)",
						Sources: cli.EnvVars("FLAGON_MAX_BODY_BYTES"),
						Value:   server.DefaultMaxBodyBytes,
					},
					&cli.FloatFlag{
						Name:    "rate-limit",
						Usage:   "sustained requests per second allowed per principal (user, access token, or client IP when anonymous); 0 disables. In-memory and per instance: N machines allow up to N times this",
						Sources: cli.EnvVars("FLAGON_RATE_LIMIT"),
						Value:   server.DefaultRateLimit,
					},
					&cli.IntFlag{
						Name:    "rate-burst",
						Usage:   "requests a principal may make at once before the sustained rate-limit applies",
						Sources: cli.EnvVars("FLAGON_RATE_BURST"),
						Value:   server.DefaultRateBurst,
					},
					&cli.StringFlag{
						Name:    "client-ip-header",
						Usage:   "proxy header carrying the real client IP (e.g. Fly-Client-IP behind Fly's edge). Empty = trust only the TCP peer address. Set it ONLY when every request arrives through a proxy that overwrites the header, or callers can spoof their IP",
						Sources: cli.EnvVars("FLAGON_CLIENT_IP_HEADER"),
					},
					&cli.StringFlag{
						Name:    "mail-provider",
						Usage:   "transactional email provider (invitations): auto (default), resend, or log. auto uses Resend when resend-api-key is set, otherwise logs emails to the server log (local development)",
						Sources: cli.EnvVars("FLAGON_MAIL_PROVIDER"),
					},
					&cli.StringFlag{
						Name:    "resend-api-key",
						Usage:   "Resend API key for transactional email",
						Sources: cli.EnvVars("RESEND_API_KEY"),
					},
					&cli.StringFlag{
						Name:    "mail-from",
						Usage:   "sender address for transactional email (e.g. \"Flagon <hello@flagon.io>\"); empty = Resend's onboarding sender",
						Sources: cli.EnvVars("FLAGON_MAIL_FROM", "RESEND_FROM"),
					},
					&cli.StringFlag{
						Name:    "app-url",
						Usage:   "public base URL of the web app, used for links in emails (e.g. invitation accept links). Empty = https://app.flagon.io in production, http://localhost:3000 otherwise",
						Sources: cli.EnvVars("FLAGON_APP_URL"),
					},
				},
				Action: runServe,
			},
			{
				Name:   "migrate",
				Usage:  "provision the app role + run migrations, then exit",
				Action: runMigrate,
			},
		},
	}

	if err := cmd.Run(context.Background(), os.Args); err != nil {
		slog.Error("flagon exited with error", "err", err)
		os.Exit(1)
	}
}

// dbConfig builds the two-role connection config from the global database flags,
// which propagate to every subcommand.
func dbConfig(cmd *cli.Command, requireApp bool) (db.Config, error) {
	return resolveDBConfig(cmd, requireApp)
}

// runMigrate provisions the app role and applies migrations, then exits. Handy
// for running migrations by hand (`fly machine run <image> migrate`); ANY
// failure is returned so a broken schema is loud (non-zero exit).
func runMigrate(ctx context.Context, cmd *cli.Command) error {
	ctx, cancel := context.WithTimeout(ctx, 2*time.Minute)
	defer cancel()

	cfg, err := dbConfig(cmd, false)
	if err != nil {
		return err
	}
	if err := db.Setup(ctx, cfg); err != nil {
		return fmt.Errorf("database setup failed: %w", err)
	}
	slog.Info("database setup complete")
	return nil
}

// runServe migrates (via an advisory lock, so concurrent boots are safe), then
// opens the runtime pool and serves. The migration step is degraded-tolerant:
// a reachable database with a failing migration is fatal (never serve a broken
// schema), but an unreachable one starts degraded (readiness reports it) rather
// than blocking the boot.
func runServe(ctx context.Context, cmd *cli.Command) error {
	cfg, err := dbConfig(cmd, true)
	if err != nil {
		return err
	}
	internalToken, err := resolveInternalToken(cmd)
	if err != nil {
		return err
	}
	// Built before touching the database, so a bad key fails the boot at once.
	keyring, err := buildKeyring(cmd)
	if err != nil {
		return err
	}

	setupCtx, cancel := context.WithTimeout(ctx, 2*time.Minute)
	if err := db.Setup(setupCtx, cfg); err != nil {
		if errors.Is(err, db.ErrUnavailable) {
			slog.Warn("database unavailable; starting DEGRADED without migrations, /readyz will report it", "err", err)
		} else {
			cancel()
			return fmt.Errorf("database migration failed; refusing to start against a broken schema: %w", err)
		}
	}
	cancel()

	database := db.Open(ctx, cfg)
	defer database.Close()
	database.SetKeyring(keyring)
	sealStoredSecrets(ctx, cfg, keyring)

	m := metrics.New(database.Pool())

	// The in-product AI agent. The provider is chosen by config (see
	// buildProvider): in auto mode with no keys it falls back to an
	// offline mock, so the /ai surface works locally with zero setup. Prod loads
	// ANTHROPIC_API_KEY (Fly secret) and uses Anthropic.
	provider, label, err := buildProvider(cmd)
	if err != nil {
		return fmt.Errorf("ai provider: %w", err)
	}
	var opts []ai.Option
	if path := cmd.String("ai-system-prompt-file"); path != "" {
		if data, err := os.ReadFile(path); err != nil {
			slog.Warn("could not read ai-system-prompt-file; using the built-in prompt", "path", path, "err", err)
		} else {
			opts = append(opts, ai.WithSystemPrompt(string(data)))
			slog.Info("loaded custom AI system prompt (SKILL)", "path", path)
		}
	}
	// The documentation corpus is embedded in the binary (see internal/docs), so
	// docs ship and deploy atomically with the code. It powers the agent's
	// search_docs/get_doc tools, the public /docs HTTP endpoints, and the public
	// MCP server. A load failure is non-fatal: the rest of the API still serves.
	var docsIndex *docs.Index
	if idx, err := docs.Load(); err != nil {
		slog.Warn("could not load docs corpus; documentation tools/endpoints disabled", "err", err)
	} else {
		docsIndex = idx
		slog.Info("docs corpus loaded", "docs", len(idx.List(true)))
	}

	// The roadmap is embedded the same way the docs corpus is (see
	// internal/roadmap), so it ships and deploys atomically with the code. It
	// backs the public /roadmap endpoint the website renders. A load failure is
	// non-fatal: the rest of the API still serves.
	var roadmapBoard *roadmap.Board
	if board, err := roadmap.Load(); err != nil {
		slog.Warn("could not load roadmap corpus; /roadmap endpoint disabled", "err", err)
	} else {
		roadmapBoard = board
		slog.Info("roadmap corpus loaded", "items", len(board.Items()))
	}

	// The changelog is embedded the same way (see internal/changelog) and backs
	// the public /changelog endpoint. A load failure is non-fatal.
	var changelogLog *changelog.Log
	if l, err := changelog.Load(); err != nil {
		slog.Warn("could not load changelog corpus; /changelog endpoint disabled", "err", err)
	} else {
		changelogLog = l
		slog.Info("changelog corpus loaded", "entries", len(l.Entries()))
	}

	// Hand the registry a true-nil interface when there is no corpus, so the
	// docs tools are omitted rather than registered against a nil index.
	var docsForAgent ai.DocsIndex
	if docsIndex != nil {
		docsForAgent = docsIndex
	}
	// The agent/MCP tools run through the same service layer as the REST
	// handlers (server.New builds its own over the same store), so every front
	// door shares one implementation of each operation.
	mailer, err := buildMailer(cmd)
	if err != nil {
		return err
	}
	svcOpts := []service.Option{service.WithMailer(mailer, appURL(cmd))}
	registry := ai.NewRegistry(service.New(database, svcOpts...), docsForAgent)
	agent := ai.NewAgent(provider, registry, ai.NewDBMeter(database, cmd.Int("ai-daily-limit")), opts...)
	slog.Info("AI agent enabled", "provider", label, "model", provider.DefaultModel(), "daily_limit", cmd.Int("ai-daily-limit"))
	if label == "mock" {
		slog.Warn("AI provider is the offline MOCK (no model configured); set ANTHROPIC_API_KEY or an OpenAI-compatible endpoint (FLAGON_AI_BASE_URL) for real responses")
	}

	router, _ := server.New(
		server.WithReadyCheck(database.Ping),
		server.WithRLSCheck(database.CheckRLS),
		server.WithIdentity(database, internalToken),
		server.WithAI(agent),
		server.WithDocs(docsIndex),
		server.WithRoadmap(roadmapBoard),
		server.WithChangelog(changelogLog),
		server.WithMCP(registry),
		server.WithMCPHost(cmd.String("mcp-host")),
		server.WithLimits(server.Limits{
			MaxBodyBytes:   cmd.Int64("max-body-bytes"),
			RateLimit:      cmd.Float("rate-limit"),
			RateBurst:      cmd.Int("rate-burst"),
			ClientIPHeader: cmd.String("client-ip-header"),
		}),
		server.WithAudit(audit.NewStore(database.Pool())),
		server.WithServiceOptions(svcOpts...),
	)

	// host is all interfaces in containers/Fly (FLAGON_HOST=0.0.0.0 or FLY_APP_NAME,
	// so the platform can route to us) and 127.0.0.1 in local dev by default
	// (loopback only, which Windows Firewall never prompts for). It applies to
	// both the API and the metrics listener. See bindHost.
	host := bindHost(cmd)

	// Metrics live on a separate, private port that Fly's Prometheus scrapes
	// (see [metrics] in fly.toml); they are never exposed on the public service.
	go serveMetrics(host, cmd.Int("metrics-port"), m)

	addr := fmt.Sprintf("%s:%d", host, cmd.Int("port"))
	slog.Info("api listening", "addr", addr)
	srv := &http.Server{Addr: addr, Handler: m.InstrumentHTTP(router), ReadHeaderTimeout: readHeaderTimeout}
	if err := srv.ListenAndServe(); err != nil {
		return fmt.Errorf("http server stopped: %w", err)
	}
	return nil
}

// readHeaderTimeout bounds how long a client may take to send request headers,
// so a slow or stalled client (slowloris) cannot pin a connection forever. Only
// the headers are bounded: bodies and responses stay unlimited, because agent
// turns can legitimately run long.
const readHeaderTimeout = 10 * time.Second

// buildMailer selects the transactional email sender (see mail.New). A provider
// pinned without its credentials fails the boot; the log fallback is loud in
// production, where it means invitation emails are not delivered.
func buildMailer(cmd *cli.Command) (mail.Sender, error) {
	sender, label, err := mail.New(mail.Config{
		Provider:     cmd.String("mail-provider"),
		ResendAPIKey: cmd.String("resend-api-key"),
		From:         cmd.String("mail-from"),
	})
	if err != nil {
		return nil, fmt.Errorf("mail provider: %w", err)
	}
	if label == "log" && isProduction(cmd) {
		slog.Warn("mail provider is the LOG mailer in production: invitation emails are NOT delivered; set RESEND_API_KEY")
	} else {
		slog.Info("mail provider", "provider", label, "app_url", appURL(cmd))
	}
	return sender, nil
}

// appURL is the web app's public base URL for links in emails.
func appURL(cmd *cli.Command) string {
	if u := strings.TrimSpace(cmd.String("app-url")); u != "" {
		return u
	}
	if isProduction(cmd) {
		return "https://app.flagon.io"
	}
	return "http://localhost:3000"
}

// isProduction reports whether this is a production deployment: the explicit
// environment flag (FLAGON_ENV) when set, otherwise production unless the server
// is off Fly AND bound to loopback. Production refuses the insecure conveniences
// local development falls back to.
func isProduction(cmd *cli.Command) bool {
	env := cmd.String("environment")
	if strings.TrimSpace(env) == "" {
		env = os.Getenv("FLAGON_ENV") // the migrate command has no environment flag
	}
	switch strings.ToLower(strings.TrimSpace(env)) {
	case "production", "prod":
		return true
	case "development", "dev":
		return false
	default:
		// Unset: Fly is production; off Fly, only a server bound to loopback (the
		// default when FLAGON_HOST is unset) is development. Anything reachable
		// from a network fails closed as production.
		return os.Getenv("FLY_APP_NAME") != "" || !isLoopbackHost(bindHost(cmd))
	}
}

// buildKeyring loads the key that seals stored credentials at rest (see
// newKeyring).
func buildKeyring(cmd *cli.Command) (*secrets.Keyring, error) {
	return newKeyring(cmd.String("secrets-key"), cmd.String("secrets-keys-retired"), isProduction(cmd))
}

// sealStoredSecrets encrypts any stored credential still in plaintext (rows that
// predate encryption at rest) or under an older key. Idempotent, so it runs on
// every boot; a failure is logged, not fatal, because reads still accept legacy
// plaintext and the next boot retries.
func sealStoredSecrets(ctx context.Context, cfg db.Config, k *secrets.Keyring) {
	sealCtx, cancel := context.WithTimeout(ctx, time.Minute)
	defer cancel()
	n, err := db.SealStoredSecrets(sealCtx, cfg, k)
	switch {
	case errors.Is(err, db.ErrUnavailable):
		slog.Warn("database unavailable; stored credentials not checked for encryption at rest", "err", err)
	case err != nil:
		slog.Error("could not encrypt stored credentials at rest; will retry on next boot", "err", err)
	case n > 0:
		slog.Info("encrypted stored credentials at rest under the current key", "rows", n)
	default:
		slog.Info("stored credentials: nothing left to re-seal under the current key")
	}
}

// buildProvider selects the AI provider from config (see ai.SelectProvider) and
// returns it with a label for logging. auto (the default) prefers Anthropic,
// then any configured OpenAI-compatible endpoint, then the offline mock, so it
// never fails; a provider pinned via FLAGON_AI_PROVIDER without its credentials
// is an error, so a misconfigured deploy fails at boot instead of 500ing on
// every agent turn.
func buildProvider(cmd *cli.Command) (ai.Provider, string, error) {
	return ai.SelectProvider(ai.ProviderConfig{
		Provider:           cmd.String("ai-provider"),
		Model:              cmd.String("ai-model"),
		AnthropicKey:       cmd.String("anthropic-api-key"),      // ANTHROPIC_API_KEY via flag Sources
		AnthropicWorkspace: cmd.String("anthropic-workspace-id"), // ANTHROPIC_WORKSPACE_ID via flag Sources
		OpenAIKey:          cmd.String("ai-api-key"),             // includes OPENAI_API_KEY via flag Sources
		OpenAIBaseURL:      cmd.String("ai-base-url"),            // includes OPENAI_BASE_URL via flag Sources
	})
}

func serveMetrics(host string, port int, m *metrics.Metrics) {
	mux := http.NewServeMux()
	mux.Handle("/metrics", m.Handler())

	addr := fmt.Sprintf("%s:%d", host, port)
	slog.Info("metrics listening", "addr", addr)
	srv := &http.Server{Addr: addr, Handler: mux, ReadHeaderTimeout: readHeaderTimeout}
	if err := srv.ListenAndServe(); err != nil {
		// Metrics are non-essential; log but keep the API running.
		slog.Warn("metrics server stopped", "err", err)
	}
}
