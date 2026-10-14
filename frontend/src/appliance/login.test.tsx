import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { applianceLogin } from "./auth";
import { ApplianceLogin } from "./login";
import type * as OwnerSetupModule from "./owner-setup";
import {
  completeOwnerSetup,
  fetchOwnerSetupStatus,
  OwnerSetupError,
} from "./owner-setup";

vi.mock("./auth", () => ({
  ApplianceSecondFactorRequiredError: class extends Error {},
  applianceLogin: vi.fn(),
}));

vi.mock("./owner-setup", async (importOriginal) => {
  const actual = await importOriginal<typeof OwnerSetupModule>();
  return {
    ...actual,
    fetchOwnerSetupStatus: vi.fn(),
    completeOwnerSetup: vi.fn(),
  };
});

const systemCapabilities = {
  suspend: false,
  restart: false,
  shutdown: false,
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(applianceLogin).mockResolvedValue(undefined);
  vi.mocked(fetchOwnerSetupStatus).mockResolvedValue({
    ownerSetupRequired: false,
    reachable: true,
    username: "admin",
  });
  vi.mocked(completeOwnerSetup).mockResolvedValue(undefined);
});

function renderLogin(onSuccess = vi.fn()) {
  render(
    <ApplianceLogin
      onSuccess={onSuccess}
      systemCapabilities={systemCapabilities}
      onSystemAction={vi.fn()}
    />,
  );
  return onSuccess;
}

const STRONG = "Harbor-Light-2147";

describe("appliance login", () => {
  it("submits a password silently populated by a password manager", async () => {
    const user = userEvent.setup();
    const onSuccess = renderLogin();

    const password = (await screen.findByLabelText("密码")) as HTMLInputElement;
    const valueSetter = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )?.set;
    valueSetter?.call(password, "password-manager-secret");

    const submit = screen.getByRole("button", { name: "进入桌面" });
    expect(submit).toBeEnabled();
    await user.click(submit);

    expect(applianceLogin).toHaveBeenCalledWith(
      "admin",
      "password-manager-secret",
      undefined,
    );
    expect(onSuccess).toHaveBeenCalledOnce();
  });

  it("keeps native required validation for an empty password", async () => {
    const user = userEvent.setup();
    renderLogin();

    await user.click(await screen.findByRole("button", { name: "进入桌面" }));

    expect(applianceLogin).not.toHaveBeenCalled();
  });

  it("falls back to sign-in when the first-boot check is unavailable", async () => {
    vi.mocked(fetchOwnerSetupStatus).mockResolvedValue(null);
    renderLogin();

    expect(await screen.findByLabelText("密码")).toBeInTheDocument();
    expect(screen.queryByText("设置设备所有者")).not.toBeInTheDocument();
  });
});

describe("first-boot owner setup", () => {
  beforeEach(() => {
    vi.mocked(fetchOwnerSetupStatus).mockResolvedValue({
      ownerSetupRequired: true,
      reachable: true,
      username: "admin",
    });
  });

  it("sets the owner password, signs in and opens the desktop", async () => {
    const user = userEvent.setup();
    const onSuccess = renderLogin();

    await user.type(await screen.findByLabelText("设置码"), "abcd-2345");
    await user.type(screen.getByLabelText("新密码"), STRONG);
    await user.type(screen.getByLabelText("再次输入新密码"), STRONG);
    await user.click(
      screen.getByRole("button", { name: "完成设置并进入桌面" }),
    );

    expect(completeOwnerSetup).toHaveBeenCalledWith("ABCD2345", STRONG);
    expect(applianceLogin).toHaveBeenCalledWith("admin", STRONG);
    expect(onSuccess).toHaveBeenCalledOnce();
    expect(screen.queryByLabelText("密码")).not.toBeInTheDocument();
  });

  it("checks the password rule and the confirmation before sending", async () => {
    const user = userEvent.setup();
    renderLogin();

    await user.type(await screen.findByLabelText("设置码"), "ABCD2345");
    await user.type(screen.getByLabelText("新密码"), "alllowercaseletters");
    await user.type(
      screen.getByLabelText("再次输入新密码"),
      "alllowercaseletters",
    );
    await user.click(
      screen.getByRole("button", { name: "完成设置并进入桌面" }),
    );
    expect(screen.getByRole("alert")).toHaveTextContent(
      "请混合使用大写字母、小写字母、数字和符号中的至少三类。",
    );

    await user.clear(screen.getByLabelText("新密码"));
    await user.type(screen.getByLabelText("新密码"), STRONG);
    await user.click(
      screen.getByRole("button", { name: "完成设置并进入桌面" }),
    );
    expect(screen.getByRole("alert")).toHaveTextContent(
      "两次输入的密码不一致。",
    );
    expect(completeOwnerSetup).not.toHaveBeenCalled();
  });

  it("shows which rules the new password meets", async () => {
    const user = userEvent.setup();
    renderLogin();

    await user.type(await screen.findByLabelText("新密码"), STRONG);
    const rules = screen.getAllByRole("listitem");
    expect(rules).toHaveLength(3);
    rules.forEach((rule) => expect(rule).toHaveAttribute("data-met", "true"));
  });

  it("returns to sign-in when an owner already exists", async () => {
    vi.mocked(completeOwnerSetup).mockRejectedValue(
      new OwnerSetupError(
        "这台设备已经设置了所有者，请直接登录。",
        "owner_already_set",
        409,
      ),
    );
    const user = userEvent.setup();
    renderLogin();

    await user.type(await screen.findByLabelText("设置码"), "ABCD2345");
    await user.type(screen.getByLabelText("新密码"), STRONG);
    await user.type(screen.getByLabelText("再次输入新密码"), STRONG);
    await user.click(
      screen.getByRole("button", { name: "完成设置并进入桌面" }),
    );

    expect(await screen.findByLabelText("密码")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent(
      "这台设备已经设置了所有者，请直接登录。",
    );
    expect(applianceLogin).not.toHaveBeenCalled();
  });

  it("explains that setup needs the home network", async () => {
    vi.mocked(fetchOwnerSetupStatus).mockResolvedValue({
      ownerSetupRequired: true,
      reachable: false,
      username: "admin",
    });
    renderLogin();

    expect(
      await screen.findByText(/首次设置只能在设备所在的局域网内完成/),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText("设置码")).not.toBeInTheDocument();
  });
});
