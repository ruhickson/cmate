import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Speech from 'expo-speech';
import { useRef, useState, useEffect } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';

type TextExtractorModule = {
  isSupported: boolean;
  extractTextFromImage: (uri: string) => Promise<string[]>;
};

export default function App() {
  const [permission, requestPermission] = useCameraPermissions();
  const [isProcessing, setIsProcessing] = useState(false);
  const [lastText, setLastText] = useState<string | null>(null);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [ocrModule, setOcrModule] = useState<TextExtractorModule | null | 'loading'>('loading');
  const cameraRef = useRef<CameraView>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (Platform.OS === 'web') {
        if (!cancelled) setOcrModule(null);
        return;
      }
      try {
        const mod = await import('expo-text-extractor');
        const supported = mod.isSupported === true;
        if (!cancelled) {
          setOcrModule(supported ? mod as TextExtractorModule : null);
        }
      } catch {
        if (!cancelled) setOcrModule(null);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  if (!permission) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View style={styles.center}>
        <Text style={styles.message}>
          Camera access is needed to read text from what you point at.
        </Text>
        <TouchableOpacity style={styles.primaryButton} onPress={requestPermission}>
          <Text style={styles.primaryButtonText}>Allow camera</Text>
        </TouchableOpacity>
        <StatusBar style="dark" />
      </View>
    );
  }

  if (ocrModule === 'loading') {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#0a84ff" />
        <Text style={styles.message}>Checking text recognition…</Text>
        <StatusBar style="dark" />
      </View>
    );
  }

  if (ocrModule === null) {
    return (
      <View style={styles.devBuildScreen}>
        <Text style={styles.devBuildTitle}>Development build required</Text>
        <Text style={styles.devBuildText}>
          Text recognition (OCR) uses a native module that isn’t included in Expo Go. Build and install the app once to use “Read aloud” on this device.
        </Text>
        <Text style={styles.devBuildSub}>From the project folder:</Text>
        <View style={styles.codeBlock}>
          <Text style={styles.codeText}>npx expo run:ios</Text>
        </View>
        <Text style={styles.devBuildSub}>Or with EAS Build (no Mac needed):</Text>
        <View style={styles.codeBlock}>
          <Text style={styles.codeText}>npx eas build --profile development --platform ios</Text>
        </View>
        <Text style={styles.devBuildSub}>Then install the built app and run “npx expo start” again.</Text>
        <StatusBar style="dark" />
      </View>
    );
  }

  async function captureAndRead() {
    if (!cameraRef.current || !ocrModule) {
      return;
    }

    setIsProcessing(true);
    setLastText(null);

    try {
      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.9,
        skipProcessing: false,
      });

      if (!photo?.uri) {
        throw new Error('No image captured');
      }

      const lines = await ocrModule.extractTextFromImage(photo.uri);
      const text = (lines ?? []).filter(Boolean).join(' ').trim();

      if (!text) {
        setLastText('');
        Alert.alert(
          'No text found',
          'Point the camera at printed or written text and try again.'
        );
        setIsProcessing(false);
        return;
      }

      setLastText(text);
      setIsSpeaking(true);
      Speech.speak(text, {
        language: 'en',
        onDone: () => setIsSpeaking(false),
        onStopped: () => setIsSpeaking(false),
        onError: () => setIsSpeaking(false),
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Something went wrong';
      Alert.alert('Error', message);
    } finally {
      setIsProcessing(false);
    }
  }

  function stopSpeaking() {
    Speech.stop();
    setIsSpeaking(false);
  }

  return (
    <View style={styles.container}>
      <CameraView
        ref={cameraRef}
        style={styles.camera}
        facing="back"
      >
        {/* Focus area overlay */}
        <View style={styles.overlay}>
          <View style={styles.focusFrame} />
          <Text style={styles.hint}>Point at text, then tap Read aloud</Text>
        </View>
      </CameraView>

      <View style={styles.controls}>
        {lastText !== null && lastText.length > 0 && (
          <View style={styles.preview}>
            <Text style={styles.previewLabel} numberOfLines={2}>
              {lastText}
            </Text>
          </View>
        )}

        <View style={styles.buttons}>
          {isSpeaking ? (
            <TouchableOpacity style={styles.stopButton} onPress={stopSpeaking}>
              <Text style={styles.stopButtonText}>Stop</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={[styles.primaryButton, isProcessing && styles.buttonDisabled]}
              onPress={captureAndRead}
              disabled={isProcessing}
            >
              {isProcessing ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.primaryButtonText}>Read aloud</Text>
              )}
            </TouchableOpacity>
          )}
        </View>
      </View>

      <StatusBar style="light" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    backgroundColor: '#111',
  },
  camera: {
    flex: 1,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
  },
  focusFrame: {
    width: 280,
    height: 160,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.7)',
    borderRadius: 12,
    backgroundColor: 'transparent',
  },
  hint: {
    position: 'absolute',
    bottom: 120,
    color: 'rgba(255,255,255,0.9)',
    fontSize: 16,
    textAlign: 'center',
    paddingHorizontal: 24,
  },
  message: {
    color: '#eee',
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 24,
  },
  controls: {
    paddingHorizontal: 24,
    paddingTop: 16,
    paddingBottom: 40,
    backgroundColor: 'rgba(0,0,0,0.85)',
  },
  preview: {
    marginBottom: 16,
    paddingVertical: 10,
    paddingHorizontal: 14,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 10,
  },
  previewLabel: {
    color: 'rgba(255,255,255,0.9)',
    fontSize: 14,
  },
  buttons: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 12,
  },
  primaryButton: {
    flex: 1,
    backgroundColor: '#0a84ff',
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 52,
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  primaryButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
  devBuildScreen: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    backgroundColor: '#111',
  },
  devBuildTitle: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 12,
    textAlign: 'center',
  },
  devBuildText: {
    color: 'rgba(255,255,255,0.9)',
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 20,
    lineHeight: 24,
  },
  devBuildSub: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 14,
    marginBottom: 8,
    alignSelf: 'flex-start',
  },
  codeBlock: {
    backgroundColor: 'rgba(0,0,0,0.4)',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 10,
    marginBottom: 16,
    alignSelf: 'stretch',
  },
  codeText: {
    color: '#0a84ff',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    fontSize: 13,
  },
  stopButton: {
    flex: 1,
    backgroundColor: '#ff453a',
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 52,
  },
  stopButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
});
