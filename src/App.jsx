import React, { useState, useEffect, useRef } from 'react';
import { 
  BookOpen, 
  MessageSquare, 
  Languages, 
  FileUp, 
  Link as LinkIcon, 
  Trash2, 
  Send,
  Loader2,
  Settings,
  ChevronRight,
  ChevronLeft,
  Plus,
  AlertCircle,
  Eye,
  X,
  Layers,
  FileText,
  ClipboardList,
  Library,
  Archive,
  User,
  PanelRightOpen,
  PanelRightClose,
  Clock,
  ShieldCheck,
  RefreshCw,
  Cloud,
  CloudOff,
  Check,
  LogOut,
  LogIn,
  Info,
  Copy,
  AlertTriangle,
  Menu,
  ExternalLink,
  ShieldAlert,
  Terminal,
  Globe
} from 'lucide-react';


// Firebase Imports
import { initializeApp, getApps, getApp } from 'firebase/app';
import { 
  getAuth, 
  signInAnonymously, 
  signInWithPopup, 
  GoogleAuthProvider, 
  onAuthStateChanged,
  signOut 
} from 'firebase/auth';
import { 
  getFirestore, 
  doc, 
  setDoc, 
  getDoc, 
  collection, 
  onSnapshot, 
  addDoc, 
  deleteDoc 
} from 'firebase/firestore';


const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID
};


// RULE 1 SANITIZATION: Clean IDs to prevent Firestore path segment issues
const rawAppId = typeof __app_id !== 'undefined' ? __app_id : 'novel-quest-v1';
const appId = String(rawAppId).replace(/[^a-zA-Z0-9]/g, '_');


// Singleton Firebase initialization
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
const auth = getAuth(app);
const db = getFirestore(app);


// Safe Environment Variable Access
const getSafeEnv = (key) => {
  try {
    return new Function(`try { return import.meta.env["${key}"]; } catch(e) { return ""; }`)() || "";
  } catch (e) { return ""; }
};


// ✅ CRITICAL FIX: Load Gemini API key from Vite .env
const apiKey = import.meta.env.VITE_GEMINI_API_KEY || "";
const BACKEND_URL = "/api"; 
const WORDS_PER_PAGE = 275; 


const THEME = {
  bg: 'bg-[#0a0a0a]',
  sidebar: 'bg-[#121212]',
  paper: 'bg-[#18181b]',
  accent: 'text-amber-500',
  accentBg: 'bg-amber-600',
  text: 'text-zinc-400',
  readerText: 'text-zinc-200'
};


const LANGUAGES = [
  { code: 'en', name: 'English' },
  { code: 'hi', name: 'Hindi' },
  { code: 'mr', name: 'Marathi' },
  { code: 'es', name: 'Spanish' },
  { code: 'ja', name: 'Japanese' },
];


