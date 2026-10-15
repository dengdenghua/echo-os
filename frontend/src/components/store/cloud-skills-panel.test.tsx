import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { renderWithProviders } from "@/test/harness";

import { CloudSkillsPanel } from "./cloud-skills-panel";

const mocks = vi.hoisted(() => ({
  fetchCloudSkills: vi.fn(),
  fetchCloudInstalled: vi.fn(),
  fetchUnifiedAssets: vi.fn(),
  streamInstallCloudSkill: vi.fn(),
  listSkills: vi.fn(),
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock("@/core/agents/agent-world-api", () => ({
  fetchCloudSkills: mocks.fetchCloudSkills,
  fetchCloudInstalled: mocks.fetchCloudInstalled,
  fetchUnifiedAssets: mocks.fetchUnifiedAssets,
  streamInstallCloudSkill: mocks.streamInstallCloudSkill,
}));

vi.mock("@/core/skills/api", () => ({ listSkills: mocks.listSkills }));

vi.mock("sonner", () => ({ toast: mocks.toast }));

describe("CloudSkillsPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.fetchCloudSkills.mockResolvedValue({
      total: 2,
      items: [
        { name: "writing", description: "云端写作技能", version: "1.0.0" },
        { name: "research", description: "云端研究技能", version: "1.0.0" },
      ],
    });
    mocks.fetchCloudInstalled.mockResolvedValue({ skills: [], plugins: [] });
    mocks.fetchUnifiedAssets.mockResolvedValue({
      total: 2,
      summary: { counts: { skill: 2 } },
      items: [
        {
          id: "writing",
          name: "writing",
          kind: "skill",
          source: "local",
          description: "本地写作技能",
        },
        {
          id: "local-only",
          name: "local-only",
          kind: "skill",
          source: "codex",
          description: "仅存在于本地",
        },
      ],
    });
  });

  it("merges cloud and local skills and marks local matches as installed", async () => {
    renderWithProviders(<CloudSkillsPanel />, { locale: "zh-CN" });

    const writingCard = (await screen.findByText("writing")).closest(
      '[data-slot="card"]',
    );
    const localOnlyCard = screen
      .getByText("local-only")
      .closest('[data-slot="card"]');
    expect(writingCard).not.toBeNull();
    expect(localOnlyCard).not.toBeNull();
    expect(
      within(writingCard!).getByRole("button", { name: "已安装" }),
    ).toBeDisabled();
    expect(
      within(localOnlyCard!).getByRole("button", { name: "已安装" }),
    ).toBeDisabled();
    expect(screen.getByText("2/3 已安装")).toBeVisible();
  });

  it("streams installation progress and commits the installed state", async () => {
    mocks.streamInstallCloudSkill.mockImplementation(
      async (
        name: string,
        onProgress: (event: Record<string, unknown>) => void,
      ) => {
        onProgress({ phase: "installing", progress: 45, message: "正在下载" });
        onProgress({
          phase: "completed",
          progress: 100,
          message: "安装完成",
          result: { installed: true, name, path: `/skills/${name}` },
        });
        return { installed: true, name, path: `/skills/${name}` };
      },
    );
    const user = userEvent.setup();
    renderWithProviders(<CloudSkillsPanel />, { locale: "zh-CN" });

    const researchCard = (await screen.findByText("research")).closest(
      '[data-slot="card"]',
    );
    await user.click(
      within(researchCard!).getByRole("button", { name: "安装" }),
    );

    await waitFor(() => {
      expect(mocks.streamInstallCloudSkill).toHaveBeenCalledWith(
        "research",
        expect.any(Function),
      );
      expect(
        within(researchCard!).getByRole("button", { name: "已安装" }),
      ).toBeDisabled();
    });
    expect(mocks.toast.success).toHaveBeenCalledWith("技能「research」已安装");
  });

  it("falls back to the runtime skill registry when the asset index is not built", async () => {
    mocks.fetchCloudSkills.mockResolvedValue({ total: 0, items: [] });
    // The read asks for an empty page instead of a 404 (no console error).
    mocks.fetchUnifiedAssets.mockResolvedValue({
      summary: null,
      total: 0,
      items: [],
    });
    mocks.listSkills.mockResolvedValue([
      {
        name: "deep-research",
        description: "深度调研",
        enabled: true,
        category: "research",
      },
      {
        name: "pdf",
        description: "PDF 处理",
        enabled: true,
        category: "documents",
      },
    ]);

    renderWithProviders(<CloudSkillsPanel />, { locale: "zh-CN" });

    const card = (await screen.findByText("deep-research")).closest(
      '[data-slot="card"]',
    );
    expect(
      within(card!).getByRole("button", { name: "已安装" }),
    ).toBeDisabled();
    expect(screen.getByText("pdf")).toBeVisible();
    expect(screen.getByText("2/2 已安装")).toBeVisible();
    expect(screen.queryByText("没有匹配的技能。")).not.toBeInTheDocument();
    expect(mocks.fetchUnifiedAssets).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "skill", allowMissing: true }),
    );
  });

  it("still falls back when an older backend answers the index read with 404", async () => {
    mocks.fetchCloudSkills.mockResolvedValue({ total: 0, items: [] });
    mocks.fetchUnifiedAssets.mockRejectedValue(
      new Error("Unified assets failed: HTTP 404"),
    );
    mocks.listSkills.mockResolvedValue([
      { name: "pdf", description: "PDF 处理", enabled: true },
    ]);

    renderWithProviders(<CloudSkillsPanel />, { locale: "zh-CN" });

    expect(await screen.findByText("pdf")).toBeVisible();
  });

  it("does not consult the runtime registry when the asset index has skills", async () => {
    renderWithProviders(<CloudSkillsPanel />, { locale: "zh-CN" });

    expect(await screen.findByText("local-only")).toBeVisible();
    expect(mocks.listSkills).not.toHaveBeenCalled();
  });
});
