package server

import (
	"context"
	"net/http"

	"github.com/danielgtaylor/huma/v2"

	"github.com/flagon-io/flagon/api/internal/db"
)

// registerNotificationsAPI wires the notification feed endpoints. Like the rest
// of the app-facing API they are gated by the internal token and act as the
// forwarded user (RLS scopes everything to that user).
func registerNotificationsAPI(api huma.API, d deps) {

	huma.Register(api, huma.Operation{
		OperationID: "list-notifications",
		Method:      http.MethodGet,
		Path:        "/notifications",
		Summary:     "List the caller's notifications",
		Middlewares: huma.Middlewares{d.auth},
	}, func(ctx context.Context, in *ListNotificationsInput) (*NotificationsOutput, error) {
		items, err := d.svc.ListNotifications(ctx, actor(ctx), in.Limit)
		if err != nil {
			return nil, apiErr(err, "could not load notifications")
		}
		out := &NotificationsOutput{}
		out.Body.Notifications = items
		return out, nil
	})

	huma.Register(api, huma.Operation{
		OperationID: "notifications-unread-count",
		Method:      http.MethodGet,
		Path:        "/notifications/unread-count",
		Summary:     "Count the caller's unread notifications",
		Middlewares: huma.Middlewares{d.auth},
	}, func(ctx context.Context, _ *struct{}) (*UnreadCountOutput, error) {
		count, err := d.svc.UnreadNotificationCount(ctx, actor(ctx))
		if err != nil {
			return nil, apiErr(err, "could not count notifications")
		}
		out := &UnreadCountOutput{}
		out.Body.Count = count
		return out, nil
	})

	huma.Register(api, huma.Operation{
		OperationID: "read-notification",
		Method:      http.MethodPost,
		Path:        "/notifications/{id}/read",
		Summary:     "Mark a notification read",
		Middlewares: huma.Middlewares{d.auth},
	}, func(ctx context.Context, in *ReadNotificationInput) (*OKOutput, error) {
		if err := d.svc.MarkNotificationRead(ctx, actor(ctx), in.ID); err != nil {
			return nil, apiErr(err, "could not update notification")
		}
		return okOutput(), nil
	})

	huma.Register(api, huma.Operation{
		OperationID: "unread-notification",
		Method:      http.MethodPost,
		Path:        "/notifications/{id}/unread",
		Summary:     "Mark a notification unread",
		Middlewares: huma.Middlewares{d.auth},
	}, func(ctx context.Context, in *ReadNotificationInput) (*OKOutput, error) {
		if err := d.svc.MarkNotificationUnread(ctx, actor(ctx), in.ID); err != nil {
			return nil, apiErr(err, "could not update notification")
		}
		return okOutput(), nil
	})

	huma.Register(api, huma.Operation{
		OperationID: "read-all-notifications",
		Method:      http.MethodPost,
		Path:        "/notifications/read-all",
		Summary:     "Mark all the caller's notifications read",
		Middlewares: huma.Middlewares{d.auth},
	}, func(ctx context.Context, _ *struct{}) (*OKOutput, error) {
		if err := d.svc.MarkAllNotificationsRead(ctx, actor(ctx)); err != nil {
			return nil, apiErr(err, "could not update notifications")
		}
		return okOutput(), nil
	})
}

// ListNotificationsInput is the notifications list request.
type ListNotificationsInput struct {
	Limit int `query:"limit" doc:"Max notifications to return (default 30; values above 100 are capped at 100)" default:"30"`
}

// NotificationsOutput is the notifications list response.
type NotificationsOutput struct {
	Body struct {
		Notifications []db.Notification `json:"notifications"`
	}
}

// UnreadCountOutput carries the unread count.
type UnreadCountOutput struct {
	Body struct {
		Count int `json:"count"`
	}
}

// ReadNotificationInput identifies a notification to mark read.
type ReadNotificationInput struct {
	ID string `path:"id"`
}

// OKOutput is a simple acknowledgement.
type OKOutput struct {
	Body struct {
		OK bool `json:"ok"`
	}
}

// okOutput is the {"ok": true} acknowledgement.
func okOutput() *OKOutput {
	out := &OKOutput{}
	out.Body.OK = true
	return out
}
