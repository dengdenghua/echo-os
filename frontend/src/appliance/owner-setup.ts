/**
 * First-boot owner setup (ECHO OS appliance).
 *
 * A device that booted without a chosen owner password asks for it once, from
 * the home network, with the one-time setup code printed on the device
 * console. The rule below mirrors `owner_password_problem` in
 * `appliance/account_security.py`; the backend stays authoritative.
 */

export type OwnerSetupStatus = {
  ownerSetupRequired: boolean;
  reachable: boolean;
  username: string;
};

export const OWNER_PASSWORD_MIN_CHARACTERS = 12;
export const OWNER_PASSWORD_MAX_BYTES = 72;

export type OwnerPasswordCheck = {
  id: "length" | "kinds" | "variety";
  label: string;
  met: boolean;
};

function characterKinds(password: string): number {
  return [
    /\p{Ll}/u.test(password),
    /\p{Lu}/u.test(password),
    /\p{Nd}/u.test(password),
    // Anything that is not an ASCII letter or digit: symbols, spaces, 中文.
    [...password].some((char) => !/^[A-Za-z0-9]$/.test(char)),
  ].filter(Boolean).length;
}

function utf8Bytes(value: string): number {
  return new TextEncoder().encode(value).length;
}

export function ownerPasswordChecks(password: string): OwnerPasswordCheck[] {
  const length = [...password].length;
  return [
    {
      id: "length",
      label: `${OWNER_PASSWORD_MIN_CHARACTERS} 个字符以上`,
      met:
        length >= OWNER_PASSWORD_MIN_CHARACTERS &&
        utf8Bytes(password) <= OWNER_PASSWORD_MAX_BYTES,
    },
    {
      id: "kinds",
      label: "包含大写字母、小写字母、数字、符号中的至少三类",
      met: characterKinds(password) >= 3,
    },
    {
      id: "variety",
      label: "不要只重复几个字符",
      met: new Set([...password.toLowerCase()]).size >= 6,
    },
  ];
}

export function ownerPasswordProblem(password: string): string | null {
  if ([...password].length < OWNER_PASSWORD_MIN_CHARACTERS)
    return `密码至少需要 ${OWNER_PASSWORD_MIN_CHARACTERS} 个字符。`;
  if (utf8Bytes(password) > OWNER_PASSWORD_MAX_BYTES)
    return "密码太长了，请控制在 72 字节以内（约 24 个汉字）。";
  if (characterKinds(password) < 3)
    return "请混合使用大写字母、小写字母、数字和符号中的至少三类。";
  if (new Set([...password.toLowerCase()]).size < 6)
    return "密码重复的字符太多，请换一个更难猜的密码。";
  return null;
}

const SETUP_ERRORS: Record<string, string> = {
  invalid_setup_code: "设置码不正确。请核对设备控制台中显示的设置码。",
  setup_code_rotated:
    "设置码输错次数过多，已经作废。设备控制台中已显示新的设置码。",
  owner_already_set: "这台设备已经设置了所有者，请直接登录。",
  setup_requires_local_network:
    "首次设置只能在设备所在的局域网内完成。请连接同一网络后重试。",
  password_too_short: `密码至少需要 ${OWNER_PASSWORD_MIN_CHARACTERS} 个字符。`,
  password_too_long: "密码太长了，请控制在 72 字节以内。",
  password_too_simple: "请混合使用大写字母、小写字母、数字和符号中的至少三类。",
  password_too_repetitive: "密码重复的字符太多，请换一个更难猜的密码。",
};

export class OwnerSetupError extends Error {
  constructor(
    message: string,
    public readonly code: string | null,
    public readonly status: number,
  ) {
    super(message);
    this.name = "OwnerSetupError";
  }
}

export function normalizeSetupCode(value: string): string {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export async function fetchOwnerSetupStatus(): Promise<OwnerSetupStatus | null> {
  try {
    const response = await fetch("/api/appliance/setup/status", {
      cache: "no-store",
    });
    if (!response.ok) return null;
    const payload = (await response.json()) as Partial<OwnerSetupStatus>;
    if (typeof payload.ownerSetupRequired !== "boolean") return null;
    return {
      ownerSetupRequired: payload.ownerSetupRequired,
      reachable: payload.reachable === true,
      username:
        typeof payload.username === "string" && payload.username
          ? payload.username
          : "admin",
    };
  } catch {
    return null;
  }
}

function problemCode(detail: unknown): string | null {
  if (typeof detail === "string") return detail;
  // FastAPI raises 422 for a body that fails validation as a list.
  if (Array.isArray(detail)) return "invalid_request";
  return null;
}

export async function completeOwnerSetup(
  setupCode: string,
  password: string,
): Promise<void> {
  const response = await fetch("/api/appliance/setup/owner", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      setupCode: normalizeSetupCode(setupCode),
      password,
    }),
  });
  if (response.ok) return;
  const detail: unknown = await response
    .json()
    .then((body) => body?.detail)
    .catch(() => null);
  const code = problemCode(detail);
  const message =
    (code && SETUP_ERRORS[code]) ??
    (response.status === 403
      ? "这个请求被设备拒绝了。请直接在设备的局域网地址上打开 ECHO OS。"
      : "暂时无法完成设置，请稍后重试。");
  throw new OwnerSetupError(message, code, response.status);
}
