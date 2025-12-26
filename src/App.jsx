import React, { useState, useEffect, useRef, useMemo } from 'react';
import { 
  BookOpen, MessageSquare, Languages, FileUp, Link as LinkIcon, 
  Trash2, Send, Loader2, User, Clock, Cloud, CloudOff, Check, 
  LogOut, LogIn, Info, X, Layers, AlertCircle, Sun, Moon, Library,
  RefreshCw, Sparkles, BrainCircuit, Quote, Wand2
} from 'lucide-react';

// Firebase Imports
import { initializeApp, getApps, getApp } from 'firebase/app';
import { 
  getAuth, signInAnonymously, signInWithCustomToken, signInWithPopup, GoogleAuthProvider, 
  onAuthStateChanged, signOut 
} from 'firebase/auth';
import { 
  getFirestore, doc, setDoc, getDoc, collection, onSnapshot, addDoc, deleteDoc, query 
} from 'firebase/firestore';

/**
 * --- ENVIRONMENT CONFIGURATION ---
 * We use the platform-provided global variables to avoid build-time errors 
 * with import.meta.
 */

// --- ENVIRONMENT CONFIGURATION (Vite .env) ---
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

const appId = String(import.meta.env.VITE_APP_ID || 'novel-quest-v1').replace(/[^a-zA-Z0-9]/g, '_');
const apiKey = import.meta.env.VITE_GEMINI_API_KEY || "";

// Initialize Firebase services outside of the component
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
const auth = getAuth(app);
const db = getFirestore(app);

const WORDS_PER_PAGE = 275;

const LANGUAGES = [
  { code: 'en', name: 'English' },
  { code: 'hi', name: 'Hindi' },
  { code: 'mr', name: 'Marathi' },
  { code: 'es', name: 'Spanish' },
  { code: 'ja', name: 'Japanese' },
  { code: 'fr', name: 'French' },
  { code: 'de', name: 'German' },
  { code: 'zh', name: 'Chinese' },
];

