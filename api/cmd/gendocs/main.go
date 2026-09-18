// Command gendocs compiles the top-level docs/ tree into the corpus the API
// embeds (internal/docs/corpus.gen.json). It mirrors cmd/genspec: run it from the
// api module root.
//
//	go run ./cmd/gendocs           # write the corpus
//	go run ./cmd/gendocs -check    # exit non-zero if the committed corpus is stale
//
// The -check mode is the CI drift gate: it fails the build when someone edits a
// doc without regenerating, so docs and corpus can never diverge on main.
package main

import (
	"flag"
	"fmt"
	"log"
	"os"

	"github.com/flagon-io/flagon/api/internal/docs"
)

func main() {
	check := flag.Bool("check", false, "verify the committed corpus is up to date instead of writing it")
	dir := flag.String("dir", "../docs", "path to the docs/ source tree")
	out := flag.String("out", docs.CorpusPath, "path to the generated corpus file")
	flag.Parse()

	corpus, err := docs.BuildFromDir(*dir)
	if err != nil {
		log.Fatalf("gendocs: build corpus from %s: %v", *dir, err)
	}
	data, err := docs.Marshal(corpus)
	if err != nil {
		log.Fatalf("gendocs: marshal corpus: %v", err)
	}

	if *check {
		existing, err := os.ReadFile(*out)
		if err != nil {
			log.Fatalf("gendocs -check: read %s: %v (run `make docs`)", *out, err)
		}
		if string(existing) != string(data) {
			fmt.Fprintf(os.Stderr, "gendocs -check: %s is stale; run `make docs` and commit the result\n", *out)
			os.Exit(1)
		}
		fmt.Printf("gendocs: %s is up to date (%d docs)\n", *out, len(corpus.Docs))
		return
	}

	if err := os.WriteFile(*out, data, 0o644); err != nil {
		log.Fatalf("gendocs: write %s: %v", *out, err)
	}
	fmt.Printf("gendocs: wrote %s (%d docs)\n", *out, len(corpus.Docs))
}
