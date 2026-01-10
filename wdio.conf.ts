import type { Options } from "@wdio/types";
import * as path from "path";
import * as fs from "fs";
import { fileURLToPath } from "url";
import { spawn, spawnSync, type ChildProcess } from "child_process";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Verbose mode - set VERBOSE=1 to see full debug output
const isVerbose = process.env.VERBOSE === "1";

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
  exclude: [],

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
    // Only show spec reporter (console test tree) in verbose mode
    ...(isVerbose ? ["spec" as const] : []),
    [
      "junit",
      {
        outputDir: "./test-results",
        outputFileFormat: function (options: { cid: string }) {
          return `e2e-results-${options.cid}.xml`;
        },
      },
    ],
  ],
  mochaOpts: {
    ui: "bdd",
    timeout: 60000,
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

    // Only forward tauri-driver output in verbose mode
    if (isVerbose) {
      tauriDriver.stdout?.on("data", (data) => {
        console.log(`[tauri-driver] ${data}`);
      });

      tauriDriver.stderr?.on("data", (data) => {
        console.error(`[tauri-driver] ${data}`);
      });
    }

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




