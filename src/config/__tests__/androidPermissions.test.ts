import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("Android permissions configuration", () => {
  const rootDir = path.resolve(__dirname, "../../..");
  const appJsonPath = path.join(rootDir, "app.json");
  const manifestPath = path.join(rootDir, "android/app/src/main/AndroidManifest.xml");

  it("blocks SYSTEM_ALERT_WINDOW and storage permissions in app.json", () => {
    const appConfig = JSON.parse(fs.readFileSync(appJsonPath, "utf8"));
    const blocked = appConfig.expo.android.blockedPermissions;
    expect(blocked).toContain("android.permission.SYSTEM_ALERT_WINDOW");
    expect(blocked).toContain("android.permission.READ_EXTERNAL_STORAGE");
    expect(blocked).toContain("android.permission.WRITE_EXTERNAL_STORAGE");

    const permissions = appConfig.expo.android.permissions;
    expect(permissions).not.toContain("android.permission.SYSTEM_ALERT_WINDOW");
    expect(permissions).toContain("android.permission.RECORD_AUDIO");
    expect(permissions).toContain("android.permission.MODIFY_AUDIO_SETTINGS");
  });

  it("excludes SYSTEM_ALERT_WINDOW with tools:node='remove' in AndroidManifest.xml", () => {
    if (!fs.existsSync(manifestPath)) return;
    const manifest = fs.readFileSync(manifestPath, "utf8");

    // Matches any uses-permission for SYSTEM_ALERT_WINDOW
    const alertWindowRegex = /<uses-permission[^>]*android:name=["']android\.permission\.SYSTEM_ALERT_WINDOW["'][^>]*>/i;
    const match = manifest.match(alertWindowRegex);
    expect(match).not.toBeNull();
    expect(match![0]).toContain('tools:node="remove"');

    // Ensures RECORD_AUDIO is requested without removal
    const recordAudioRegex = /<uses-permission[^>]*android:name=["']android\.permission\.RECORD_AUDIO["'][^>]*>/i;
    const audioMatch = manifest.match(recordAudioRegex);
    expect(audioMatch).not.toBeNull();
    expect(audioMatch![0]).not.toContain('tools:node="remove"');
  });
});

