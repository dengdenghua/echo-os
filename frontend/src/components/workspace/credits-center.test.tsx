import { screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { renderWithProviders } from "@/test/harness";

vi.mock("@/core/oct/hooks", () => ({ useOctLink: () => ({ data: null }) }));

import { CreditsCenterDialog } from "./credits-center";

describe("<CreditsCenterDialog />", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("reads an empty ledger as 0 on monochrome tiles, not +0 / -0", async () => {
    renderWithProviders(<CreditsCenterDialog open onOpenChange={() => {}} />, {
      locale: "zh-CN",
    });

    const earned = (await screen.findByText("累计赚得")).nextElementSibling;
    const spent = screen.getByText("累计花掉").nextElementSibling;
    expect(earned).toHaveTextContent(/^0$/);
    expect(spent).toHaveTextContent(/^0$/);
    expect(earned?.className).not.toContain("text-core");
    expect(earned?.parentElement?.className).not.toMatch(/bg-core/);
  });
});
