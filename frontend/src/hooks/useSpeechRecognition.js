import { useCallback, useEffect, useRef, useState } from 'react';

const SpeechRecognitionAPI =
  typeof window !== 'undefined'
    ? window.SpeechRecognition || window.webkitSpeechRecognition
    : null;

export const SPEECH_RECOGNITION_SUPPORTED = Boolean(SpeechRecognitionAPI);

export function useSpeechRecognition(onResult) {
  const [listening, setListening] = useState(false);
  const [error, setError] = useState(null);
  const recognitionRef = useRef(null);

  useEffect(() => {
    if (!SPEECH_RECOGNITION_SUPPORTED) return;

    const recognition = new SpeechRecognitionAPI();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = 'en-IN';

    recognition.onresult = (event) => {
      const transcript = Array.from(event.results)
        .map((r) => r[0]?.transcript || '')
        .join(' ')
        .trim();
      if (transcript) onResult(transcript);
    };

    recognition.onerror = (event) => {
      const messages = {
        'not-allowed': 'Microphone access was denied. Check your browser permissions.',
        'no-speech': "Didn't catch that — try again.",
        'audio-capture': 'No microphone found.',
        network: 'Speech recognition needs an internet connection.',
      };
      setError(messages[event.error] || 'Voice input failed. You can type instead.');
      setListening(false);
    };

    recognition.onend = () => setListening(false);

    recognitionRef.current = recognition;
    return () => recognition.abort();
  }, [onResult]);

  const start = useCallback(() => {
    if (!recognitionRef.current || listening) return;
    setError(null);
    try {
      recognitionRef.current.start();
      setListening(true);
    } catch (e) {
      /* start() throws if already running - safe to ignore */
    }
  }, [listening]);

  const stop = useCallback(() => {
    recognitionRef.current?.stop();
  }, []);

  return { listening, error, start, stop, supported: SPEECH_RECOGNITION_SUPPORTED };
}
