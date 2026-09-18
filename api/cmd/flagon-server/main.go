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
// compose Postgres with no setup. For persistent local overrides, drop a `.env`
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
	"github.com/flagon-io/flagon/api/internal/db"
	"github.com/flagon-io/flagon/api/internal/docs"
	"github.com/flagon-io/flagon/api/internal/metrics"
	"github.com/flagon-io/flagon/api/internal/server"
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
				Usage:   "migrator/owner Postgres URL - schema owner, used only to migrate and provision the app role",
				Sources: cli.EnvVars("DATABASE_URL"),
				Value:   "postgres://flagon:flagon@localhost:5432/flagon_api?sslmode=disable",
			},
			&cli.StringFlag{
				Name:    "app-database-url",
				Usage:   "RLS runtime Postgres URL - the NOBYPASSRLS app role used for every request",
				Sources: cli.EnvVars("FLAGON_APP_DATABASE_URL"),
				Value:   "postgres://flagon_app:flagon_app@localhost:5432/flagon_api?sslmode=disable",
			},
		},
		Commands: []*cli.Command{
			{
				Name:  "serve",
				Usage: "run the HTTP API (migrates on boot, then serves)",
				Flags: []cli.Flag{
					&cli.StringFlag{
						Name:    "internal-token",
						Usage:   "shared secret the app authenticates to the API with (must match the app's FLAGON_INTERNAL_TOKEN)",
						Sources: cli.EnvVars("FLAGON_INTERNAL_TOKEN"),
						Value:   "dev-internal-token",
					},
					&cli.StringFlag{
						Name:    "host",
						Usage:   "interface to bind (empty = all interfaces, needed in prod/containers; set 127.0.0.1 locally to bind loopback only and avoid the Windows Firewall prompt)",
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
func dbConfig(cmd *cli.Command) db.Config {
	return db.Config{
		MigratorURL: cmd.String("database-url"),
		AppURL:      cmd.String("app-database-url"),
	}
}

// runMigrate provisions the app role and applies migrations, then exits. Handy
// for running migrations by hand (`fly machine run <image> migrate`); ANY
// failure is returned so a broken schema is loud (non-zero exit).
func runMigrate(ctx context.Context, cmd *cli.Command) error {
	ctx, cancel := context.WithTimeout(ctx, 2*time.Minute)
	defer cancel()

	if err := db.Setup(ctx, dbConfig(cmd)); err != nil {
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
	cfg := dbConfig(cmd)

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

	m := metrics.New(database.Pool())

	// The in-product AI agent. The provider is chosen by config (see
	// buildProvider) and is always non-nil: with no keys it falls back to an
	// offline mock, so the /ai surface works locally with zero setup. Prod loads
	// ANTHROPIC_API_KEY (Fly secret) and uses Anthropic.
	provider, label := buildProvider(cmd)
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

	// Hand the registry a true-nil interface when there is no corpus, so the
	// docs tools are omitted rather than registered against a nil index.
	var docsForAgent ai.DocsIndex
	if docsIndex != nil {
		docsForAgent = docsIndex
	}
	registry := ai.NewRegistry(database, docsForAgent)
	agent := ai.NewAgent(provider, registry, ai.NewDBMeter(database, cmd.Int("ai-daily-limit")), opts...)
	slog.Info("AI agent enabled", "provider", label, "model", provider.DefaultModel(), "daily_limit", cmd.Int("ai-daily-limit"))
	if label == "mock" {
		slog.Warn("AI provider is the offline MOCK (no model configured); set ANTHROPIC_API_KEY or an OpenAI-compatible endpoint (FLAGON_AI_BASE_URL) for real responses")
	}

	router, _ := server.New(
		server.WithReadyCheck(database.Ping),
		server.WithRLSCheck(database.CheckRLS),
		server.WithIdentity(database, cmd.String("internal-token")),
		server.WithAI(agent),
		server.WithDocs(docsIndex),
		server.WithMCP(registry),
		server.WithMCPHost(cmd.String("mcp-host")),
		server.WithAudit(audit.NewStore(database.Pool())),
	)

	// host is empty in prod (bind all interfaces, so Fly/containers can route to
	// us) and 127.0.0.1 in local dev (loopback only, which Windows Firewall never
	// prompts for). It applies to both the API and the metrics listener.
	host := cmd.String("host")

	// Metrics live on a separate, private port that Fly's Prometheus scrapes
	// (see [metrics] in fly.toml); they are never exposed on the public service.
	go serveMetrics(host, cmd.Int("metrics-port"), m)

	addr := fmt.Sprintf("%s:%d", host, cmd.Int("port"))
	slog.Info("api listening", "addr", addr)
	if err := http.ListenAndServe(addr, m.InstrumentHTTP(router)); err != nil {
		return fmt.Errorf("http server stopped: %w", err)
	}
	return nil
}

// buildProvider selects the AI provider from config and returns it with a label
// for logging. It NEVER returns nil: `auto` (the default) prefers Anthropic,
// then any configured OpenAI-compatible endpoint, then the offline mock - so the
// agent is always available, and swapping to a cheaper or self-hosted OSS model
// is a config change (FLAGON_AI_PROVIDER / FLAGON_AI_BASE_URL / FLAGON_AI_MODEL),
// not a code change.
func buildProvider(cmd *cli.Command) (ai.Provider, string) {
	model := cmd.String("ai-model")
	anthKey := os.Getenv("ANTHROPIC_API_KEY")
	anthWorkspace := os.Getenv("ANTHROPIC_WORKSPACE_ID")
	oaiKey := cmd.String("ai-api-key")   // includes OPENAI_API_KEY via flag Sources
	baseURL := cmd.String("ai-base-url") // includes OPENAI_BASE_URL via flag Sources

	switch strings.ToLower(strings.TrimSpace(cmd.String("ai-provider"))) {
	case "anthropic":
		return ai.NewAnthropic(anthKey, anthWorkspace, model), "anthropic"
	case "openai":
		return ai.NewOpenAI(oaiKey, baseURL, model), "openai-compatible"
	case "mock":
		return ai.NewMock(model), "mock"
	case "", "auto":
		switch {
		case anthKey != "":
			return ai.NewAnthropic(anthKey, anthWorkspace, model), "anthropic"
		case oaiKey != "" || baseURL != "":
			return ai.NewOpenAI(oaiKey, baseURL, model), "openai-compatible"
		default:
			return ai.NewMock(model), "mock"
		}
	default:
		slog.Warn("unknown ai-provider; falling back to the offline mock", "provider", cmd.String("ai-provider"))
		return ai.NewMock(model), "mock"
	}
}

func serveMetrics(host string, port int, m *metrics.Metrics) {
	mux := http.NewServeMux()
	mux.Handle("/metrics", m.Handler())

	addr := fmt.Sprintf("%s:%d", host, port)
	slog.Info("metrics listening", "addr", addr)
	if err := http.ListenAndServe(addr, mux); err != nil {
		// Metrics are non-essential; log but keep the API running.
		slog.Warn("metrics server stopped", "err", err)
	}
}