export default function App() {
  const [user, setUser] = useState(null);
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const [text, setText] = useState("");
  const [currentDocId, setCurrentDocId] = useState(null);
  const [currentDocName, setCurrentDocName] = useState("Untitled Manuscript");
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [activeTab, setActiveTab] = useState('library');
  const [chatHistory, setChatHistory] = useState([]);
  const [userInput, setUserInput] = useState("");
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [sources, setSources] = useState([]); 
  const [selectedLang, setSelectedLang] = useState('hi');
  const [linkInput, setLinkInput] = useState("");
  const [showLinkInput, setShowLinkInput] = useState(false);
  const [notification, setNotification] = useState(null);
  const [currentPage, setCurrentPage] = useState(0);
  const [lastPosition, setLastPosition] = useState(null);
  const [isRestoring, setIsRestoring] = useState(true);
  const [isPdfLibReady, setIsPdfLibReady] = useState(false);
  
  const scrollContainerRef = useRef(null);


  const copyToClipboard = (txt) => {
    // Standard execCommand fallback for iframe environments
    const textArea = document.createElement("textarea");
    textArea.value = txt;
    document.body.appendChild(textArea);
    textArea.select();
    try {
      document.execCommand('copy');
      notify("Hostname copied! Add to Firebase Console.", "info");
    } catch (err) {
      notify("Failed to copy. Please select and copy manually.", "error");
    }
    document.body.removeChild(textArea);
  };


  const notify = (msg, type = 'error') => {
    if (!msg) {
      setNotification(null);
      return;
    }
    let textContent = typeof msg === 'string' ? msg : (msg.message || String(msg));
    
    // Auto-diagnosis for domain errors
    if (textContent.includes('auth/unauthorized-domain')) {
      textContent = "Google Auth Failed: Domain not authorized. See the yellow box in Profile tab.";
    }


    setNotification({ text: textContent, type });
    if (type !== 'error') {
      setTimeout(() => setNotification(null), 8000);
    }
  };


  const handleSignOut = async () => {
    try {
      await signOut(auth);
      setUser(null);
      setSources([]);
      setText("");
      setCurrentDocId(null);
      notify("Researcher session ended.", "info");
    } catch (err) {
      notify("Sign out failed.");
    }
  };


  const handleSignInGoogle = async () => {
    setIsAuthLoading(true);
    notify(null);
    try {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: 'select_account' });
      await signInWithPopup(auth, provider);
    } catch (err) {
      console.error("Google Auth Fail:", err);
      notify(err);
    } finally {
      setIsAuthLoading(false);
    }
  };


  const handleSignInGuest = async () => {
    setIsAuthLoading(true);
    notify(null);
    try {
      await signInAnonymously(auth);
      notify("Guest Access Granted.", "info");
    } catch (err) {
      console.error("Guest Auth Fail:", err);
      if (err.code === 'auth/admin-restricted-operation') {
        notify("Guest access disabled. Enable 'Anonymous' in Firebase Console.", "error");
      } else {
        notify(err);
      }
    } finally {
      setIsAuthLoading(false);
    }
  };


  const getPages = () => {
    const words = text.split(/\s+/).filter(Boolean);
    const result = [];
    for (let i = 0; i < words.length; i += WORDS_PER_PAGE) {
      result.push(words.slice(i, i + WORDS_PER_PAGE).join(" "));
    }
    return result.length > 0 ? result : ["(Vault empty. Sign in and upload a manuscript to begin analysis.)"];
  };


  const pages = getPages();


  // Auth Sync
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setIsAuthLoading(false);
    });
    return () => unsubscribe();
  }, []);


  // Firestore Sync
  useEffect(() => {
    if (!user || !db) return;


    const sanitizedUserId = String(user.uid).replace(/[^a-zA-Z0-9]/g, '_');
    const sourcesRef = collection(db, 'artifacts', appId, 'users', sanitizedUserId, 'sources');
    
    const unsubSources = onSnapshot(sourcesRef, (snap) => {
      const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setSources(docs.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0)));
    }, (err) => {
      if (err.code !== 'permission-denied') console.error("Firestore Error:", err);
    });


    const posRef = doc(db, 'artifacts', appId, 'users', sanitizedUserId, 'settings', 'lastPosition');
    const unsubPos = onSnapshot(posRef, (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        setLastPosition(data);
        if (isRestoring && data.docId && !currentDocId) {
          const restore = async () => {
            try {
              const docRef = doc(db, 'artifacts', appId, 'users', sanitizedUserId, 'sources', data.docId);
              const docSnap = await getDoc(docRef);
              if (docSnap.exists()) {
                const src = docSnap.data();
                setText(String(src.content || ""));
                setCurrentDocName(String(src.name || "Untitled"));
                setCurrentDocId(data.docId);
                setTimeout(() => scrollToPage(data.page || 0), 800);
              }
            } finally {
              setIsRestoring(false);
            }
          };
          restore();
        }
      } else {
        setIsRestoring(false);
      }
    });


    return () => { unsubSources(); unsubPos(); };
  }, [user]);


  // Position Auto-save
  useEffect(() => {
    if (!user || !db || !currentDocId || isRestoring) return;
    const timer = setTimeout(async () => {
      const sanitizedUserId = String(user.uid).replace(/[^a-zA-Z0-9]/g, '_');
      try {
        const posRef = doc(db, 'artifacts', appId, 'users', sanitizedUserId, 'settings', 'lastPosition');
        await setDoc(posRef, { 
          docId: currentDocId, 
          docName: String(currentDocName),
          page: currentPage, 
          timestamp: Date.now() 
        }, { merge: true });
      } catch (e) {
        console.error("Auto-save sync error", e);
      }
    }, 2000);
    return () => clearTimeout(timer);
  }, [currentPage, currentDocId, user, isRestoring, currentDocName]);


  // PDF Engine
  useEffect(() => {
    if (window.pdfjsLib) { setIsPdfLibReady(true); return; }
    if (document.querySelector('script[src*="pdf.js"]')) return;
    const script = document.createElement('script');
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.4.120/pdf.min.js';
    script.async = true;
    script.onload = () => {
      if (window.pdfjsLib) {
        window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.4.120/pdf.worker.min.js';
        setIsPdfLibReady(true);
      }
    };
    document.head.appendChild(script);
  }, []);


  // Intersection Observer
  useEffect(() => {
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          const idx = parseInt(entry.target.getAttribute('data-page-index'));
          if (!isNaN(idx)) setCurrentPage(idx);
        }
      });
    }, { root: scrollContainerRef.current, threshold: 0.5 });
    document.querySelectorAll('[data-page-index]').forEach(el => observer.observe(el));
    return () => observer.disconnect();
  }, [pages]);


  const scrollToPage = (index) => {
    const el = document.getElementById(`page-${index}`);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };


  const handleTabClick = (tab) => {
    if (activeTab === tab && isSidebarOpen) setIsSidebarOpen(false);
    else { setActiveTab(tab); setIsSidebarOpen(true); }
  };


  const handleFileUpload = async (e) => {
    if (!user) {
        notify("Identity Required: Sign in to store manuscripts in your vault.", "info");
        setActiveTab('profile');
        return;
    }
    const file = e?.target?.files?.[0];
    if (!file || !isPdfLibReady) return;
    setIsAiLoading(true);
    notify(null);
    try {
      const buf = await file.arrayBuffer();
      const pdf = await window.pdfjsLib.getDocument({ data: buf }).promise;
      let full = "";
      for (let i = 1; i <= pdf.numPages; i++) {
        const p = await pdf.getPage(i);
        const tc = await p.getTextContent();
        full += tc.items.map(it => it.str).join(" ") + "\n";
      }
      const sanitizedUserId = String(user.uid).replace(/[^a-zA-Z0-9]/g, '_');
      const d = await addDoc(collection(db, 'artifacts', appId, 'users', sanitizedUserId, 'sources'), { 
        name: String(file.name), type: 'pdf', content: String(full), 
        date: new Date().toLocaleDateString(), size: (full.length/1024).toFixed(1) + " KB", timestamp: Date.now()
      });
      setText(full); setCurrentDocName(file.name); setCurrentDocId(d.id);
      setActiveTab('navigator'); setIsSidebarOpen(true);
    } catch (err) { notify("PDF processing failed."); }
    finally { setIsAiLoading(false); if(e.target) e.target.value = null; }
  };


  const handleAddLink = async () => {
    if (!user) {
        notify("Identity Required: Sign in to add web sources.", "info");
        setActiveTab('profile');
        return;
    }
    if (!linkInput) return;
    setIsAiLoading(true);
    try {
      const res = await fetch(`${BACKEND_URL}/process-link`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: linkInput })
      });
      const data = await res.json();
      if (data.content) {
        const sanitizedUserId = String(user.uid).replace(/[^a-zA-Z0-9]/g, '_');
        const d = await addDoc(collection(db, 'artifacts', appId, 'users', sanitizedUserId, 'sources'), { 
          name: String(data.name || "Web Page"), type: 'link', content: String(data.content), 
          date: new Date().toLocaleDateString(), size: (data.content.length/1024).toFixed(1) + " KB", timestamp: Date.now()
        });
        setText(data.content); setCurrentDocName(String(data.name || "Web Page")); setCurrentDocId(d.id);
        setLinkInput(""); setShowLinkInput(false);
        setActiveTab('navigator'); setIsSidebarOpen(true);
      }
    } catch (e) { notify("Scraping failed."); }
    finally { setIsAiLoading(false); }
  };


  const callAi = async (prompt, sys = "You are a literary analyst.") => {
    setIsAiLoading(true);
    try {
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: `Doc: ${currentDocName}\nText: ${text.substring(0, 4000)}\n\nQuery: ${prompt}` }] }],
          systemInstruction: { parts: [{ text: sys }] }
        })
      });
      const result = await response.json();
      return result.candidates?.[0]?.content?.parts?.[0]?.text || "No response.";
    } catch (e) { return "AI service error."; }
    finally { setIsAiLoading(false); }
  };


  const handleChat = async () => {
    if (!userInput.trim() || isAiLoading) return;
    const msg = String(userInput);
    setChatHistory(p => [...p, { role: 'user', content: msg }]);
    setUserInput("");
    const resp = await callAi(msg);
    setChatHistory(p => [...p, { role: 'bot', content: String(resp) }]);
  };


  const handleTranslate = async () => {
    const selection = window.getSelection().toString();
    if (!selection) return notify("Please select text in the reader to translate.");
    const targetLang = LANGUAGES.find(l => l.code === selectedLang).name;
    const translated = await callAi(`Translate to ${targetLang}: ${selection}`, "You are a literary translator.");
    setChatHistory(p => [...p, { role: 'bot', content: `**Translation (${targetLang}):**\n\n${translated}` }]);
    setActiveTab('chat'); setIsSidebarOpen(true);
  };


  // ✅ NEW: Clear Chat Function
  const handleClearChat = () => {
    if (chatHistory.length === 0) {
      notify("Chat is already empty", "info");
      return;
    }
    // Ask for confirmation before clearing
    if (window.confirm("Are you sure you want to clear all chat history?")) {
      setChatHistory([]);
      notify("Chat cleared successfully", "info");
    }
  };


  const loadFromLibrary = (source) => {
    setText(String(source.content || ""));
    setCurrentDocName(String(source.name || "Untitled"));
    setCurrentDocId(source.id);
    setActiveTab('navigator');
    setIsSidebarOpen(true);
    setTimeout(() => scrollToPage(0), 100);
  };


  const deleteFromLibrary = async (e, id) => {
    e.stopPropagation();
    if (!user || !db) return;
    const sanitizedUserId = String(user.uid).replace(/[^a-zA-Z0-9]/g, '_');
    try {
      await deleteDoc(doc(db, 'artifacts', appId, 'users', sanitizedUserId, 'sources', id));
      if (currentDocId === id) {
        setText(""); setCurrentDocName("Untitled Manuscript"); setCurrentDocId(null);
      }
    } catch (err) { notify("Removal failed."); }
  };


  const resumeLastPosition = () => {
    if (!lastPosition || !lastPosition.docId) return;
    const source = sources.find(s => s.id === lastPosition.docId);
    if (source) {
      loadFromLibrary(source);
      setTimeout(() => scrollToPage(lastPosition.page || 0), 200);
    }
  };


  if (isAuthLoading && isRestoring) {
    return (
      <div className={`h-screen w-full flex flex-col items-center justify-center ${THEME.bg} text-amber-500 font-serif`}>
        <Loader2 size={32} className="animate-spin mb-4" />
        <p className="text-[10px] uppercase font-black tracking-[0.5em] opacity-50 text-center">Syncing Identity</p>
      </div>
    );
  }


  return (
    <div className={`flex h-screen ${THEME.bg} ${THEME.text} font-serif overflow-hidden relative`}>
      {/* SIDE NAV */}
      <div className={`w-16 ${THEME.sidebar} flex flex-col items-center py-6 border-r border-zinc-900 z-30`}>
        <div className="mb-8 p-2 bg-amber-900/20 rounded-lg"><BookOpen className="text-amber-500" size={24} /></div>
        <nav className="flex flex-col gap-6">
          <button onClick={() => handleTabClick('library')} className={`${activeTab === 'library' && isSidebarOpen ? THEME.accent : 'text-zinc-600'} hover:text-amber-500 transition-colors`}><Library size={20} /></button>
          <button onClick={() => handleTabClick('navigator')} className={`${activeTab === 'navigator' && isSidebarOpen ? THEME.accent : 'text-zinc-600'} hover:text-amber-500 transition-colors`}><Layers size={20} /></button>
          <button onClick={() => handleTabClick('chat')} className={`${activeTab === 'chat' && isSidebarOpen ? THEME.accent : 'text-zinc-600'} hover:text-amber-500 transition-colors`}><MessageSquare size={20} /></button>
          <button onClick={() => handleTabClick('translate')} className={`${activeTab === 'translate' && isSidebarOpen ? THEME.accent : 'text-zinc-600'} hover:text-amber-500 transition-colors`}><Languages size={20} /></button>
          <button onClick={() => handleTabClick('profile')} className={`${activeTab === 'profile' && isSidebarOpen ? THEME.accent : 'text-zinc-600'} hover:text-amber-500 transition-colors`}><User size={20} /></button>
        </nav>
        <div className="mt-auto flex flex-col items-center gap-6">
            <div className="text-[10px] text-zinc-700 font-black vertical-text uppercase tracking-widest text-center">Pg {currentPage + 1}</div>
            <div className="pb-2">
              {user ? (
                <div className="flex flex-col items-center gap-1">
                  <Cloud className="text-emerald-900" size={12}/>
                  <Check className="text-emerald-600" size={8}/>
                </div>
              ) : (
                <CloudOff className="text-zinc-800" size={12}/>
              )}
            </div>
        </div>
      </div>


      <main ref={scrollContainerRef} className="flex-1 overflow-y-auto custom-scrollbar bg-[#080808] flex flex-col items-center py-16 gap-12">
        <header className="w-full max-w-[850px] flex justify-between items-center px-8 opacity-40">
          <h1 className="text-[10px] font-sans font-black tracking-[0.5em] uppercase truncate max-w-[400px]">
            {String(currentDocName)}
          </h1>
          <button onClick={() => setIsSidebarOpen(!isSidebarOpen)} className={`px-4 py-2 border border-zinc-800 rounded-full text-[9px] font-bold uppercase tracking-widest transition-all hover:bg-zinc-900 ${isSidebarOpen ? 'text-amber-500 border-amber-500/30 bg-amber-500/5' : ''}`}>
             Tools {isSidebarOpen ? 'Open' : ''}
          </button>
        </header>
        <div className="flex flex-col gap-16 w-full items-center">
          {pages.map((p, i) => (
            <div key={i} id={`page-${i}`} data-page-index={i} className={`relative w-full max-w-[816px] min-h-[1056px] ${THEME.paper} border border-zinc-800/40 rounded shadow-2xl p-20 flex flex-col animate-in`}>
              <div className="absolute top-8 left-1/2 -translate-x-1/2 text-[10px] font-black text-zinc-700 tracking-[0.3em] uppercase opacity-20">Page {i + 1}</div>
              <div className={`flex-1 text-xl leading-[2.2] ${THEME.readerText} whitespace-pre-wrap selection:bg-amber-500/20`}>{String(p)}</div>
            </div>
          ))}
        </div>
        <div className="py-24 text-zinc-800 text-[10px] font-black uppercase tracking-[0.4em]">End of Document</div>
      </main>


      <aside className={`${isSidebarOpen ? 'w-96' : 'w-0'} ${THEME.sidebar} border-l border-zinc-900 transition-all duration-300 relative flex flex-col overflow-hidden z-20 shadow-2xl`}>
        <div className="p-6 border-b border-zinc-900 bg-zinc-900/10 flex justify-between items-center shrink-0">
          <h2 className="text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-500">{String(activeTab)}</h2>
          {isAiLoading && <Loader2 className="animate-spin text-amber-500" size={14} />}
        </div>
        <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar">
          {activeTab === 'profile' && (
            <div className="space-y-6 animate-in">
              <div className="bg-zinc-900/50 p-8 rounded-3xl border border-zinc-800 flex flex-col items-center text-center">
                <div className="w-20 h-20 bg-amber-500/10 border border-amber-500/20 rounded-full flex items-center justify-center mb-6 overflow-hidden">
                   {isAuthLoading ? <RefreshCw className="text-zinc-700 animate-spin" size={24}/> : (
                     user?.photoURL ? <img src={user.photoURL} className="w-full h-full object-cover" /> : <User className="text-amber-500" size={32} />
                   )}
                </div>
                
                {user ? (
                  <div className="w-full space-y-6">
                    <div>
                      <h3 className="text-sm font-bold text-zinc-200">{user.displayName || (user.isAnonymous ? "Guest Researcher" : "Researcher")}</h3>
                      <p className="text-[10px] text-emerald-500 mt-1 uppercase tracking-widest font-bold">Authenticated Profile</p>
                    </div>


                    <div className="w-full p-4 bg-zinc-950 rounded-2xl border border-zinc-900 text-left">
                        <span className="text-[9px] uppercase font-black text-zinc-500 block mb-2">Researcher ID</span>
                        <code className="text-[10px] text-amber-600 break-all">{String(user.email || user.uid)}</code>
                    </div>


                    <button 
                      onClick={handleSignOut}
                      className="w-full py-4 border border-red-500/30 bg-red-500/5 text-red-500 rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-red-500/10 transition-all flex items-center justify-center gap-2"
                    >
                      <LogOut size={14} />
                      Sign Out
                    </button>
                  </div>
                ) : (
                  <div className="w-full space-y-4">
                    <div className="p-4 bg-amber-500/5 border border-amber-500/20 rounded-2xl mb-4">
                      <div className="flex items-center gap-2 text-amber-500 mb-2">
                        <AlertTriangle size={14}/>
                        <span className="text-[10px] font-black uppercase tracking-widest">Required Action</span>
                      </div>
                      <p className="text-[10px] text-zinc-400 leading-relaxed mb-3">
                        To enable Google Sign-In, add this exact domain to your Firebase Authorized Domains list:
                      </p>
                      <div className="p-3 bg-black/60 rounded-xl border border-white/5 text-[9px] font-mono text-zinc-300 break-all select-all flex items-center justify-between group">
                          {window.location.hostname}
                          <button 
                            onClick={() => copyToClipboard(window.location.hostname)}
                            className="p-1 hover:text-amber-500 transition-colors"
                          >
                              <Copy size={12}/>
                          </button>
                      </div>
                      <p className="text-[8px] text-zinc-500 italic mt-2">Firebase Console {'->'} Authentication {'->'} Settings {'->'} Authorized Domains</p>
                    </div>


                    <div className="flex flex-col gap-3">
                        <button 
                        onClick={handleSignInGoogle}
                        className="w-full py-4 bg-white text-black rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-zinc-200 transition-all flex items-center justify-center gap-2 shadow-xl"
                        >
                        <LogIn size={14} />
                        Sign In with Google
                        </button>


                        <button 
                        onClick={handleSignInGuest}
                        className="w-full py-3 border border-zinc-800 text-zinc-500 rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-zinc-900 transition-all"
                        >
                        Guest Entry
                        </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
          {activeTab === 'library' && (
            <div className="space-y-6">
              {lastPosition && lastPosition.docId && sources.length > 0 && (
                <div className="p-5 bg-amber-600/5 border border-amber-500/20 rounded-3xl animate-in">
                  <div className="flex items-center gap-2 mb-3 text-amber-500">
                    <Clock size={14} />
                    <span className="text-[9px] font-black uppercase tracking-widest">Resume Reading</span>
                  </div>
                  <h4 className="text-xs font-bold text-zinc-200 truncate mb-1">{String(lastPosition.docName || "Untitled")}</h4>
                  <p className="text-[9px] text-zinc-500 uppercase font-bold mb-4">Last seen on page {(lastPosition.page || 0) + 1}</p>
                  <button onClick={resumeLastPosition} className="w-full py-3 bg-amber-600 text-black text-[10px] font-black uppercase rounded-xl hover:bg-amber-500 transition-colors shadow-lg shadow-amber-600/10">Jump Back In</button>
                </div>
              )}
              <div className="grid grid-cols-2 gap-3">
                <button 
                   onClick={() => {
                      if (!user) {
                          notify("Identity Required: Sign in to store manuscripts in the cloud.", "info");
                          setActiveTab('profile');
                      }
                   }}
                   className={`relative flex flex-col items-center justify-center p-6 border-2 border-dashed rounded-2xl transition-all ${user ? 'border-zinc-800 cursor-pointer hover:bg-amber-500/5' : 'border-zinc-900 opacity-60 hover:border-zinc-700'}`}
                >
                  <FileUp size={24} className="mb-2 text-zinc-600"/><span className="text-[9px] uppercase font-bold text-zinc-600">Store PDF</span>
                  {user && <input type="file" className="absolute inset-0 opacity-0 cursor-pointer" accept=".pdf" onChange={handleFileUpload} />}
                </button>
                
                <button 
                  onClick={() => {
                    if (!user) {
                        notify("Identity Required: Sign in to add manuscripts from the web.", "info");
                        setActiveTab('profile');
                    } else {
                        setShowLinkInput(!showLinkInput);
                    }
                  }} 
                  className={`flex flex-col items-center justify-center p-6 border-2 border-dashed rounded-2xl transition-all ${user ? 'border-zinc-800 hover:bg-amber-500/5' : 'border-zinc-900 opacity-60 hover:border-zinc-700'}`}
                >
                  <LinkIcon size={24} className="mb-2 text-zinc-600"/><span className="text-[9px] uppercase font-bold text-zinc-600">Add Link</span>
                </button>
              </div>
              {showLinkInput && (
                <div className="flex gap-2 animate-in"><input type="url" placeholder="https://..." className="flex-1 bg-zinc-900 border border-zinc-800 p-2 rounded-lg text-xs" value={linkInput} onChange={(e) => setLinkInput(e.target.value)}/><button onClick={handleAddLink} className="p-2 bg-amber-600 rounded-lg text-black"><Plus size={16}/></button></div>
              )}
              <div className="space-y-4 pt-4">
                <div className="flex justify-between items-center border-b border-zinc-900 pb-2"><h3 className="text-[9px] text-zinc-600 uppercase font-black tracking-widest">Library Collection</h3></div>
                {sources.map(s => (
                  <div key={s.id} onClick={() => loadFromLibrary(s)} className={`p-4 bg-zinc-900/40 border rounded-2xl cursor-pointer ${currentDocId === s.id ? 'border-amber-600/40' : 'border-zinc-800/50 hover:border-zinc-700'}`}>
                    <div className="flex justify-between items-center">
                      <h4 className="text-xs font-bold truncate max-w-[150px] text-zinc-300">{String(s.name)}</h4>
                      <Trash2 onClick={(e) => {e.stopPropagation(); deleteFromLibrary(e, s.id)}} size={12} className="text-zinc-700 hover:text-red-400 transition-colors"/>
                    </div>
                    <div className="text-[8px] text-zinc-600 mt-1 uppercase tracking-tighter">{String(s.date)} • {String(s.size)}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
          {activeTab === 'navigator' && (
            <div className="grid grid-cols-3 gap-2">
              {pages.map((_, i) => (
                <button key={i} onClick={() => scrollToPage(i)} className={`aspect-square flex flex-col items-center justify-center border rounded-xl transition-all ${currentPage === i ? 'bg-amber-600/20 border-amber-600' : 'bg-zinc-900/50 border-zinc-800'}`}>
                  <span className="text-[9px] font-black">{i + 1}</span>
                </button>
              ))}
            </div>
          )}
          {activeTab === 'chat' && (
            <div className="space-y-4 pb-24">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-[10px] font-bold uppercase tracking-widest text-amber-500">
                  Chat History
                </h3>
                {chatHistory.length > 0 && (
                  <button
                    onClick={handleClearChat}
                    title="Clear all chat messages"
                    className="p-2 text-zinc-600 hover:text-red-500 transition-colors rounded-lg hover:bg-zinc-900"
                  >
                    <Trash2 size={16} />
                  </button>
                )}
              </div>

              {chatHistory.length === 0 && (
                <div className="flex flex-col items-center justify-center py-12 text-center opacity-20">
                  <MessageSquare size={32} className="mb-4" />
                  <p className="text-[10px] font-bold uppercase tracking-widest">
                    Analyze manuscript
                  </p>
                </div>
              )}
              {chatHistory.map((m, i) => (
                <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div
                    className={`max-w-[90%] p-4 rounded-2xl text-sm ${
                      m.role === 'user'
                        ? 'bg-amber-600/10 text-amber-100'
                        : 'bg-zinc-800 text-zinc-300'
                    }`}
                  >
                    {String(m.content)}
                  </div>
                </div>
              ))}
            </div>
          )}
          {activeTab === 'translate' && (
            <div className="space-y-6">
              <div className="bg-zinc-900/50 p-5 rounded-2xl border border-zinc-800">
                <label className="text-[9px] text-zinc-600 uppercase font-black block mb-3">Target Language</label>
                <select className="w-full bg-zinc-800 border border-zinc-700 p-3 rounded-xl text-xs outline-none text-zinc-300" value={selectedLang} onChange={(e) => setSelectedLang(e.target.value)}>{LANGUAGES.map(l => <option key={l.code} value={l.code}>{l.name}</option>)}</select>
              </div>
              <button onClick={handleTranslate} className="w-full py-4 rounded-2xl font-black text-[10px] uppercase bg-amber-600 text-black hover:bg-amber-500 shadow-xl shadow-amber-600/10 transition-all">Translate Selection</button>
            </div>
          )}
        </div>
        {activeTab === 'chat' && (
          <div className="p-6 bg-[#0a0a0a] border-t border-zinc-900 shrink-0">
            <div className="relative flex items-center">
              <input type="text" placeholder="Analyze..." className="w-full bg-zinc-900 border border-zinc-800 rounded-2xl py-4 px-6 text-sm outline-none pr-14 focus:border-amber-500/50 transition-colors" value={userInput} onChange={e => setUserInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleChat()}/>
              <button onClick={handleChat} disabled={isAiLoading || !userInput.trim()} className="absolute right-3 p-2 text-zinc-600 hover:text-amber-500 transition-colors"><Send size={18} /></button>
            </div>
          </div>
        )}
      </aside>


      {/* NOTIFICATION OVERLAY */}
      {notification && (
        <div className="fixed bottom-8 right-8 z-50 animate-in">
            <div className={`border p-5 rounded-2xl flex items-start shadow-2xl backdrop-blur-md max-w-sm ${notification.type === 'error' ? 'bg-red-950/90 border-red-500/30' : 'bg-zinc-900/90 border-zinc-700'}`}>
                {notification.type === 'error' ? <AlertCircle className="text-red-500 shrink-0 mt-1" size={16}/> : <Info className="text-amber-500 shrink-0 m-1" size={16}/>}
                <div className="ml-3 mr-2 text-left">
                    <p className={`text-[10px] font-black uppercase tracking-widest mb-1 ${notification.type === 'error' ? 'text-red-500' : 'text-amber-500'}`}>
                      {notification.type === 'error' ? 'System' : 'Notice'}
                    </p>
                    <p className={`text-[10px] leading-relaxed ${notification.type === 'error' ? 'text-red-100' : 'text-zinc-300'}`}>{String(notification.text)}</p>
                </div>
                <button onClick={() => setNotification(null)} className="text-zinc-500 hover:text-white p-1 shrink-0"><X size={14}/></button>
            </div>
        </div>
      )}
      <style dangerouslySetInnerHTML={{ __html: `.vertical-text { writing-mode: vertical-rl; text-orientation: mixed; transform: rotate(180deg); } .custom-scrollbar::-webkit-scrollbar { width: 4px; } .custom-scrollbar::-webkit-scrollbar-thumb { background: #1c1c1c; border-radius: 10px; } ::selection { background: rgba(217, 119, 6, 0.25); color: #fbbf24; } .animate-in { animation: fadeIn 0.4s ease-out; } @keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }` }} />
    </div>
  );
}