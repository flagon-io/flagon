/**
 * Session access for the console.
 *
 * There is no authentication backend yet (see app/login/login-form.tsx), so
 * there is no session to read and every visitor is treated as signed out.
 * Callers gate on this exactly as they will once auth ships: when the real
 * session lookup lands here (reading the cross-subdomain cookie), the call
 * sites do not change.
 */
export type Session = {
  userId: string;
};

export async function getSession(): Promise<Session | null> {
  // Faked as signed-out until auth lands.
  return null;
}
