// Command flagon is the Flagon platform CLI - the tool a developer installs to
// operate Flagon from their terminal (`flagon login`, `flagon projects`,
// `flagon deploy`, ...). It is a thin HTTP client: it talks to the Flagon API
// (api.flagon.io, or --api-url for self-hosted) as the authenticated user and
// deliberately links none of the server internals - no Postgres driver, no huma,
// no AI providers. The server itself lives in cmd/flagon-server.
//
// This is a baseline skeleton: the command surface, flags, and help are real, so
// the shape is stable and installable, but the actions are not wired up yet -
// each returns a "not implemented" error with a non-zero exit code. Fill them in
// against the generated API client (see `make openapi`) as capabilities land.
package main

import (
	"context"
	"fmt"
	"os"

	"github.com/urfave/cli/v3"
)

// exitNotImplemented is the code every unimplemented command returns, so scripts
// and CI can tell "the CLI ran but this verb is a stub" apart from a usage error
// (which urfave/cli reports as its own non-zero exit).
const exitNotImplemented = 3

func main() {
	cmd := &cli.Command{
		Name:  "flagon",
		Usage: "Operate Flagon from your terminal",
		// Global flags every subcommand shares: where the API lives and how to
		// authenticate. Backed by env vars so scripts and CI can set them once.
		// A self-hoster points --api-url at their own deployment.
		Flags: []cli.Flag{
			&cli.StringFlag{
				Name:    "api-url",
				Usage:   "base URL of the Flagon API",
				Sources: cli.EnvVars("FLAGON_API_URL"),
				Value:   "https://api.flagon.io",
			},
			&cli.StringFlag{
				Name:    "token",
				Usage:   "Flagon API token (personal or org access token); overrides the stored login",
				Sources: cli.EnvVars("FLAGON_TOKEN"),
			},
			&cli.StringFlag{
				Name:    "org",
				Usage:   "organization slug to act within (defaults to your configured org)",
				Sources: cli.EnvVars("FLAGON_ORG"),
			},
		},
		Commands: []*cli.Command{
			{
				Name:   "login",
				Usage:  "authenticate this machine to Flagon",
				Action: notImplemented,
			},
			{
				Name:   "logout",
				Usage:  "remove stored Flagon credentials from this machine",
				Action: notImplemented,
			},
			{
				Name:   "whoami",
				Usage:  "show the currently authenticated user",
				Action: notImplemented,
			},
			{
				Name:   "orgs",
				Usage:  "list the organizations you belong to",
				Action: notImplemented,
			},
			{
				Name:  "projects",
				Usage: "manage projects in an organization",
				Commands: []*cli.Command{
					{Name: "list", Usage: "list projects", Action: notImplemented},
					{Name: "create", Usage: "create a project", Action: notImplemented},
				},
				Action: notImplemented,
			},
			{
				Name:   "deploy",
				Usage:  "deploy a project",
				Action: notImplemented,
			},
			{
				Name:   "logs",
				Usage:  "stream logs for a project",
				Action: notImplemented,
			},
			{
				Name:  "mcp",
				Usage: "run a local MCP server that proxies to Flagon as you (for editors/agents over stdio)",
				// The local, authenticated counterpart to the public mcp.flagon.io:
				// a stdio transport that forwards tool calls to the API with the
				// user's identity. See AGENTS.md (AI + MCP + API stay in lockstep).
				Action: notImplemented,
			},
		},
	}

	if err := cmd.Run(context.Background(), os.Args); err != nil {
		// cli.Exit (ExitCoder) errors are already printed and exited by cmd.Run
		// with their own code. Reaching here means an unexpected, non-ExitCoder
		// error: surface it with a generic non-zero exit.
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}

// notImplemented is the placeholder action for every command in this baseline. It
// names the command that was invoked and exits with exitNotImplemented, so the
// CLI is runnable and testable today without pretending the feature works.
func notImplemented(_ context.Context, cmd *cli.Command) error {
	// FullName is the whole command path from the root (e.g. "flagon projects
	// list"), so subcommands report themselves accurately.
	return cli.Exit(fmt.Sprintf("%s: not implemented yet", cmd.FullName()), exitNotImplemented)
}
