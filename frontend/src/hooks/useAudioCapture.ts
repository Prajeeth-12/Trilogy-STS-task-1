import { useRef, useCallback, useState } from 'react';

export function useAudioCapture() {
  const [stream, setStream] = useState<MediaStream | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const startMic = useCallback(async () => {
    const s = await navigator.mediaDevices.getUserMedia({ audio: true });
    streamRef.current = s;
    setStream(s);
    return s;
  }, []);

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    setStream(null);
  }, []);

  return { stream, startMic, stop };
}
