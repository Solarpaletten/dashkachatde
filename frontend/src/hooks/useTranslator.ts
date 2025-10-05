import { useState, useEffect, useRef } from 'react';

type TranslationMode = 'manual' | 'auto';

export const useTranslator = () => {
  // State management
  const [translationMode, setTranslationMode] = useState<TranslationMode>('auto');
  const [currentRole, setCurrentRole] = useState<'user' | 'steuerberater'>('user');
  const [currentMode, setCurrentMode] = useState<'text' | 'voice'>('text');
  const [inputText, setInputText] = useState('');
  const [originalText, setOriginalText] = useState('');
  const [translatedText, setTranslatedText] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [status, setStatus] = useState('🟢 Ready');
  const [isTranslating, setIsTranslating] = useState(false);
  const [autoTranslate, setAutoTranslate] = useState(false);
  const [recognitionLang, setRecognitionLang] = useState<string>('ru-RU');

  // Connection status
  const [connectionStatus, setConnectionStatus] = useState({
    ai: false,
    ws: false,
    speech: false
  });

  // Refs
  const recognitionRef = useRef<any>(null);
  const websocketRef = useRef<WebSocket | null>(null);

  // API Configuration
  const config = {
    aiServer: import.meta.env.VITE_API_URL || "http://localhost:8080",
    wsServer: import.meta.env.VITE_WS_URL || "ws://localhost:8080/ws",
  };

  // Initialize system
  useEffect(() => {
    initSystem();
    return () => cleanup();
  }, []);

  // Auto-translate after recording stops
  useEffect(() => {
    if (!isRecording && originalText.trim() && translationMode === 'auto') {
      performTranslation(originalText);
    }
  }, [isRecording]);

  useEffect(() => {
    if (recognitionRef.current) {
      recognitionRef.current.lang = recognitionLang;
    }
  }, [recognitionLang]);

  const initSystem = async () => {
    await checkAIServer();
    initWebSocket();
    initSpeechRecognition();
    setStatus('🟢 DashkaBot ready');
  };

  const cleanup = () => {
    if (recognitionRef.current) recognitionRef.current.stop();
    if (websocketRef.current) websocketRef.current.close();
  };

  const checkAIServer = async () => {
    try {
      const response = await fetch(`${config.aiServer}/health`);
      setConnectionStatus(prev => ({ ...prev, ai: response.ok }));
    } catch {
      setConnectionStatus(prev => ({ ...prev, ai: false }));
    }
  };

  const initWebSocket = () => {
    try {
      const ws = new WebSocket(config.wsServer);
      ws.onopen = () => setConnectionStatus(prev => ({ ...prev, ws: true }));
      ws.onclose = () => setConnectionStatus(prev => ({ ...prev, ws: false }));
      ws.onerror = () => setConnectionStatus(prev => ({ ...prev, ws: false }));
      websocketRef.current = ws;
    } catch {
      setConnectionStatus(prev => ({ ...prev, ws: false }));
    }
  };

  const initSpeechRecognition = () => {
    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
      setConnectionStatus(prev => ({ ...prev, speech: false }));
      return;
    }

    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    const recognition = new SpeechRecognition();

    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = recognitionLang;

    recognition.onstart = () => {
      setConnectionStatus(prev => ({ ...prev, speech: true }));
      setStatus('🎤 Recording...');
    };

    recognition.onresult = (event: any) => {
      let transcript = '';
      for (let i = 0; i < event.results.length; i++) {
        transcript += event.results[i][0].transcript;
      }
      if (transcript.trim()) {
        setOriginalText(transcript);
      }
    };

    recognition.onerror = (event: any) => {
      if (event.error !== 'no-speech' && event.error !== 'audio-capture') {
        setStatus(`❌ Error: ${event.error}`);
      }
    };

    recognition.onend = () => {
      if (isRecording) {
        try {
          recognition.start();
        } catch (err) {
          setIsRecording(false);
        }
      }
    };

    recognitionRef.current = recognition;
    setConnectionStatus(prev => ({ ...prev, speech: true }));
  };

  const detectLanguage = async (text: string): Promise<string> => {
    try {
      const response = await fetch(`${config.aiServer}/detect-language`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text })
      });
      const result = await response.json();
      return result.detected_language || 'RU';
    } catch {
      return 'RU';
    }
  };

  const performTranslation = async (text: string) => {
    if (!text.trim()) return;

    setIsTranslating(true);
    setStatus('🔄 Translating...');

    try {
      let fromLang: string;
      let toLang: string;

      if (translationMode === 'auto') {
        const detected = await detectLanguage(text);
        setRecognitionLang(detected === 'RU' ? 'ru-RU' : 'fr-FR');

        if (detected === 'RU') {
          fromLang = 'RU';
          toLang = 'FR';
        } else {
          fromLang = detected;
          toLang = 'RU';
        }
      } else {
        fromLang = currentRole === 'user' ? 'RU' : 'FR';
        toLang = currentRole === 'user' ? 'FR' : 'RU';
      }

      const response = await fetch(`${config.aiServer}/translate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text,
          source_language: fromLang,
          target_language: toLang
        })
      });

      const result = await response.json();
      const translation = result.translated_text || '';

      setTranslatedText(translation);
      setStatus(`✅ Done (${fromLang} → ${toLang})`);

      // Озвучка перевода
      const targetLangCode = toLang.toLowerCase();
      if ('speechSynthesis' in window && translation) {
        const utterance = new SpeechSynthesisUtterance(translation);
        utterance.lang = targetLangCode === 'ru' ? 'ru-RU' : 'fr-FR';
        utterance.rate = 0.9;

        const speakNow = () => {
          const voices = speechSynthesis.getVoices();
          const voice = voices.find(v => v.lang.startsWith(targetLangCode));
          if (voice) utterance.voice = voice;
          speechSynthesis.speak(utterance);
        };

        if (speechSynthesis.getVoices().length === 0) {
          speechSynthesis.addEventListener('voiceschanged', speakNow, { once: true });
        } else {
          speakNow();
        }
      }

    } catch (error: any) {
      setStatus('❌ Translation error');
      setTranslatedText('Error: ' + error.message);
    } finally {
      setIsTranslating(false);
    }
  };

  const toggleRecording = () => {
    if (!recognitionRef.current) {
      setStatus('❌ Speech recognition unavailable');
      return;
    }
    if (!isRecording) {
      setIsRecording(true);
      setStatus('🎤 Listening...');
      try {
        recognitionRef.current.start();
      } catch {
        setIsRecording(false);
      }
    } else {
      setIsRecording(false);
      setStatus('⏸️ Stopped');
      if (recognitionRef.current) recognitionRef.current.stop();
    }
  };

  const toggleTranslationMode = () => {
    const newMode = translationMode === 'manual' ? 'auto' : 'manual';
    setTranslationMode(newMode);
    setStatus(newMode === 'auto' ? '🤖 Auto mode' : '🎯 Manual mode');

    // ✅ Переключаем язык микрофона
    const newLang = newMode === 'manual'
      ? (currentRole === 'user' ? 'ru-RU' : 'fr-FR')
      : 'ru-RU';

    setRecognitionLang(newLang);

    if (recognitionRef.current) {
      recognitionRef.current.lang = newLang;
      recognitionRef.current.stop();
    }

    initSpeechRecognition();
  };


  const handleRoleChange = (role: 'user' | 'steuerberater') => {
    if (translationMode === 'manual') {
      setCurrentRole(role);
      if (recognitionRef.current) {
        recognitionRef.current.lang = role === 'user' ? 'ru-RU' : 'fr-FR';
      }
    }
  };

  const translateText = async () => {
    if (inputText.trim()) {
      await performTranslation(inputText.trim());
    }
  };

  const clearText = () => {
    setInputText('');
    setOriginalText('');
    setTranslatedText('');
    setStatus('🟢 Ready');
  };

  const pasteText = async () => {
    try {
      const text = await navigator.clipboard.readText();
      setInputText(text);
    } catch { }
  };

  const copyResult = async () => {
    if (translatedText) {
      try {
        await navigator.clipboard.writeText(translatedText);
        setStatus('📄 Copied');
      } catch { }
    }
  };

  return {
    translationMode,
    currentRole,
    currentMode,
    inputText,
    originalText,
    translatedText,
    isRecording,
    status,
    isTranslating,
    autoTranslate,
    connectionStatus,
    setCurrentMode,
    setInputText,
    setAutoTranslate,
    handleRoleChange,
    toggleRecording,
    translateText,
    clearText,
    pasteText,
    copyResult,
    performTranslation,
    toggleTranslationMode,
    recognitionLang,
    setRecognitionLang
  };
};