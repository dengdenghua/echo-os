/**
 * First-boot owner setup on the lock screen.
 *
 * Shown only while the device reports `ownerSetupRequired`. The owner enters
 * the one-time setup code from the device console and chooses the password
 * for the administrator account; the form then signs in and lands on the
 * desktop.
 */

import { useMemo, useState, type FormEvent } from "react";
import { CheckIcon } from "lucide-react";

import { applianceLogin } from "@/appliance/auth";
import {
  completeOwnerSetup,
  normalizeSetupCode,
  OwnerSetupError,
  ownerPasswordChecks,
  ownerPasswordProblem,
} from "@/appliance/owner-setup";
import { EchoMark } from "@/components/brand/echo-mark";

export function OwnerSetupForm({
  username,
  reachable,
  onSuccess,
  onOwnerExists,
}: {
  username: string;
  reachable: boolean;
  onSuccess: () => void;
  onOwnerExists: (message: string) => void;
}) {
  const [setupCode, setSetupCode] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const checks = useMemo(() => ownerPasswordChecks(password), [password]);

  if (!reachable) {
    return (
      <section className="mac-login-form mac-owner-setup" role="status">
        <div className="mac-login-avatar">
          <EchoMark tone="light" />
        </div>
        <h1>设置设备所有者</h1>
        <p>
          这台设备还没有所有者。首次设置只能在设备所在的局域网内完成，请连接同一网络后打开
          ECHO OS。
        </p>
      </section>
    );
  }

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitting) return;
    const formData = new FormData(event.currentTarget);
    const code = normalizeSetupCode(String(formData.get("setupCode") ?? ""));
    const nextPassword = String(formData.get("password") ?? "");
    const nextConfirmation = String(formData.get("confirmation") ?? "");
    if (code.length !== 8) {
      setError("请输入设备控制台中显示的 8 位设置码。");
      return;
    }
    const problem = ownerPasswordProblem(nextPassword);
    if (problem) {
      setError(problem);
      return;
    }
    if (nextPassword !== nextConfirmation) {
      setError("两次输入的密码不一致。");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await completeOwnerSetup(code, nextPassword);
    } catch (err) {
      setSubmitting(false);
      if (err instanceof OwnerSetupError && err.code === "owner_already_set") {
        onOwnerExists(err.message);
        return;
      }
      setError(
        err instanceof Error ? err.message : "暂时无法完成设置，请稍后重试。",
      );
      return;
    }
    try {
      await applianceLogin(username, nextPassword);
      onSuccess();
    } catch {
      setSubmitting(false);
      onOwnerExists("所有者密码已设置。请用新密码登录。");
    }
  };

  return (
    <form
      onSubmit={submit}
      className="mac-login-form mac-owner-setup"
      aria-label="设置设备所有者"
      noValidate
    >
      <div className="mac-login-avatar">
        <EchoMark tone="light" />
      </div>
      <h1>设置设备所有者</h1>
      <p>
        这台设备还没有所有者。为管理员账号 {username} 设置密码后即可进入桌面。
      </p>

      <label className="mac-login-password mac-owner-setup-field">
        <input
          name="setupCode"
          type="text"
          autoFocus
          autoComplete="one-time-code"
          autoCapitalize="characters"
          spellCheck={false}
          required
          maxLength={16}
          value={setupCode}
          onChange={(event) => {
            setSetupCode(event.target.value);
            if (error) setError(null);
          }}
          placeholder="设置码，例如 ABCD-2345"
          aria-label="设置码"
          className="mac-owner-setup-code"
        />
      </label>
      <label className="mac-login-password mac-owner-setup-field">
        <input
          name="password"
          type="password"
          autoComplete="new-password"
          required
          value={password}
          onChange={(event) => {
            setPassword(event.target.value);
            if (error) setError(null);
          }}
          placeholder="新密码"
          aria-label="新密码"
          aria-describedby="owner-setup-rules"
        />
      </label>
      <label className="mac-login-password mac-owner-setup-field">
        <input
          name="confirmation"
          type="password"
          autoComplete="new-password"
          required
          value={confirmation}
          onChange={(event) => {
            setConfirmation(event.target.value);
            if (error) setError(null);
          }}
          placeholder="再次输入新密码"
          aria-label="再次输入新密码"
        />
      </label>

      <ul id="owner-setup-rules" className="mac-owner-setup-rules">
        {checks.map((check) => (
          <li key={check.id} data-met={check.met ? "true" : "false"}>
            <span aria-hidden className="mac-owner-setup-rule-mark">
              {check.met ? <CheckIcon /> : null}
            </span>
            <span>{check.label}</span>
            <span className="sr-only">
              {check.met ? "（已满足）" : "（未满足）"}
            </span>
          </li>
        ))}
      </ul>

      {error && (
        <p className="mac-login-error" role="alert">
          {error}
        </p>
      )}

      <button
        type="submit"
        className="mac-owner-setup-submit"
        disabled={submitting}
      >
        {submitting ? "正在设置…" : "完成设置并进入桌面"}
      </button>
      <small>设置码只显示在设备控制台和服务日志中，设置完成后立即失效。</small>
    </form>
  );
}
