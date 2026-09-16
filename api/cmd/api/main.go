// Command api runs the Flagon HTTP API.
package main

import (
	"log"
	"net/http"

	"github.com/flagon-io/flagon/api/internal/server"
)

func main() {
	router, _ := server.New()

	addr := ":8080"
	log.Printf("flagon api listening on %s", addr)
	if err := http.ListenAndServe(addr, router); err != nil {
		log.Fatal(err)
	}
}
