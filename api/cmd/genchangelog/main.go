// Command genchangelog compiles the top-level changelog/ tree into the corpus the
// API embeds (internal/changelog/changelog.gen.json). It mirrors cmd/gendocs and
// cmd/genroadmap: run it from the api module root.
//
//	go run ./cmd/genchangelog           # write the corpus
//	go run ./cmd/genchangelog -check    # exit non-zero if the committed corpus is stale
//
// The -check mode is the CI drift gate: it fails the build when someone adds a
// changelog entry without regenerating, so the changelog and corpus can never
// diverge on main.
package main

import (
	"flag"
	"fmt"
	"log"
	"os"

	"github.com/flagon-io/flagon/api/internal/changelog"
)

func main() {
	check := flag.Bool("check", false, "verify the committed corpus is up to date instead of writing it")
	dir := flag.String("dir", "../changelog", "path to the changelog/ source tree")
	out := flag.String("out", changelog.CorpusPath, "path to the generated corpus file")
	flag.Parse()

	corpus, err := changelog.BuildFromDir(*dir)
	if err != nil {
		log.Fatalf("genchangelog: build corpus from %s: %v", *dir, err)
	}
	data, err := changelog.Marshal(corpus)
	if err != nil {
		log.Fatalf("genchangelog: marshal corpus: %v", err)
	}

	if *check {
		existing, err := os.ReadFile(*out)
		if err != nil {
			log.Fatalf("genchangelog -check: read %s: %v (run `make changelog`)", *out, err)
		}
		if string(existing) != string(data) {
			fmt.Fprintf(os.Stderr, "genchangelog -check: %s is stale; run `make changelog` and commit the result\n", *out)
			os.Exit(1)
		}
		fmt.Printf("genchangelog: %s is up to date (%d entries)\n", *out, len(corpus.Entries))
		return
	}

	if err := os.WriteFile(*out, data, 0o644); err != nil {
		log.Fatalf("genchangelog: write %s: %v", *out, err)
	}
	fmt.Printf("genchangelog: wrote %s (%d entries)\n", *out, len(corpus.Entries))
}
