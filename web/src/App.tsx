import { useCallback, useEffect, useRef, useState } from 'react';
import { createWorker, Worker } from 'tesseract.js';
import './App.css';

function playTapFeedback() {
  if (typeof navigator !== 'undefined' && navigator.vibrate) {
    navigator.vibrate(10);
  }
  try {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = 880;
    osc.type = 'sine';
    gain.gain.setValueAtTime(0.15, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.08);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.08);
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
      const maxWidth = 800;
      const scale = video.videoWidth > maxWidth ? maxWidth / video.videoWidth : 1;
      canvas.width = Math.round(video.videoWidth * scale);
      canvas.height = Math.round(video.videoHeight * scale);
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Could not get canvas context');
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

      const worker = workerRef.current ?? (await workerPromiseRef.current!);
      const { data } = await worker.recognize(canvas);
      const trimmed = (data?.text || '').trim();
      if (!trimmed) {
        setLastText('');
        alert('No text found. Point the camera at printed or written text and try again.');
        setIsProcessing(false);
        return;
      }

      setLastText(trimmed);
      setIsSpeaking(true);

      window.speechSynthesis.cancel();
      if (typeof window.speechSynthesis.resume === 'function') {
        window.speechSynthesis.resume();
      }
      const utterance = new SpeechSynthesisUtterance(trimmed);
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
