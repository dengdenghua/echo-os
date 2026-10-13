import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "./dropdown-menu";

function renderMenu(container?: HTMLElement) {
  render(
    <DropdownMenu open>
      <DropdownMenuTrigger>打开</DropdownMenuTrigger>
      <DropdownMenuContent portalContainer={container}>
        <DropdownMenuSub open>
          <DropdownMenuSubTrigger>更多</DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            <DropdownMenuItem>子项</DropdownMenuItem>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
      </DropdownMenuContent>
    </DropdownMenu>,
  );
  const root = document.querySelector<HTMLElement>(
    '[data-slot="dropdown-menu-content"]',
  );
  const sub = screen
    .getByText("子项")
    .closest<HTMLElement>('[data-slot="dropdown-menu-sub-content"]');
  return { root, sub };
}

describe("DropdownMenuSubContent", () => {
  it("portals outside the parent menu so the parent cannot clip it", () => {
    const { root, sub } = renderMenu();

    expect(root).not.toBeNull();
    expect(sub).not.toBeNull();
    expect(root?.contains(sub)).toBe(false);
  });

  it("follows the root menu into its themed host", () => {
    const host = document.createElement("div");
    host.dataset.echoTheme = "graphite";
    document.body.appendChild(host);

    const { root, sub } = renderMenu(host);

    expect(host.contains(root)).toBe(true);
    expect(host.contains(sub)).toBe(true);
    expect(root?.contains(sub)).toBe(false);
    host.remove();
  });
});
