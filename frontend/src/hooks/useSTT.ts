import { useRef, useState, useCallback } from 'react';

interface STTCallbacks {
  onInterim: (text: string) => void;
  onFinal: (text: string) => void;
}

export function useSTT() {
  const [isListening, setIsListening] = useState(false);
  const recognitionRef = useRef<any>(null);
  const callbacksRef = useRef<STTCallbacks | null>(null);
  const isListeningRef = useRef(false);

  const start = useCallback((lang: string, callbacks: STTCallbacks) => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) return;

    callbacksRef.current = callbacks;

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = lang;

    recognition.onresult = (event: any) => {
      let interim = '';
      let final = '';

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          final += transcript;
        } else {
          interim += transcript;
        }
      }

      if (final && callbacksRef.current) {
        callbacksRef.current.onFinal(final.trim());
      } else if (interim && callbacksRef.current) {
        callbacksRef.current.onInterim(interim.trim());
      }
    };

    recognition.onerror = (event: any) => {
      if (event.error === 'not-allowed') {
        setIsListening(false);
        isListeningRef.current = false;
      }
    };

    recognition.onend = () => {
      if (isListeningRef.current) {
        recognition.start();
      }
    };

    recognition.start();
    recognitionRef.current = recognition;
    setIsListening(true);
    isListeningRef.current = true;
  }, []);

  const stop = useCallback(() => {
    isListeningRef.current = false;
    setIsListening(false);
    recognitionRef.current?.stop();
    recognitionRef.current = null;
  }, []);

  const isSupported = !!(
    (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
  );

  return { isListening, start, stop, isSupported };
}
