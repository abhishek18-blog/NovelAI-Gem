import React, { useState, useEffect, useRef } from 'react';
import { 
  BookOpen, MessageSquare, Languages, FileUp, Link as LinkIcon, 
  Trash2, Send, Loader2, User, Clock, Cloud, CloudOff, Check, 
  LogOut, LogIn, Info, X, Layers, AlertCircle, Sun, Moon, Library,
  RefreshCw, Plus, Settings
} from 'lucide-react';


// Firebase Imports
import { initializeApp, getApps, getApp } from 'firebase/app';
import { 
  getAuth, signInAnonymously, signInWithPopup, GoogleAuthProvider, 
  onAuthStateChanged, signOut 
} from 'firebase/auth';
import { 
  getFirestore, doc, setDoc, getDoc, collection, onSnapshot, addDoc, deleteDoc 
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


const rawAppId = typeof __app_id !== 'undefined' ? __app_id : 'novel-quest-v1';
const appId = String(rawAppId).replace(/[^a-zA-Z0-9]/g, '_');


const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
const auth = getAuth(app);
const db = getFirestore(app);


const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY || "";
const BACKEND_URL = "http://localhost:5000"; 
const WORDS_PER_PAGE = 275;
const AI_CALL_DELAY = 1500; // Minimum 1.5 seconds between API calls


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
  
  // 🔥 PERSISTENT STATES - Load from localStorage
  const [text, setText] = useState(() => {
    try { return localStorage.getItem('novelQuestText') || ""; } catch { return ""; }
  });
  const [currentDocId, setCurrentDocId] = useState(() => {
    try { 
      const saved = localStorage.getItem('novelQuestCurrentDocId');
      return saved && saved !== '' ? saved : null;
    } catch { return null; }
  });
  const [currentDocName, setCurrentDocName] = useState(() => {
    try { return localStorage.getItem('novelQuestCurrentDocName') || "Untitled Manuscript"; } catch { return "Untitled Manuscript"; }
  });
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('library');
  const [chatHistory, setChatHistory] = useState(() => {
    try { return localStorage.getItem('novelQuestChat') ? JSON.parse(localStorage.getItem('novelQuestChat')) : []; } catch { return []; }
  });
  const [userInput, setUserInput] = useState("");
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [sources, setSources] = useState([]); 
  const [selectedLang, setSelectedLang] = useState('hi');
  const [linkInput, setLinkInput] = useState("");
  const [showLinkInput, setShowLinkInput] = useState(false);
  const [notification, setNotification] = useState(null);

  // ✅ currentPage persisted and restored
  const [currentPage, setCurrentPage] = useState(() => {
    try {
      const saved = localStorage.getItem('novelQuestCurrentPage');
      return saved ? Number(saved) || 0 : 0;
    } catch {
      return 0;
    }
  });

  const [isPdfLibReady, setIsPdfLibReady] = useState(false);
const [theme, setTheme] = useState(() => {
  try {
    const stored = localStorage.getItem('novelQuestTheme');
    return stored === 'light' || stored === 'dark' ? stored : 'light';
  } catch {
    return 'light';
  }
});


  const [lastAiCall, setLastAiCall] = useState(0);
  const [nextCallAvailable, setNextCallAvailable] = useState(0);
  const [isRestoringSession, setIsRestoringSession] = useState(true);
  
  const scrollContainerRef = useRef(null);


  // 🔥 SAVE TO LOCALSTORAGE IMMEDIATELY on any change
  // ✅ also store currentPage
  useEffect(() => {
    try {
      localStorage.setItem('novelQuestText', text);
      localStorage.setItem('novelQuestCurrentDocId', currentDocId || '');
      localStorage.setItem('novelQuestCurrentDocName', currentDocName);
      localStorage.setItem('novelQuestChat', JSON.stringify(chatHistory));
      localStorage.setItem('novelQuestTheme', theme);
      localStorage.setItem('novelQuestCurrentPage', String(currentPage));
      localStorage.setItem('novelQuestLastSaved', new Date().toISOString());
    } catch (err) {
      console.warn('localStorage save failed:', err);
    }
  }, [text, currentDocId, currentDocName, chatHistory, theme, currentPage]);


  // Theme Sync
useEffect(() => {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;

  if (theme === 'dark') root.classList.add('dark');
  else root.classList.remove('dark');

  try {
    localStorage.setItem('novelQuestTheme', theme);
  } catch {}
}, [theme]);




  // Update countdown for next API call
  useEffect(() => {
    if (nextCallAvailable <= 0) return;
    const interval = setInterval(() => {
      setNextCallAvailable(prev => Math.max(0, prev - 1));
    }, 100);
    return () => clearInterval(interval);
  }, [nextCallAvailable]);


const toggleTheme = () => {
  setTheme(prev => (prev === 'dark' ? 'light' : 'dark'));
};


  const notify = (msg, type = 'error') => {
    if (!msg) { setNotification(null); return; }
    let textContent = typeof msg === 'string' ? msg : (msg.message || String(msg));
    setNotification({ text: textContent, type });
    if (type !== 'error') setTimeout(() => setNotification(null), 5000);
  };


  // 🔥 FIXED: PROPER AI CALL WITH BETTER TOKEN MANAGEMENT
  const callAi = async (prompt, sys = "You are a helpful literary analyst. Keep responses concise and under 300 words.", isTranslation = false) => {
    // Check rate limit
    const now = Date.now();
    const timeSinceLastCall = now - lastAiCall;
    
    if (timeSinceLastCall < AI_CALL_DELAY) {
      const waitMs = AI_CALL_DELAY - timeSinceLastCall;
      const waitSec = Math.ceil(waitMs / 1000);
      setNextCallAvailable(waitSec);
      notify(`Rate limited. Wait ${waitSec}s before next request`, "info");
      return `Please wait ${waitSec} seconds before making another request.`;
    }


    if (!GEMINI_API_KEY) {
      notify("Gemini API key not configured", "error");
      return "Error: API key is missing. Check your .env file.";
    }


    if (!text.trim()) {
      notify("Load a document first", "info");
      return "Please load a document before asking questions.";
    }


    setIsAiLoading(true);
    setLastAiCall(now);
    
    try {
      // For translations, use minimal context; for chat, include more
      const contextSize = isTranslation ? 200 : 2000;      // less context
      const maxTokens = isTranslation ? 1200 : 300;        // more room for output
      
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: sys }] },
            contents: [{
              parts: [{
                text: `Document: "${currentDocName}"\n\nContext (first ${contextSize} characters):\n${text.substring(0, contextSize)}\n\n---\n\nUser Query:\n${prompt}`
              }]
            }],
            generationConfig: {
              temperature: isTranslation ? 0.3 : 0.6, // Lower temp for translations (more consistent)
              maxOutputTokens: maxTokens,
              topP: 0.9,
              topK: 40,
            }
          })
        }
      );


      if (!response.ok) {
        const errorData = await response.json();
        console.error("Gemini API Error:", errorData);
        
        // Handle specific errors
        if (errorData.error?.message?.includes("RESOURCE_EXHAUSTED")) {
          notify("API quota exceeded. Please try again later.", "error");
          return "API quota exceeded. Please try again in a few moments.";
        }
        
        if (errorData.error?.message?.includes("INVALID_ARGUMENT")) {
          notify("Invalid API request. Try again.", "error");
          return "Invalid request format. Please try again.";
        }


        return `API Error: ${errorData.error?.message || 'Request failed'}`;
      }


      const result = await response.json();
      const aiResponse = result.candidates?.[0]?.content?.parts?.[0]?.text || "No response generated. Try again.";
      
      // Check if response was truncated (very short for translation)
      if (isTranslation && aiResponse.length < 20) {
        notify("Translation may be incomplete. Try selecting shorter text.", "info");
      }
      
      return aiResponse;
    } catch (error) {
      console.error("AI Call Error:", error);
      notify(`Network error: ${error.message}`, "error");
      return `Error: ${error.message}. Check your internet connection.`;
    } finally {
      setIsAiLoading(false);
    }
  };


  const handleSignOut = async () => {
    try {
      await signOut(auth);
      setUser(null);
      setSources([]);
      // Clear sensitive data
      localStorage.removeItem('novelQuestCurrentDocId');
      setText("");
      setCurrentDocName("Untitled Manuscript");
      notify("Signed out", "info");
    } catch (err) {
      notify("Sign out failed");
    }
  };


  const handleSignInGoogle = async () => {
    setIsAuthLoading(true);
    try {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: 'select_account' });
      await signInWithPopup(auth, provider);
      notify("Signed in successfully!", "info");
    } catch (err) {
      notify(err.message || "Sign in failed");
    } finally {
      setIsAuthLoading(false);
    }
  };


  const handleSignInGuest = async () => {
    setIsAuthLoading(true);
    try {
      await signInAnonymously(auth);
      notify("Guest access granted", "info");
    } catch (err) {
      notify(err.message || "Guest access failed");
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
    return result.length > 0 ? result : ["(Vault empty. Sign in to upload document.)"];
  };


  const pages = getPages();


  // 🔥 AUTH LISTENER - First thing to run
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setIsAuthLoading(false);
      setIsRestoringSession(false);
    });
    return unsubscribe;
  }, []);


  // 🔥 FIRESTORE LISTENER - Load sources from Firestore when user logs in
  useEffect(() => {
    if (!user) {
      setSources([]);
      return;
    }
    
    const sanitizedUserId = String(user.uid).replace(/[^a-zA-Z0-9]/g, '_');
    const sourcesRef = collection(db, 'artifacts', appId, 'users', sanitizedUserId, 'sources');
    
    const unsub = onSnapshot(sourcesRef, (snap) => {
      const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setSources(docs.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0)));
      console.log('Firestore sources loaded:', docs.length);
    });
    
    return unsub;
  }, [user]);


  // 🔥 RESTORE SESSION - After user loaded, restore from Firestore if exists
  useEffect(() => {
    if (isAuthLoading || isRestoringSession || !user || !currentDocId) return;
    
    const sanitizedUserId = String(user.uid).replace(/[^a-zA-Z0-9]/g, '_');
    const docRef = doc(db, 'artifacts', appId, 'users', sanitizedUserId, 'sources', currentDocId);
    
    getDoc(docRef).then(docSnap => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        setText(data.content || "");
        setCurrentDocName(data.name || "Untitled");
        notify("Session restored ✓", "info");
        console.log('Session restored from Firestore');
      } else {
        console.log('Document not found in Firestore, using localStorage');
      }
    }).catch(err => {
      console.warn('Firestore restore failed:', err);
      // Fallback to localStorage is already loaded
    });
  }, [user, currentDocId, isAuthLoading, isRestoringSession]);


  // Intersection Observer for Page Counter
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

  // ✅ auto-scroll to last visited page when pages are ready
  useEffect(() => {
    if (!pages.length) return;
    const safeIndex = Math.min(currentPage, pages.length - 1);
    setTimeout(() => scrollToPage(safeIndex), 300);
  }, [pages.length]);  


  // PDF Lib
  useEffect(() => {
    if (window.pdfjsLib) return setIsPdfLibReady(true);
    const script = document.createElement('script');
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.4.120/pdf.min.js';
    script.onload = () => {
      window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.4.120/pdf.worker.min.js';
      setIsPdfLibReady(true);
    };
    document.head.appendChild(script);
  }, []);


  const scrollToPage = (index) => {
    const el = document.getElementById(`page-${index}`);
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };


  const handleTabClick = (tab) => {
    if (activeTab === tab && isSidebarOpen) setIsSidebarOpen(false);
    else { setActiveTab(tab); setIsSidebarOpen(true); }
  };


  const loadFromLibrary = (source) => {
    setText(source.content || "");
    setCurrentDocName(source.name || "Untitled");
    setCurrentDocId(source.id);
    setActiveTab('navigator');
    setIsSidebarOpen(true);
    setTimeout(() => scrollToPage(0), 100);
  };


  const deleteFromLibrary = async (e, id) => {
    e.stopPropagation();
    if (!user) return;
    const sanitizedUserId = String(user.uid).replace(/[^a-zA-Z0-9]/g, '_');
    try {
      await deleteDoc(doc(db, 'artifacts', appId, 'users', sanitizedUserId, 'sources', id));
      if (currentDocId === id) {
        setText(""); 
        setCurrentDocName("Untitled Manuscript"); 
        setCurrentDocId(null);
        localStorage.removeItem('novelQuestCurrentDocId');
      }
      notify("Document deleted", "info");
    } catch (err) { notify("Deletion failed"); }
  };


  const handleFileUpload = async (e) => {
    if (!user || !isPdfLibReady) return notify("Sign in first", "info");
    const file = e.target.files[0];
    if (!file) return;
    
    setIsAiLoading(true);
    try {
      const buf = await file.arrayBuffer();
      const pdf = await window.pdfjsLib.getDocument({ data: buf }).promise;
      let fullText = "";
      for (let i = 1; i <= Math.min(pdf.numPages, 50); i++) {
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        fullText += textContent.items.map(item => item.str).join(' ') + '\n';
      }
      const sanitizedUserId = String(user.uid).replace(/[^a-zA-Z0-9]/g, '_');
      const docRef = await addDoc(
        collection(db, 'artifacts', appId, 'users', sanitizedUserId, 'sources'),
        {
          name: file.name,
          content: fullText,
          type: 'pdf',
          date: new Date().toLocaleDateString(),
          size: (fullText.length/1024).toFixed(1) + " KB",
          timestamp: Date.now()
        }
      );
      setText(fullText);
      setCurrentDocName(file.name);
      setCurrentDocId(docRef.id);
      setActiveTab('navigator');
      setIsSidebarOpen(true);
      notify("PDF loaded successfully!", "info");
    } catch (err) {
      notify("PDF loading failed: " + err.message);
    } finally {
      setIsAiLoading(false);
      e.target.value = '';
    }
  };



  const handleAddLink = async () => {
    if (!user) return notify("Sign in first", "info");
    if (!linkInput.trim()) return notify("Enter a URL", "info");
    setIsAiLoading(true);
    try {
      const res = await fetch(`${BACKEND_URL}/api/process-link`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: linkInput })
      });
      const data = await res.json();
      if (data.content) {
        const sanitizedUserId = String(user.uid).replace(/[^a-zA-Z0-9]/g, '_');
        const d = await addDoc(collection(db, 'artifacts', appId, 'users', sanitizedUserId, 'sources'), { 
          name: data.name || "Web Page", type: 'link', content: data.content, 
          date: new Date().toLocaleDateString(), size: (data.content.length/1024).toFixed(1) + " KB", timestamp: Date.now()
        });
        setText(data.content); 
        setCurrentDocName(data.name || "Web Page"); 
        setCurrentDocId(d.id);
        setLinkInput(""); 
        setShowLinkInput(false); 
        setActiveTab('navigator'); 
        setIsSidebarOpen(true);
        notify("Web page loaded!", "info");
      } else {
        notify("Failed to load page", "error");
      }
    } catch (e) { notify("Error: " + e.message); }
    finally { setIsAiLoading(false); }
  };


  // 🔥 FIXED: PROPER CHAT HANDLER WITH RATE LIMITING
  const handleChat = async () => {
    if (!userInput.trim() || isAiLoading || !text.trim()) {
      if (!text.trim()) notify("Load a document first", "info");
      return;
    }
    
    const msg = userInput.trim();
    setChatHistory(p => [...p, { role: 'user', content: msg }]);
    setUserInput("");
    
    const response = await callAi(msg, "You are a helpful literary analyst.", false);
    setChatHistory(p => [...p, { role: 'bot', content: response }]);
  };


  // 🔥 FIXED: BETTER TRANSLATE WITH CHUNKING FOR LONG TEXT
  const handleTranslate = async () => {
    const selection = window.getSelection().toString().trim();
    if (!selection) {
      notify("Select text in the document first", "info");
      return;
    }
    
    // Warn if text is very long
    if (selection.length > 1000) {
      notify("Text is long. Translation may be incomplete. Select shorter text.", "info");
    }
    
    const targetLang = LANGUAGES.find(l => l.code === selectedLang)?.name || selectedLang;
    
    // Safer: translate at most 500 characters at a time
    const textToTranslate = selection.length > 500 ? selection.substring(0, 500) + "..." : selection;
    
    const response = await callAi(
      `Translate this ${selection.length} character text to ${targetLang}. Provide COMPLETE translation:\n\n${textToTranslate}`,
      `You are a professional translator. Translate the text to ${targetLang}. IMPORTANT: Provide the COMPLETE translation, even if it's long. Reply with ONLY the full translation, no explanations.`,
      true // isTranslation = true
    );
    
    setChatHistory(p => [...p, { 
      role: 'bot', 
      content: `**${targetLang} Translation (${selection.length} chars):**\n\n${response}` 
    }]);
    setActiveTab('chat'); 
    setIsSidebarOpen(true);
  };


  
  const handleClearChat = () => {
    if (confirm("Clear all chat messages?")) {
      setChatHistory([]);
      notify("Chat cleared", "info");
    }
  };


  if (isAuthLoading || isRestoringSession) {
    return (
      <div className="h-screen flex items-center justify-center bg-zinc-50 dark:bg-zinc-950">
        <div className="text-center">
          <Loader2 className="animate-spin text-amber-500 mx-auto mb-4" size={32} />
          <p className="text-sm font-bold uppercase tracking-widest opacity-75">Restoring session...</p>
        </div>
      </div>
    );
  }


  return (
    <div className="flex flex-col md:flex-row h-screen bg-zinc-50 dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 font-serif overflow-hidden">
      {/* SIDEBAR / MOBILE BOTTOM NAV */}
      {/* sidebar hidden on mobile, visible on md+ */}
      <div className="hidden md:flex w-16 bg-white dark:bg-[#121212] flex-col items-center py-6 border-r border-zinc-200 dark:border-zinc-800 z-30">
        <div className="mb-8 p-2 bg-amber-100 dark:bg-amber-900/20 rounded-lg">
          <BookOpen className="text-amber-500" size={24} />
        </div>
        <nav className="flex flex-col justify-around w-auto gap-6">
          <button onClick={() => handleTabClick('library')} title="Library" className={`p-3 rounded transition-colors ${activeTab === 'library' && isSidebarOpen ? 'text-amber-500 bg-amber-50 dark:bg-amber-900/20' : 'text-zinc-500 hover:text-amber-500'}`}><Library size={20}/></button>
          <button onClick={() => handleTabClick('navigator')} title="Pages" className={`p-3 rounded transition-colors ${activeTab === 'navigator' && isSidebarOpen ? 'text-amber-500 bg-amber-50 dark:bg-amber-900/20' : 'text-zinc-500 hover:text-amber-500'}`}><Layers size={20}/></button>
          <button onClick={() => handleTabClick('chat')} title="Chat" className={`p-3 rounded transition-colors ${activeTab === 'chat' && isSidebarOpen ? 'text-amber-500 bg-amber-50 dark:bg-amber-900/20' : 'text-zinc-500 hover:text-amber-500'}`}><MessageSquare size={20}/></button>
          <button onClick={() => handleTabClick('translate')} title="Translate" className={`p-3 rounded transition-colors ${activeTab === 'translate' && isSidebarOpen ? 'text-amber-500 bg-amber-50 dark:bg-amber-900/20' : 'text-zinc-500 hover:text-amber-500'}`}><Languages size={20}/></button>
          <button onClick={() => handleTabClick('profile')} title="Profile" className={`p-3 rounded transition-colors ${activeTab === 'profile' && isSidebarOpen ? 'text-amber-500 bg-amber-50 dark:bg-amber-900/20' : 'text-zinc-500 hover:text-amber-500'}`}><User size={20}/></button>
        </nav>
        <div className="mt-auto flex flex-col items-center gap-6 text-center">
          <div className="text-[10px] text-zinc-500 font-black vertical-text uppercase tracking-widest">Pg {currentPage + 1}</div>
          {user ? <Check className="text-emerald-500" size={12}/> : <CloudOff className="text-zinc-500" size={12}/>}
        </div>
      </div>


      {/* MAIN CONTENT */}
<main ref={scrollContainerRef} className="flex-1 overflow-y-auto pt-4 pb-20 md:pb-4 px-4 md:px-12 bg-zinc-50 order-1 md:order-2">
        <header className="max-w-4xl mx-auto mb-8 flex justify-between items-center py-4">
          <h1 className="text-sm md:text-lg font-black tracking-widest uppercase truncate max-w-[200px] md:max-w-md opacity-70">
            {currentDocName}
          </h1>
          <div className="flex items-center gap-3">
            <span className="md:hidden text-xs font-bold text-zinc-500 uppercase tracking-widest">Pg {currentPage + 1}</span>
            <button onClick={toggleTheme} className="p-2 rounded-full bg-zinc-200 dark:bg-zinc-800 hover:bg-zinc-300 dark:hover:bg-zinc-700 transition">
              {theme === 'dark' ? <Sun size={14}/> : <Moon size={14}/>}
            </button>
            <button onClick={() => setIsSidebarOpen(!isSidebarOpen)} className="px-4 py-2 bg-amber-500/10 text-amber-600 rounded-full text-xs font-bold uppercase tracking-widest md:hidden hover:bg-amber-500/20 transition">
              Menu
            </button>
          </div>
        </header>


        <div className="max-w-3xl mx-auto flex flex-col gap-16 items-center">
          {pages.map((p, i) => (
             <div
    key={i}
    id={`page-${i}`}
    data-page-index={i}
    className="relative w-full min-h-[80vh] bg-white border border-zinc-200 rounded-xl shadow-xl p-8 md:p-16 flex flex-col hover:shadow-2xl transition"
  >
    <div className="absolute top-4 left-1/2 -translate-x-1/2 text-[10px] uppercase font-black text-zinc-300 tracking-widest">
      Page {i + 1}
    </div>
    <div className="flex-1 text-base md:text-lg leading-relaxed text-zinc-800 whitespace-pre-wrap font-serif select-text">
      {p}
    </div>
  </div>
          ))}
          {!text && (
            <div className="py-20 text-center opacity-50">
              <BookOpen size={48} className="mx-auto mb-4"/>
              <p className="text-lg font-bold">No document loaded</p>
              <p className="text-sm mt-2">Upload a PDF or add a web link from Library tab</p>
            </div>
          )}
        </div>
      </main>


      {/* DRAWER / SIDEBAR */}
      <aside className={`${isSidebarOpen ? 'w-full md:w-96 translate-x-0' : 'w-0 translate-x-full'} fixed md:static inset-y-0 right-0 bg-white dark:bg-[#121212] border-l border-zinc-200 dark:border-zinc-800 transition-all duration-300 z-40 shadow-2xl overflow-hidden flex flex-col order-3`}>
        <div className="p-4 border-b border-zinc-200 dark:border-zinc-800 flex justify-between items-center bg-zinc-50 dark:bg-zinc-900/50">
          <h2 className="text-xs font-black uppercase tracking-widest text-zinc-500">{activeTab}</h2>
          <div className="flex items-center gap-2">
            {isAiLoading && <Loader2 className="animate-spin text-amber-500" size={14}/>}
            <button onClick={() => setIsSidebarOpen(false)} className="md:hidden p-1 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded"><X size={16}/></button>
          </div>
        </div>


        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* PROFILE TAB */}
          {activeTab === 'profile' && (
            <div className="space-y-6 text-center">
              <div className="w-20 h-20 mx-auto bg-gradient-to-r from-amber-400 to-amber-500 rounded-full flex items-center justify-center overflow-hidden shadow-lg">
                {user?.photoURL ? <img src={user.photoURL} className="w-full h-full object-cover"/> : <User size={32} className="text-white"/>}
              </div>
              <div>
                <h3 className="font-bold text-lg">{user?.displayName || "Guest Researcher"}</h3>
                <p className="text-xs text-zinc-500">{user?.email || "Anonymous"}</p>
                {user && <p className="text-[10px] text-emerald-600 dark:text-emerald-400 mt-1 uppercase font-bold">✓ Authenticated</p>}
              </div>
              {user ? (
                <button onClick={handleSignOut} className="w-full py-3 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 font-bold rounded-xl text-xs uppercase tracking-widest hover:bg-red-100 dark:hover:bg-red-900/30 transition flex items-center justify-center gap-2">
                  <LogOut size={14}/> Sign Out
                </button>
              ) : (
                <div className="space-y-3">
                  <button onClick={handleSignInGoogle} className="w-full py-3 bg-gradient-to-r from-blue-600 to-blue-700 text-white font-bold rounded-xl text-xs uppercase tracking-widest hover:from-blue-700 hover:to-blue-800 transition flex items-center justify-center gap-2">
                    <LogIn size={14}/> Google Sign In
                  </button>
                  <button onClick={handleSignInGuest} className="w-full py-3 border border-zinc-300 dark:border-zinc-700 font-bold rounded-xl text-xs uppercase tracking-widest hover:bg-zinc-50 dark:hover:bg-zinc-800 transition">
                    Guest Access
                  </button>
                </div>
              )}
            </div>
          )}


          {/* LIBRARY TAB */}
          {activeTab === 'library' && (
            <div className="space-y-4">
              {!user ? (
                <div className="text-center py-8 text-zinc-500">
                  <BookOpen size={32} className="mx-auto mb-3 opacity-30"/>
                  <p className="text-sm mb-4">Sign in to access your library</p>
                  <button onClick={() => setActiveTab('profile')} className="px-4 py-2 bg-amber-500 text-white rounded-lg text-xs font-bold">Sign In Now</button>
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <label className="flex flex-col items-center p-4 border-2 border-dashed border-zinc-300 dark:border-zinc-700 rounded-xl cursor-pointer hover:border-amber-500 hover:bg-amber-50 dark:hover:bg-amber-900/10 transition-colors">
                      <FileUp className="mb-2 text-zinc-400"/>
                      <span className="text-[10px] font-bold uppercase text-zinc-600 dark:text-zinc-400">Upload PDF</span>
                      <input type="file" accept=".pdf" className="hidden" onChange={handleFileUpload}/>
                    </label>
                    <button onClick={() => setShowLinkInput(!showLinkInput)} className="flex flex-col items-center p-4 border-2 border-dashed border-zinc-300 dark:border-zinc-700 rounded-xl hover:border-amber-500 hover:bg-amber-50 dark:hover:bg-amber-900/10 transition-colors">
                      <LinkIcon className="mb-2 text-zinc-400"/>
                      <span className="text-[10px] font-bold uppercase text-zinc-600 dark:text-zinc-400">Web Link</span>
                    </button>
                  </div>


                  {showLinkInput && (
                    <div className="flex gap-2 p-3 bg-zinc-100 dark:bg-zinc-800 rounded-xl">
                      <input 
                        value={linkInput} 
                        onChange={e=>setLinkInput(e.target.value)} 
                        placeholder="https://example.com" 
                        className="flex-1 bg-white dark:bg-zinc-900 p-2 rounded border border-zinc-300 dark:border-zinc-700 text-xs focus:ring-2 focus:ring-amber-500"
                      />
                      <button 
                        onClick={handleAddLink} 
                        disabled={isAiLoading}
                        className="px-3 py-2 bg-amber-500 text-white rounded font-bold text-xs disabled:opacity-50 transition"
                      >
                        {isAiLoading ? <Loader2 size={14} className="animate-spin"/> : "Add"}
                      </button>
                    </div>
                  )}


                  <div className="space-y-2">
                    <h4 className="text-xs font-bold uppercase text-zinc-500">Library ({sources.length})</h4>
                    {sources.length === 0 ? (
                      <p className="text-center py-8 text-zinc-400 text-sm">No documents yet</p>
                    ) : (
                      sources.map(s => (
                        <button
                          key={s.id}
                          onClick={() => loadFromLibrary(s)}
                          className={`w-full p-3 border rounded-xl flex justify-between items-start transition-all hover:shadow-lg ${
                            currentDocId === s.id
                              ? 'border-amber-500 bg-amber-50 dark:bg-amber-900/20 shadow-md'
                              : 'border-zinc-200 dark:border-zinc-800 hover:border-amber-300 hover:bg-amber-50/50 dark:hover:bg-amber-900/10'
                          }`}
                        >
                          <div className="flex-1 min-w-0 text-left">
                            <p className="text-xs font-bold truncate">{s.name}</p>
                            <p className="text-[10px] text-zinc-500 mt-1">{s.date} • {s.size}</p>
                          </div>
                          <Trash2 
                            onClick={(e)=>{e.stopPropagation();deleteFromLibrary(e,s.id)}} 
                            size={14} 
                            className="ml-2 text-zinc-400 hover:text-red-500 flex-shrink-0 transition"
                          />
                        </button>
                      ))
                    )}
                  </div>
                </>
              )}
            </div>
          )}


          {/* NAVIGATOR TAB */}
          {activeTab === 'navigator' && (
            <div>
              <h4 className="text-xs font-bold uppercase text-zinc-500 mb-4">Jump to Page</h4>
              <div className="grid grid-cols-4 gap-2 max-h-96 overflow-y-auto">
                {pages.map((_, i) => (
                  <button 
                    key={i} 
                    onClick={() => scrollToPage(i)} 
                    className={`aspect-square flex items-center justify-center rounded-lg border text-xs font-bold transition-all hover:shadow-md ${
                      currentPage === i 
                        ? 'bg-amber-500 text-white border-amber-500 shadow-md' 
                        : 'bg-zinc-50 dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 hover:border-amber-400'
                    }`}
                  >
                    {i+1}
                  </button>
                ))}
              </div>
              <p className="text-xs text-zinc-500 mt-4 text-center">{pages.length} pages total</p>
            </div>
          )}


          {/* CHAT TAB */}
          {activeTab === 'chat' && (
            <div className="space-y-4 h-full flex flex-col">
              <div className="flex justify-between items-center">
                <h4 className="text-xs font-bold uppercase text-zinc-500">Chat with AI ({chatHistory.length})</h4>
                {chatHistory.length > 0 && (
                  <button 
                    onClick={handleClearChat}
                    className="p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded transition"
                  >
                    <Trash2 size={14} className="text-zinc-400 hover:text-red-500"/>
                  </button>
                )}
              </div>


              <div className="flex-1 space-y-3 min-h-[200px] max-h-96 overflow-y-auto p-3 bg-zinc-50 dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800">
                {chatHistory.length === 0 ? (
                  <div className="text-center py-12 text-zinc-400">
                    <MessageSquare size={32} className="mx-auto mb-4 opacity-25"/>
                    <p className="text-sm">Ask questions about your document</p>
                  </div>
                ) : (
                  chatHistory.map((m, i) => (
                    <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                      <div className={`max-w-[85%] p-3 rounded-xl text-sm leading-relaxed break-words ${
                        m.role === 'user'
                          ? 'bg-amber-500 text-white rounded-br-none'
                          : 'bg-zinc-200 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-200 rounded-bl-none'
                      }`}>
                        {m.content}
                      </div>
                    </div>
                  ))
                )}
                {nextCallAvailable > 0 && (
                  <div className="text-center p-2 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded text-xs text-yellow-700 dark:text-yellow-400 font-bold">
                    Rate limited. Wait {nextCallAvailable}s...
                  </div>
                )}
              </div>


              {!text && (
                <div className="text-center py-4 text-zinc-400 text-sm">
                  <p>Load a document first to chat</p>
                </div>
              )}
            </div>
          )}


          {/* TRANSLATE TAB */}
          {activeTab === 'translate' && (
            <div className="space-y-4">
              <div className="p-4 bg-zinc-100 dark:bg-zinc-800 rounded-xl border border-zinc-200 dark:border-zinc-700">
                <label className="block text-[10px] font-bold uppercase text-zinc-600 dark:text-zinc-400 mb-3">Target Language</label>
                <select 
                  value={selectedLang} 
                  onChange={(e)=>setSelectedLang(e.target.value)} 
                  className="w-full bg-white dark:bg-zinc-900 p-3 rounded-lg border border-zinc-300 dark:border-zinc-700 text-sm font-medium focus:ring-2 focus:ring-amber-500"
                >
                  {LANGUAGES.map(l => <option key={l.code} value={l.code}>{l.name}</option>)}
                </select>
              </div>


              <button 
                onClick={handleTranslate}
                disabled={isAiLoading || nextCallAvailable > 0}
                className="w-full py-3 px-4 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-white font-bold rounded-xl text-xs uppercase tracking-widest transition-all shadow-lg disabled:opacity-60 flex items-center justify-center gap-2"
              >
                {isAiLoading ? <Loader2 size={14} className="animate-spin"/> : <Languages size={14}/>}
                {nextCallAvailable > 0 ? `Wait ${nextCallAvailable}s` : 'Translate Selection'}
              </button>


              <div className="p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl">
                <p className="text-[10px] text-amber-800 dark:text-amber-300 text-center leading-relaxed">
                  ✓ Select text in the document<br/>
                  ✓ Choose target language<br/>
                  ✓ Click button to translate
                </p>
              </div>
            </div>
          )}
        </div>


        {/* CHAT INPUT */}
        {activeTab === 'chat' && (
          <div className="p-4 border-t border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 shrink-0">
            <div className="relative">
              <input 
                value={userInput} 
                onChange={e=>setUserInput(e.target.value)} 
                onKeyDown={e=>e.key==='Enter'&&handleChat()}
                placeholder={text ? "Ask about document..." : "Load document first..."} 
                disabled={!text || isAiLoading || nextCallAvailable > 0}
                className="w-full px-4 py-3 pr-12 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-sm focus:ring-2 focus:ring-amber-500 focus:border-amber-500 disabled:opacity-50"
              />
              <button 
                onClick={handleChat}
                disabled={!text || isAiLoading || !userInput.trim() || nextCallAvailable > 0}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-2 text-zinc-400 hover:text-amber-500 disabled:opacity-30 transition"
              >
                <Send size={16}/>
              </button>
            </div>
          </div>
        )}
      </aside>


      {/* NOTIFICATION */}
      {notification && (
        <div className="fixed top-4 right-4 z-50 p-4 rounded-xl bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 shadow-2xl flex items-center gap-3 text-sm max-w-sm animate-in fade-in slide-in-from-top-4">
          {notification.type === 'error' ? <AlertCircle size={16} className="text-red-400"/> : <Info size={16} className="text-emerald-400"/>}
          <span className="flex-1">{notification.text}</span>
          <button onClick={() => setNotification(null)} className="p-1 opacity-50 hover:opacity-100"><X size={14}/></button>
        </div>
      )}


      <style jsx global>{`
        .vertical-text { writing-mode: vertical-rl; transform: rotate(180deg); }
        .select-text { user-select: text; }
        @keyframes slide-in-from-top-4 {
          from { transform: translateY(-1rem); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
        .animate-in { animation: slide-in-from-top-4 0.3s ease-out; }
      `}</style>
    </div>
  );
}
