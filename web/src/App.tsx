import { useCallback, useEffect, useRef, useState } from 'react';
import { createWorker, type Worker, PSM } from 'tesseract.js';
import './App.css';

/**
 * Preprocess canvas for better OCR: grayscale + contrast stretch.
 * Helps with different fonts, lighting, and low-contrast text.
 */
function preprocessForOCR(source: HTMLCanvasElement): HTMLCanvasElement {
  const { width, height } = source;
  const out = document.createElement('canvas');
  out.width = width;
  out.height = height;
  const ctx = out.getContext('2d');
  const srcCtx = source.getContext('2d');
  if (!ctx || !srcCtx) return source;

  const srcData = srcCtx.getImageData(0, 0, width, height);
  const data = srcData.data;
  const gray: number[] = [];
  let min = 255;
  let max = 0;

  for (let i = 0; i < data.length; i += 4) {
    const g = Math.round(0.299 * data[i]! + 0.587 * data[i + 1]! + 0.114 * data[i + 2]!);
    gray.push(g);
    if (g < min) min = g;
    if (g > max) max = g;
  }

  const range = Math.max(max - min, 1);
  const outData = ctx.createImageData(width, height);
  for (let i = 0; i < gray.length; i++) {
    const v = Math.round(((gray[i]! - min) / range) * 255);
    outData.data[i * 4] = v;
    outData.data[i * 4 + 1] = v;
    outData.data[i * 4 + 2] = v;
    outData.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(outData, 0, 0);
  return out;
}

let tapAudioCtx: AudioContext | null = null;

function playTapFeedback() {
  if (typeof navigator !== 'undefined' && navigator.vibrate) {
    navigator.vibrate(10);
  }
  try {
    const Ctx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    if (!tapAudioCtx) {
      tapAudioCtx = new Ctx();
    }
    if (tapAudioCtx.state === 'suspended') {
      tapAudioCtx.resume().catch(() => {});
    }
    const osc = tapAudioCtx.createOscillator();
    const gain = tapAudioCtx.createGain();
    osc.connect(gain);
    gain.connect(tapAudioCtx.destination);
    osc.frequency.value = 880;
    osc.type = 'sine';
    gain.gain.setValueAtTime(0.15, tapAudioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, tapAudioCtx.currentTime + 0.08);
    osc.start(tapAudioCtx.currentTime);
    osc.stop(tapAudioCtx.currentTime + 0.08);
  } catch {
    // ignore
  }
}

export default function App() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const workerRef = useRef<Worker | null>(null);
  const workerPromiseRef = useRef<Promise<Worker> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [lastText, setLastText] = useState<string | null>(null);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);

  // Pre-load Tesseract worker once so "Read aloud" is fast (no create on every tap)
  useEffect(() => {
    if (workerPromiseRef.current) return;
    workerPromiseRef.current = (async () => {
      const worker = await createWorker('eng', 1, { logger: () => {} });
      await worker.setParameters({ tessedit_pageseg_mode: PSM.AUTO });
      workerRef.current = worker;
      return worker;
    })();
    return () => {
      workerRef.current?.terminate();
      workerRef.current = null;
      workerPromiseRef.current = null;
    };
  }, []);

  useEffect(() => {
    let stream: MediaStream | null = null;
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false,
        });
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
        setCameraReady(true);
        setError(null);
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Could not access camera';
        setError(msg);
      }
    })();
    return () => {
      if (stream) stream.getTracks().forEach((t) => t.stop());
    };
  }, []);

  const captureAndRead = useCallback(async () => {
    const video = videoRef.current;
    if (!video || !streamRef.current || isProcessing) return;

    playTapFeedback();
    setIsProcessing(true);
    setLastText(null);

    try {
      const canvas = document.createElement('canvas');
      const vw = video.videoWidth;
      const vh = video.videoHeight;
      const boxAspect = 280 / 160;
      const cropW = Math.min(vw * 0.5, vh * boxAspect);
      const cropH = cropW / boxAspect;
      const sx = (vw - cropW) / 2;
      const sy = (vh - cropH) / 2;
      const maxWidth = 800;
      const scale = cropW > maxWidth ? maxWidth / cropW : 1;
      canvas.width = Math.round(cropW * scale);
      canvas.height = Math.round(cropH * scale);
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Could not get canvas context');
      ctx.drawImage(video, sx, sy, cropW, cropH, 0, 0, canvas.width, canvas.height);

      const preprocessed = preprocessForOCR(canvas);
      const worker = workerRef.current ?? (await workerPromiseRef.current!);
      const { data } = await worker.recognize(preprocessed);

      const anyData = data as any;
      const avgConfidence: number = typeof anyData?.confidence === 'number' ? anyData.confidence : 0;
      const words: any[] = Array.isArray(anyData?.words) ? anyData.words : [];
      const strongWords = words
        .filter((w) => typeof w.text === 'string' && w.text.trim() && (w.confidence ?? 0) >= 70)
        .map((w) => w.text as string);

      const rawText = (data?.text || '').replace(/\s+/g, ' ').trim();
      const joinedStrong = strongWords.join(' ').replace(/\s+/g, ' ').trim();
      const bestText = joinedStrong.length >= 3 ? joinedStrong : rawText;

      if (!bestText || bestText.length < 3 || avgConfidence < 50) {
        setLastText('');
        alert(
          'No clear text found. Try moving closer, centering the text in the box, or improving the lighting.'
        );
        setIsProcessing(false);
        return;
      }

      setLastText(bestText);
      setIsSpeaking(true);

      window.speechSynthesis.cancel();
      if (typeof window.speechSynthesis.resume === 'function') {
        window.speechSynthesis.resume();
      }
      const utterance = new SpeechSynthesisUtterance(bestText);
      utterance.lang = 'en';
      utterance.volume = 1;
      utterance.rate = 1;
      utterance.onend = () => setIsSpeaking(false);
      utterance.onerror = () => setIsSpeaking(false);
      window.speechSynthesis.speak(utterance);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Something went wrong';
      setError(msg);
    } finally {
      setIsProcessing(false);
    }
  }, [isProcessing]);

  const stopSpeaking = useCallback(() => {
    window.speechSynthesis.cancel();
    setIsSpeaking(false);
  }, []);

  const speakLastText = useCallback(() => {
    if (!lastText) return;
    playTapFeedback();
    window.speechSynthesis.cancel();
    if (typeof window.speechSynthesis.resume === 'function') {
      window.speechSynthesis.resume();
    }
    const utterance = new SpeechSynthesisUtterance(lastText);
    utterance.lang = 'en';
    utterance.volume = 1;
    utterance.rate = 1;
    utterance.onend = () => setIsSpeaking(false);
    utterance.onerror = () => setIsSpeaking(false);
    window.speechSynthesis.speak(utterance);
    setIsSpeaking(true);
  }, [lastText]);

  if (error && !cameraReady) {
    return (
      <div className="app">
        <div className="card center">
          <h1>cmate</h1>
          <p className="message">{error}</p>
          <p className="hint">Allow camera access when prompted, or use HTTPS/localhost.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="app">
      <div className="cameraWrap">
        <video ref={videoRef} className="video" playsInline muted />
        <div className="overlay">
          <div className="focusFrame" />
          <p className="hint">Point at text, then tap Read aloud</p>
        </div>
      </div>

      <div className="controls">
        {lastText !== null && lastText.length > 0 && (
          <div className="preview">
            <p className="previewText">{lastText}</p>
            {!isSpeaking && (
              <button type="button" className="playAgain" onClick={speakLastText}>
                🔊 Play again
              </button>
            )}
          </div>
        )}

        <div className="buttons">
          {isSpeaking ? (
            <button type="button" className="btn btnStop" onClick={stopSpeaking}>
              Stop
            </button>
          ) : (
            <button
              type="button"
              className="btn btnPrimary"
              onClick={captureAndRead}
              disabled={isProcessing || !cameraReady}
            >
              {isProcessing ? 'Reading…' : 'Read aloud'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
