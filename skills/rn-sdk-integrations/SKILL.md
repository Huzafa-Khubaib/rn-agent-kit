---
name: rn-sdk-integrations
description: >-
  Integration checklists for Firebase, Sentry, RevenueCat, Stripe, Google/Apple
  Sign-In, deep links, permissions, secure storage, and maps—Expo vs bare native
  config and pitfalls. Use when adding or debugging third-party SDKs, auth, push,
  payments, analytics, or device permissions in React Native / Expo.
globs: "**/*.{ts,tsx,js,jsx,json}"
alwaysApply: false
---

# rn-sdk-integrations

Prefer **current stable** SDKs and official install guides: **Expo docs**, **React Native Firebase**, **Sentry React Native**, **RevenueCat**, **Stripe React Native**, **Google Sign-In**, **Apple**, **React Native Maps**. Always rebuild a **Dev Client / native binary** after adding native modules.

## Universal checklist (every SDK)

1. Read the library’s **Expo** install page if present; else bare RN guide.
2. `npx expo install <pkg>` (Expo) to keep SDK-aligned versions.
3. Add **config plugins** / native files; run prebuild or edit bare projects.
4. Add env keys via EAS secrets / CI—not committed `.env` with prod secrets.
5. Gate behind a thin `services/` wrapper + zod-validated config.
6. Verify **release** builds (Proguard, bitcode-less, privacy manifests).
7. Document required console setup (Firebase project, Stripe mode, etc.).

```ts
// ✅ Good — single integration boundary
export const analytics = {
  log(event: string, props?: Record<string, string | number | boolean>) {
    void firebaseAnalytics.logEvent(event, props);
  },
};

// ❌ Bad — call vendor SDK from 40 random screens
```

---

## Firebase (Analytics, Crashlytics, Push)

Cite **React Native Firebase** and/or **Expo Firebase** guides for your stack.

### Expo

- Prefer `@react-native-firebase/*` with config plugins **or** Expo’s documented Firebase path for your SDK—follow the current Expo + RNFirebase plugin docs.
- Place `google-services.json` / `GoogleService-Info.plist` per Expo RNFirebase plugin instructions (often `GOOGLE_SERVICES_JSON` path in app config).
- Push: `@react-native-firebase/messaging` + credentials in Firebase / Apple / Play.
- Rebuild native app; Expo Go is insufficient for RNFirebase.

### Bare

- Apply Google Services Gradle plugin; add pods; configure capabilities (Push).
- Upload dSYMs / Proguard mapping for Crashlytics.

### Pitfalls

- Mixing Expo Go with RNFirebase.
- Wrong `google-services` file per flavor/env.
- Forgetting APNs key in Firebase for iOS push.
- Logging PII to Analytics.

---

## Sentry

Cite **Sentry — React Native** / **Sentry Expo**.

### Expo

```bash
npx expo install @sentry/react-native
npx @sentry/wizard@latest -i reactNative
```

- Add plugin in `app.config.ts`; set DSN via env / `extra`.
- Enable source maps upload in EAS (Sentry Expo docs).

### Bare

- Run wizard; verify `sentry.properties` not leaking auth tokens in public forks (use CI secrets).

### Pitfalls

- No release/dist set → useless stack traces.
- Capturing `console` noise without scrubbing tokens.
- Missing native symbol upload for release crashes.

---

## RevenueCat

Cite **RevenueCat — React Native** / Expo.

### Expo & bare

```bash
npx expo install react-native-purchases
```

- Configure apps + products in RevenueCat + StoreKit / Play Console.
- Use sandbox Apple / license testers on Play.
- Expose entitlements via a `purchases` service; don’t scatter `Purchases.*` calls.

### Pitfalls

- Testing IAP in Expo Go (needs Dev Client).
- Bundle ID / applicationId mismatch with store apps.
- Not restoring purchases on new devices.
- Trusting client-only entitlement checks for gated backend content—verify server-side when needed.

---

## Stripe

Cite **Stripe — React Native SDK** and **PaymentSheet**.

### Expo

```bash
npx expo install @stripe/stripe-react-native
```

- Add config plugin; set merchant identifier for Apple Pay.
- **Never** ship secret keys; only publishable key on device. PaymentIntents from your backend.

