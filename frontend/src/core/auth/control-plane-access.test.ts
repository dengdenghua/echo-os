import { expect, it } from "vitest";

import {
  canAccessGlobalControlPlane,
  canAccessOperatorControlPlane,
} from "./control-plane-access";

const enabled = {
  enabled: true,
  jwt_available: true,
  allow_registration: true,
  exempt_paths: [],
};

it("keeps both control planes available in explicit local auth-off mode", () => {
  const disabled = { ...enabled, enabled: false };
  expect(canAccessOperatorControlPlane(disabled, null)).toBe(true);
  expect(canAccessGlobalControlPlane(disabled, null)).toBe(true);
});

it("does not probe privileged control planes for ordinary users", () => {
  const user = { user_id: "eve", username: "Eve", roles: ["member"] };
  expect(canAccessOperatorControlPlane(enabled, user)).toBe(false);
  expect(canAccessGlobalControlPlane(enabled, user)).toBe(false);
});

it("distinguishes operator access from cross-tenant admin access", () => {
  const operator = {
    user_id: "operator",
    username: "Operator",
    roles: ["operator"],
  };
  const admin = {
    user_id: "admin",
    username: "Admin",
    roles: ["admin"],
    permissions: ["global:admin"],
  };
  expect(canAccessOperatorControlPlane(enabled, operator)).toBe(true);
  expect(canAccessGlobalControlPlane(enabled, operator)).toBe(false);
  expect(canAccessGlobalControlPlane(enabled, admin)).toBe(true);
});

it("does not probe the global control plane for an admin with an explicit empty scope list", () => {
  // Golden path 2026-10: the appliance owner (admin, permissions: []) hit
  // 403 on /api/evolution/status and /api/tool-effects with every workbench open.
  const owner = {
    user_id: "local:admin",
    username: "admin",
    roles: ["user", "local", "admin"],
    permissions: [],
  };
  expect(canAccessOperatorControlPlane(enabled, owner)).toBe(true);
  expect(canAccessGlobalControlPlane(enabled, owner)).toBe(false);
  const legacy = { user_id: "admin", username: "Admin", roles: ["admin"] };
  expect(canAccessGlobalControlPlane(enabled, legacy)).toBe(true);
});
