// The signed-in user's notifications.
import { request } from "./client";
import type { Notification } from "./types";

export async function listNotifications(limit = 30): Promise<Notification[]> {
  const data = await request<{ notifications?: Notification[] | null }>(
    `/notifications?limit=${limit}`,
  );
  return data.notifications ?? [];
}

export async function unreadNotificationCount(): Promise<number> {
  const data = await request<{ count?: number }>("/notifications/unread-count");
  return data.count ?? 0;
}

export function markNotificationRead(id: string): Promise<void> {
  return request(`/notifications/${encodeURIComponent(id)}/read`, { method: "POST" });
}

export function markNotificationUnread(id: string): Promise<void> {
  return request(`/notifications/${encodeURIComponent(id)}/unread`, { method: "POST" });
}

export function markAllNotificationsRead(): Promise<void> {
  return request("/notifications/read-all", { method: "POST" });
}
