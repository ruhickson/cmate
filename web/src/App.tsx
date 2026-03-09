import { useCallback, useEffect, useRef, useState } from 'react';
import { createWorker } from 'tesseract.js';
import './App.css';

export default function App() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [lastText, setLastText] = useState<string | null>(null);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);

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

    setIsProcessing(true);
    setLastText(null);

    try {
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Could not get canvas context');
      ctx.drawImage(video, 0, 0);

      const worker = await createWorker('eng', 1, { logger: () => {} });
      const { data } = await worker.recognize(canvas);
      await worker.terminate();
      const trimmed = (data?.text || '').trim();
      if (!trimmed) {
        setLastText('');
        alert('No text found. Point the camera at printed or written text and try again.');
        setIsProcessing(false);
        return;
      }

      setLastText(trimmed);
      setIsSpeaking(true);

      const utterance = new SpeechSynthesisUtterance(trimmed);
      utterance.lang = 'en';
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
