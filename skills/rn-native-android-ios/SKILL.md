---
name: rn-native-android-ios
description: >-
  Native Android/iOS for bare React Native CLI and Expo prebuild projects:
  Gradle, Proguard, signing, flavors, Podfile, schemes, xcconfig, capabilities,
  privacy manifest, New Architecture, TurboModules, Hermes, upgrades. Use when
  editing android/ or ios/, fixing native builds, adding modules, or upgrading RN.
globs: "**/{android,ios}/**/*"
alwaysApply: false
---

# rn-native-android-ios

Applies to **React Native CLI** and **Expo prebuild** outputs. Cite **React Native docs**, **Android Gradle Plugin**, **Apple Human Interface / Xcode docs**, **Expo prebuild / CNG**, and **Hermes**.

## Golden rule (Expo CNG)

If the app is Expo-managed with Continuous Native Generation:

- **Do not hand-edit** generated `android/` or `ios/` for durable changes.
- Encode changes via **config plugins**, `expo-build-properties`, entitlements plugins, or a custom config plugin.
- Only maintain a long-lived native fork if the team explicitly owns bare workflow.

```text
✅ app.config.ts + plugins → prebuild
❌ “quick fix” in Podfile that nobody regenerates
```

## Android (`android/`)

### Gradle & SDK levels

- Set `minSdkVersion`, `targetSdkVersion`, `compileSdkVersion` in `android/build.gradle` or via **expo-build-properties**.
- Keep AGP / Kotlin / RN versions aligned with the RN release notes for your version.
- Prefer Version Catalogs / RN template structure; avoid duplicate `google()` repos chaos.

```gradle
// ✅ Good — single source of truth (example values; use RN template defaults)
ext {
  minSdkVersion = 24
  targetSdkVersion = 35
  compileSdkVersion = 35
}
```

### Product flavors

Use flavors for env (dev/staging/prod) with distinct `applicationIdSuffix` and resources.

```gradle
// ✅ Good
productFlavors {
  staging {
    dimension "env"
    applicationIdSuffix ".staging"
    resValue "string", "app_name", "MyApp Staging"
  }
  prod {
    dimension "env"
    // production applicationId
  }
}
```

Wire the same idea in Expo via different `android.package` per `APP_ENV` in `app.config.ts`.

### Signing

- Release: store keystore outside git; inject via CI secrets / `GRADLE_OPTS` / `signingConfigs`.
- Never commit `keystore.properties` with passwords.
- Cite **Android Studio — Sign your app**.

### Proguard / R8

- Enable for release; keep rules for RN, Hermes, and libraries (Reanimated, OkHttp, etc.).
- Test release builds; don’t only run debug.

```proguard
# Example keeps — follow each library’s RN docs
-keep class com.facebook.react.** { *; }
-keep class com.swmansion.reanimated.** { *; }
```

### Common Android pitfalls

- Missing `usesCleartextTraffic` only when debugging HTTP (prefer HTTPS).
- Notification / deep link intent-filters missing in `AndroidManifest.xml` (or config plugin).
- 16 KB page size / Play requirements—track current **Play Console** + RN release notes.

## iOS (`ios/`)

### Podfile

- Run `bundle exec pod install` from `ios/` (or `npx pod-install`).
- Pin CocoaPods via Gemfile when possible.
- Prefer RN / Expo template Podfile hooks; avoid random `post_install` hacks unless documented.

### Schemes, xcconfig, build configs

- Debug / Release (+ Staging) schemes with matching xcconfig.
- Set `PRODUCT_BUNDLE_IDENTIFIER` per configuration.
- Capabilities (Push, Associated Domains, Sign in with Apple) via Xcode **Signing & Capabilities** or Expo plugins—not one-off entitlements edits lost on clean prebuild.

### Signing

- Use automatic signing for small teams; CI often needs API key + match / EAS credentials.
- Cite **EAS Submit** / Apple **App Store Connect API**.

### Privacy manifest

- Ship `PrivacyInfo.xcprivacy` as required by Apple for APIs (cite **Apple — Privacy manifest files**).
- Expo modules often ship manifests; audit third-party SDKs on upgrade.

```xml
<!-- Conceptual — follow Apple’s schema -->
<key>NSPrivacyAccessedAPITypes</key>
```

### Permissions usage strings

Set `NSCameraUsageDescription`, etc., via `infoPlist` in app config or `Info.plist`. Missing strings → App Store rejection / crash on access.

## New Architecture (Fabric / TurboModules)

Cite **React Native — New Architecture**.

- Prefer enabling New Arch on current RN/Expo SDK when library support allows (`newArchEnabled`).
- Interop layer helps old modules; don’t assume every lib is Fabric-ready—check release notes.
- Write new native modules as **Turbo Modules** + codegen when targeting New Arch.

```ts
// ✅ Good — JS spec for codegen (illustrative)
export interface Spec extends TurboModule {
  multiply(a: number, b: number): number;
}
```

```objc
// ❌ Bad — forever-only legacy bridge module for greenfield features without migration plan
```

## Writing native modules

1. Prefer an existing Expo module or community package.
2. Else **Expo Modules API** (`expo-modules-core`) for cross-platform Swift/Kotlin modules—cite **Expo Modules API**.
3. Else RN TurboModule / Fabric component with codegen.
4. Keep a thin JS facade in `src/shared/lib` or a feature `services/`.

Never put business logic only in native if it can live in JS/TS for testability.

## Hermes

- Hermes is the default on modern RN/Expo—keep it on unless a vendor forces JSC.
- Debug Hermes bytecode / sourcemaps via Metro + appropriate symbolication.
- Cite **React Native — Hermes**.

## Upgrade strategy

1. Read RN / Expo SDK changelog + breaking changes.
2. Align Node, JDK, Xcode, Android SDK, CocoaPods.
3. Expo: bump SDK → `npx expo install --fix` → `expo-doctor` → clean prebuild → EAS build.
4. Bare: upgrade `react-native` via [Upgrade Helper](https://react-native-community.github.io/upgrade-helper/) → diff native templates carefully.
5. Upgrade one third-party native module at a time; keep a green binary between steps.
6. Smoke-test: cold start, deep link, push, IAP/auth, release build.

```bash
# ✅ Expo path
npx expo install expo@latest
npx expo install --fix
npx expo-doctor
eas build --profile development
```

## Never do this

```text
❌ Edit node_modules native code permanently
❌ Commit secrets into gradle / xcconfig
❌ Disable New Arch / Hermes “to make error go away” without root-causing
❌ Mix Expo CNG with long-lived undocumented Podfile patches
❌ Upgrade RN + all native SDKs in one unreviewable mega-PR
```

## Common mistakes

1. Hand-editing Expo-generated native projects without plugins.
2. Debug works, release crashes—skipped Proguard/R8 keep rules.
3. Wrong `minSdk` / deployment target vs library requirements.
4. Missing privacy manifest / usage description strings.
5. Push entitlements present in Xcode but not in provisioning profile.
6. Assuming TurboModule support without checking the library.
7. Checking in `Pods/` inconsistently with team policy (prefer lockfile + CI pods).
8. Using outdated Upgrade Helper target or skipping AndroidManifest merges.
9. Local JDK 11 vs 17 mismatch vs AGP requirements.
10. Ignoring official **React Native** / **Expo** upgrade docs in favor of random GitHub issues.
