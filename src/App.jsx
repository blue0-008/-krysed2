import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  Send, UserIcon, Bot, BookOpen, Loader2, Volume2, VolumeX, FileText, Zap, Download, Trash2, Users, GraduationCap
} from 'lucide-react';
import { getGeminiChatSession } from './lib/gemini';
import { fetchCrisisBackground } from './lib/unsplash';
import ReactMarkdown from 'react-markdown';
import rehypeRaw from 'rehype-raw';
import { db } from './lib/firebase';
import { collection, addDoc, serverTimestamp, query, where, getDocs, limit } from 'firebase/firestore';

// ─── Smart Mock Mode Content ────────────────────────────────────────────────
// Logic moved to handleSend for dynamic response generation.
// ─────────────────────────────────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────────────────────

const INITIAL_MESSAGE = {
  id: '1',
  text: 'أهلاً! أنا كريزيد (Krysed)، خوك الكبير هنا باش نعاونك تفهم دروسك واخا فهاد الظروف الصعبة. شنو بغيتي نراجعو اليوم؟ 🛡️',
  sender: 'bot',
  timestamp: new Date(),
};

const VisualAids = ({ query }) => (
  <div className='my-4 rounded-xl overflow-hidden border-2 border-slate-700 max-w-sm mx-auto shadow-xl'>
    <img
      src={`https://loremflickr.com/400/225/${encodeURIComponent(query)}`}
      alt={query}
      className='w-full h-48 object-cover'
      onError={(e) => e.target.src = 'https://images.unsplash.com/photo-1451187580459-43490279c0fa?auto=format&fit=crop&q=80&w=800'}
    />
    <p className='text-[10px] text-slate-500 p-2 italic bg-slate-900/50'>📸 Visualizing: {query}</p>
  </div>
);

// ─── Crisis configuration ────────────────────────────────────────────────────
const CRISIS_TYPES = [
  {
    id: 'home',
    icon: '🏠',
    label: 'At Home',
    prompt: 'The student is studying from home, possibly under lockdown or unable to reach school.',
    unsplashKeyword: 'cozy home study lamp',
    gradient: 'linear-gradient(135deg, #064e3b 0%, #065f46 100%)',
    overlayColor: 'rgba(6, 78, 59, 0.4)',
    bannerColor: '#10b981',
    bannerBg: 'rgba(6, 78, 59, 0.6)',
    shadowColor: 'rgba(16, 185, 129, 0.4)', // Green
    tintClass: 'crisis-tint-home'
  },
  {
    id: 'disaster',
    icon: '🌊',
    label: 'Natural Disaster',
    prompt: 'The student is affected by a natural disaster (flood, earthquake, storm).',
    unsplashKeyword: 'flood disaster storm',
    gradient: 'linear-gradient(135deg, #134e4a 0%, #115e59 100%)',
    overlayColor: 'rgba(19, 78, 74, 0.4)',
    bannerColor: '#0d9488',
    bannerBg: 'rgba(19, 78, 74, 0.6)',
    shadowColor: 'rgba(59, 130, 246, 0.4)', // Blue
    tintClass: 'crisis-tint-disaster'
  },
  {
    id: 'health',
    icon: '😷',
    label: 'Health Crisis',
    prompt: 'The student is affected by a health crisis or epidemic.',
    unsplashKeyword: 'hospital health emergency',
    gradient: 'linear-gradient(135deg, #7f1d1d 0%, #991b1b 100%)',
    overlayColor: 'rgba(127, 29, 29, 0.4)',
    bannerColor: '#ef4444',
    bannerBg: 'rgba(127, 29, 29, 0.6)',
    shadowColor: 'rgba(239, 68, 68, 0.4)', // Red
    tintClass: 'crisis-tint-health'
  },
  {
    id: 'nopower',
    icon: '⚡',
    label: 'No Power',
    prompt: 'The student has no electricity or very limited power.',
    unsplashKeyword: 'candle dark room',
    gradient: 'linear-gradient(135deg, #78350f 0%, #92400e 100%)',
    overlayColor: 'rgba(120, 53, 15, 0.4)',
    bannerColor: '#f59e0b',
    bannerBg: 'rgba(120, 53, 15, 0.6)',
    shadowColor: 'rgba(245, 158, 11, 0.4)', // Amber
    tintClass: 'crisis-tint-nopower'
  },
];
// ─────────────────────────────────────────────────────────────────────────────

