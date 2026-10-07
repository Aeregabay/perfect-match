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
  plugins: {
    // Edge to edge (Android 15+): Capacitor provides --safe-area-inset-* CSS variables; see app.css.
    SystemBars: { insetsHandling: "css", initialViewportFitValueHint: "cover" },
  },
};

export default config;
