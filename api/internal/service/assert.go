package service

import "github.com/flagon-io/flagon/api/internal/db"

// *db.DB is the production Store; keep that true at compile time.
var _ Store = (*db.DB)(nil)
