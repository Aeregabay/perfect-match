import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "app.perfectmatch.planner",
  appName: "Perfect Match",
  webDir: "dist",
  android: {
    allowMixedContent: false,
    captureInput: true,
    // Only test builds (PM_TEST_BUILD=1) can be inspected via chrome://inspect.
    webContentsDebuggingEnabled: process.env.PM_TEST_BUILD === "1",
  },
  server: { androidScheme: "https", cleartext: false },
};

export default config;
