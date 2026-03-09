# cmate

A mobile app that uses your phone’s camera to **read text aloud** from whatever you point at. Point at a sign, label, document, or book and tap **Read aloud** to capture and hear the text.

Built with **Expo (React Native)** using **Expo SDK 54**:

- **expo-camera** – live camera preview and capture  
- **expo-text-extractor** – on-device OCR (Google ML Kit on Android, Apple Vision on iOS) – **requires a development build**  
- **expo-speech** – text-to-speech

**Important:** Text recognition (OCR) uses a native module that **is not included in Expo Go**. You must install a **development build** on your device once (see below). In Expo Go the app will open but show a “Development build required” screen with instructions.

## Prerequisites

- **Node.js** 20.19+
- **iOS**: Mac with Xcode (for `npx expo run:ios`) or an [Expo](https://expo.dev) account (for EAS Build in the cloud)
- **Android**: Android Studio / SDK (for local run) or EAS Build

## First-time setup: development build (required for “Read aloud”)

OCR only works in a **development build** of the app, not in Expo Go. Build and install the app once, then use it like a normal app (it will connect to your dev server when you run `npx expo start`).

### Option A – Run on a connected iPhone (Mac with Xcode)

```bash
npm install
npx expo run:ios
```

This builds the app and installs it on your connected iPhone or simulator. After that, start the dev server with `npx expo start` and open the **cmate** app on your device (not Expo Go).

### Option B – Build in the cloud (no Mac needed for iOS)

```bash
npm install
npm install -g eas-cli
eas login
eas build --profile development --platform ios
```

When the build finishes, install the app from the link EAS gives you (e.g. TestFlight or direct download). Then run `npx expo start` on your computer and open the **cmate** app on your phone so it connects to your dev server.

(For Android: same flow with `--platform android` or `--platform all`.)

## Daily development

After you have the development build installed:

```bash
npx expo start
```

Open the **cmate** app on your phone (the one you built and installed), not Expo Go. The app will connect to the dev server and load your code. Point the camera at text and tap **Read aloud**.

## Usage

1. Allow camera access when prompted.
2. Point the camera at text (sign, document, label, etc.).
3. Tap **Read aloud** to capture the frame, run OCR, and hear the result.
4. Tap **Stop** to stop playback.

The white frame is a guide for where the app is reading from; the full image is sent to OCR.

## Building for production

To create a standalone app for the App Store or Play Store:

```bash
eas build --profile production --platform all
```

See `eas.json` for the `production` profile and [EAS Build](https://docs.expo.dev/build/introduction/) for publishing.

## Project structure

- `App.tsx` – main screen: camera, capture, OCR, and TTS (OCR loaded only in dev builds)
- `app.json` – Expo config and camera permission
- `eas.json` – EAS Build profiles (development, preview, production)
- `package.json` – dependencies and scripts

## License

Private / unlicensed. Use and modify as you like.
