import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import {
  ActivityMonitorArtwork,
  AppStoreArtwork,
  BrowserArtwork,
  FinderArtwork,
  LaunchpadArtwork,
  PhoneMirrorArtwork,
  PhotosArtwork,
  SettingsArtwork,
  StorageCenterArtwork,
  TasksArtwork,
  getMacAppArtwork,
} from "./mac-app-artworks";

describe("MacAppArtworks", () => {
  it("renders Finder artwork with two-tone smile face", () => {
    const { container } = render(<FinderArtwork />);
    const svg = container.querySelector("svg");
    expect(svg).toBeInTheDocument();
    expect(svg).toHaveClass("mac-app-icon-art");
  });

  it("renders Launchpad artwork with 3D rocket and flame", () => {
    const { container } = render(<LaunchpadArtwork />);
    expect(container.querySelector("svg")).toBeInTheDocument();
  });

  it("renders Safari compass with nautical dial and needle", () => {
    const { container } = render(<BrowserArtwork />);
    expect(container.querySelector("polygon[fill='#ef4444']")).toBeInTheDocument();
  });

  it("renders Photos artwork with multi-colored radial flower petals", () => {
    const { container } = render(<PhotosArtwork />);
    expect(container.querySelectorAll("path")).toHaveLength(8);
  });

  it("renders Phone Mirror artwork with titanium chassis", () => {
    const { container } = render(<PhoneMirrorArtwork />);
    expect(container.querySelector("svg")).toBeInTheDocument();
  });

  it("renders Storage Center artwork with drive bays and LEDs", () => {
    const { container } = render(<StorageCenterArtwork />);
    expect(container.querySelector("circle[fill='#22c55e']")).toBeInTheDocument();
  });

  it("renders Tasks artwork with colorful checklist bullets", () => {
    const { container } = render(<TasksArtwork />);
    expect(container.querySelector("circle[fill='#f97316']")).toBeInTheDocument();
  });

  it("renders Activity Monitor artwork with glowing green pulse wave", () => {
    const { container } = render(<ActivityMonitorArtwork />);
    expect(container.querySelector("path[stroke='#4ade80']")).toBeInTheDocument();
  });

  it("renders Settings artwork with mechanical interlocking gears", () => {
    const { container } = render(<SettingsArtwork />);
    expect(container.querySelector("svg")).toBeInTheDocument();
  });

  it("renders App Store artwork with architectural blueprint A", () => {
    const { container } = render(<AppStoreArtwork />);
    expect(container.querySelector("svg")).toBeInTheDocument();
  });

  it("dispatches known app IDs via getMacAppArtwork", () => {
    expect(getMacAppArtwork("system:finder")).not.toBeNull();
    expect(getMacAppArtwork("system:launchpad")).not.toBeNull();
    expect(getMacAppArtwork("echo:/browser")).not.toBeNull();
    expect(getMacAppArtwork("echo:/photos")).not.toBeNull();
    expect(getMacAppArtwork("system:settings")).not.toBeNull();
    expect(getMacAppArtwork("unknown:app")).toBeNull();
  });
});
