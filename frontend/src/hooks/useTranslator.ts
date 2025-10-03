import { useState, useEffect, useRef } from 'react';

type TranslationMode = 'manual' | 'auto';

export const useTranslator = () => {
  // State управление
  const [translationMode, setTranslationMode] = useState<TranslationMode>('manual');
  const [currentRole, setCurrentRole] = useState<'user' | 'steuerberater'>('user');
  const [currentMode, setCurrentMode] = useState<'text' | 'voice'>('text');
  const [inputText, setInputText] = useState('');
  const [originalText, setOriginalText] = useState('Введите текст или нажмите на микрофон...');
  const [translatedText, setTranslatedText] = useState('Перевод появится здесь...');
  const [isRecording, setIsRecording] = useState(false);
  const [status, setStatus] = useState('🟢 DashkaBot готов к работе');
  const [isTranslating, setIsTranslating] = useState(false);
  const [autoTranslate, setAutoTranslate] = useState(false);

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
    enableWebSocket: true,
    enableSpeech: true
  };

  // Initialize system
  useEffect(() => {
    initSystem();
    return () => cleanup();
  }, []);

  const initSystem = async () => {
    await checkAIServer();
    initWebSocket();
    initSpeechRecognition();
    setStatus('🟢 DashkaBot готов к работе');
  };

  const cleanup = () => {
    if (recognitionRef.current) recognitionRef.current.stop();
    if (websocketRef.current) websocketRef.current.close();
  };

  // AI Server Check
  const checkAIServer = async () => {
    try {
      const response = await fetch(`${config.aiServer}/health`);
      if (response.ok) {
        setConnectionStatus(prev => ({ ...prev, ai: true }));
      } else {
        throw new Error(`Server responded with ${response.status}`);
      }
    } catch (error) {
      setConnectionStatus(prev => ({ ...prev, ai: false }));
    }
  };

  // WebSocket initialization
  const initWebSocket = () => {
    if (!config.enableWebSocket) return;
    try {
      const ws = new WebSocket(config.wsServer);
      ws.onopen = () => setConnectionStatus(prev => ({ ...prev, ws: true }));
      ws.onclose = () => setConnectionStatus(prev => ({ ...prev, ws: false }));
      ws.onmessage = (event) => {
        const data = JSON.parse(event.data);
        handleWebSocketMessage(data);
      };
      ws.onerror = () => setConnectionStatus(prev => ({ ...prev, ws: false }));
      websocketRef.current = ws;
    } catch (error) {
      setConnectionStatus(prev => ({ ...prev, ws: false }));
    }
  };

  // Speech Recognition
  const initSpeechRecognition = () => {
    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
      setConnectionStatus(prev => ({ ...prev, speech: false }));
      return;
    }

    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    const recognition = new SpeechRecognition();

    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;
    
    // В auto режиме используем универсальный язык
    recognition.lang = translationMode === 'auto' ? 'ru-RU' : (currentRole === 'user' ? 'ru-RU' : 'fr-FR');

    recognition.onstart = () => {
      setConnectionStatus(prev => ({ ...prev, speech: true }));
      setStatus('🎤 Запись началась... Говорите сколько угодно времени');
    };

    recognition.onresult = (event: any) => {
      let finalTranscript = '';
      let interimTranscript = '';

      for (let i = 0; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          finalTranscript += transcript + ' ';
        } else {
          interimTranscript += transcript;
        }
      }

      const currentText = finalTranscript + interimTranscript;
      if (currentText.trim()) {
        setOriginalText(currentText);
        setStatus('🎤 Записываю... Нажмите ⏹️ когда закончите');
      }
    };

    recognition.onerror = (event: any) => {
      if (event.error === 'no-speech' || event.error === 'audio-capture') {
        setStatus('🔇 Не слышу речь... Продолжайте говорить');
        return;
      }
      setStatus(`❌ Ошибка: ${event.error}`);
      stopRecording();
    };

    recognition.onend = () => {
      if (isRecording) {
        try {
          recognition.start();
        } catch (err) {
          stopRecording();
        }
      }
    };

    recognitionRef.current = recognition;
    setConnectionStatus(prev => ({ ...prev, speech: true }));
  };

  // Auto language detection
  const detectLanguage = async (text: string): Promise<string> => {
    try {
      const response = await fetch(`${config.aiServer}/detect-language`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text })
      });

      if (!response.ok) {
        throw new Error('Language detection failed');
      }

      const result = await response.json();
      return result.detected_language || 'RU';
    } catch (error) {
      console.error('Language detection error:', error);
      return 'RU'; // Fallback
    }
  };

  // Speech synthesis - UNIVERSAL
  const speakTranslation = (text: string, language: string) => {
    if (!('speechSynthesis' in window)) return;

    speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    
    const languageMap: Record<string, string> = {
      'en': 'en-US',
      'ru': 'ru-RU',
      'de': 'de-DE',
      'pl': 'pl-PL',
      'fr': 'fr-FR',
      'es': 'es-ES',
      'cs': 'cs-CZ',
      'lt': 'lt-LT',
      'lv': 'lv-LV',
      'no': 'no-NO'
    };
    
    const langCode = language.toLowerCase();
    utterance.lang = languageMap[langCode] || 'en-US';
    
    const voices = speechSynthesis.getVoices();
    const selectedVoice = voices.find(voice => 
      voice.lang.toLowerCase().startsWith(langCode)
    );
    
    if (selectedVoice) {
      utterance.voice = selectedVoice;
    }
    
    utterance.pitch = 1.0;
    utterance.rate = 0.9;
    utterance.volume = 1.0;
    
    speechSynthesis.speak(utterance);
  };

  // Translation function with auto-detect
  const performTranslation = async (text: string) => {
    setIsTranslating(true);
    setOriginalText(text);
    setStatus('🔄 Перевожу...');

    try {
      let fromLang: string;
      let toLang: string;

      if (translationMode === 'auto') {
        // Auto-detect mode
        setStatus('🔍 Определяю язык...');
        const detectedLang = await detectLanguage(text);
        
        // Smart logic: RU → FR, everything else → RU
        if (detectedLang === 'RU') {
          fromLang = 'RU';
          toLang = 'FR';
          setStatus('🔄 Переводжу RU → FR...');
        } else {
          fromLang = detectedLang;
          toLang = 'RU';
          setStatus(`🔄 Перевожу ${detectedLang} → RU...`);
        }
      } else {
        // Manual mode
        fromLang = currentRole === 'user' ? 'RU' : 'FR';
        toLang = currentRole === 'user' ? 'FR' : 'RU';
      }

      const response = await fetch(`${config.aiServer}/translate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: text,
          source_language: fromLang,
          target_language: toLang
        })
      });

      if (!response.ok) {
        throw new Error(`AI Server error: ${response.status}`);
      }

      const result = await response.json();
      const translation = result.translated_text || '[Ошибка перевода]';

      setTranslatedText(translation);
      setStatus(`✅ Переведено! (${fromLang} → ${toLang})`);

      const targetLangCode = result.target_language || toLang.toLowerCase();
      speakTranslation(translation, targetLangCode);

      // WebSocket message
      if (websocketRef.current && websocketRef.current.readyState === WebSocket.OPEN) {
        const wsMessage = {
          type: 'translation',
          mode: translationMode,
          original: text,
          translation: translation,
          from: fromLang.toLowerCase(),
          to: toLang.toLowerCase(),
          timestamp: new Date().toISOString()
        };
        websocketRef.current.send(JSON.stringify(wsMessage));
      }

    } catch (error: any) {
      setStatus('❌ Ошибка перевода: ' + error.message);
      setTranslatedText('Ошибка: ' + error.message);
    } finally {
      setIsTranslating(false);
    }
  };

  // Recording controls
  const toggleRecording = () => {
    if (!recognitionRef.current) {
      setStatus('❌ Распознавание речи недоступно');
      return;
    }
    if (!isRecording) startRecording();
    else stopRecording();
  };

  const startRecording = () => {
    setIsRecording(true);
    
    const modeText = translationMode === 'auto' 
      ? '🤖 Auto-detect режим' 
      : `🎯 Manual режим (${currentRole === 'user' ? 'RU→FR' : 'FR→RU'})`;
    
    setStatus(`🎤 Слушаю... ${modeText}`);
    setOriginalText('Говорите сейчас... (нажмите ⏹️ когда закончите)');
    setTranslatedText('Перевод появится после остановки...');

    try {
      recognitionRef.current.start();
    } catch (error: any) {
      setStatus('❌ Не удалось начать запись');
      setIsRecording(false);
    }
  };

  const stopRecording = () => {
    setIsRecording(false);
    setStatus('⏸️ Остановлено. Обработка...');

    if (recognitionRef.current) recognitionRef.current.stop();

    setTimeout(() => {
      const recordedText = originalText;
      if (recordedText && recordedText !== 'Говорите сейчас... (нажмите ⏹️ когда закончите)' && recordedText.trim()) {
        setStatus('✅ Готово! Можете нажать "Перевести" или подождать автоперевод');
        setTimeout(() => {
          if (!isRecording && recordedText === originalText) {
            performTranslation(recordedText);
          }
        }, 3000);
      } else {
        setStatus('❌ Текст не записан. Попробуйте еще раз');
      }
    }, 1000);
  };

  // Text functions
  const translateText = async () => {
    const text = inputText.trim();
    if (!text) {
      setStatus('❌ Введите текст для перевода');
      return;
    }
    await performTranslation(text);
  };

  const translateCurrentText = async () => {
    const textFromInput = inputText.trim();
    const textFromOriginal = originalText;

    let text = '';
    if (currentMode === 'text' && textFromInput) {
      text = textFromInput;
    } else if (textFromOriginal && textFromOriginal !== 'Введите текст или нажмите на микрофон...') {
      text = textFromOriginal;
    }

    if (!text) {
      setStatus('❌ Нет текста для перевода');
      return;
    }

    await performTranslation(text);
  };

  const clearText = () => {
    setInputText('');
    setOriginalText('Введите текст или нажмите на микрофон...');
    setTranslatedText('Перевод появится здесь...');
    setStatus('🟢 DashkaBot готов к работе');
  };

  // Utility functions
  const pasteText = async () => {
    try {
      const text = await navigator.clipboard.readText();
      setInputText(text);
      setStatus('📋 Текст вставлен из буфера обмена');
    } catch (error) {
      setStatus('❌ Не удалось вставить текст');
    }
  };

  const copyResult = async () => {
    if (translatedText && translatedText !== 'Перевод появится здесь...') {
      try {
        await navigator.clipboard.writeText(translatedText);
        setStatus('📄 Перевод скопирован в буфер обмена');
      } catch (error) {
        setStatus('❌ Не удалось скопировать текст');
      }
    } else {
      setStatus('❌ Нет текста для копирования');
    }
  };

  const handleWebSocketMessage = (data: any) => {
    if (data.type === 'translation') {
      if (translationMode === 'auto' || data.role !== currentRole) {
        setOriginalText(`[${data.from}]: ${data.original}`);
        setTranslatedText(data.translation);
        setStatus(`📨 Получен перевод ${data.from} → ${data.to}`);
      }
    }
  };

  // Role switching (only for manual mode)
  const handleRoleChange = (role: 'user' | 'steuerberater') => {
    if (translationMode === 'manual') {
      setCurrentRole(role);
      const roleName = role === 'user' ? 'Russian Speaker 🇷🇺' : 'France Speaker 🇫🇷';
      setStatus('Роль: ' + roleName);

      if (recognitionRef.current) {
        recognitionRef.current.lang = role === 'user' ? 'ru-RU' : 'fr-FR';
      }
    }
  };

  // Toggle translation mode
  const toggleTranslationMode = () => {
    const newMode = translationMode === 'manual' ? 'auto' : 'manual';
    setTranslationMode(newMode);
    
    const modeText = newMode === 'auto' 
      ? '🤖 Auto-detect: система сама определит язык'
      : '🎯 Manual: выберите направление перевода';
    
    setStatus(modeText);
    
    // Reinit speech recognition with new mode
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      initSpeechRecognition();
    }
  };

  return {
    // State
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
    
    // Setters
    setCurrentMode,
    setInputText,
    setAutoTranslate,
    
    // Functions
    handleRoleChange,
    toggleRecording,
    translateText,
    translateCurrentText,
    clearText,
    pasteText,
    copyResult,
    performTranslation,
    toggleTranslationMode
  };
};