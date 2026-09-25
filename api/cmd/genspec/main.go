// Command genspec regenerates openapi/openapi.json from the Go source of
// truth (internal/server). Run via `go generate ./...` or `make openapi`.
// Never hand-edit the generated file; add/adjust huma.Register calls instead.
package main

import (
	"flag"
	"log"
	"os"
	"path/filepath"

	"github.com/flagon-io/flagon/api/internal/server"
)

func main() {
	out := flag.String("out", filepath.Join("..", "openapi", "openapi.json"), "path to write the generated OpenAPI spec")
	flag.Parse()

	spec, err := server.Spec()
	if err != nil {
		log.Fatal(err)
	}

	if err := os.MkdirAll(filepath.Dir(*out), 0o755); err != nil {
		log.Fatalf("create output dir: %v", err)
	}
	if err := os.WriteFile(*out, spec, 0o644); err != nil {
		log.Fatalf("write openapi spec: %v", err)
	}

	log.Printf("wrote %s", *out)
}
