import type { Options } from "@wdio/types";
import * as path from "path";
import * as fs from "fs";
import { fileURLToPath } from "url";
import { spawn, spawnSync, type ChildProcess } from "child_process";
import video from "wdio-video-reporter";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Verbose mode - set VERBOSE=1 to see full debug output
const isVerbose = process.env.VERBOSE === "1";

// Video recording mode - set RECORD_VIDEO=1 to enable video recording
const recordVideo = process.env.RECORD_VIDEO === "1";

// Store tauri-driver process reference
let tauriDriver: ChildProcess | null = null;

/**
 * Kill a process and all its children on Windows
 */
function killProcessTree(pid: number): void {
  if (process.platform === "win32") {
    // Use taskkill with /T flag to kill the process tree
    spawnSync("taskkill", ["/F", "/T", "/PID", pid.toString()], {
      stdio: "ignore",
    });
  } else {
    // On Unix, try to kill the process group
    try {
      process.kill(-pid, "SIGKILL");
    } catch {
      // Fallback to regular kill
      try {
        process.kill(pid, "SIGKILL");
      } catch {
        // Process may already be dead
      }
    }
  }
}

/**
 * Get the installed Microsoft Edge browser version from the Windows registry.
 * Returns the full version string (e.g., "145.0.3800.70") or null if not found.
 */
function getEdgeBrowserVersion(): string | null {
  if (process.platform !== "win32") return null;

  const result = spawnSync(
    "reg",
    [
      "query",
      "HKLM\\SOFTWARE\\WOW6432Node\\Microsoft\\EdgeUpdate\\Clients\\{56EB18F8-B008-4CBD-B6D2-8C97FE7E9062}",
      "/v",
      "pv",
    ],
    { encoding: "utf-8", stdio: ["ignore", "pipe", "pipe"] }
  );

  if (result.status !== 0) return null;

  const match = result.stdout.match(/pv\s+REG_SZ\s+(\S+)/);
  return match ? match[1] : null;
}

/**
 * Get the version of the local msedgedriver.exe.
 * Returns the full version string or null if not found/runnable.
 */
function getEdgeDriverVersion(driverPath: string): string | null {
  if (!fs.existsSync(driverPath)) return null;

  const result = spawnSync(driverPath, ["--version"], {
    encoding: "utf-8",
    stdio: ["ignore", "pipe", "pipe"],
  });

  if (result.status !== 0) return null;

  // Output is like "Microsoft Edge WebDriver 143.0.3774.0 (...)"
  const match = result.stdout.match(/(\d+\.\d+\.\d+\.\d+)/);
  return match ? match[1] : null;
}

/**
 * Ensure msedgedriver.exe matches the installed Edge browser version.
 * Downloads the correct version automatically if there's a mismatch.
 */
async function ensureEdgeDriver(): Promise<void> {
  if (process.platform !== "win32") return;

  const driverPath = path.join(__dirname, "msedgedriver.exe");
  const edgeVersion = getEdgeBrowserVersion();

  if (!edgeVersion) {
    console.warn(
      "Could not detect Edge browser version. Skipping driver version check."
    );
    return;
  }

  const driverVersion = getEdgeDriverVersion(driverPath);
  const edgeMajor = edgeVersion.split(".")[0];
  const driverMajor = driverVersion?.split(".")[0];

  if (driverVersion && edgeMajor === driverMajor) {
    if (isVerbose) {
      console.log(
        `Edge driver version ${driverVersion} matches browser ${edgeVersion}`
      );
    }
    return;
  }

  console.log(
    driverVersion
      ? `Edge driver ${driverVersion} does not match browser ${edgeVersion} — updating...`
      : `Edge driver not found — downloading for Edge ${edgeVersion}...`
  );

  const zipPath = path.join(__dirname, "msedgedriver.zip");
  const extractDir = path.join(__dirname, "msedgedriver-temp");
  const url = `https://msedgewebdriverstorage.blob.core.windows.net/edgewebdriver/${edgeVersion}/edgedriver_win64.zip`;

  // Download
  const downloadResult = spawnSync(
    "powershell",
    [
      "-Command",
      `Invoke-WebRequest -Uri '${url}' -OutFile '${zipPath}'`,
    ],
    { encoding: "utf-8", stdio: ["ignore", "pipe", "pipe"], timeout: 120000 }
  );

  if (downloadResult.status !== 0) {
    throw new Error(
      `Failed to download Edge WebDriver ${edgeVersion}.\n` +
        `URL: ${url}\n` +
        `Error: ${downloadResult.stderr}\n` +
        `Download it manually and place msedgedriver.exe in the project root.`
    );
  }

  // Extract
  const extractResult = spawnSync(
    "powershell",
    [
      "-Command",
      `Expand-Archive -Path '${zipPath}' -DestinationPath '${extractDir}' -Force`,
    ],
    { encoding: "utf-8", stdio: ["ignore", "pipe", "pipe"] }
  );

  if (extractResult.status !== 0) {
    throw new Error(
      `Failed to extract Edge WebDriver zip: ${extractResult.stderr}`
    );
  }

  // Replace old driver (kill lingering process first)
  spawnSync("taskkill", ["/F", "/IM", "msedgedriver.exe"], {
    stdio: "ignore",
  });

  const extractedExe = path.join(extractDir, "msedgedriver.exe");
  if (!fs.existsSync(extractedExe)) {
    throw new Error(
      `Expected msedgedriver.exe not found in extracted archive at ${extractDir}`
    );
  }

  fs.copyFileSync(extractedExe, driverPath);

  // Clean up
  fs.rmSync(extractDir, { recursive: true, force: true });
  fs.unlinkSync(zipPath);

  // Verify
  const newVersion = getEdgeDriverVersion(driverPath);
  console.log(`Edge WebDriver updated to ${newVersion}`);
}

