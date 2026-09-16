// Command genspec regenerates openapi/openapi.json from the Go source of
// truth (internal/server). Run via `go generate ./...` or `make openapi`.
// Never hand-edit the generated file; add/adjust huma.Register calls instead.
package main

import (
	"encoding/json"
	"flag"
	"log"
	"os"
	"path/filepath"

	"github.com/flagon-io/flagon/api/internal/server"
)

func main() {
	out := flag.String("out", filepath.Join("..", "openapi", "openapi.json"), "path to write the generated OpenAPI spec")
	flag.Parse()

	_, api := server.New()

	spec, err := api.OpenAPI().MarshalJSON()
	if err != nil {
		log.Fatalf("marshal openapi spec: %v", err)
	}

	var indented []byte
	buf := &json.RawMessage{}
	if err := json.Unmarshal(spec, buf); err != nil {
		log.Fatalf("parse openapi spec: %v", err)
	}
	if indented, err = json.MarshalIndent(buf, "", "  "); err != nil {
		log.Fatalf("format openapi spec: %v", err)
	}
	indented = append(indented, '\n')

	if err := os.MkdirAll(filepath.Dir(*out), 0o755); err != nil {
		log.Fatalf("create output dir: %v", err)
	}
	if err := os.WriteFile(*out, indented, 0o644); err != nil {
		log.Fatalf("write openapi spec: %v", err)
	}

	log.Printf("wrote %s", *out)
}
