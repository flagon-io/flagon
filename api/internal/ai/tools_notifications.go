package ai

import (
	"context"
	"fmt"

	"github.com/flagon-io/flagon/api/internal/service"
)

// Notification tools (server/notifications.go). They act on the caller's own
// feed only.
func registerNotificationTools(r *Registry, svc *service.Service) {
	type listInput struct {
		Limit int `json:"limit"`
	}
	r.add(Tool{
		Def: ToolDef{
			Name:        "list_notifications",
			Description: "List the current user's notifications, newest first. Each has an id, type, title, optional body/link, and read_at (null when unread).",
			InputSchema: schema(`{"type":"object","properties":{"limit":{"type":"integer","description":"Max notifications to return (default 30, max 100)"}},"additionalProperties":false}`),
		},
		Scope:     "notifications",
		Operation: "list-notifications",
		Run: run(func(ctx context.Context, tc ToolContext, in listInput) (any, error) {
			// The service applies the same default/cap as the REST operation.
			notes, err := svc.ListNotifications(ctx, tc.actor(), in.Limit)
			if err != nil {
				return nil, err
			}
			return map[string]any{"notifications": notes}, nil
		}),
	})

	r.add(Tool{
		Def: ToolDef{
			Name:        "count_unread_notifications",
			Description: "Count the current user's unread notifications.",
			InputSchema: schema(`{"type":"object","properties":{},"additionalProperties":false}`),
		},
		Scope:     "notifications",
		Operation: "notifications-unread-count",
		Run: run(func(ctx context.Context, tc ToolContext, _ struct{}) (any, error) {
			n, err := svc.UnreadNotificationCount(ctx, tc.actor())
			if err != nil {
				return nil, err
			}
			return map[string]any{"count": n}, nil
		}),
	})

	type idInput struct {
		ID string `json:"id" tool:"required"`
	}
	r.add(Tool{
		Def: ToolDef{
			Name:        "mark_notification_read",
			Description: "Mark one of the current user's notifications as read, by its id.",
			InputSchema: schema(`{"type":"object","properties":{"id":{"type":"string","description":"Notification id"}},"required":["id"],"additionalProperties":false}`),
		},
		Scope:     "notifications",
		Operation: "read-notification",
		Mutating:  true,
		Summarize: summarize(func(in idInput) string {
			return fmt.Sprintf("Mark notification %q read", in.ID)
		}),
		Run: run(func(ctx context.Context, tc ToolContext, in idInput) (any, error) {
			if err := svc.MarkNotificationRead(ctx, tc.actor(), in.ID); err != nil {
				return nil, err
			}
			return ok(), nil
		}),
	})

	r.add(Tool{
		Def: ToolDef{
			Name:        "mark_notification_unread",
			Description: "Mark one of the current user's notifications as unread again, by its id.",
			InputSchema: schema(`{"type":"object","properties":{"id":{"type":"string","description":"Notification id"}},"required":["id"],"additionalProperties":false}`),
		},
		Scope:     "notifications",
		Operation: "unread-notification",
		Mutating:  true,
		Summarize: summarize(func(in idInput) string {
			return fmt.Sprintf("Mark notification %q unread", in.ID)
		}),
		Run: run(func(ctx context.Context, tc ToolContext, in idInput) (any, error) {
			if err := svc.MarkNotificationUnread(ctx, tc.actor(), in.ID); err != nil {
				return nil, err
			}
			return ok(), nil
		}),
	})

	r.add(Tool{
		Def: ToolDef{
			Name:        "mark_all_notifications_read",
			Description: "Mark all of the current user's notifications as read.",
			InputSchema: schema(`{"type":"object","properties":{},"additionalProperties":false}`),
		},
		Scope:     "notifications",
		Operation: "read-all-notifications",
		Mutating:  true,
		Summarize: summarize(func(struct{}) string { return "Mark all notifications read" }),
		Run: run(func(ctx context.Context, tc ToolContext, _ struct{}) (any, error) {
			if err := svc.MarkAllNotificationsRead(ctx, tc.actor()); err != nil {
				return nil, err
			}
			return ok(), nil
		}),
	})
}
