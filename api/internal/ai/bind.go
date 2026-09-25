package ai

import (
	"context"
	"encoding/json"
	"reflect"
	"strings"

	"github.com/flagon-io/flagon/api/internal/paginate"
	"github.com/flagon-io/flagon/api/internal/service"
)

// Tool input plumbing. Every tool decodes its JSON arguments into a small
// struct; bind does the shared work once (decode, trim every string field,
// enforce the fields tagged `tool:"required"`) so a tool body is just the
// service call. Validation failures are service.Invalid errors, so they render
// as a safe 422-class message on every front door.

// bind decodes a tool's JSON input into T (a struct), trims its string fields,
// and reports any `tool:"required"` string field left empty, in declaration
// order ("org and project are required"). The decoded value is returned even on
// a validation error, so Summarize can still describe a partial proposal.
func bind[T any](input json.RawMessage) (T, error) {
	var in T
	if len(input) == 0 {
		input = json.RawMessage(`{}`)
	}
	if err := json.Unmarshal(input, &in); err != nil {
		return in, service.Invalid("invalid tool input: expected a JSON object matching the tool's schema")
	}
	v := reflect.ValueOf(&in).Elem()
	if v.Kind() != reflect.Struct {
		return in, nil
	}
	t := v.Type()
	var missing []string
	for i := 0; i < v.NumField(); i++ {
		f, sf := v.Field(i), t.Field(i)
		if f.Kind() != reflect.String || !f.CanSet() {
			continue
		}
		f.SetString(strings.TrimSpace(f.String()))
		if sf.Tag.Get("tool") == "required" && f.String() == "" {
			missing = append(missing, jsonName(sf))
		}
	}
	if len(missing) > 0 {
		return in, service.Invalid(requiredMessage(missing))
	}
	return in, nil
}

// jsonName is the field's JSON key (what the model sees), falling back to the Go
// name.
func jsonName(sf reflect.StructField) string {
	if name, _, _ := strings.Cut(sf.Tag.Get("json"), ","); name != "" {
		return name
	}
	return sf.Name
}

// requiredMessage renders "a is required", "a and b are required", or
// "a, b and c are required".
func requiredMessage(fields []string) string {
	switch len(fields) {
	case 1:
		return fields[0] + " is required"
	default:
		return strings.Join(fields[:len(fields)-1], ", ") + " and " + fields[len(fields)-1] + " are required"
	}
}

// run adapts a typed tool body to the registry's raw-JSON Run signature.
func run[T any](fn func(ctx context.Context, tc ToolContext, in T) (any, error)) func(context.Context, ToolContext, json.RawMessage) (any, error) {
	return func(ctx context.Context, tc ToolContext, input json.RawMessage) (any, error) {
		in, err := bind[T](input)
		if err != nil {
			return nil, err
		}
		return fn(ctx, tc, in)
	}
}

// summarize adapts a typed proposal summary to the registry's Summarize
// signature. It describes whatever decoded, even if validation would fail.
func summarize[T any](fn func(in T) string) func(json.RawMessage) string {
	return func(input json.RawMessage) string {
		in, _ := bind[T](input)
		return fn(in)
	}
}

// schema marks a literal JSON Schema for a tool's input.
func schema(s string) json.RawMessage { return json.RawMessage(s) }

// firstPage is the query tools use for list reads: the first page at the maximum
// size (the model can narrow with the tool's own filters where offered).
var firstPage = paginate.Query{Limit: paginate.MaxLimit}

// ok is the conventional result of a mutation with nothing else to report.
func ok() map[string]any { return map[string]any{"ok": true} }

// Shared argument shapes, reused across the resource tool files.

// orgArg is a tool that takes only an org slug.
type orgArg struct {
	Org string `json:"org" tool:"required"`
}

// projectArg addresses one project.
type projectArg struct {
	Org     string `json:"org" tool:"required"`
	Project string `json:"project" tool:"required"`
}

// teamArg addresses one team.
type teamArg struct {
	Org  string `json:"org" tool:"required"`
	Team string `json:"team" tool:"required"`
}

// orDefault returns the trimmed value, or def when it is empty (for proposal
// summaries, which describe what the service will apply).
func orDefault(v, def string) string {
	if v = strings.TrimSpace(v); v != "" {
		return v
	}
	return def
}