export default function App() {
  const [user, setUser] = useState(null);
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const [isSigningIn, setIsSigningIn] = useState(false);
  
  // --- PERSISTENT STATES ---
  const [text, setText] = useState(() => localStorage.getItem('nq_text') || "");
  const [currentDocId, setCurrentDocId] = useState(() => localStorage.getItem('nq_doc_id') || null);
  const [currentDocName, setCurrentDocName] = useState(() => localStorage.getItem('nq_doc_name') || "Untitled Manuscript");
  const [currentPage, setCurrentPage] = useState(() => Number(localStorage.getItem('nq_page')) || 0);
  const [theme, setTheme] = useState(() => localStorage.getItem('nq_theme') || 'light');
  const [chatHistory, setChatHistory] = useState(() => {
    try {
      const saved = localStorage.getItem('nq_chat');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  // UI States
  const [activeTab, setActiveTab] = useState('library');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [userInput, setUserInput] = useState("");
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [sources, setSources] = useState([]); 
  const [notification, setNotification] = useState(null);
  const [insightResult, setInsightResult] = useState("");
  const [insightType, setInsightType] = useState(null);
  const [isPdfReady, setIsPdfReady] = useState(false);
  const [selectedLang, setSelectedLang] = useState('hi');
  
  const isInitialLoad = useRef(true);

  // --- THEME ENGINE ---
  useEffect(() => {
    const root = window.document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
      root.style.backgroundColor = "#09090b";
    } else {
      root.classList.remove('dark');
      root.style.backgroundColor = "#fafafa";
    }
    localStorage.setItem('nq_theme', theme);
  }, [theme]);

  // --- PERSISTENCE SYNC ---
  useEffect(() => {
    localStorage.setItem('nq_text', text);
    localStorage.setItem('nq_doc_id', currentDocId || "");
    localStorage.setItem('nq_doc_name', currentDocName);
    localStorage.setItem('nq_chat', JSON.stringify(chatHistory));
    localStorage.setItem('nq_page', currentPage.toString());
  }, [text, currentDocId, currentDocName, chatHistory, currentPage]);

  // --- PDF ENGINE LOADER ---
  useEffect(() => {
    if (window.pdfjsLib) {
      setIsPdfReady(true);
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.4.120/pdf.min.js';
    script.onload = () => {
      window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.4.120/pdf.worker.min.js';
      setIsPdfReady(true);
    };
    document.head.appendChild(script);
  }, []);

  // --- AUTH INITIALIZATION ---
  useEffect(() => {
    const initAuth = async () => {
      try {
        if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
          await signInWithCustomToken(auth, __initial_auth_token);
        } else {
          await signInAnonymously(auth);
        }
      } catch (err) {
        console.error("Authentication Error:", err);
      }
    };
    initAuth();

    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setIsAuthLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // --- FIRESTORE SYNC ---
  useEffect(() => {
    if (!user) return;
    const sourcesRef = collection(db, 'artifacts', appId, 'users', user.uid, 'sources');
    const unsubscribe = onSnapshot(sourcesRef, 
      (snap) => {
        const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        setSources(docs.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0)));
      },
      (error) => {
        console.error("Firestore sync error:", error);
      }
    );
    return () => unsubscribe();
  }, [user]);

  // --- READING ENGINE ---
  const pages = useMemo(() => {
    const words = text.split(/\s+/).filter(Boolean);
    const res = [];
    for (let i = 0; i < words.length; i += WORDS_PER_PAGE) {
      res.push(words.slice(i, i + WORDS_PER_PAGE).join(" "));
    }
    return res.length > 0 ? res : ["No manuscript loaded. Use the Library to upload a PDF or start writing."];
  }, [text]);

  const readProgress = useMemo(() => {
    if (pages.length <= 1 || !text) return 0;
    return Math.round(((currentPage + 1) / pages.length) * 100);
  }, [currentPage, pages.length, text]);

  // Progress Tracking via Intersection Observer
  useEffect(() => {
    const observer = new IntersectionObserver((entries) => {
      if (isInitialLoad.current) return;
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          const idx = parseInt(entry.target.getAttribute('data-page-index') || "0");
          if (!isNaN(idx)) setCurrentPage(idx);
        }
      });
    }, { threshold: 0.5 });

    document.querySelectorAll('[data-page-index]').forEach(el => observer.observe(el));
    return () => observer.disconnect();
  }, [pages]);

  // Restore Last Visited Page
  useEffect(() => {
    if (pages.length > 0 && isInitialLoad.current) {
      const savedPage = Number(localStorage.getItem('nq_page')) || 0;
      const safePage = Math.min(savedPage, pages.length - 1);
      setTimeout(() => {
        scrollToPage(safePage);
        isInitialLoad.current = false;
      }, 800);
    }
  }, [pages]);

  // --- AI ENGINE ---
  const callAi = async (prompt, systemPrompt = "You are a literary assistant.", isTranslation = false) => {
    setIsAiLoading(true);
    
    const fetchContent = async (retryCount = 0) => {
      try {
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${apiKey}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: `Current Context (Page ${currentPage + 1}):\n${pages[currentPage]}\n\nQuery: ${prompt}` }] }],
            systemInstruction: { parts: [{ text: systemPrompt }] }
          })
        });

        if (!response.ok) {
          if ((response.status === 429 || response.status >= 500) && retryCount < 5) {
            const delay = Math.pow(2, retryCount) * 1000;
            await new Promise(resolve => setTimeout(resolve, delay));
            return fetchContent(retryCount + 1);
          }
          throw new Error('AI API request failed');
        }

        const result = await response.json();
        return result.candidates?.[0]?.content?.parts?.[0]?.text || "No response generated.";
      } catch (err) {
        if (retryCount < 5) {
          const delay = Math.pow(2, retryCount) * 1000;
          await new Promise(resolve => setTimeout(resolve, delay));
          return fetchContent(retryCount + 1);
        }
        throw err;
      }
    };

    try {
      return await fetchContent();
    } catch (err) {
      notify("AI analysis failed. Please check your connection.", "error");
      return "AI connection failed.";
    } finally {
      setIsAiLoading(false);
    }
  };

  // --- UI HANDLERS ---
  const scrollToPage = (index) => {
    const el = document.getElementById(`page-${index}`);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    if (window.innerWidth < 768) setIsSidebarOpen(false);
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file || !user || !isPdfReady) return notify("PDF engine not ready or not signed in", "error");
    setIsAiLoading(true);
    try {
      const buf = await file.arrayBuffer();
      const pdf = await window.pdfjsLib.getDocument({ data: buf }).promise;
      let fullText = "";
      for (let i = 1; i <= Math.min(pdf.numPages, 100); i++) {
        const page = await pdf.getPage(i);
        const content = await page.getTextContent();
        fullText += content.items.map(item => item.str).join(' ') + '\n';
      }
      const docRef = await addDoc(collection(db, 'artifacts', appId, 'users', user.uid, 'sources'), {
        name: file.name, content: fullText, date: new Date().toLocaleDateString(), timestamp: Date.now()
      });
      setText(fullText); setCurrentDocName(file.name); setCurrentDocId(docRef.id); setCurrentPage(0);
      notify("Imported Successfully!", "success");
    } catch (err) { 
      console.error("PDF upload error:", err);
      notify("PDF processing failed", "error"); 
    }
    finally { setIsAiLoading(false); }
  };

  const handleInsight = async (type) => {
    if (!user) return notify("Sign in for insights", "error");
    setInsightType(type);
    let p = ""; let s = "You are a literary analyst.";
    if (type === 'summary') p = "Summarize the key events on this page concisely.";
    if (type === 'characters') p = "Identify characters on this page and their current motivations.";
    if (type === 'weaver') p = "Suggest 3 creative plot directions based on the current scene.";
    const res = await callAi(p, s);
    setInsightResult(res);
  };

  const notify = (msg, type = 'info') => {
    setNotification({ text: msg, type });
    setTimeout(() => setNotification(null), 4000);
  };

  const handleChat = async () => {
    if (!userInput.trim() || isAiLoading || !text.trim() || !user) return;
    const q = userInput; setUserInput("");
    setChatHistory(prev => [...prev, { role: 'user', content: q }]);
    const res = await callAi(q);
    setChatHistory(prev => [...prev, { role: 'bot', content: res }]);
  };

  const handleTranslate = async () => {
    const selection = window.getSelection().toString().trim();
    if (!selection) return notify("Select text in the manuscript to translate", "info");
    const targetLangName = LANGUAGES.find(l => l.code === selectedLang)?.name || selectedLang;
    const res = await callAi(
      `Translate this text to ${targetLangName}. Return ONLY the translated text:\n\n${selection.substring(0, 500)}`,
      `You are a professional literary translator. Preserve tone. Reply with ONLY the translation.`,
      true
    );
    setChatHistory(prev => [...prev, { role: 'bot', content: `**${targetLangName} Translation:**\n\n${res}` }]);
    setActiveTab('chat'); setIsSidebarOpen(true);
  };

  const handleGoogleSignIn = async () => {
    if (isSigningIn) return;
    setIsSigningIn(true);
    try {
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
      notify("Signed in with Google", "success");
    } catch (err) {
      if (err.code === 'auth/cancelled-popup-request' || err.code === 'auth/popup-closed-by-user') {
        notify("Sign-in cancelled", "info");
      } else if (err.code === 'auth/popup-blocked') {
        notify("Popup blocked!", "error");
      } else {
        notify("Authentication failed", "error");
        console.error("Google Auth error:", err);
      }
    } finally {
      setIsSigningIn(false);
    }
  };

  const hardReset = () => {
    if (confirm("Factory reset app? This clears your local session.")) {
      localStorage.clear();
      window.location.reload();
    }
  };

  if (isAuthLoading) return (
    <div className="h-screen flex items-center justify-center bg-zinc-50 dark:bg-zinc-950">
      <div className="flex flex-col items-center gap-4">
        <Loader2 className="animate-spin text-amber-500" size={32} />
        <span className="text-[10px] font-black uppercase tracking-widest text-zinc-400">Syncing Novel Quest</span>
      </div>
    </div>
  );

  const NavItem = ({ id, icon: Icon, label }) => (
    <button
      onClick={() => { setActiveTab(id); setIsSidebarOpen(true); }}
      className={`flex flex-col items-center justify-center gap-1 p-2 rounded-xl transition-all
        ${activeTab === id && isSidebarOpen ? 'text-amber-500 bg-amber-50 dark:bg-amber-900/20 shadow-inner' : 'text-zinc-400'}`}
    >
      <Icon size={20} />
      <span className="text-[9px] font-black uppercase tracking-tight">{label}</span>
    </button>
  );

  return (
    <div className="flex flex-col h-screen bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 overflow-hidden font-sans">
      
      {/* MOBILE HEADER */}
      <header className="md:hidden sticky top-0 bg-white/90 dark:bg-zinc-900/90 backdrop-blur-md border-b border-zinc-200 dark:border-zinc-800 z-40 px-4 py-3 flex justify-between items-center">
        <div className="flex items-center gap-2 overflow-hidden max-w-[60%]">
          <BookOpen size={16} className="text-amber-500 shrink-0" />
          <h1 className="text-xs font-black uppercase tracking-widest truncate">{currentDocName}</h1>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-[10px] font-black text-amber-500">{readProgress}%</span>
          <button onClick={() => setTheme(t => t === 'dark' ? 'light' : 'dark')} className="p-1 text-zinc-400">
            {theme === 'dark' ? <Sun size={18}/> : <Moon size={18}/>}
          </button>
        </div>
        <div className="absolute bottom-0 left-0 h-[2.5px] bg-amber-500 transition-all duration-700 shadow-[0_0_10px_rgba(245,158,11,0.5)]" style={{ width: `${readProgress}%` }} />
      </header>

      <div className="flex flex-1 overflow-hidden relative">
        {/* DESKTOP SIDEBAR */}
        <nav className="hidden md:flex w-20 border-r border-zinc-200 dark:border-zinc-800 flex-col items-center py-8 gap-8 bg-white dark:bg-zinc-900 z-50">
          <div className="p-3 bg-amber-500 rounded-2xl text-white shadow-lg shadow-amber-500/20 transition-transform hover:scale-105"><BookOpen size={24}/></div>
          <NavItem id="library" icon={Library} label="Library" />
          <NavItem id="insights" icon={Sparkles} label="Magic" />
          <NavItem id="chat" icon={MessageSquare} label="Chat" />
          <NavItem id="navigator" icon={Layers} label="Pages" />
          <div className="mt-auto flex flex-col gap-4">
            <button onClick={() => setTheme(t => t === 'dark' ? 'light' : 'dark')} className="p-3 text-zinc-400 hover:text-amber-500 transition-colors" title="Toggle Theme">
              {theme === 'dark' ? <Sun size={20}/> : <Moon size={20}/>}
            </button>
            <button onClick={hardReset} className="p-3 text-zinc-400 hover:text-red-500 transition-colors" title="Factory Reset">
              <RefreshCw size={20}/>
            </button>
          </div>
        </nav>

        {/* READING AREA */}
        <main className="flex-1 overflow-y-auto px-4 md:px-20 py-8 scroll-smooth relative custom-scrollbar bg-zinc-50 dark:bg-zinc-950">
          <div className="max-w-3xl mx-auto">
            <div className="hidden md:flex justify-between items-end border-b border-zinc-200 dark:border-zinc-800 pb-6 mb-12">
              <div className="max-w-[70%]">
                <h1 className="text-3xl font-serif font-bold text-zinc-800 dark:text-zinc-100">{currentDocName}</h1>
                <p className="text-[10px] uppercase font-black tracking-widest text-zinc-400 mt-2">
                  Progress: Page {currentPage + 1} of {pages.length} ({readProgress}%)
                </p>
              </div>
              {user && (
                <div className="text-[10px] font-bold text-emerald-500 flex items-center gap-2 bg-emerald-50 dark:bg-emerald-950/30 px-3 py-1.5 rounded-full border border-emerald-100 dark:border-emerald-900/50">
                  <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"/> 
                  Session Active
                </div>
              )}
            </div>

            <div className="space-y-12 pb-32">
              {pages.map((p, i) => (
                <article 
                  key={i} id={`page-${i}`} data-page-index={i}
                  className="bg-white dark:bg-zinc-900 p-8 md:p-16 rounded-[2rem] border border-zinc-200 dark:border-zinc-800 shadow-sm transition-all hover:shadow-md relative group selection:bg-amber-100 dark:selection:bg-amber-900/50"
                >
                  <span className="absolute top-6 right-8 text-[10px] font-black text-zinc-200 dark:text-zinc-800 uppercase tracking-widest transition-colors group-hover:text-amber-500">Page {i + 1}</span>
                  <div className="font-serif text-lg md:text-xl leading-relaxed text-zinc-800 dark:text-zinc-300 whitespace-pre-wrap select-text">
                    {p}
                  </div>
                </article>
              ))}
            </div>
          </div>
        </main>

        {/* FUNCTIONAL DRAWER */}
        <aside className={`fixed inset-0 md:relative md:inset-auto z-[100] md:z-auto transition-all duration-300 overflow-hidden flex
          ${isSidebarOpen ? 'w-full md:w-[420px]' : 'w-0'}`}>
          <div className="flex-1 bg-white dark:bg-zinc-900 border-l border-zinc-200 dark:border-zinc-800 flex flex-col shadow-2xl md:shadow-none">
            <div className="p-4 border-b border-zinc-100 dark:border-zinc-800 flex justify-between items-center bg-zinc-50/50 dark:bg-zinc-950/20">
              <h2 className="text-[10px] font-black uppercase tracking-widest text-zinc-400">{activeTab}</h2>
              <button onClick={() => setIsSidebarOpen(false)} className="p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-xl transition-colors"><X size={20}/></button>
            </div>
            <div className="flex-1 overflow-y-auto p-6">
              {activeTab === 'library' && (
                <div className="space-y-6">
                  {!user || user.isAnonymous ? (
                    <div className="space-y-4 py-8 text-center">
                      <div className="w-16 h-16 bg-amber-50 dark:bg-amber-900/20 rounded-full flex items-center justify-center mx-auto text-amber-500 mb-2"><User size={32}/></div>
                      <p className="text-sm text-zinc-500 px-4">Sign in with Google to sync manuscripts across devices.</p>
                      <button 
                        onClick={handleGoogleSignIn} 
                        disabled={isSigningIn}
                        className="w-full py-4 bg-amber-500 text-white rounded-2xl font-black text-xs uppercase shadow-lg active:scale-95 transition-transform flex items-center justify-center gap-2"
                      >
                        {isSigningIn ? <Loader2 className="animate-spin" size={16} /> : <LogIn size={16} />}
                        {isSigningIn ? "Authorizing..." : "Continue with Google"}
                      </button>
                    </div>
                  ) : (
                    <>
                      <label className="flex flex-col items-center justify-center p-10 border-2 border-dashed border-zinc-200 dark:border-zinc-800 rounded-3xl hover:border-amber-500 cursor-pointer transition-all group">
                        <FileUp size={32} className="text-zinc-300 group-hover:text-amber-500 mb-2 transition-colors"/>
                        <span className="text-[10px] font-black uppercase text-zinc-500">Upload PDF</span>
                        <input type="file" onChange={handleFileUpload} className="hidden" accept=".pdf" />
                      </label>
                      <div className="space-y-3">
                        <h3 className="text-[10px] font-black uppercase text-zinc-400 tracking-widest">Collections</h3>
                        {sources.map(s => (
                          <div key={s.id} className={`p-4 rounded-2xl border flex items-center gap-4 transition-all ${currentDocId === s.id ? 'border-amber-500 bg-amber-50 dark:bg-amber-900/10' : 'border-zinc-100 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-800'}`}>
                            <button onClick={() => { setText(s.content); setCurrentDocName(s.name); setCurrentDocId(s.id); setIsSidebarOpen(false); isInitialLoad.current = true; }} className="flex-1 text-left min-w-0">
                              <p className="text-xs font-bold truncate">{s.name}</p>
                              <p className="text-[10px] text-zinc-400 mt-1">{s.date}</p>
                            </button>
                            <button onClick={() => deleteDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'sources', s.id))} className="text-zinc-300 hover:text-red-500 transition-colors"><Trash2 size={16}/></button>
                          </div>
                        ))}
                      </div>
                      <button onClick={() => signOut(auth)} className="w-full py-3 text-[10px] font-black uppercase text-zinc-400 border border-zinc-100 dark:border-zinc-800 rounded-xl hover:text-red-500 transition-colors mt-8">Sign Out</button>
                    </>
                  )}
                </div>
              )}
              {activeTab === 'insights' && (
                <div className="space-y-6">
                  <div className="p-4 bg-zinc-50 dark:bg-zinc-800/50 rounded-2xl border border-zinc-100 dark:border-zinc-700">
                    <label className="block text-[10px] font-black uppercase tracking-widest text-zinc-500 mb-2">Translation Language</label>
                    <div className="flex gap-2">
                      <select value={selectedLang} onChange={e => setSelectedLang(e.target.value)} className="flex-1 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-xl px-3 py-2 text-xs">
                        {LANGUAGES.map(l => <option key={l.code} value={l.code}>{l.name}</option>)}
                      </select>
                      <button onClick={handleTranslate} className="px-4 py-2 bg-amber-500 text-white rounded-xl text-[10px] font-black uppercase transition-transform active:scale-95 shadow-md">Translate Selection</button>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <button onClick={() => handleInsight('summary')} className="p-4 bg-amber-50 dark:bg-amber-900/20 rounded-2xl flex flex-col items-center gap-2 border border-amber-100 dark:border-amber-900/50 active:scale-95 transition-transform">
                      <BrainCircuit size={24} className="text-amber-500" /><span className="text-[9px] font-black uppercase tracking-widest">Summary</span>
                    </button>
                    <button onClick={() => handleInsight('characters')} className="p-4 bg-blue-50 dark:bg-blue-900/10 rounded-2xl flex flex-col items-center gap-2 border border-blue-100 dark:border-blue-900/50 active:scale-95 transition-transform">
                      <User size={24} className="text-blue-500" /><span className="text-[9px] font-black uppercase tracking-widest">Characters</span>
                    </button>
                    <button onClick={() => handleInsight('weaver')} className="p-4 bg-purple-50 dark:bg-purple-900/10 rounded-2xl flex flex-col items-center gap-2 border border-purple-100 dark:border-purple-900/50 active:scale-95 transition-transform col-span-2">
                      <Wand2 size={24} className="text-purple-500" /><span className="text-[9px] font-black uppercase tracking-widest">Story Weaver</span>
                    </button>
                  </div>
                  {insightResult && (
                    <div className="p-6 bg-zinc-50 dark:bg-zinc-800/50 rounded-3xl border border-zinc-200 dark:border-zinc-700 animate-in fade-in slide-in-from-bottom-2 duration-500 shadow-sm">
                      <div className="text-sm leading-relaxed whitespace-pre-wrap font-serif text-zinc-800 dark:text-zinc-200">{insightResult}</div>
                      <button onClick={() => {
                        setChatHistory(prev => [...prev, {role:'bot', content: `**✨ Magic Insight (${insightType}):**\n${insightResult}`}]);
                        setActiveTab('chat');
                      }} className="mt-4 w-full py-2.5 text-[9px] font-black uppercase text-amber-600 border border-amber-200 dark:border-amber-900 rounded-xl hover:bg-amber-50 transition-colors">Add to Chat Session</button>
                    </div>
                  )}
                  {isAiLoading && <div className="py-20 text-center"><Loader2 className="animate-spin text-amber-500 mx-auto mb-2"/><p className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">Consulting the Muse...</p></div>}
                </div>
              )}
              {activeTab === 'chat' && (
                <div className="flex flex-col h-full space-y-4">
                  <div className="flex-1 space-y-4 overflow-y-auto pr-2 custom-scrollbar">
                    {chatHistory.length === 0 && <div className="py-20 text-center opacity-30 px-6"><MessageSquare size={48} className="mx-auto mb-4" /><p className="text-[10px] font-black uppercase tracking-widest">Ask about characters, themes, or plot points.</p></div>}
                    {chatHistory.map((m, i) => (
                      <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                        <div className={`max-w-[85%] p-4 rounded-3xl text-sm ${m.role === 'user' ? 'bg-amber-500 text-white rounded-tr-none shadow-lg' : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200 rounded-tl-none border border-zinc-200 dark:border-zinc-700'}`}>
                          {m.content}
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="relative pt-2">
                    <input value={userInput} onChange={e=>setUserInput(e.target.value)} onKeyDown={e=>e.key==='Enter'&&handleChat()} placeholder="Ask Gemini..." className="w-full p-4 bg-zinc-100 dark:bg-zinc-800 rounded-2xl text-sm focus:ring-2 focus:ring-amber-500 outline-none shadow-inner" />
                    <button onClick={handleChat} disabled={isAiLoading || !userInput.trim()} className="absolute right-2 top-1/2 -translate-y-1/2 p-2 bg-amber-500 text-white rounded-xl shadow-lg hover:bg-amber-600 active:scale-90 transition-all"><Send size={18}/></button>
                  </div>
                </div>
              )}
              {activeTab === 'navigator' && (
                <div className="grid grid-cols-4 gap-3">
                  {pages.map((_, i) => (
                    <button key={i} onClick={() => scrollToPage(i)} className={`aspect-square rounded-2xl border-2 flex items-center justify-center text-xs font-black transition-all ${currentPage === i ? 'bg-amber-500 text-white border-amber-500 shadow-xl scale-110' : 'border-zinc-100 dark:border-zinc-800 hover:border-amber-200'}`}>
                      {i + 1}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </aside>
      </div>

      <nav className="md:hidden fixed bottom-0 left-0 right-0 h-16 bg-white dark:bg-zinc-900 border-t border-zinc-200 dark:border-zinc-800 flex justify-around items-center z-[110] shadow-[0_-8px_30px_rgba(0,0,0,0.15)] px-2">
        <NavItem id="library" icon={Library} label="Library" />
        <NavItem id="insights" icon={Sparkles} label="Magic" />
        <NavItem id="chat" icon={MessageSquare} label="Chat" />
        <NavItem id="navigator" icon={Layers} label="Pages" />
        <button onClick={hardReset} className="flex flex-col items-center p-2 text-zinc-400 active:text-red-500 transition-colors">
          <RefreshCw size={20} />
          <span className="text-[9px] font-black uppercase tracking-tight">Reset</span>
        </button>
      </nav>

      {notification && (
        <div className={`fixed bottom-20 md:bottom-10 left-4 right-4 md:left-1/2 md:-translate-x-1/2 md:max-w-xs p-4 rounded-3xl shadow-2xl z-[200] flex items-center gap-3 animate-in fade-in slide-in-from-bottom-4 duration-300 border border-zinc-100 dark:border-zinc-800 ${notification.type === 'error' ? 'bg-red-600 text-white' : 'bg-zinc-900 text-white dark:bg-white dark:text-zinc-900'}`}>
          {notification.type === 'error' ? <AlertCircle size={20}/> : <Check size={20} className="text-emerald-400"/>}
          <span className="text-[10px] font-bold uppercase tracking-widest leading-tight">{notification.text}</span>
          <button onClick={() => setNotification(null)} className="ml-auto opacity-50"><X size={14}/></button>
        </div>
      )}

      <style>{`
        .animate-in { animation: fadeIn 0.3s ease-out; }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(0,0,0,0.05); border-radius: 10px; }
        .dark .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.05); }
        body { margin: 0; padding: 0; }
      `}</style>
    </div>
  );
}
