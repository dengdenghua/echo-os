import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  isSystemSoundEnabled,
  setSystemSoundEnabled,
  playSystemSound,
  resetAudioContextForTesting,
} from "./desktop-audio-feedback";

describe("Desktop Audio Feedback Synthesizer", () => {
  beforeEach(() => {
    localStorage.clear();
    resetAudioContextForTesting();
    vi.restoreAllMocks();
  });

  it("defaults to enabled", () => {
    expect(isSystemSoundEnabled()).toBe(true);
  });

  it("can be enabled and disabled", () => {
    setSystemSoundEnabled(false);
    expect(isSystemSoundEnabled()).toBe(false);

    setSystemSoundEnabled(true);
    expect(isSystemSoundEnabled()).toBe(true);
  });

  it("synthesizes sounds via Web Audio API oscillators and gain nodes", () => {
    const mockOsc = {
      type: "sine",
      frequency: {
        setValueAtTime: vi.fn(),
        exponentialRampToValueAtTime: vi.fn(),
      },
      connect: vi.fn(),
      start: vi.fn(),
      stop: vi.fn(),
    };

    const mockGain = {
      gain: {
        setValueAtTime: vi.fn(),
        exponentialRampToValueAtTime: vi.fn(),
        linearRampToValueAtTime: vi.fn(),
      },
      connect: vi.fn(),
    };

    const mockCtx = {
      currentTime: 10,
      state: "running",
      destination: {},
      createOscillator: vi.fn().mockReturnValue(mockOsc),
      createGain: vi.fn().mockReturnValue(mockGain),
      resume: vi.fn().mockResolvedValue(undefined),
    };

    function MockAudioContext(this: any) {
      return mockCtx;
    }

    vi.stubGlobal("AudioContext", MockAudioContext);

    setSystemSoundEnabled(true);
    playSystemSound("snap");
    expect(mockCtx.createOscillator).toHaveBeenCalled();
    expect(mockOsc.start).toHaveBeenCalled();

    playSystemSound("whoosh");
    expect(mockCtx.createOscillator).toHaveBeenCalled();

    playSystemSound("pop");
    expect(mockCtx.createOscillator).toHaveBeenCalled();

    playSystemSound("toggle");
    expect(mockCtx.createOscillator).toHaveBeenCalled();

    playSystemSound("chime");
    expect(mockCtx.createOscillator).toHaveBeenCalled();

    vi.unstubAllGlobals();
  });

  it("does not play sounds when disabled", () => {
    const mockCtx = {
      createOscillator: vi.fn(),
    };
    function MockAudioContext(this: any) {
      return mockCtx;
    }
    vi.stubGlobal("AudioContext", MockAudioContext);

    setSystemSoundEnabled(false);
    playSystemSound("snap");
    expect(mockCtx.createOscillator).not.toHaveBeenCalled();

    vi.unstubAllGlobals();
  });
});
