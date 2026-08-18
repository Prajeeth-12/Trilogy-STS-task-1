import { useRef, useState, useCallback } from 'react';

interface SilenceOptions {
  threshold?: number;
  silenceDuration?: number;
  onSilence: () => void;
  onVolume: (volume: number) => void;
}

export function useSilenceDetector() {
  const [volume, setVolume] = useState(0);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const silenceStartRef = useRef<number | null>(null);
  const optionsRef = useRef<SilenceOptions | null>(null);

  const start = useCallback((stream: MediaStream, options: SilenceOptions) => {
    const threshold = options.threshold ?? 0.02;
    const silenceDuration = options.silenceDuration ?? 700;
    optionsRef.current = options;

    const audioCtx = new AudioContext();
    const source = audioCtx.createMediaStreamSource(stream);
    const analyser = audioCtx.createAnalyser();
    analyser.fftSize = 512;
    source.connect(analyser);

    audioCtxRef.current = audioCtx;
    analyserRef.current = analyser;

    const dataArray = new Uint8Array(analyser.frequencyBinCount);

    const analyze = () => {
      analyser.getByteFrequencyData(dataArray);
      let sum = 0;
      for (let i = 0; i < dataArray.length; i++) sum += dataArray[i];
      const normalized = Math.min(1, sum / dataArray.length / 128);

      setVolume(normalized);
      options.onVolume(normalized);

      if (normalized < threshold) {
        if (!silenceStartRef.current) {
          silenceStartRef.current = Date.now();
        } else if (Date.now() - silenceStartRef.current >= silenceDuration) {
          options.onSilence();
          silenceStartRef.current = Date.now();
        }
      } else {
        silenceStartRef.current = null;
      }

      animFrameRef.current = requestAnimationFrame(analyze);
    };

    analyze();
  }, []);

  const stop = useCallback(() => {
    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    audioCtxRef.current?.close();
    audioCtxRef.current = null;
    analyserRef.current = null;
    silenceStartRef.current = null;
    setVolume(0);
  }, []);

  return { volume, start, stop };
}
