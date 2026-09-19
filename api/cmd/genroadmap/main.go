// Command genroadmap compiles the top-level roadmap/ tree into the corpus the API
// embeds (internal/roadmap/roadmap.gen.json). It mirrors cmd/gendocs: run it from
// the api module root.
//
//	go run ./cmd/genroadmap           # write the corpus
//	go run ./cmd/genroadmap -check    # exit non-zero if the committed corpus is stale
//
// The -check mode is the CI drift gate: it fails the build when someone edits the
// roadmap without regenerating, so the roadmap and corpus can never diverge on
// main.
package main

import (
	"flag"
	"fmt"
	"log"
	"os"

	"github.com/flagon-io/flagon/api/internal/roadmap"
)

func main() {
	check := flag.Bool("check", false, "verify the committed corpus is up to date instead of writing it")
	dir := flag.String("dir", "../roadmap", "path to the roadmap/ source tree")
	out := flag.String("out", roadmap.CorpusPath, "path to the generated corpus file")
	flag.Parse()

	corpus, err := roadmap.BuildFromDir(*dir)
	if err != nil {
		log.Fatalf("genroadmap: build corpus from %s: %v", *dir, err)
	}
	data, err := roadmap.Marshal(corpus)
	if err != nil {
		log.Fatalf("genroadmap: marshal corpus: %v", err)
	}

	if *check {
		existing, err := os.ReadFile(*out)
		if err != nil {
			log.Fatalf("genroadmap -check: read %s: %v (run `make roadmap`)", *out, err)
		}
		if string(existing) != string(data) {
			fmt.Fprintf(os.Stderr, "genroadmap -check: %s is stale; run `make roadmap` and commit the result\n", *out)
			os.Exit(1)
		}
		fmt.Printf("genroadmap: %s is up to date (%d items)\n", *out, len(corpus.Items))
		return
	}

	if err := os.WriteFile(*out, data, 0o644); err != nil {
		log.Fatalf("genroadmap: write %s: %v", *out, err)
	}
	fmt.Printf("genroadmap: wrote %s (%d items)\n", *out, len(corpus.Items))
}
