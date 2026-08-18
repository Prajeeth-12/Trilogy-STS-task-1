import { useRef, useState, useCallback } from 'react';

interface UseTabAudioOptions {
  onAudioChunk: (chunk: ArrayBuffer) => void;
  onVolume: (volume: number) => void;
}

export function useTabAudio() {
  const [isCapturing, setIsCapturing] = useState(false);
  const streamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const workletNodeRef = useRef<AudioWorkletNode | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animFrameRef = useRef<number | null>(null);

  const start = useCallback(async (options: UseTabAudioOptions) => {
    try {
      // Request tab audio capture
      const stream = await navigator.mediaDevices.getDisplayMedia({
        audio: true,
        video: false, // We only need audio
      });

      // Check if we actually got an audio track
      const audioTrack = stream.getAudioTracks()[0];
      if (!audioTrack) {
        // User might have shared screen without audio
        stream.getTracks().forEach(t => t.stop());
        throw new Error('No audio track captured. Make sure to check "Share tab audio" in the picker.');
      }

      // Stop any video tracks (we don't need them)
      stream.getVideoTracks().forEach(t => t.stop());

      streamRef.current = stream;

      // Create audio context
      const audioCtx = new AudioContext({ sampleRate: 48000 });
      audioCtxRef.current = audioCtx;

      // Load AudioWorklet
      await audioCtx.audioWorklet.addModule('/audio-processor.js');

      // Create nodes
      const source = audioCtx.createMediaStreamSource(new MediaStream([audioTrack]));
      const workletNode = new AudioWorkletNode(audioCtx, 'audio-chunk-processor');
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 512;

      // Connect: source → analyser → worklet
      source.connect(analyser);
      source.connect(workletNode);
      workletNode.connect(audioCtx.destination); // Required for processing

      workletNodeRef.current = workletNode;
      analyserRef.current = analyser;

      // Listen for audio chunks from worklet
      workletNode.port.onmessage = (event) => {
        if (event.data.type === 'audio_chunk') {
          options.onAudioChunk(event.data.data);
        }
      };

      // Volume metering
      const dataArray = new Uint8Array(analyser.frequencyBinCount);
      const meter = () => {
        analyser.getByteFrequencyData(dataArray);
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) sum += dataArray[i];
        const normalized = Math.min(1, sum / dataArray.length / 128);
        options.onVolume(normalized);
        animFrameRef.current = requestAnimationFrame(meter);
      };
      meter();

      // Handle track ending (user stops sharing)
      audioTrack.onended = () => {
        stop();
      };

      setIsCapturing(true);
    } catch (err) {
      console.error('Tab audio capture failed:', err);
      throw err;
    }
  }, []);

  const stop = useCallback(() => {
    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    workletNodeRef.current?.disconnect();
    audioCtxRef.current?.close();
    streamRef.current?.getTracks().forEach(t => t.stop());

    streamRef.current = null;
    audioCtxRef.current = null;
    workletNodeRef.current = null;
    analyserRef.current = null;
    setIsCapturing(false);
  }, []);

  return { isCapturing, start, stop };
}
