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
func registerNotificationsAPI(api huma.API, store IdentityStore, internalToken string) {
	auth := combinedAuth(api, store, internalToken)

	huma.Register(api, huma.Operation{
		OperationID: "list-notifications",
		Method:      http.MethodGet,
		Path:        "/notifications",
		Summary:     "List the caller's notifications",
		Middlewares: huma.Middlewares{auth},
	}, func(ctx context.Context, in *ListNotificationsInput) (*NotificationsOutput, error) {
		userID, _ := identity(ctx)
		items, err := store.ListNotifications(ctx, userID, in.Limit)
		if err != nil {
			return nil, huma.Error500InternalServerError("could not load notifications", err)
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
		Middlewares: huma.Middlewares{auth},
	}, func(ctx context.Context, _ *struct{}) (*UnreadCountOutput, error) {
		userID, _ := identity(ctx)
		count, err := store.UnreadNotificationCount(ctx, userID)
		if err != nil {
			return nil, huma.Error500InternalServerError("could not count notifications", err)
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
		Middlewares: huma.Middlewares{auth},
	}, func(ctx context.Context, in *ReadNotificationInput) (*OKOutput, error) {
		userID, _ := identity(ctx)
		if err := store.MarkNotificationRead(ctx, userID, in.ID); err != nil {
			return nil, huma.Error500InternalServerError("could not update notification", err)
		}
		out := &OKOutput{}
		out.Body.OK = true
		return out, nil
	})

	huma.Register(api, huma.Operation{
		OperationID: "read-all-notifications",
		Method:      http.MethodPost,
		Path:        "/notifications/read-all",
		Summary:     "Mark all the caller's notifications read",
		Middlewares: huma.Middlewares{auth},
	}, func(ctx context.Context, _ *struct{}) (*OKOutput, error) {
		userID, _ := identity(ctx)
		if err := store.MarkAllNotificationsRead(ctx, userID); err != nil {
			return nil, huma.Error500InternalServerError("could not update notifications", err)
		}
		out := &OKOutput{}
		out.Body.OK = true
		return out, nil
	})
}

// ListNotificationsInput is the notifications list request.
type ListNotificationsInput struct {
	Limit int `query:"limit" doc:"Max notifications to return" default:"30"`
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
