package server

import (
	"context"
	"encoding/json"
	"net/http"

	"github.com/go-chi/chi/v5"

	"github.com/flagon-io/flagon/api/internal/ai"
)

// registerMCP mounts the public MCP front door at /mcp. It speaks the Model
// Context Protocol over JSON-RPC 2.0 (Streamable HTTP transport) and exposes
// ONLY the registry's public-safe tools - today, documentation retrieval. Those
// tools are read-only and touch no tenant data, so this endpoint needs no auth;
// it runs every tool with an anonymous context, so internal docs never leak here.
//
// Operational tools that act as a user (whoami, create_organization, ...) are not
// public and are intentionally absent until an authenticated MCP surface exists.
// Registered on the chi router directly (like the health checks), off the
// documented REST spec.
func registerMCP(router chi.Router, registry *ai.Registry) {
	if registry == nil {
		return
	}
	router.Post("/mcp", func(w http.ResponseWriter, r *http.Request) {
		defer r.Body.Close()
		req, err := decodeRPC(r)
		if err != nil {
			writeJSON(w, http.StatusOK, rpcErr(nil, -32700, "parse error"))
			return
		}
		resp, notification := handleRPC(r.Context(), registry, req)
		if notification {
			w.WriteHeader(http.StatusAccepted)
			return
		}
		writeJSON(w, http.StatusOK, resp)
	})
}

type rpcRequest struct {
	JSONRPC string          `json:"jsonrpc"`
	ID      json.RawMessage `json:"id,omitempty"`
	Method  string          `json:"method"`
	Params  json.RawMessage `json:"params,omitempty"`
}

type rpcResponse struct {
	JSONRPC string          `json:"jsonrpc"`
	ID      json.RawMessage `json:"id,omitempty"`
	Result  any             `json:"result,omitempty"`
	Error   *rpcError       `json:"error,omitempty"`
}

type rpcError struct {
	Code    int    `json:"code"`
	Message string `json:"message"`
}

func decodeRPC(r *http.Request) (rpcRequest, error) {
	var req rpcRequest
	err := json.NewDecoder(r.Body).Decode(&req)
	return req, err
}

func rpcErr(id json.RawMessage, code int, msg string) rpcResponse {
	return rpcResponse{JSONRPC: "2.0", ID: id, Error: &rpcError{Code: code, Message: msg}}
}

func rpcOK(id json.RawMessage, result any) rpcResponse {
	return rpcResponse{JSONRPC: "2.0", ID: id, Result: result}
}

// handleRPC dispatches one MCP method. The bool return is true for a
// notification (no id): the caller sends no response body.
func handleRPC(ctx context.Context, registry *ai.Registry, req rpcRequest) (rpcResponse, bool) {
	// Notifications (e.g. notifications/initialized) carry no id and expect no
	// reply.
	if len(req.ID) == 0 {
		return rpcResponse{}, true
	}

	switch req.Method {
	case "initialize":
		return rpcOK(req.ID, map[string]any{
			"protocolVersion": "2024-11-05",
			"capabilities":    map[string]any{"tools": map[string]any{}},
			"serverInfo":      map[string]any{"name": "flagon", "version": "0.0.0"},
		}), false

	case "ping":
		return rpcOK(req.ID, map[string]any{}), false

	case "tools/list":
		defs := registry.PublicDefs()
		tools := make([]map[string]any, 0, len(defs))
		for _, d := range defs {
			tools = append(tools, map[string]any{
				"name":        d.Name,
				"description": d.Description,
				"inputSchema": json.RawMessage(d.InputSchema),
			})
		}
		return rpcOK(req.ID, map[string]any{"tools": tools}), false

	case "tools/call":
		return callTool(ctx, registry, req), false

	default:
		return rpcErr(req.ID, -32601, "method not found: "+req.Method), false
	}
}

func callTool(ctx context.Context, registry *ai.Registry, req rpcRequest) rpcResponse {
	var params struct {
		Name      string          `json:"name"`
		Arguments json.RawMessage `json:"arguments"`
	}
	if err := json.Unmarshal(req.Params, &params); err != nil {
		return rpcErr(req.ID, -32602, "invalid params")
	}

	tool, ok := registry.Get(params.Name)
	// Only public-safe tools are callable here; anything else is treated as
	// nonexistent so the public surface never hints at internal capabilities.
	if !ok || !tool.Public {
		return rpcErr(req.ID, -32602, "unknown tool: "+params.Name)
	}

	args := params.Arguments
	if len(args) == 0 {
		args = json.RawMessage(`{}`)
	}
	// Anonymous context: no user identity, no internal docs.
	out, err := tool.Run(ctx, ai.ToolContext{}, args)
	if err != nil {
		return rpcOK(req.ID, toolResult(err.Error(), true))
	}
	payload, err := json.Marshal(out)
	if err != nil {
		return rpcOK(req.ID, toolResult("could not encode tool result", true))
	}
	return rpcOK(req.ID, toolResult(string(payload), false))
}

// toolResult renders an MCP tool result: a single text content block plus the
// error flag, per the protocol.
func toolResult(text string, isErr bool) map[string]any {
	return map[string]any{
		"content": []map[string]any{{"type": "text", "text": text}},
		"isError": isErr,
	}
}
