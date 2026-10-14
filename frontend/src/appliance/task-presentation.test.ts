import { describe, expect, it } from "vitest";

import { approvalOperation, approvalText } from "./task-presentation";
import type { EchoTaskProjection } from "./task-space";

function waiting(
  approval: Partial<NonNullable<EchoTaskProjection["approval"]>>,
): EchoTaskProjection {
  return {
    displayStatus: "waiting_approval",
    approval: { required: true, ...approval },
  } as unknown as EchoTaskProjection;
}

describe("approvalText", () => {
  it("prefers the agent's own reason", () => {
    expect(
      approvalText(
        waiting({ reason: "把 hello.txt 复制到工作区外", tool: "exec_shell" }),
      ),
    ).toBe("把 hello.txt 复制到工作区外");
  });

  it("words a bare request by its tool instead of internal ids", () => {
    const text = approvalText(
      waiting({ reason: null, tool: "exec_shell", action: "ask" }),
    );

    expect(text).toBe("Agent 请求运行命令，需要你授权");
    expect(text).not.toMatch(/exec_shell|ask/);
  });

  it("falls back to a generic sentence for an unknown tool", () => {
    expect(approvalText(waiting({ reason: "  ", tool: "mystery_tool" }))).toBe(
      "Agent 请求执行一项需要你授权的操作",
    );
  });
});

describe("approvalOperation", () => {
  it("labels the tool and the policy action", () => {
    expect(
      approvalOperation(waiting({ tool: "exec_shell", action: "ask" })),
    ).toBe("运行命令 · 需要确认");
  });
});
