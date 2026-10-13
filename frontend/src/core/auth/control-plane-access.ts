import type { AuthStatus, User } from "./types";

const GLOBAL_SCOPES = new Set([
  "evolution:cross_tenant",
  "tenant:cross_tenant",
  "global:admin",
  "*",
]);

/** Operator-only control surfaces remain available in local auth-off mode. */
export function canAccessOperatorControlPlane(
  authStatus: AuthStatus | null,
  user: User | null,
): boolean {
  if (authStatus?.enabled === false) return true;
  if (!authStatus?.enabled || !user) return false;
  const roles = new Set(user.roles ?? []);
  return roles.has("admin") || roles.has("operator");
}

/** Cross-tenant process-global controls require an admin and a durable scope. */
export function canAccessGlobalControlPlane(
  authStatus: AuthStatus | null,
  user: User | null,
): boolean {
  if (authStatus?.enabled === false) return true;
  if (!authStatus?.enabled || !user?.roles?.includes("admin")) return false;
  // Older auth payloads omitted the list for an otherwise valid admin. Let the
  // backend make the final decision in that compatibility case. A list that is
  // present is authoritative, including an empty one: /api/auth/me always
  // sends it, and probing anyway answers 403 on every workbench open (the
  // appliance owner is an admin without a cross-tenant scope).
  if (user.permissions === undefined) return true;
  return user.permissions.some((permission) => GLOBAL_SCOPES.has(permission));
}
