import { describe, expect, it } from "vitest";

import { getStreamErrorMessage, isNoModelConfigured } from "./errors";

describe("getStreamErrorMessage", () => {
  it("maps missing stream endpoints to a product message", () => {
    expect(
      getStreamErrorMessage(new Error("Stream failed: 404"), "friendly"),
    ).toBe("friendly");
  });

  it("maps unavailable stream endpoints to a product message", () => {
    expect(
      getStreamErrorMessage({ message: "Stream failed: 503" }, "friendly"),
    ).toBe("friendly");
  });

  it("preserves specific non-endpoint errors", () => {
    expect(getStreamErrorMessage("Model timed out", "friendly")).toBe(
      "Model timed out",
    );
  });
});

describe("isNoModelConfigured", () => {
  it("recognises the runtime's no-model error, also inside wrappers", () => {
    expect(
      isNoModelConfigured(
        "no LLM model configured — add one to data/custom_models.json (or set ANTHROPIC_API_KEY)",
      ),
    ).toBe(true);
    expect(isNoModelConfigured("RuntimeError: No LLM model configured")).toBe(
      true,
    );
  });

  it("ignores other failures and empty values", () => {
    expect(isNoModelConfigured("model_unavailable")).toBe(false);
    expect(isNoModelConfigured("")).toBe(false);
    expect(isNoModelConfigured(undefined)).toBe(false);
  });
});