function App() {
  const [messages, setMessages] = useState([INITIAL_MESSAGE]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [activeCrisis, setActiveCrisis] = useState(null);
  const [isTtsEnabled, setIsTtsEnabled] = useState(false);
  const [isPaperMode, setIsPaperMode] = useState(false);
  const [isMockMode, setIsMockMode] = useState(false);
  const [appView, setAppView] = useState('student'); // 'student' or 'teacher'
  const [classroomCodeInput, setClassroomCodeInput] = useState('');
  const [activeLessonCode, setActiveLessonCode] = useState(null);
  const [teacherTopic, setTeacherTopic] = useState('');
  const [teacherGrade, setTeacherGrade] = useState('');
  const [generatedLessonCode, setGeneratedLessonCode] = useState(null);

  // Background image state (Unsplash)
  const [crisisBg, setCrisisBg] = useState(null);
  const [isBgLoading, setIsBgLoading] = useState(false);
  const [bgKey, setBgKey] = useState(0);

  const messagesEndRef = useRef(null);
  const chatSessionRef = useRef(null);

  // ─── Persistence ───────────────────────────────────────────────────────────
  useEffect(() => {
    const savedMsg = localStorage.getItem('krysed_messages');
    if (savedMsg) {
      try {
        const parsed = JSON.parse(savedMsg);
        // Convert ISO strings back to Date objects
        const withDates = parsed.map(m => ({
          ...m,
          timestamp: new Date(m.timestamp)
        }));
        setMessages(withDates);
      } catch (e) {
        console.error('Failed to load saved messages:', e);
      }
    }
  }, []);

  useEffect(() => {
    if (messages.length > 1 || (messages.length === 1 && messages[0].id !== '1')) {
      localStorage.setItem('krysed_messages', JSON.stringify(messages));
    }
  }, [messages]);

  // ─── Cloud Sync (Firebase) ────────────────────────────────────────────────
  const sessionIdRef = useRef(Math.random().toString(36).substring(7));

  const syncMessageToCloud = async (message) => {
    try {
      if (!import.meta.env.VITE_FIREBASE_API_KEY || import.meta.env.VITE_FIREBASE_API_KEY === 'YOUR_FIREBASE_API_KEY') {
        console.warn('Firebase sync skipped: Missing API Key');
        return;
      }
      await addDoc(collection(db, "krysed_chats"), {
        ...message,
        sessionId: sessionIdRef.current,
        cloudTimestamp: serverTimestamp(),
        crisisContext: activeCrisis || 'none'
      });
    } catch (e) {
      console.error('Error syncing to Firestore:', e);
    }
  };

  // ─── Teacher Mode Logic ───────────────────────────────────────────────────
  const handleCreateLesson = async () => {
    if (!teacherTopic || !teacherGrade) return;
    setIsLoading(true);
    
    try {
      const code = `KRY-${Math.floor(1000 + Math.random() * 9000)}`;
      let lessonContent = "";

      if (isMockMode) {
        await new Promise(r => setTimeout(r, 1500));
        lessonContent = `📖 **LESSON: ${teacherTopic} (${teacherGrade})**\n\nBienvenue dans cette leçon préparée par votre professeur. Aujourd'hui, nous explorons **${teacherTopic}**. \n\nImaginez un monde où ce concept change tout...\n\n💡 **KEY INSIGHT:** La connaissance est la base de la survie.\n🎯 **QUICK CHECK:** Qu'avez-vous appris de plus important ?`;
      } else {
        const prompt = `Role: Teacher. Structure a full lesson about "${teacherTopic}" for "${teacherGrade}". Use the Krysed format: 📖 LESSON, 🖼️ ANALOGY, 💡 KEY INSIGHT, 🎯 QUICK CHECK. Translate empathetic intro to Darija (Arabic script), rest in French.`;
        const result = await chatSessionRef.current.sendMessage(prompt);
        lessonContent = result.response.text();
      }

      const lessonData = {
        code,
        content: lessonContent,
        topic: teacherTopic,
        grade: teacherGrade,
        createdAt: serverTimestamp()
      };

      await addDoc(collection(db, "krysed_lessons"), lessonData);
      setGeneratedLessonCode(code);
      
      const teacherMsg = {
        id: Date.now().toString(),
        text: `✅ **Lesson Created!** Share this code with your students: **${code}**`,
        sender: 'bot',
        timestamp: new Date()
      };
      setMessages(prev => [...prev, teacherMsg]);
    } catch (e) {
      console.error("Failed to create lesson:", e);
    } finally {
      setIsLoading(false);
    }
  };

  // ─── Student Mode Logic ───────────────────────────────────────────────────
  const joinClassroom = async () => {
    const code = classroomCodeInput.trim().toUpperCase();
    if (!code) return;
    setIsLoading(true);

    try {
      let lessonFound = null;

      if (code === 'KRY-2026') {
        lessonFound = {
          content: `📖 **LESSON: Fractions (الأعداد الكسرية)**\n\nImagine cutting a **Harcha** into 4 pieces. If you eat one, you've taken **1/4**. \n\n🎯 **Check:** If we have 8 pieces and take 2, is that the same as 1/4? Think about it!\n\n(Note: This is a demo lesson for the challenge)`
        };
      } else {
        const q = query(collection(db, "krysed_lessons"), where("code", "==", code), limit(1));
        const querySnapshot = await getDocs(q);
        if (!querySnapshot.empty) {
          lessonFound = querySnapshot.docs[0].data();
        }
      }

      if (lessonFound) {
        const botMsg = {
          id: Date.now().toString(),
          text: `🔗 **Classroom Connected!** Loading your lesson...\n\n---\n\n${lessonFound.content}`,
          sender: 'bot',
          timestamp: new Date()
        };
        setMessages(prev => [...prev, botMsg]);
        setActiveLessonCode(code);
        speakText(botMsg.text);
      } else {
        setMessages(prev => [...prev, {
          id: Date.now().toString(),
          text: `❌ Code **${code}** not found. Please check with your teacher.`,
          sender: 'bot',
          timestamp: new Date()
        }]);
      }
    } catch (e) {
      console.error("Error joining classroom:", e);
    } finally {
      setIsLoading(false);
      setClassroomCodeInput('');
    }
  };

  const clearHistory = () => {
    setMessages([INITIAL_MESSAGE]);
    localStorage.removeItem('krysed_messages');
    sessionIdRef.current = Math.random().toString(36).substring(7); // New session for new start
  };
  // ─────────────────────────────────────────────────────────────────────────────

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    try {
      chatSessionRef.current = getGeminiChatSession();
    } catch (e) {
      console.error('Failed to initialize Gemini:', e);
    }
    return () => {
      if (window.speechSynthesis) window.speechSynthesis.cancel();
    };
  }, []);

  // ─── Fetch Unsplash background whenever crisis changes ─────────────────────
  useEffect(() => {
    if (!activeCrisis || isPaperMode) {
      setCrisisBg(null);
      return;
    }

    const crisis = CRISIS_TYPES.find((c) => c.id === activeCrisis);
    if (!crisis) return;

    let cancelled = false;
    (async () => {
      setIsBgLoading(true);
      const result = await fetchCrisisBackground(crisis.unsplashKeyword);
      if (!cancelled) {
        setCrisisBg(result);
        setBgKey((k) => k + 1);
        setIsBgLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [activeCrisis, isPaperMode]);
  // ─────────────────────────────────────────────────────────────────────────────

  // ─── Render bot message: parse [VISUAL: keyword] tags ───────────────────────
  const renderBotText = useCallback((text) => {
    const arabicCharCount = (text.match(/[\u0600-\u06FF]/g) || []).length;
    const isArabic = arabicCharCount > text.length * 0.1;

    return (
      <div className={`
        relative px-6 py-5 rounded-2xl bg-white/5 border-l-[3px] border-emerald-500 shadow-xl backdrop-blur-sm transition-all duration-300 group-hover:bg-white/10
        ${isArabic ? 'text-right text-2xl leading-relaxed font-arabic' : 'font-sans leading-relaxed text-[16px]'}
      `}>
        {/* Top-left Shield Avatar */}
        <div className="absolute -top-3 -left-3 bg-emerald-500 text-white rounded-lg p-1.5 shadow-lg flex items-center justify-center border border-white/20 z-20">
          <span className="text-sm">🛡️</span>
        </div>

        <ReactMarkdown
          rehypePlugins={[rehypeRaw]}
          components={{
            p: ({ node, ...props }) => <p className="mb-4 last:mb-0" {...props} />,
            img: ({ node, ...props }) => (
              <div className="my-6 rounded-2xl overflow-hidden border border-white/5 shadow-2xl">
                <img 
                  {...props} 
                  src={`https://loremflickr.com/600/337/${props.alt || 'lesson'}`}
                  className="w-full h-auto object-cover hover:scale-105 transition-transform duration-700" 
                  onError={(e) => { e.target.src = 'https://images.unsplash.com/photo-1451187580459-43490279c0fa?w=600'; }}
                />
              </div>
            ),
            strong: ({ node, ...props }) => <strong className="font-bold text-emerald-400" {...props} />,
            em: ({ node, ...props }) => <em className="italic text-text-muted/80" {...props} />
          }}
        >
          {text}
        </ReactMarkdown>
      </div>
    );
  }, []);
  // ─────────────────────────────────────────────────────────────────────────────

  const speakText = useCallback((text) => {
    if (!isTtsEnabled || !window.speechSynthesis) return;
    window.speechSynthesis.cancel();

        // Strip [VISUAL: ...] tags before speaking
        let cleanText = text.replace(/\[VISUAL:[^\]]+\]/gi, '').replace(/<[^>]*>?/gm, '');
        const boilerplateRegex =
        /(سلام أ خويا \/ أ ختي[،,] ما تخافش|سلام أ ختي[،,] ما تخافيش|سلام أ خويا[،,] ما تخافش|سلام أ خويا|سلام أ ختي|ما تخافش|ما تخافيش|نزيدو نشوفو هادشي|هنا معاك|سلام!?)/gi;
        cleanText = cleanText.replace(boilerplateRegex, '').trim();
        cleanText = cleanText.replace(/^[،,.\-:]+\s*/, '');

        const arabicCharCount = (cleanText.match(/[\u0600-\u06FF]/g) || []).length;
    const isArabic = arabicCharCount > cleanText.length * 0.1;
        const frenchRegex = /[éèêëàâîïôùûç]|(\b(le|la|les|un|une|des|et|est|sur|avec|pour|dans|qui|que)\b)/i;
        const isFrench = frenchRegex.test(cleanText);

        let targetLang = 'en-US';
        if (isArabic) targetLang = 'ar-SA';
        else if (isFrench) targetLang = 'fr-FR';

        const utterance = new SpeechSynthesisUtterance(cleanText);
        utterance.lang = targetLang;
        const voices = window.speechSynthesis.getVoices();
    if (voices.length > 0) {
      const voice = voices.find(
        (v) => v.lang.startsWith(targetLang) || v.lang.startsWith(targetLang.split('-')[0])
        );
        if (voice) utterance.voice = voice;
    }
        window.speechSynthesis.speak(utterance);
  }, [isTtsEnabled]);

  const downloadLesson = (text) => {
    const blob = new Blob([text], {type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `krysed-lesson-${Date.now()}.txt`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
  };

  const handleSend = async (e) => {
    e?.preventDefault();
    if (!input.trim() || isLoading) return;

    const userMsg = input.trim();
    setInput('');

    const newUserMessage = {
      id: Date.now().toString(),
      text: userMsg,
      sender: 'user',
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, newUserMessage]);
    syncMessageToCloud(newUserMessage);
    setIsLoading(true);

    try {
      if (isMockMode) {
        await new Promise((r) => setTimeout(r, 1000));
        let dynamicText = "";
        const userQuery = userMsg.toLowerCase();

        if (userQuery.includes('volcano') || userQuery.includes('géographie') || userQuery.includes('geography')) {
          dynamicText = `سلام أ خويا/أ ختي! هاد الدرس على البراكين (Les Volcans). 🌋\n\n📖 **LESSON:** Un volcan est une ouverture dans la croûte terrestre d'où s'échappent du magma. C'est comme une soupape de sécurité pour la Terre.\n\n🖼️ **IMAGE:** Understanding the core of our planet.\n![volcano](volcano)\n\n💡 **KEY INSIGHT:** Nature is powerful, but knowledge is your shield.\n🎯 **QUICK CHECK:** Qu'appelle-t-on la roche fondue qui sort du volcan ?`;
        } else if (userQuery.includes('math') || userQuery.includes('fraction') || userQuery.includes('calcul')) {
          dynamicText = `سلام أ خويا/أ ختي! خلينا نشوفو الأعداد الكسرية (Les Fractions). 🔢\n\n📖 **LESSON:** Une fraction représente une partie d'un tout — imagine partager un pain **Harcha** en morceaux égaux.\n\n🖼️ **IMAGE:** Visualizing math in daily life.\n![fractions](math)\n\n💡 **KEY INSIGHT:** Even if school is closed, we can still divide and conquer these numbers!\n🎯 **QUICK CHECK:** Si tu as 4 parts de gâteau et tu en manges 1, quelle est la fraction restante ?`;
        } else if (userQuery.includes('eau') || userQuery.includes('water') || userQuery.includes('cycle')) {
          dynamicText = `سلام أ خويا! تبارك الله عليك مهتم بالماء (Le Cycle de l'Eau). 💧\n\n📖 **LESSON:** L'eau sur Terre circule partout. Évaporation, Condensation, et Précipitations. C'est un cycle sans fin.\n\n🖼️ **IMAGE:** Nature's recycling system.\n![water lifecycle](water)\n\n💡 **KEY INSIGHT:** La nature se régénère toujours.\n🎯 **QUICK CHECK:** Comment appelle-t-on le passage de l'eau liquide à la vapeur ?`;
        } else if (userQuery.includes('plante') || userQuery.includes('photo') || userQuery.includes('nature')) {
          dynamicText = `سلام أ ختي! خوك هنا باش يشرح ليك كيفاش كتاكل النبتة (La Photosynthèse). 🌿\n\n📖 **LESSON:** Les plantes fabriquent leur propre nourriture en utilisant la lumière du soleil, l'eau et le CO2.\n\n🖼️ **IMAGE:** Life creating life through light.\n![leaf](photosynthesis)\n\n💡 **KEY INSIGHT:** Sans les plantes, il n'y aurait pas d'oxygène.\n🎯 **QUICK CHECK:** De quoi la plante a-t-elle besoin pour fabriquer son énergie ?`;
        } else if (userQuery.includes('force') || userQuery.includes('physique') || userQuery.includes('physics')) {
          dynamicText = `أهلاً! خلينا نكتشفو قوانين الحركة (Force et Mouvement). 🏎️\n\n📖 **LESSON:** Une force est une poussée (push) ou une traction (pull). La gravité est la force qui nous garde sur Terre.\n\n🖼️ **IMAGE:** Physics in action.\n![force](physics)\n\n💡 **KEY INSIGHT:** Comprendre la force, c'est comprendre le monde.\n🎯 **QUICK CHECK:** Qu'arrive-t-il à un objet si aucune force ne s'exerce sur lui ?`;
        } else {
          dynamicText = "سلام أ خويا/أ ختي! أنا معاك فهاد الظروف. I'm in Emergency Cache Mode. Ask me about **Math**, **Volcanoes**, **Water Cycle**, **Plants**, or **Physics**! \n\n(Local Cache Active 📶)";
        }

        const botMsg = { id: Date.now().toString(), text: dynamicText, sender: 'bot', timestamp: new Date() };
        setMessages((prev) => [...prev, botMsg]);
        syncMessageToCloud(botMsg);
        speakText(dynamicText);
        return;
      }

      if (!chatSessionRef.current) throw new Error('MISSING_KEY');

      let contextPrefix = '';
      if (activeCrisis === 'disaster') contextPrefix = `Context: Student is in a crisis zone. Keep lessons relevant.\n\n`;
      if (activeCrisis === 'nopower') contextPrefix = `Context: Student has limited battery. Keep responses short.\n\n`;

      const apiPrompt = contextPrefix ? `${contextPrefix}USER MESSAGE: ${userMsg}` : userMsg;
      const result = await chatSessionRef.current.sendMessage(apiPrompt);
      const responseText = result.response.text();

      const botMsg = { id: Date.now().toString(), text: responseText, sender: 'bot', timestamp: new Date() };
      setMessages((prev) => [...prev, botMsg]);
      syncMessageToCloud(botMsg);
      speakText(responseText);

    } catch (error) {
      console.error('Krysed Error:', error);
      const isQuota = error?.status === 429 || error?.message?.toLowerCase().includes('quota');
      
      if (isQuota) {
        setIsMockMode(true);
        const switchMsg = {
          id: Date.now().toString(),
          text: '⚡ API quota reached — switching to **Emergency Cache Mode** for uninterrupted learning.',
          sender: 'bot',
          timestamp: new Date(),
        };
        setMessages((prev) => [...prev, switchMsg]);
        syncMessageToCloud(switchMsg);
        return;
      }

      const errorText = error?.message === 'MISSING_KEY' 
        ? '⚠️ API key missing. Check your .env setup.' 
        : `Connection lost. Try asking again or check your Emergency Cache settings.`;
      
      setMessages(prev => [...prev, { id: Date.now().toString(), text: errorText, sender: 'bot', timestamp: new Date() }]);
    } finally {
      setIsLoading(false);
    }
  };

        // ─── Derived values ────────────────────────────────────────────────────────
        const activeCrisisData = activeCrisis
    ? CRISIS_TYPES.find((c) => c.id === activeCrisis)
        : null;
        // ─────────────────────────────────────────────────────────────────────────────

        // ─── Paper Mode: plain wrapper with no gradients/animations ───────────────
        if (isPaperMode) {
    return (
        <div className="flex flex-col h-screen bg-white text-gray-900 font-sans">
          {/* Paper Header */}
          <header className="flex items-center justify-between px-4 py-3 bg-gray-100 border-b border-gray-300">
            <div className="flex items-center gap-2">
              <BookOpen size={20} className="text-gray-700" />
              <div>
                <h1 className="font-bold text-base text-gray-900">Krysed</h1>
                <p className="text-xs text-gray-500">Emergency Education AI</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {/* Mock Mode badge */}
              {isMockMode && (
                <span className="flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-amber-100 text-amber-800 border border-amber-300">
                  <Zap size={10} /> DEMO
                  <button onClick={() => setIsMockMode(false)} className="ml-1 underline font-normal">Exit</button>
                </span>
              )}
              {/* Crisis selectors (text only, no glow) */}
              <div className="flex gap-1 border border-gray-300 rounded p-0.5">
                {CRISIS_TYPES.map((crisis) => (
                  <button
                    key={crisis.id}
                    onClick={() => setActiveCrisis(activeCrisis === crisis.id ? null : crisis.id)}
                    className={`px-2 py-1 text-xs rounded transition-colors ${activeCrisis === crisis.id
                      ? 'bg-gray-900 text-white font-semibold'
                      : 'text-gray-600 hover:bg-gray-200'
                      }`}
                    aria-pressed={activeCrisis === crisis.id}
                  >
                    {crisis.icon} <span className="hidden sm:inline">{crisis.label}</span>
                  </button>
                ))}
              </div>
              {/* Exit Paper Mode */}
              <button
                onClick={() => setIsPaperMode(false)}
                className="px-2 py-1 text-xs bg-gray-900 text-white rounded hover:bg-gray-700 transition-colors flex items-center gap-1"
                title="Exit Paper Mode"
              >
                <FileText size={12} /> Exit
              </button>
            </div>
          </header>

          {/* Crisis banner */}
          {activeCrisisData && (
            <div className="px-4 py-1.5 bg-gray-200 border-b border-gray-300 text-xs text-gray-700 flex items-center justify-between">
              <span>{activeCrisisData.icon} <strong>SITUATION AWARENESS:</strong> {activeCrisisData.prompt}</span>
              <button onClick={() => setActiveCrisis(null)} className="underline text-gray-500 hover:text-gray-800">Dismiss</button>
            </div>
          )}

          {/* Messages */}
          <main className="flex-1 overflow-y-auto p-4">
            <div className="max-w-2xl mx-auto space-y-4">
              {messages.map((message) => (
                <div key={message.id} className={`flex gap-2 ${message.sender === 'user' ? 'justify-end' : 'justify-start'}`}>
                  {message.sender === 'bot' && (
                    <div className="h-7 w-7 rounded-full border border-gray-400 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <Bot size={14} className="text-gray-600" />
                    </div>
                  )}
                  <div
                    className={`max-w-[85%] px-3 py-2 rounded text-sm leading-relaxed relative group ${message.sender === 'user'
                      ? 'bg-gray-900 text-white'
                      : 'bg-gray-100 border border-gray-300 text-gray-900'
                      }`}
                    style={{ wordBreak: 'break-word', whiteSpace: 'pre-wrap' }}
                  >
                    {message.sender === 'bot' ? (
                      <div style={{ whiteSpace: 'pre-wrap' }}>
                        {renderBotText(message.text)}
                      </div>
                    ) : message.text}

                    {message.sender === 'bot' && (
                      <button
                        onClick={() => downloadLesson(message.text)}
                        className="absolute -right-8 top-0 p-1 text-gray-400 hover:text-gray-900 opacity-0 group-hover:opacity-100 transition-opacity"
                        title="Save Lesson Offline"
                      >
                        <Download size={14} />
                      </button>
                    )}
                  </div>
                  {message.sender === 'user' && (
                    <div className="h-7 w-7 rounded-full border border-gray-400 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <UserIcon size={14} className="text-gray-600" />
                    </div>
                  )}
                </div>
              ))}
              {isLoading && (
                <div className="flex gap-2 justify-start">
                  <div className="h-7 w-7 rounded-full border border-gray-400 flex items-center justify-center flex-shrink-0">
                    <Bot size={14} className="text-gray-600" />
                  </div>
                  <div className="px-3 py-2 rounded bg-gray-100 border border-gray-300 text-gray-500 text-sm">Thinking…</div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>
          </main>

          {/* Paper Footer */}
          <footer className="p-3 bg-gray-100 border-t border-gray-300">
            <div className="max-w-2xl mx-auto">
              <form onSubmit={handleSend} className="flex gap-2">
                <textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
                  placeholder="Ask a question…"
                  className="flex-1 px-3 py-2 border border-gray-300 rounded text-sm resize-none min-h-[44px] max-h-28 focus:outline-none focus:ring-1 focus:ring-gray-500 text-gray-900 bg-white"
                  rows={1}
                />
                <button
                  type="submit"
                  disabled={!input.trim() || isLoading}
                  className="px-4 py-2 bg-gray-900 text-white rounded text-sm disabled:opacity-40 hover:bg-gray-700 transition-colors self-end"
                >
                  <Send size={16} />
                </button>
              </form>
              <p className="text-center mt-1 text-[10px] text-gray-400">Powered by Gemini 3 Flash Preview · Paper Mode enabled</p>
            </div>
          </footer>
        </div>
      );
    }

    // ─── Crisis Selection UI (Standard Mode) ──────────────────────────────────

    return (
      <div 
        className={`relative flex flex-col h-screen text-text-main font-sans overflow-hidden transition-all duration-500 ease-in-out ${activeCrisis === 'nopower' ? 'high-contrast-theme' : ''} ${activeCrisisData?.tintClass || ''}`}
        style={{
          boxShadow: activeCrisisData ? `inset 0 0 120px ${activeCrisisData.shadowColor}` : 'none'
        }}
      >
        
        {/* ── Background Layer ────────────────────────────────────────────────── */}
        {activeCrisisData && (
          <div className="crisis-bg-layer absolute inset-0 z-0 pointer-events-none" aria-hidden="true">
            <div 
              className="absolute inset-0 transition-all duration-1000"
              style={{
                background: activeCrisisData.gradient,
              }}
            />
            <div className="absolute inset-0" style={{ background: activeCrisisData.overlayColor }} />
          </div>
        )}

        <div className="relative z-10 flex flex-col h-full">
          {/* ── Header ────────────────────────────────────────────────────────── */}
          <header
            className="flex flex-col items-stretch px-6 py-4 transition-all duration-500 shadow-2xl"
            style={{ background: 'linear-gradient(135deg, #022c22 0%, #042f2e 100%)' }}
          >
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4 max-w-6xl mx-auto w-full">
              <div className="flex items-center gap-4 group cursor-default">
                <div className="flex items-center gap-3">
                  <span className="text-4xl">🛡️</span>
                  <div>
                    <h1 className="wordmark text-4xl text-white tracking-tighter uppercase leading-none">Krysed</h1>
                    <p className="text-[10px] font-black text-emerald-400/60 uppercase tracking-[0.3em] mt-1">Learning Never Stops</p>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-3 flex-wrap justify-center">
                <div className="flex bg-black/40 p-1 rounded-xl border border-white/5 backdrop-blur-sm">
                  <button
                    onClick={() => setAppView('student')}
                    className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${appView === 'student' ? 'bg-emerald-500 text-white shadow-lg' : 'text-text-muted hover:text-text-main hover:bg-white/5'}`}
                  >
                    <GraduationCap size={14} /> Student
                  </button>
                  <button
                    onClick={() => setAppView('teacher')}
                    className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${appView === 'teacher' ? 'bg-emerald-500 text-white shadow-lg' : 'text-text-muted hover:text-text-main hover:bg-white/5'}`}
                  >
                    <Users size={14} /> Teacher
                  </button>
                </div>
                {/* ── Status Badge ────────────────────────────────────────────── */}
                {isMockMode && (
                  <div className="status-badge-emergency-cache animate-pulse" title="Operating on emergency local cache">
                    <Zap size={10} fill="currentColor" /> Emergency Cache Mode
                  </div>
                )}

                {/* ── Crisis Selector ───────────────────────────────────────────── */}
                <div className="flex gap-1.5 bg-black/40 p-1 rounded-full border border-white/5 backdrop-blur-md">
                  {CRISIS_TYPES.map((crisis) => {
                    const isActive = activeCrisis === crisis.id;
                    return (
                      <button
                        key={crisis.id}
                        onClick={() => setActiveCrisis(isActive ? null : crisis.id)}
                        className={`
                          relative px-3 py-2 rounded-full text-sm transition-all duration-300
                          flex items-center gap-2 select-none group/btn
                          ${isActive ? 'font-bold text-white shadow-lg' : 'text-text-muted/40 hover:text-text-main'}
                        `}
                        style={
                          isActive
                            ? {
                                background: crisis.bannerBg,
                                boxShadow: `0 0 20px ${crisis.bannerColor}33`,
                                border: `1px solid ${crisis.bannerColor}66`,
                                color: 'white'
                              }
                            : { border: '1px solid transparent' }
                        }
                        onMouseEnter={(e) => {
                          if (!isActive) {
                             e.currentTarget.style.background = `${crisis.bannerColor}1a`; 
                             e.currentTarget.style.borderColor = `${crisis.bannerColor}33`;
                             e.currentTarget.style.color = crisis.bannerColor;
                          }
                        }}
                        onMouseLeave={(e) => {
                          if (!isActive) {
                             e.currentTarget.style.background = 'transparent';
                             e.currentTarget.style.borderColor = 'transparent';
                             e.currentTarget.style.color = '';
                          }
                        }}
                        title={`Toggle ${crisis.label}`}
                        aria-pressed={isActive}
                      >
                        <span className={`transition-transform duration-300 ${isActive ? 'scale-110' : 'scale-100 group-hover/btn:scale-110'}`}>
                          {crisis.icon}
                        </span>
                        <span className={`hidden lg:inline text-[10px] font-bold uppercase tracking-wider transition-opacity duration-300 ${isActive ? 'opacity-100' : 'opacity-0 group-hover/btn:opacity-100'}`}>
                          {crisis.label}
                        </span>
                      </button>
                    );
                  })}
                </div>

                {/* ── Paper Mode Toggle ─────────────────────────────────────────── */}
                <button
                  onClick={() => setIsPaperMode(true)}
                  className="p-2 rounded-lg transition-all border bg-bg-dark/70 text-text-muted border-border hover:bg-white/5 hover:text-text-main"
                  title="Paper Mode (low bandwidth — strips colors & animations)"
                >
                  <FileText size={18} />
                </button>

                {/* ── TTS Toggle ───────────────────────────────────────────────── */}
                <button
                  onClick={() => {
                    setIsTtsEnabled(!isTtsEnabled);
                    if (isTtsEnabled) window.speechSynthesis.cancel();
                  }}
                  className={`p-2 rounded-lg transition-all border ${isTtsEnabled
                    ? 'bg-primary/20 text-primary border-primary/30'
                    : 'bg-bg-dark/70 text-text-muted border-border hover:bg-white/5'
                    }`}
                  title={isTtsEnabled ? 'Disable Text-to-Speech' : 'Enable Text-to-Speech'}
                  aria-pressed={isTtsEnabled}
                >
                  {isTtsEnabled ? <Volume2 size={18} /> : <VolumeX size={18} />}
                </button>

                {/* ── Clear History ────────────────────────────────────────────── */}
                <button
                  onClick={clearHistory}
                  className="p-2 rounded-lg transition-all border bg-bg-dark/70 text-red-400 border-red-400/30 hover:bg-red-500/10 hover:border-red-400/50"
                  title="Clear all messages and history"
                >
                  <Trash2 size={18} />
                </button>
              </div>
            </div>
          </header>
            {/* ── /Header ──────────────────────────────────────────────────────── */}
            {/* ── Classroom Management UI ────────────────────────────────────────── */}
            <div className="bg-black/20 border-b border-white/5 px-4 py-3">
              <div className="max-w-4xl mx-auto">
                {appView === 'student' ? (
                  <div className="flex items-center gap-3">
                    <div className="relative flex-1 group">
                      <GraduationCap size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-primary opacity-60" />
                      <input 
                        type="text"
                        placeholder="Enter Classroom Code (e.g., KRY-2026)"
                        value={classroomCodeInput}
                        onChange={(e) => setClassroomCodeInput(e.target.value.toUpperCase())}
                        onKeyDown={(e) => e.key === 'Enter' && joinClassroom()}
                        className="w-full bg-bg-dark/50 border border-white/10 rounded-xl pl-10 pr-4 py-2.5 text-sm focus:outline-none focus:border-primary/50 transition-all placeholder:text-text-muted/40"
                      />
                    </div>
                    <button 
                      onClick={joinClassroom}
                      disabled={!classroomCodeInput || isLoading}
                      className="bg-primary text-white px-5 py-2.5 rounded-xl text-sm font-bold shadow-lg hover:bg-primary-hover active:scale-95 transition-all disabled:opacity-50 disabled:scale-100"
                    >
                      Join
                    </button>
                  </div>
                ) : (
                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                    <div className="flex-1 grid grid-cols-2 gap-2">
                       <input 
                        type="text"
                        placeholder="Lesson Topic (e.g., Physics)"
                        value={teacherTopic}
                        onChange={(e) => setTeacherTopic(e.target.value)}
                        className="bg-bg-dark/50 border border-white/10 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-primary/50 transition-all"
                      />
                       <input 
                        type="text"
                        placeholder="Grade Level (e.g., 9th Grade)"
                        value={teacherGrade}
                        onChange={(e) => setTeacherGrade(e.target.value)}
                        className="bg-bg-dark/50 border border-white/10 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-primary/50 transition-all"
                      />
                    </div>
                    <button 
                      onClick={handleCreateLesson}
                      disabled={!teacherTopic || !teacherGrade || isLoading}
                      className="bg-primary text-white px-5 py-2.5 rounded-xl text-sm font-bold shadow-lg hover:bg-primary-hover active:scale-95 transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:scale-100"
                    >
                      {isLoading ? <Loader2 size={16} className="animate-spin" /> : <FileText size={16} />}
                      Create Lesson
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* ── Emergency Cache Banner ────────────────────────────────────────── */}
            {isMockMode && (
              <div 
                className="bg-primary/10 border-b border-primary/20 px-4 py-2 flex items-center justify-center gap-2 backdrop-blur-md animate-in fade-in slide-in-from-top-2 duration-500"
              >
                <div className="bg-primary/20 p-1 rounded-full text-primary">
                  <Zap size={12} fill="currentColor" />
                </div>
                <p className="text-xs font-bold text-primary tracking-tight">
                  ⚡ Emergency Cache Active — Learning continues even without internet.
                </p>
              </div>
            )}

            {/* ── Crisis Active Banner ──────────────────────────────────────────── */}
            {activeCrisisData && (
              <div
                key={`banner-${activeCrisisData.id}`}
                className="crisis-banner flex items-center justify-between px-4 py-2 text-xs font-medium tracking-wide"
                style={{
                  background: activeCrisisData.bannerBg,
                  borderBottom: `1px solid ${activeCrisisData.bannerColor}44`,
                  color: activeCrisisData.bannerColor,
                  backdropFilter: 'blur(8px)',
                }}
              >
                <span className="flex items-center gap-2">
                  <span className="text-base">{activeCrisisData.icon}</span>
                  <span>
                    <strong>SITUATION AWARENESS:</strong>
                    {' '}{activeCrisisData.prompt}
                  </span>
                </span>
                <button
                  onClick={() => setActiveCrisis(null)}
                  className="ml-4 opacity-60 hover:opacity-100 transition-opacity text-xs underline underline-offset-2 shrink-0"
                >
                  Dismiss
                </button>
              </div>
            )}
            {/* ── /Crisis Active Banner ─────────────────────────────────────────── */}

            {/* ── Main Chat Area ────────────────────────────────────────────────── */}
            <main className="flex-1 overflow-y-auto w-full p-4 sm:p-8 space-y-8">
              <div className="max-w-4xl mx-auto space-y-8 flex flex-col">
                
                {/* Welcome Hero Screen */}
                {messages.length === 1 && (
                  <div className="flex-1 flex flex-col items-center justify-center min-h-[70vh] py-12 text-center space-y-12 animate-in fade-in zoom-in duration-1000">
                    <div className="relative">
                      <div className="w-56 h-56 bg-gradient-to-br from-emerald-400 to-teal-600 rounded-[3.5rem] flex items-center justify-center shadow-2xl krysed-mascot pulse-animation border-4 border-white/10">
                        <span className="text-8xl">🛡️</span>
                      </div>
                      <div className="absolute -top-4 -right-4 bg-amber-400 text-amber-950 font-black px-5 py-2.5 rounded-full text-base shadow-xl border-2 border-white animate-bounce">
                        أهلاً!
                      </div>
                    </div>
                    <div className="max-w-2xl px-6">
                      <h2 className="text-5xl font-black tracking-tight text-white mb-6 leading-tight">
                        Marhaba! I am Krysed, <br/>your crisis learning companion.
                      </h2>
                      <p className="text-xl text-emerald-100/60 font-medium leading-relaxed">
                        Premium education that keeps going, <br/>no matter what happens outside.
                      </p>
                    </div>
                  </div>
                )}

                {messages.map((message) => {
                  const arabicCharCount = (message.text.match(/[\u0600-\u06FF]/g) || []).length;
                  const isArabic = arabicCharCount > message.text.length * 0.1;

                  return (
                    <div
                      key={message.id}
                      className={`flex w-full mb-10 transition-all message-animate ${message.sender === 'user' ? 'justify-end' : 'justify-start'}`}
                    >
                      <div
                        className={`
                          w-fit max-w-[90%] sm:max-w-[85%] md:max-w-3xl lg:max-w-4xl relative group transition-all duration-500
                          ${message.sender === 'user'
                            ? 'bg-amber-500/10 border-r-[3px] border-amber-500 px-6 py-4 rounded-2xl shadow-lg backdrop-blur-[2px]'
                            : ''
                          }
                        `}
                      >
                        {message.sender === 'bot' ? (
                          <div className="min-w-[12rem]">
                            {renderBotText(message.text)}
                          </div>
                        ) : (
                          <div className={`
                            ${isArabic ? 'text-right text-2xl leading-relaxed font-arabic text-amber-100' : 'text-amber-100/90 leading-relaxed text-[16px]'}
                          `}>
                            {message.text}
                          </div>
                        )}

                        {message.sender === 'bot' && (
                          <button
                            onClick={() => downloadLesson(message.text)}
                            className="absolute -right-12 top-0 p-2.5 rounded-xl bg-white/10 border border-white/10 text-emerald-400 hover:bg-emerald-500 hover:text-white opacity-0 group-hover:opacity-100 transition-all shadow-xl backdrop-blur-md"
                            title="Save Lesson Offline"
                          >
                            <Download size={18} />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}

                {isLoading && (
                  <div className="flex w-full gap-3 justify-start">
                    <div className="flex-shrink-0 mt-1 h-8 w-8 rounded-full bg-primary/20 flex items-center justify-center text-primary border border-primary/30">
                      <Bot size={18} />
                    </div>
                    <div className="px-4 py-3 rounded-2xl rounded-tl-sm bg-bg-message/90 backdrop-blur-sm border border-border text-text-muted flex items-center gap-2">
                      <Loader2 size={16} className="animate-spin text-primary" />
                      <span className="text-[15px]">Thinking…</span>
                    </div>
                  </div>
                )}

                <div ref={messagesEndRef} />
              </div>
            </main>
            {/* ── /Main Chat Area ───────────────────────────────────────────────── */}

            {/* ── Footer / Input Area ───────────────────────────────────────────── */}
            <footer className="p-4 bg-bg-dark/80 backdrop-blur-md border-t border-border">
              <div className="max-w-3xl mx-auto">
                <form
                  onSubmit={handleSend}
                  className="flex items-end gap-2 bg-bg-surface/90 backdrop-blur-sm p-2 rounded-2xl border border-border shadow-sm focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/40 transition-all duration-300"
                >
                  <textarea
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        handleSend();
                      }
                    }}
                    placeholder="Ask a question…"
                    className="flex-1 max-h-32 min-h-[44px] bg-transparent border-none resize-none focus:outline-none focus:ring-0 px-3 py-3 text-text-main placeholder:text-text-muted text-[15px]"
                    rows={1}
                  />
                  <button
                    type="submit"
                    disabled={!input.trim() || isLoading}
                    className="mb-1 mr-1 p-3 rounded-xl bg-primary text-white disabled:opacity-50 disabled:cursor-not-allowed hover:bg-primary-hover active:scale-95 transition-all self-end flex-shrink-0"
                  >
                    <Send size={18} />
                  </button>
                </form>

                {/* Unsplash photo credit */}
                {crisisBg?.credit && (
                  <div className="flex items-center justify-center gap-1 mt-1.5 text-[10px] text-text-muted/60">
                    <span>
                      Photo by{' '}
                      <a
                        href={`${crisisBg.credit.link}?utm_source=krysed&utm_medium=referral`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="underline hover:text-text-muted transition-colors"
                      >
                        {crisisBg.credit.name}
                      </a>{' '}
                      on{' '}
                      <a
                        href="https://unsplash.com?utm_source=krysed&utm_medium=referral"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="underline hover:text-text-muted transition-colors"
                      >
                        Unsplash
                      </a>
                    </span>
                  </div>
                )}

                <div className="text-center mt-1 pb-1">
                  {isMockMode && (
                    <p className="text-[10px] text-primary font-bold tracking-tight mb-1 flex items-center justify-center gap-1.5 opacity-80">
                      📶 Emergency Cache Mode
                    </p>
                  )}
                  <p className="text-[11px] text-text-muted flex items-center justify-center gap-1">
                    Powered by Gemini 3 Flash Preview <Bot size={10} />
                  </p>
                </div>
              </div>
            </footer>
            {/* ── /Footer ──────────────────────────────────────────────────────── */}

          </div>
        </div>
      );
}

export default App;
