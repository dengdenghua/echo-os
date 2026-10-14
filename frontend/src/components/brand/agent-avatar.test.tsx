import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import {
  agentMonogram,
  isEchoMarkAvatar,
  isEmojiAvatar,
  resolveAgentAvatar,
} from "@/core/agents/avatar";

import { AgentAvatarTile } from "./agent-avatar";

describe("resolveAgentAvatar", () => {
  it("draws the ECHO mark for the default Echo agent, whatever its data says", () => {
    expect(resolveAgentAvatar({ agentId: "general", avatar: "🐙" })).toEqual({
      kind: "echo",
    });
    expect(
      resolveAgentAvatar({
        agentId: "general",
        imageUrl: "/api/agents/general/avatar",
      }),
    ).toEqual({ kind: "echo" });
    expect(resolveAgentAvatar({ agentId: "echo" })).toEqual({ kind: "echo" });
  });

  it("maps the runtime echo token and the retired octopus to the mark", () => {
    expect(isEchoMarkAvatar("echo")).toBe(true);
    expect(isEchoMarkAvatar("🐙")).toBe(true);
    expect(resolveAgentAvatar({ name: "Rune-3fa", avatar: "echo" })).toEqual({
      kind: "echo",
    });
  });

  it("turns emoji role avatars into a monogram of the name", () => {
    expect(isEmojiAvatar("🔍")).toBe(true);
    expect(
      resolveAgentAvatar({ agentId: "coder", name: "Kane", avatar: "💻" }),
    ).toEqual({ kind: "monogram", monogram: "K" });
    expect(resolveAgentAvatar({ name: "编码助手", avatar: "🛡️" })).toEqual({
      kind: "monogram",
      monogram: "编",
    });
  });

  it("keeps image avatars and short text monograms", () => {
    expect(
      resolveAgentAvatar({
        agentId: "coder",
        name: "Kane",
        imageUrl: "/api/agents/coder/avatar",
      }),
    ).toEqual({
      kind: "image",
      src: "/api/agents/coder/avatar",
      monogram: "K",
    });
    expect(resolveAgentAvatar({ name: "Claude Code", avatar: "cc" })).toEqual({
      kind: "monogram",
      monogram: "CC",
    });
  });

  it("skips emoji and punctuation when picking the letter", () => {
    expect(agentMonogram("✨ nova", "x")).toBe("N");
    expect(agentMonogram("", null, "admin")).toBe("A");
  });
});

describe("AgentAvatarTile", () => {
  it("renders the ECHO mark tile for the default agent", () => {
    const { container } = render(
      <AgentAvatarTile agentId="general" name="Echo" avatar="🐙" />,
    );
    const tile = container.querySelector('[data-agent-avatar="echo"]');
    expect(tile).not.toBeNull();
    expect(tile).toHaveAttribute("data-echo-theme", "graphite");
    expect(tile?.querySelector("svg")).not.toBeNull();
    expect(container.textContent).not.toContain("🐙");
  });

  it("never prints an emoji avatar", () => {
    const { container } = render(
      <AgentAvatarTile name="Researcher" avatar="🔍" label="Researcher" />,
    );
    const tile = container.querySelector('[data-agent-avatar="monogram"]');
    expect(tile).toHaveTextContent("R");
    expect(tile).toHaveAttribute("role", "img");
    expect(container.textContent).not.toContain("🔍");
  });

  it("keeps Chinese monograms at the 12px floor", () => {
    const { container } = render(
      <AgentAvatarTile name="编码助手" className="size-4" />,
    );
    const letter = container.querySelector<HTMLElement>(
      '[data-agent-avatar="monogram"] > span',
    );
    expect(letter).toHaveTextContent("编");
    expect(letter?.className).toContain("max(12px");
  });
});
