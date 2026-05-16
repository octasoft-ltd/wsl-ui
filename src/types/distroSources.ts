/**
 * Types for WSL Distribution Sources (HKLM `DistributionListUrl` / append)
 *
 * Mirrors `src-tauri/src/wsl/distro_sources.rs`.
 */

export type DistroSourceMode = "append" | "replace";

export interface DistroSource {
  url: string;
  mode: DistroSourceMode;
}

export interface ManifestEntryPreview {
  flavor: string;
  name: string;
  friendlyName: string;
  default: boolean;
  hasAmd64: boolean;
  hasArm64: boolean;
}

export interface ManifestPreview {
  url: string;
  entries: ManifestEntryPreview[];
}

/**
 * Suggested community manifests surfaced as one-click "Add" entries.
 * Adding one still requires the user to confirm + grant UAC.
 */
export interface SuggestedSource {
  /** Stable id for telemetry/keys */
  id: string;
  /** Display label */
  label: string;
  /** Short description of what the manifest contains */
  description: string;
  /** Manifest URL */
  url: string;
}

export const SUGGESTED_SOURCES: SuggestedSource[] = [
  {
    id: "greengorych-wsl-configs",
    label: "greengorych/wsl-configs",
    description:
      "Community manifest with Rocky Linux 10.1, Ubuntu 25.04, 25.10, and 26.04 Snapshot.",
    url: "https://raw.githubusercontent.com/greengorych/wsl-configs/main/distributions/distributions.json",
  },
];
