import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { beforeEach, expect, it } from "vitest";
import { renderWithProviders } from "@/test/harness";
import type { Agent } from "@/core/agents/types";
import { useEvent } from "@/core/events/event-bus";
import {
  BrowserAgentPicker,
  browserPersonaRoster,
} from "./browser-agent-picker";

const agent = (name: string, display_name: string): Agent => ({
  name,
  display_name,
  description: "",
  model: null,
  tool_groups: null,
});
const roster = browserPersonaRoster([
  agent("aoi", "Zero"),
  agent("desktop_operator", "Raven"),
  agent("coder", "Kane"),
  agent("general", "Eve"),
  agent("general", "Eve again"),
  agent("expert", "Expert"),
]);

function Picker({ initial }: { initial: string }) {
  const [id, setId] = useState(initial);
  useEvent("agent:changed", (payload) => setId(payload.name));
  return (
    <BrowserAgentPicker
      activeAgent={roster.find((item) => item.name === id) ?? null}
      activeAgentId={id}
      agents={roster}
    />
  );
}

beforeEach(() => localStorage.clear());

it("lists the squad once, in squad order, without on-demand experts", () => {
  expect(roster.map((item) => item.name)).toEqual([
    "general",
    "coder",
    "desktop_operator",
    "aoi",
  ]);
});

it("marks the active persona and draws Echo as the ECHO mark tile", async () => {
  renderWithProviders(<Picker initial="general" />, { locale: "zh-CN" });
  const trigger = screen.getByRole("button", { name: "切换智能体 · Eve" });
  expect(
    trigger.querySelector('[data-agent-avatar="echo"]'),
  ).toBeInTheDocument();
  await userEvent.click(trigger);
  const menu = screen.getByRole("menu");
  const items = within(menu).getAllByRole("menuitem");
  expect(items).toHaveLength(4);
  ["Eve", "Kane", "Raven", "Zero"].forEach((name, index) => {
    expect(items[index]).toHaveAccessibleName(new RegExp(name));
  });
  expect(within(menu).getByRole("menuitem", { name: /Eve/ })).toHaveAttribute(
    "aria-current",
    "true",
  );
});

it("switches the persona through the shared agent event", async () => {
  renderWithProviders(<Picker initial="desktop_operator" />, {
    locale: "zh-CN",
  });
  await userEvent.click(
    screen.getByRole("button", { name: "切换智能体 · Raven" }),
  );
  await userEvent.click(screen.getByRole("menuitem", { name: /Kane/ }));
  // emitAgentChanged persists the lead for the signed-in actor.
  expect(localStorage.getItem("echo.active-agent.v2:anonymous")).toBe("coder");
  expect(
    screen.getByRole("button", { name: "切换智能体 · Kane" }),
  ).toBeVisible();
});
