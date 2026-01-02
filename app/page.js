"use client";
import { useState, useEffect, useRef, useMemo } from 'react';
// Firebase
import { auth, googleProvider, db } from '../firebase'; 
import { signInWithPopup, signOut, onAuthStateChanged, setPersistence, browserLocalPersistence  } from "firebase/auth";
import { collection, addDoc, query, where, onSnapshot, deleteDoc, doc, orderBy, serverTimestamp, setDoc, getDoc, Timestamp} from "firebase/firestore";
// Grafik Kütüphanesi
import { AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts';

const COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#6366F1', '#14B8A6'];

const CustomTooltip = ({ active, payload, label }) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-white/95 backdrop-blur-sm p-2 border border-slate-100 shadow-md rounded-lg text-xs z-50">
        <p className="font-bold text-slate-700 mb-1">{label ? label : payload[0].name}</p>
        {payload.map((entry, index) => (
          <div key={index} className="text-slate-600 font-mono">
             {entry.name}: {entry.value.toLocaleString()}
          </div>
        ))}
      </div>
    );
  }
  return null;
};

export default function Home() {
  // --- STATE TANIMLARI ---
  const [authLoading, setAuthLoading] = useState(true);
  const [user, setUser] = useState(null);
  const [messages, setMessages] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  
  // Modallar
  const [modalOpen, setModalOpen] = useState(false);
  const [itemToDelete, setItemToDelete] = useState(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [showLanguageModal, setShowLanguageModal] = useState(false); 

  // Ayarlar
  const [tempBalance, setTempBalance] = useState("");
  const [startingBalance, setStartingBalance] = useState(0); 
  const [currency, setCurrency] = useState('JPY'); 
  const [language, setLanguage] = useState('en'); 

  const [isChatOpen, setIsChatOpen] = useState(false);
  const chatEndRef = useRef(null);
  const [chartView, setChartView] = useState('monthly');

  // --- 1. VERİ ÇEKME FONKSİYONLARI ---
  const listenToTransactions = (uid) => {
    const q = query(collection(db, "transactions"), where("uid", "==", uid));

    const unsubscribe = onSnapshot(q, (querySnapshot) => {
      const transactionsData = [];
      querySnapshot.forEach((doc) => { transactionsData.push({ ...doc.data(), id: doc.id }); });

      transactionsData.sort((a, b) => {
        const dateA = a.date && a.date.toDate ? a.date.toDate() : new Date(a.date || 0);
        const dateB = b.date && b.date.toDate ? b.date.toDate() : new Date(b.date || 0);
        if (dateB.getTime() === dateA.getTime()) {
            const createdA = a.createdAt && a.createdAt.toDate ? a.createdAt.toDate() : new Date(0);
            const createdB = b.createdAt && b.createdAt.toDate ? b.createdAt.toDate() : new Date(0);
            return createdB - createdA;
        }
        return dateB - dateA;
      });

      setTransactions(transactionsData);
    });
  };

  const fetchSettings = async (uid) => {
      const docRef = doc(db, "user_settings", uid);
      const docSnap = await getDoc(docRef);
      
      if (docSnap.exists()) {
          const data = docSnap.data();
          if (data.startingBalance) setStartingBalance(data.startingBalance);
          if (data.currency) setCurrency(data.currency);
          if (data.language) setLanguage(data.language);
      } else {
          setShowLanguageModal(true);
      }
  };

  // --- 2. AUTH & SETUP ---
  useEffect(() => {
    const initAuth = async () => {
      try { await setPersistence(auth, browserLocalPersistence); } catch (error) { console.error(error); }

      const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
        setUser(currentUser);
        if (currentUser) {
          listenToTransactions(currentUser.uid);
          fetchSettings(currentUser.uid);
        } else {
          setTransactions([]);
        }
        setAuthLoading(false);
      });
      return unsubscribe;
    };
    initAuth();
  }, []);

  // --- 3. İŞLEM KAYDETME (API) ---
  const handleSend = async (e) => {
    e.preventDefault();
    if (!input.trim()) return;
    
    const userMsg = { role: 'user', text: input, time: new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) };
    setMessages(prev => [...prev, userMsg]);
    setInput("");
    setLoading(true);

    try {
      const res = await fetch('/api/chat', { 
        method: 'POST', 
        headers: { 'Content-Type': 'application/json', 'x-app-key': process.env.NEXT_PUBLIC_APP_SECRET_KEY }, 
        body: JSON.stringify({ 
            message: userMsg.text,
            userName: user.displayName || "Dostum",
            currency: currency 
        }) 
      });
      
      const data = await res.json();
      setMessages(prev => [...prev, { role: 'ai', text: data.reply || "İşlendi.", time: new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) }]);
      
      if (data.transactions && Array.isArray(data.transactions) && user) {
        data.transactions.forEach(async (t) => {
          const safeAmount = parseFloat(t.amount);
          if (!isNaN(safeAmount)) {
              let finalDate = new Date();
              if (t.date) {
                const aiDate = new Date(t.date);
                const today = new Date();
                const isSameDay = aiDate.getDate() === today.getDate() && aiDate.getMonth() === today.getMonth() && aiDate.getFullYear() === today.getFullYear();
                if (!isSameDay) finalDate = aiDate;
              }
              await addDoc(collection(db, "transactions"), {
                uid: user.uid, desc: t.desc || "Genel", category: t.category || "Diğer", amount: safeAmount, date: Timestamp.fromDate(finalDate), createdAt: serverTimestamp()
              });
          }
        });
      }
    } catch (error) { console.error(error); setMessages(prev => [...prev, { role: 'ai', text: "Hata oluştu.", time: "Now" }]); } finally { setLoading(false); }
  };

  // --- 4. AYARLARI KAYDETME ---
  const handleSelectPreference = async (selectedLang, selectedCurrency) => {
    if (!user) return;
    try {
        await setDoc(doc(db, "user_settings", user.uid), { 
            language: selectedLang,
            currency: selectedCurrency 
        }, { merge: true });
        
        setLanguage(selectedLang);
        setCurrency(selectedCurrency);
        setShowLanguageModal(false);
    } catch (error) { console.error("Ayar kaydedilemedi", error); }
  };

  const handleSaveSettings = async () => {
    if (!user) return;
    const newBalance = parseFloat(tempBalance);
    if (isNaN(newBalance)) return;
    try {
      await setDoc(doc(db, "user_settings", user.uid), { startingBalance: newBalance }, { merge: true });
      setStartingBalance(newBalance);
      setIsSettingsOpen(false);
    } catch (error) { console.error(error); }
  };

  // --- 5. HESAPLAMALAR ---
  const allTimeIncome = transactions.filter(t => Number(t.amount) > 0).reduce((acc, t) => acc + Number(t.amount), 0);
  const allTimeExpense = transactions.filter(t => Number(t.amount) < 0).reduce((acc, t) => acc + Math.abs(Number(t.amount)), 0);
  const totalBalance = (allTimeIncome - allTimeExpense) + startingBalance;

  const now = new Date();
  const currentMonth = now.getMonth(); 
  const currentYear = now.getFullYear();
  const currentMonthLabel = now.toLocaleDateString(language === 'tr' ? 'tr-TR' : 'en-US', { month: '2-digit', year: 'numeric' });

  const thisMonthTransactions = transactions.filter(t => {
      if (!t.date) return false;
      const tDate = t.date.toDate ? t.date.toDate() : new Date(t.date || 0);
      return tDate.getMonth() === currentMonth && tDate.getFullYear() === currentYear;
  });

  const monthlyIncome = thisMonthTransactions.filter(t => t.amount > 0).reduce((acc, t) => acc + t.amount, 0);
  const monthlyExpense = thisMonthTransactions.filter(t => t.amount < 0).reduce((acc, t) => acc + Math.abs(t.amount), 0);
  const monthlyFlow = monthlyIncome - monthlyExpense;
  const savingsRate = monthlyIncome > 0 ? monthlyFlow / monthlyIncome : 0;

  // Tasarruf Eşik Değerleri (Para birimine göre ayarla)
  // JPY için 50000, TRY için 10000 gibi düşünebiliriz.
  const dangerLimit = currency === 'JPY' ? 20000 : 5000;
  const safeLimit = currency === 'JPY' ? 50000 : 15000;

  // --- GRAFİK DATA ---
  const chartData = useMemo(() => {
    const last30Days = [];
    for (let i = 29; i >= 0; i--) {
        const d = new Date(); d.setDate(d.getDate() - i);
        const dateKey = d.toLocaleDateString(language === 'tr' ? 'tr-TR' : 'ja-JP', { month: 'numeric', day: 'numeric' });
        const dayTransactions = transactions.filter(t => { if(!t.date) return false; const tDate = t.date.toDate ? t.date.toDate() : new Date(t.date || 0); return tDate.getDate() === d.getDate() && tDate.getMonth() === d.getMonth(); });
        const dayIncome = dayTransactions.filter(t => t.amount > 0).reduce((acc, t) => acc + t.amount, 0);
        const dayExpense = dayTransactions.filter(t => t.amount < 0).reduce((acc, t) => acc + Math.abs(t.amount), 0);
        last30Days.push({ name: dateKey, Gelir: dayIncome, Gider: dayExpense });
    }
    return last30Days;
  }, [transactions, language]);

  const categoryData = useMemo(() => {
    const expenses = transactions.filter(t => t.amount < 0);
    const categoryMap = {};
    expenses.forEach(t => { const cat = t.category || "Diğer"; if (!categoryMap[cat]) categoryMap[cat] = 0; categoryMap[cat] += Math.abs(t.amount); });
    return Object.keys(categoryMap).map(key => ({ name: key, value: categoryMap[key] })).sort((a, b) => b.value - a.value);
  }, [transactions]);

  const displayData = useMemo(() => {
    const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
    const data = [];
    for (let i = 1; i <= daysInMonth; i++) {
        const dayTransactions = transactions.filter(t => { if(!t.date) return false; const tDate = t.date.toDate ? t.date.toDate() : new Date(t.date || 0); return tDate.getDate() === i && tDate.getMonth() === currentMonth; });
        const dayIncome = dayTransactions.filter(t => t.amount > 0).reduce((acc, t) => acc + t.amount, 0);
        const dayExpense = dayTransactions.filter(t => t.amount < 0).reduce((acc, t) => acc + Math.abs(t.amount), 0);
        data.push({ day: i, net: dayIncome - dayExpense });
    }
    return data;
  }, [transactions, currentMonth]);

  // --- FORMATTER ---
  const formatMoney = (amount) => {
    if (currency === 'TRY') {
        return new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY', maximumFractionDigits: 0 }).format(amount);
    } else if (currency === 'USD') {
        return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(amount);
    }
    return new Intl.NumberFormat('ja-JP', { style: 'currency', currency: 'JPY', maximumFractionDigits: 0 }).format(amount);
  };

  const handleLogin = async () => { await signInWithPopup(auth, googleProvider); };
  const handleLogout = async () => { await signOut(auth); setMessages([]); localStorage.removeItem("chatHistory"); };
  const confirmDelete = (id) => { setItemToDelete(id); setModalOpen(true); };
  const handleDelete = async () => { if (!itemToDelete) return; await deleteDoc(doc(db, "transactions", itemToDelete)); setModalOpen(false); setItemToDelete(null); };
  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, isChatOpen]);

  // --- RENDER ---
  if (authLoading) return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <div className="flex flex-col items-center gap-4">
          <div className="relative flex h-20 w-20 items-center justify-center rounded-2xl bg-white shadow-xl shadow-blue-500/20">
            <span className="material-symbols-outlined text-4xl text-blue-600 animate-pulse">calculate</span>
            <div className="absolute inset-0 rounded-2xl border-2 border-blue-100"></div>
            <div className="absolute inset-0 rounded-2xl border-t-2 border-blue-600 animate-spin"></div>
          </div>
          <div className="text-center">
            <h2 className="text-lg font-bold text-slate-700">Finans AI</h2>
            <p className="text-xs text-slate-400 font-medium animate-pulse">Yükleniyor...</p>
          </div>
        </div>
      </div>
  );

  if (!user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 relative overflow-hidden">
        <div className="z-10 flex flex-col items-center gap-6 p-10 bg-white/70 backdrop-blur-xl border border-slate-200 rounded-3xl shadow-2xl max-w-md text-center">
            <h1 className="text-3xl font-bold text-slate-800">Finans AI</h1>
            <button onClick={handleLogin} className="px-6 py-3 bg-white border rounded-xl shadow-sm hover:bg-slate-50 font-bold text-slate-700">Google ile Giriş Yap</button>
        </div>
      </div>
    );
  }

  return (
    <div className="relative flex min-h-screen w-full flex-col overflow-x-hidden bg-slate-50 text-slate-800 font-['Manrope']">
      
      {/* CSS: IŞILTI EFEKTİ (GERİ GETİRİLDİ) */}
      <style jsx>{`
        @keyframes shimmer {
          0% { transform: translateX(-150%); }
          50% { transform: translateX(150%); }
          100% { transform: translateX(150%); }
        }
        .animate-shimmer {
          animation: shimmer 2.5s infinite;
        }
      `}</style>

      {/* HEADER */}
      <header className="fixed top-0 left-0 w-full z-[40] h-20 flex items-center justify-between border-b border-slate-200 bg-white/80 backdrop-blur-xl px-6 md:px-10">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl shadow-lg shadow-blue-500/30">
            <span className="material-symbols-outlined text-2xl">calculate</span>
          </div>
          <h2 className="text-xl font-bold tracking-tight text-slate-800">Finans AI</h2>
        </div>
        <div className="flex items-center gap-4">
          <span className="hidden md:inline text-sm font-bold text-slate-700">{user.displayName}</span>
          <span className="text-xs font-mono bg-slate-100 px-2 py-1 rounded">{currency}</span>
          <button onClick={handleLogout} className="p-2 text-slate-400 hover:text-red-500"><span className="material-symbols-outlined">logout</span></button>
        </div>
      </header>

      {/* MAIN CONTENT */}
      <main className="relative z-0 flex-1 overflow-y-auto p-4 pt-24 mt-0 pb-32">
        <div className="mx-auto flex max-w-[1200px] flex-col gap-6">
          
          {/* ÖZET KART (GIF VE SHIMMER GERİ GELDİ) */}
          <div className="relative z-0 w-full rounded-2xl bg-white border border-slate-200 p-5 shadow-sm overflow-hidden group hover:shadow-md transition-all">
            <div className="flex flex-row items-center justify-between gap-4">
              <div className="flex-1 flex flex-col justify-center gap-2 min-w-0">
                <div>
                    <h3 className="text-base md:text-lg font-bold text-slate-800 truncate">
                        {monthlyFlow < 0 ? (language === 'tr' ? "Bütçe Aşıldı! 🚨" : "Over Budget! 🚨") : 
                         monthlyFlow < dangerLimit ? (language === 'tr' ? "Dikkatli Ol! 🚨" : "Watch Out! 🚨") : 
                         monthlyFlow < safeLimit ? (language === 'tr' ? "İdare Eder 👍" : "Not Bad 👍") :
                         (language === 'tr' ? "Süper Gidiyorsun! 🚀" : "Great Job! 🚀")}
                    </h3>
                    <p className="text-xs text-slate-500 line-clamp-1">
                        {monthlyFlow < 0 ? `${formatMoney(Math.abs(monthlyFlow))} ${language==='tr'?'aşıldı':'over'}` : `${language==='tr'?'Tasarruf':'Saving'}`}
                    </p>
                </div>
                {/* BAR (IŞILTILI) */}
                <div className="relative w-full h-3 bg-slate-100 rounded-full overflow-hidden border border-slate-200">
                    <div className={`relative h-full transition-all duration-1000 ease-out shadow-sm overflow-hidden ${monthlyFlow >= 0 ? 'bg-gradient-to-r from-emerald-400 to-emerald-500' : 'bg-gradient-to-r from-red-500 to-red-600'}`} style={{ width: monthlyFlow >= 0 ? `${monthlyIncome > 0 ? Math.min((monthlyFlow / monthlyIncome) * 100, 100) : 0}%` : '100%' }}>
                        <div className="absolute top-0 left-0 w-full h-full bg-gradient-to-r from-transparent via-white/60 to-transparent -skew-x-12 animate-shimmer"></div>
                    </div>
                </div>
              </div>

              {/* KARAKTER GIF (GERİ GELDİ) */}
              <div className={`h-16 w-16 md:h-20 md:w-20 shrink-0 flex items-center justify-center rounded-2xl border-2 md:border-4 shadow-sm transition-all 
                ${monthlyFlow < 0 ? 'bg-red-50 border-red-200' : monthlyFlow < safeLimit ? 'bg-orange-50 border-orange-200' : savingsRate < 0.65 ? 'bg-blue-50 border-blue-200' : 'bg-emerald-50 border-emerald-200' }`}>
                {monthlyFlow < 0 ? <img src="/unhappy.gif" className="h-14 w-14 md:h-16 md:w-16 object-contain scale-x-[-1]"/> : 
                 monthlyFlow < safeLimit ? <img src="/notr.gif" className="h-14 w-14 md:h-16 md:w-16 object-contain scale-x-[-1]"/> : 
                 savingsRate < 0.65 ? <img src="/good.gif" className="h-14 w-14 md:h-16 md:w-16 object-contain scale-x-[-1]"/> : 
                 <img src="/happy.gif" className="h-14 w-14 md:h-16 md:w-16 object-contain scale-x-[-1]"/>}
              </div>
            </div>
          </div>
          
          {/* GRAFİK */}
          <div className="w-full h-72 bg-white rounded-2xl border border-slate-200 p-6 shadow-sm mt-6">
              <div className="w-full h-full min-h-[200px]">
                  <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={displayData} margin={{ top: 10, right: 0, left: -20, bottom: 25 }}>
                          <defs><linearGradient id="colorNet" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#3b82f6" stopOpacity={0.8}/><stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/></linearGradient></defs>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                          <XAxis dataKey="day" axisLine={false} tickLine={false} tick={{fill: '#94a3b8', fontSize: 11}} />
                          <YAxis axisLine={false} tickLine={false} tick={{fill: '#94a3b8', fontSize: 11}} tickFormatter={(value) => currency === 'JPY' ? `¥${value/1000}k` : `${value}`} />
                          <Tooltip content={<CustomTooltip />} />
                          <Area type="monotone" dataKey="net" stroke="#3b82f6" fillOpacity={1} fill="url(#colorNet)" strokeWidth={3} />
                      </AreaChart>
                  </ResponsiveContainer>
              </div>
          </div>

          {/* İKİLİ GRAFİK */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
             <div className="w-full h-80 bg-white rounded-2xl border border-slate-200 p-6 shadow-sm flex flex-col">
                 <h3 className="text-sm font-bold uppercase tracking-widest text-slate-500 mb-4 shrink-0">{language === 'tr' ? 'Akış' : 'Flow'}</h3>
                 <div className="flex-1 w-full min-h-[200px] relative overflow-hidden">
                    <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={chartData}><Bar dataKey="Gelir" fill="#10B981" radius={[4, 4, 0, 0]} /><Bar dataKey="Gider" fill="#F43F5E" radius={[4, 4, 0, 0]} /></BarChart>
                    </ResponsiveContainer>
                 </div>
             </div>
             <div className="w-full h-80 bg-white rounded-2xl border border-slate-200 p-6 shadow-sm flex flex-col">
                 <h3 className="text-sm font-bold uppercase tracking-widest text-slate-500 mb-2 shrink-0">{language === 'tr' ? 'Kategoriler' : 'Categories'}</h3>
                 <div className="flex-1 w-full min-h-[200px] relative overflow-hidden flex items-center justify-center">
                    <ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={categoryData} cx="50%" cy="50%" innerRadius={70} outerRadius={100} paddingAngle={3} dataKey="value">{categoryData.map((entry, index) => (<Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} stroke="none" />))}</Pie><Tooltip /></PieChart></ResponsiveContainer>
                 </div>
             </div>
          </div>

          {/* LİSTE */}
          <div className="flex flex-col gap-6 rounded-2xl p-6 border border-slate-200 bg-white shadow-sm">
              <div className="flex items-center justify-between border-b border-slate-100 pb-4">
                <h3 className="text-lg font-bold text-slate-800">{language === 'tr' ? 'Cüzdan' : 'Wallet'}</h3>
                <button onClick={() => { setTempBalance(startingBalance); setIsSettingsOpen(true); }} className="px-3 py-1 bg-slate-50 border rounded text-xs font-bold text-slate-600">{language === 'tr' ? 'Devir:' : 'Start:'} {formatMoney(startingBalance)}</button>
              </div>
              <div className="text-center py-6"><p className="text-5xl font-bold text-slate-800">{formatMoney(totalBalance)}</p></div>
              <div className="flex flex-col gap-3">
                  {transactions.map((t) => (
                    <div key={t.id || Math.random()} className="flex items-center justify-between p-3 bg-white border border-slate-100 rounded-xl">
                         <div className="flex items-center gap-3">
                            <div className={`w-10 h-10 rounded-full flex items-center justify-center ${t.amount < 0 ? 'bg-orange-50 text-orange-500' : 'bg-green-50 text-green-500'}`}><span className="material-symbols-outlined text-[20px]">{t.amount < 0 ? 'shopping_cart' : 'payments'}</span></div>
                            <div><div className="text-sm font-bold text-slate-700">{t.desc}</div><div className="text-[10px] text-slate-400">{t.category} • {t.date?.toDate ? t.date.toDate().toLocaleDateString(language==='tr'?'tr-TR':'ja-JP') : ''}</div></div>
                         </div>
                         <div className="flex items-center gap-3">
                            <span className={`text-sm font-bold ${t.amount < 0 ? 'text-slate-800' : 'text-green-600'}`}>{t.amount < 0 ? '' : '+'}{formatMoney(t.amount)}</span>
                            <button onClick={() => confirmDelete(t.id)} className="text-slate-300 hover:text-red-500"><span className="material-symbols-outlined text-lg">delete</span></button>
                         </div>
                    </div>
                  ))}
              </div>
          </div>
        </div>
      </main>

      {/* CHAT */}
      <div className="fixed bottom-6 right-6 z-[9999] flex flex-col items-end gap-4">
        <div className={`bg-white border border-slate-200 shadow-2xl rounded-2xl overflow-hidden flex flex-col transition-all duration-300 ease-in-out origin-bottom-right ${isChatOpen ? 'w-[350px] h-[500px] opacity-100 scale-100' : 'w-0 h-0 opacity-0 scale-50 pointer-events-none'}`}>
            <div className="bg-blue-600 p-4 flex items-center justify-between text-white shrink-0">
                <span className="font-bold text-sm">Finans Asistanı</span>
                <button onClick={() => setIsChatOpen(false)}><span className="material-symbols-outlined text-lg">close</span></button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 bg-slate-50 flex flex-col gap-3">
                {messages.map((msg, index) => (<div key={index} className={`flex flex-col max-w-[85%] ${msg.role === 'user' ? 'self-end items-end' : 'self-start items-start'}`}><div className={`px-4 py-2 rounded-2xl text-sm shadow-sm ${msg.role === 'user' ? 'bg-blue-600 text-white' : 'bg-white border border-slate-200'}`}>{msg.text}</div></div>))}
                {loading && <div className="ml-2 text-xs text-slate-400">Yazıyor...</div>}<div ref={chatEndRef} />
            </div>
            <form onSubmit={handleSend} className="p-3 bg-white border-t border-slate-100 flex gap-2 shrink-0">
                <input className="flex-1 bg-slate-100 rounded-full px-4 text-sm focus:outline-none" placeholder={language === 'tr' ? "Harcama yaz..." : "Type expense..."} value={input} onChange={(e) => setInput(e.target.value)} />
                <button type="submit" className="h-10 w-10 bg-blue-600 text-white rounded-full flex items-center justify-center"><span className="material-symbols-outlined text-lg">send</span></button>
            </form>
        </div>
        <button onClick={() => setIsChatOpen(!isChatOpen)} className={`h-16 w-16 rounded-full shadow-2xl flex items-center justify-center transition-all duration-300 transform hover:scale-110 active:scale-95 ${isChatOpen ? 'bg-slate-700 text-white rotate-90' : 'bg-blue-600 text-white'}`}><span className="material-symbols-outlined text-3xl">{isChatOpen ? 'close' : 'chat_bubble'}</span></button>
      </div>
      
      {/* SİLME MODALI */}
      {modalOpen && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm">
            <div className="bg-white p-6 rounded-2xl">
                <h3 className="font-bold mb-4">Silinsin mi?</h3>
                <button onClick={handleDelete} className="bg-red-500 text-white px-4 py-2 rounded-lg">Sil</button>
                <button onClick={() => setModalOpen(false)} className="ml-2 px-4 py-2">İptal</button>
            </div>
        </div>
      )}

      {/* AYARLAR (Devir) MODALI */}
      {isSettingsOpen && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm">
            <div className="bg-white p-6 rounded-2xl">
                <h3 className="font-bold mb-4">Devir Bakiyesi</h3>
                <input 
                    type="number" 
                    value={tempBalance} 
                    onChange={(e) => setTempBalance(e.target.value)} 
                    className="border p-2 w-full rounded mb-4"
                />
                <button onClick={handleSaveSettings} className="bg-blue-600 text-white px-4 py-2 rounded-lg">Kaydet</button>
                <button onClick={() => setIsSettingsOpen(false)} className="ml-2 px-4 py-2">İptal</button>
            </div>
        </div>
      )}
      
      {/* DİL VE PARA BİRİMİ SEÇİM MODALI */}
      {showLanguageModal && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-900/60 backdrop-blur-md">
            <div className="bg-white p-8 rounded-3xl shadow-2xl max-w-lg w-full text-center border border-slate-200">
                <div className="mb-6 flex justify-center">
                    <div className="h-16 w-16 bg-blue-50 rounded-full flex items-center justify-center">
                         <span className="material-symbols-outlined text-3xl text-blue-600">language</span>
                    </div>
                </div>
                <h2 className="text-2xl font-bold text-slate-800 mb-2">Hoş Geldiniz / Welcome</h2>
                <p className="text-slate-500 mb-8">Lütfen kullanmak istediğiniz bölgeyi seçin.<br/>Please select your region preference.</p>
                
                <div className="grid grid-cols-1 gap-4">
                    {/* SEÇENEK 1: TÜRKİYE */}
                    <button 
                        onClick={() => handleSelectPreference('tr', 'TRY')}
                        className="flex items-center gap-4 p-4 border-2 border-slate-100 rounded-2xl hover:border-blue-600 hover:bg-blue-50 transition-all group text-left"
                    >
                        <div className="h-12 w-12 rounded-full bg-red-100 flex items-center justify-center text-xl">🇹🇷</div>
                        <div>
                            <h3 className="font-bold text-slate-800 group-hover:text-blue-700">Türkçe</h3>
                            <p className="text-xs text-slate-500">Para Birimi: ₺ (TRY)</p>
                        </div>
                        <div className="ml-auto opacity-0 group-hover:opacity-100 text-blue-600"><span className="material-symbols-outlined">check_circle</span></div>
                    </button>

                    {/* SEÇENEK 2: JAPONYA (İNGİLİZCE UI) */}
                    <button 
                        onClick={() => handleSelectPreference('en', 'JPY')}
                        className="flex items-center gap-4 p-4 border-2 border-slate-100 rounded-2xl hover:border-blue-600 hover:bg-blue-50 transition-all group text-left"
                    >
                        <div className="h-12 w-12 rounded-full bg-slate-100 flex items-center justify-center text-xl">🇯🇵</div>
                        <div>
                            <h3 className="font-bold text-slate-800 group-hover:text-blue-700">English (Japan)</h3>
                            <p className="text-xs text-slate-500">Currency: ¥ (JPY)</p>
                        </div>
                        <div className="ml-auto opacity-0 group-hover:opacity-100 text-blue-600"><span className="material-symbols-outlined">check_circle</span></div>
                    </button>

                    {/* SEÇENEK 3: ABD */}
                    <button 
                        onClick={() => handleSelectPreference('en', 'USD')}
                        className="flex items-center gap-4 p-4 border-2 border-slate-100 rounded-2xl hover:border-blue-600 hover:bg-blue-50 transition-all group text-left"
                    >
                        <div className="h-12 w-12 rounded-full bg-green-100 flex items-center justify-center text-xl">🇺🇸</div>
                        <div>
                            <h3 className="font-bold text-slate-800 group-hover:text-blue-700">ENG (USA)</h3>
                            <p className="text-xs text-slate-500">Currency: $ (USD)</p>
                        </div>
                        <div className="ml-auto opacity-0 group-hover:opacity-100 text-blue-600"><span className="material-symbols-outlined">check_circle</span></div>
                    </button>
                </div>
            </div>
        </div>
      )}

    </div>
  );
}