```tsx
// ✅ Good
<StripeProvider publishableKey={env.stripePublishableKey}>
  <CheckoutScreen />
</StripeProvider>;

// ❌ Bad
fetch("https://api.stripe.com/v1/charges", { headers: { Authorization: `Bearer sk_live_...` } });
```

### Pitfalls

- Using Charges API from the client.
- Forgetting return URL / 3DS handling.
- Misconfigured Apple Pay merchant ID / Google Pay.

---

## Google Sign-In / Apple Sign-In

Cite **@react-native-google-signin/google-signin**, **expo-apple-authentication**, Apple HIG.

### Expo

```bash
npx expo install @react-native-google-signin/google-signin expo-apple-authentication
```

- Google: OAuth client IDs (iOS/Android/Web); plugin URL schemes / reversed client id.
- Apple: enable Sign in with Apple capability; use `expo-apple-authentication` on iOS; follow Android alternatives if needed.

### Pitfalls

- Wrong SHA-1 on Firebase/Google Cloud for Android.
- Missing URL scheme → Google redirect fails.
- Apple required if you offer other social login (App Store Guideline 4.8)—know the policy.
- Using web client ID incorrectly as iOS client ID.

---

## Deep links / universal links

Cite **Expo Linking**, **React Native Linking**, Apple **Associated Domains**, Android **App Links**.

### Checklist

- [ ] App scheme in `app.config.ts` (`scheme: "myapp"`).
- [ ] HTTPS AASA / `assetlinks.json` for universal / app links.
- [ ] Intent filters / associated domains via config plugin.
- [ ] Handle URL with Expo Router `useURL` / linking config.
- [ ] Test cold start + warm start.

```ts
// ✅ Good — validate params
const id = z.string().parse(params.id);

// ❌ Bad — trust deep link query blindly in SQL/API path
```

### Pitfalls

- Only testing custom scheme, not HTTPS links.
- TeamID / package mismatch in verification files.
- Expo Router path not matching link path.

---

## Permissions

Cite **expo-modules** permission libs (`expo-camera`, `expo-location`, …) and platform settings.

| Concern                       | Expo                                               | Bare                         |
| ----------------------------- | -------------------------------------------------- | ---------------------------- |
| Manifest / Info.plist strings | app config `plugins` + `infoPlist` / `permissions` | AndroidManifest / Info.plist |
| Runtime prompt                | library `requestPermissionAsync`                   | same                         |
| UX                            | explain before system dialog                       | same                         |

```ts
// ✅ Good
const { status } = await ImagePicker.requestCameraPermissionsAsync();
if (status !== "granted") return;

// ❌ Bad — open camera without checking; crash or silent failure
```

### Pitfalls

- Missing usage description → iOS crash.
- Requesting on launch without context → denials.
- Not handling “never ask again” on Android.

---

## Secure storage

Cite **expo-secure-store**, **react-native-keychain**.

```ts
import * as SecureStore from "expo-secure-store";

// ✅ Good — tokens
await SecureStore.setItemAsync("session", token, {
  keychainAccessible: SecureStore.WHEN_UNLOCKED,
});

// ❌ Bad — access tokens in AsyncStorage / MMKV without encryption needs assessment
```

### Pitfalls

- Storing large blobs in Keychain.
- Assuming SecureStore syncs across devices (it doesn’t like a backend).
- Logging secrets.

---

## Maps

Cite **react-native-maps** / Expo maps guide.

### Expo

```bash
npx expo install react-native-maps
```

- Provide Google Maps API keys (Android manifest / iOS as required); restrict keys by app + API.
- Apple Maps default on iOS unless Google provider configured.

### Pitfalls

- Unrestricted API keys in client (still restrict by bundle/package + API).
- Rendering hundreds of `Marker`s without clustering.
- Forgetting billing enabled on Google Cloud.

---

## Common mistakes (cross-cutting)

1. Adding a native SDK and expecting **Expo Go** to load it.
2. Skipping config plugins / privacy manifests / usage strings.
3. Secret keys in the JS bundle.
4. No env separation (dev keys in prod builds).
5. Not rebuilding after native changes.
6. Ignoring Proguard/R8 rules for the SDK.
7. Calling vendor APIs directly from UI components.
8. Missing release symbolication (Sentry/Crashlytics).
9. Deep links without validation.
10. Following outdated Medium posts instead of **current official docs**.