/**
 * Find the Tauri application binary based on the current platform
 */
function findTauriBinary(): string {
  const targetDir = path.join(__dirname, "src-tauri", "target");
  // The binary name comes from Cargo.toml, not the product name
  const binaryName = "wsl-ui";
  const productName = "WSL UI";

  // Check for debug build first, then release (debug is more up-to-date during development)
  const buildTypes = ["debug", "release"];

  for (const buildType of buildTypes) {
    let binaryPath: string;

    if (process.platform === "win32") {
      binaryPath = path.join(targetDir, buildType, `${binaryName}.exe`);
    } else if (process.platform === "darwin") {
      binaryPath = path.join(
        targetDir,
        buildType,
        "bundle",
        "macos",
        `${productName}.app`,
        "Contents",
        "MacOS",
        productName
      );
    } else {
      // Linux
      binaryPath = path.join(targetDir, buildType, binaryName);
    }

    if (fs.existsSync(binaryPath)) {
      return binaryPath;
    }
  }

  throw new Error(
    `Could not find Tauri binary. Please build the app first with 'npm run tauri build' or 'npm run tauri build -- --debug'`
  );
}

export const config: Options.Testrunner = {
  //
  // ====================
  // Runner Configuration
  // ====================
  runner: "local",
  autoCompileOpts: {
    autoCompile: true,
    tsNodeOpts: {
      project: "./tsconfig.e2e.json",
      transpileOnly: true,
    },
  },

  //
  // ==================
  // Specify Test Files
  // ==================
  specs: ["./src/test/e2e/specs/**/*.spec.ts"],
  // Exclude screenshot and demo specs from normal test runs (run explicitly via npm scripts)
  // Use INCLUDE_ALL_SPECS=1 to override exclusions (used by demo/screenshot scripts)
  exclude: process.env.INCLUDE_ALL_SPECS === "1" ? [] : [
    "./src/test/e2e/specs/screenshots.spec.ts",
    "./src/test/e2e/specs/demo.spec.ts",
  ],

  //
  // ============
  // Capabilities
  // ============
  maxInstances: 1,
  capabilities: [
    {
      // Use tauri-driver which implements WebDriver protocol
      "tauri:options": {
        application: findTauriBinary(),
      },
      // Ensure sequential test execution
      maxInstances: 1,
    },
  ],

  //
  // ===================
  // Test Configurations
  // ===================
  logLevel: isVerbose ? "info" : "error",
  bail: 0,
  waitforTimeout: 10000,
  connectionRetryTimeout: 120000,
  connectionRetryCount: 3,

  // Use tauri-driver as the WebDriver server
  port: 4444,
  hostname: "localhost",

  //
  // Framework
  // =========
  framework: "mocha",
  reporters: [
    // Always include spec reporter - without it, tests hang due to output buffering issues
    "spec",
    [
      "junit",
      {
        outputDir: "./test-results",
        outputFileFormat: function (options: { cid: string }) {
          return `e2e-results-${options.cid}.xml`;
        },
      },
    ],
    // Video reporter - only enabled when RECORD_VIDEO=1
    ...(recordVideo
      ? [
          [
            video,
            {
              saveAllVideos: true,
              // Slow down video playback (1 = normal, 2 = half speed)
              videoSlowdownMultiplier: parseInt(process.env.VIDEO_SPEED || "1"),
              outputDir: "./docs/videos",
              videoRenderTimeout: 60000,
              // Preserve original resolution (default downscales to 1200px)
              videoScale: "-1:-1",
              // Use mp4 for better quality/compatibility
              videoFormat: "mp4",
              // Store temp screenshots in test-results (easier to gitignore/clean)
              rawPath: "./test-results/.video-screenshots",
            },
          ] as const,
        ]
      : []),
  ],
  mochaOpts: {
    ui: "bdd",
    // Extended timeout for demo video recording (5 minutes)
    timeout: process.env.RECORD_VIDEO === "1" ? 300000 : 60000,
  },

  //
  // =====
  // Hooks
  // =====
  /**
   * Gets executed once before all workers get launched.
   */
  onPrepare: async function () {
    // Kill any lingering processes from previous runs
    if (process.platform === "win32") {
      spawnSync("taskkill", ["/F", "/IM", "tauri-driver.exe"], {
        stdio: "ignore",
      });
      spawnSync("taskkill", ["/F", "/IM", "msedgedriver.exe"], {
        stdio: "ignore",
      });
    }

    // Ensure msedgedriver.exe matches the installed Edge browser version
    await ensureEdgeDriver();

    if (isVerbose) {
      console.log("Starting tauri-driver...");
    }

    // Path to msedgedriver in project directory
    const msedgedriverPath = path.join(__dirname, "msedgedriver.exe");

    // Spawn tauri-driver with native driver path
    const args = fs.existsSync(msedgedriverPath)
      ? ["--native-driver", msedgedriverPath]
      : [];

    // Pass WSL_MOCK=1 to enable mock mode in the Tauri app
    const env = { ...process.env, WSL_MOCK: "1" };

    tauriDriver = spawn("tauri-driver", args, {
      stdio: ["ignore", "pipe", "pipe"],
      shell: true,
      env,
    });

    // Always consume tauri-driver output to prevent pipe buffer from filling up and causing hangs
    // Only log to console in verbose mode
    tauriDriver.stdout?.on("data", (data) => {
      if (isVerbose) {
        console.log(`[tauri-driver] ${data}`);
      }
    });

    tauriDriver.stderr?.on("data", (data) => {
      if (isVerbose) {
        console.error(`[tauri-driver] ${data}`);
      }
    });

    // Wait for tauri-driver to be ready
    await new Promise((resolve) => setTimeout(resolve, 2000));
    if (isVerbose) {
      console.log("tauri-driver started");
    }
  },

  /**
   * Gets executed after all workers have shut down.
   */
  onComplete: async function () {
    if (isVerbose) {
      console.log("Stopping tauri-driver...");
    }
    if (tauriDriver && tauriDriver.pid) {
      killProcessTree(tauriDriver.pid);
      tauriDriver = null;
    }

    // Rename demo video to consistent filename
    if (recordVideo) {
      const videoDir = path.join(__dirname, "docs", "videos");
      const finalName = "wsl-ui-demo.mp4";

      // Wait for video rendering to complete (retry with delays)
      const maxRetries = 30;
      const retryDelay = 1000; // 1 second

      for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
          if (!fs.existsSync(videoDir)) {
            await new Promise(resolve => setTimeout(resolve, retryDelay));
            continue;
          }

          const files = fs.readdirSync(videoDir);
          // Find all wsl-ui video files and get the most recent one
          const videoFiles = files
            .filter(f => f.startsWith("wsl-ui") && f.endsWith(".mp4") && f !== finalName)
            .map(f => ({
              name: f,
              mtime: fs.statSync(path.join(videoDir, f)).mtime.getTime()
            }))
            .sort((a, b) => b.mtime - a.mtime);

          if (videoFiles.length === 0) {
            await new Promise(resolve => setTimeout(resolve, retryDelay));
            continue;
          }

          const latestVideo = videoFiles[0].name;
          const oldPath = path.join(videoDir, latestVideo);
          const newPath = path.join(videoDir, finalName);

          // Remove existing demo file if it exists
          if (fs.existsSync(newPath)) {
            fs.unlinkSync(newPath);
          }

          // Try to rename - will fail if file is locked
          fs.renameSync(oldPath, newPath);
          console.log(`\nDemo video saved: docs/videos/${finalName}\n`);

          // Clean up any other old wsl-ui video files
          for (let i = 1; i < videoFiles.length; i++) {
            const oldFile = path.join(videoDir, videoFiles[i].name);
            try {
              if (fs.existsSync(oldFile)) {
                fs.unlinkSync(oldFile);
              }
            } catch {
              // Ignore cleanup errors
            }
          }

          break; // Success - exit retry loop
        } catch (err) {
          if (attempt < maxRetries - 1) {
            console.log(`Waiting for video to finish rendering... (${attempt + 1}/${maxRetries})`);
            await new Promise(resolve => setTimeout(resolve, retryDelay));
          } else {
            console.error("Could not rename video file:", err);
          }
        }
      }
    }
  },

  /**
   * Gets executed before test execution begins.
   */
  before: async function () {
    // Wait for the app to be ready
    await browser.pause(2000);
  },

  /**
   * Hook that gets executed after the test
   */
  afterTest: async function (
    test: { title: string; parent: string },
    _context: unknown,
    result: { passed: boolean }
  ) {
    // Take screenshot on failure
    if (!result.passed) {
      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      const screenshotName = `${test.parent}-${test.title}-${timestamp}`.replace(/\s+/g, "_");
      const screenshotDir = path.join(__dirname, "test-results", "screenshots");

      if (!fs.existsSync(screenshotDir)) {
        fs.mkdirSync(screenshotDir, { recursive: true });
      }

      await browser.saveScreenshot(path.join(screenshotDir, `${screenshotName}.png`));
    }
  },
};




