"use client";
import { useState, useEffect, useRef, useMemo } from 'react';
// Firebase
import { auth, googleProvider, db } from '../firebase'; 
import { signInWithPopup, signOut, onAuthStateChanged, setPersistence, browserLocalPersistence  } from "firebase/auth";
import { collection, addDoc, query, where, onSnapshot, deleteDoc, updateDoc, doc, serverTimestamp, setDoc, getDoc, Timestamp} from "firebase/firestore";
import NetBalanceChart from './components/charts/NetBalanceChart';
import FlowAnalysis from './components/charts/FlowAnalysis';

// Kategori Listesi
const CATEGORIES = [
  "🍔 Yeme-İçme", "🎉 Eğlence/Sosyal", "🏠 Ev/Yaşam", "🚌 Ulaşım", 
  "💡 Faturalar", "🛍️ Alışveriş", "🏥 Sağlık", "💰 Gelir/Yatırım", "📦 Diğer"
];

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
  
  // Düzenleme
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [editForm, setEditForm] = useState({ desc: "", amount: "", category: "", date: "" });

  // Ayarlar ve Görünüm
  const [tempBalance, setTempBalance] = useState("");
  const [startingBalance, setStartingBalance] = useState(0); 
  const [currency, setCurrency] = useState('JPY'); 
  const [language, setLanguage] = useState('tr'); 
  const [chartView, setChartView] = useState('monthly');

  const [isChatOpen, setIsChatOpen] = useState(false);
  const chatEndRef = useRef(null);

  // --- 1. VERİ ÇEKME ---
  const listenToTransactions = (uid) => {
    const q = query(collection(db, "transactions"), where("uid", "==", uid));
    const unsubscribe = onSnapshot(q, (querySnapshot) => {
      const transactionsData = [];
      querySnapshot.forEach((doc) => { transactionsData.push({ ...doc.data(), id: doc.id }); });
      transactionsData.sort((a, b) => {
        const dateA = a.date && a.date.toDate ? a.date.toDate() : new Date(a.date || 0);
        const dateB = b.date && b.date.toDate ? b.date.toDate() : new Date(b.date || 0);
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

  // --- 2. AUTH ---
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

  // --- 3. İŞLEM KAYDETME ---
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
        body: JSON.stringify({ message: userMsg.text, userName: user.displayName || "Dostum", currency: currency, language: language }) 
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

  // --- 4. SİLME VE GÜNCELLEME ---
  const confirmDelete = (id) => { setItemToDelete(id); setModalOpen(true); };
  const handleDelete = async () => { if (!itemToDelete) return; await deleteDoc(doc(db, "transactions", itemToDelete)); setModalOpen(false); setItemToDelete(null); };

  const openEditModal = (item) => {
    setEditingItem(item);
    let dateStr = "";
    if (item.date && item.date.toDate) dateStr = item.date.toDate().toISOString().split('T')[0];
    setEditForm({ desc: item.desc, amount: item.amount, category: item.category, date: dateStr });
    setEditModalOpen(true);
  };

  const handleUpdate = async () => {
    if (!editingItem) return;
    try {
        const docRef = doc(db, "transactions", editingItem.id);
        const newDate = new Date(editForm.date);
        await updateDoc(docRef, {
            desc: editForm.desc, amount: parseFloat(editForm.amount), category: editForm.category, date: Timestamp.fromDate(newDate)
        });
        setEditModalOpen(false);
        setEditingItem(null);
    } catch (error) { console.error(error); }
  };

  // --- 5. AYARLAR ---
  const handleSelectPreference = async (selectedLang, selectedCurrency) => {
    if (!user) return;
    try {
        await setDoc(doc(db, "user_settings", user.uid), { language: selectedLang, currency: selectedCurrency }, { merge: true });
        setLanguage(selectedLang); setCurrency(selectedCurrency); setShowLanguageModal(false);
    } catch (error) { console.error(error); }
  };
  const handleSaveSettings = async () => {
    if (!user) return;
    const newBalance = parseFloat(tempBalance);
    if (isNaN(newBalance)) return;
    try { await setDoc(doc(db, "user_settings", user.uid), { startingBalance: newBalance }, { merge: true }); setStartingBalance(newBalance); setIsSettingsOpen(false); } catch (error) { console.error(error); }
  };

  // --- HESAPLAMALAR ---
  const allTimeIncome = transactions.filter(t => Number(t.amount) > 0).reduce((acc, t) => acc + Number(t.amount), 0);
  const allTimeExpense = transactions.filter(t => Number(t.amount) < 0).reduce((acc, t) => acc + Math.abs(Number(t.amount)), 0);
  const totalBalance = (allTimeIncome - allTimeExpense) + startingBalance;
  const now = new Date();
  const currentMonth = now.getMonth(); 
  const currentYear = now.getFullYear();
  const thisMonthTransactions = transactions.filter(t => {
      if (!t.date) return false;
      const tDate = t.date.toDate ? t.date.toDate() : new Date(t.date || 0);
      return tDate.getMonth() === currentMonth && tDate.getFullYear() === currentYear;
  });
  const monthlyIncome = thisMonthTransactions.filter(t => t.amount > 0).reduce((acc, t) => acc + t.amount, 0);
  const monthlyExpense = thisMonthTransactions.filter(t => t.amount < 0).reduce((acc, t) => acc + Math.abs(t.amount), 0);
  const monthlyFlow = monthlyIncome - monthlyExpense;
  const savingsRate = monthlyIncome > 0 ? monthlyFlow / monthlyIncome : 0;
  const dangerLimit = currency === 'JPY' ? 20000 : 5000;
  const safeLimit = currency === 'JPY' ? 50000 : 15000;

  // --- GRAFİK DATA ---
  const chartData = useMemo(() => {
    const last30Days = [];
    for (let i = 29; i >= 0; i--) {
        const d = new Date(); d.setDate(d.getDate() - i);
        const dateKey = d.toLocaleDateString(language === 'tr' ? 'tr-TR' : 'en-US', { month: 'numeric', day: 'numeric' });
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
    if (chartView === 'monthly') {
        const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
        const data = [];
        for (let i = 1; i <= daysInMonth; i++) {
            const dayTransactions = transactions.filter(t => { if(!t.date) return false; const tDate = t.date.toDate ? t.date.toDate() : new Date(t.date || 0); return tDate.getDate() === i && tDate.getMonth() === currentMonth; });
            const dayIncome = dayTransactions.filter(t => t.amount > 0).reduce((acc, t) => acc + t.amount, 0);
            const dayExpense = dayTransactions.filter(t => t.amount < 0).reduce((acc, t) => acc + Math.abs(t.amount), 0);
            data.push({ name: i.toString(), net: dayIncome - dayExpense });
        }
        return data;
    } else {
        const months = language === 'tr' ? ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'] : ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        const data = months.map(m => ({ name: m, net: 0 }));
        transactions.forEach(t => {
            if (!t.date) return;
            const tDate = t.date.toDate ? t.date.toDate() : new Date(t.date || 0);
            if (tDate.getFullYear() === currentYear) {
                data[tDate.getMonth()].net += t.amount;
            }
        });
        return data;
    }
  }, [transactions, currentMonth, currentYear, chartView, language]);

  const formatMoney = (amount) => {
    if (currency === 'TRY') return new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY', maximumFractionDigits: 0 }).format(amount);
    if (currency === 'USD') return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(amount);
    return new Intl.NumberFormat('ja-JP', { style: 'currency', currency: 'JPY', maximumFractionDigits: 0 }).format(amount);
  };

  const handleLogin = async () => { await signInWithPopup(auth, googleProvider); };
  const handleLogout = async () => { await signOut(auth); setMessages([]); localStorage.removeItem("chatHistory"); };
  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, isChatOpen]);

  if (authLoading) return <div className="flex min-h-screen items-center justify-center bg-slate-50">Yükleniyor...</div>;
  if (!user) return (<div className="flex min-h-screen items-center justify-center bg-slate-50"><button onClick={handleLogin}>Giriş Yap</button></div>);

  return (
    <div className="relative flex min-h-screen w-full flex-col overflow-x-hidden bg-slate-50 text-slate-800 font-['Manrope']">
      <style jsx>{` @keyframes shimmer { 0% { transform: translateX(-150%); } 50% { transform: translateX(150%); } 100% { transform: translateX(150%); } } .animate-shimmer { animation: shimmer 2.5s infinite; } `}</style>

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
          <button onClick={handleLogout} className="p-2 text-slate-400 hover:text-red-500 transition-transform active:scale-90"><span className="material-symbols-outlined">logout</span></button>
        </div>
      </header>

      {/* MAIN CONTENT */}
      <main className="relative z-0 flex-1 overflow-y-auto p-4 pt-24 mt-0 pb-32">
        <div className="mx-auto flex max-w-[1200px] flex-col gap-6">
          
          {/* ÖZET KART */}
          <div className="relative z-0 w-full rounded-2xl bg-white border border-slate-200 p-5 shadow-sm overflow-hidden group hover:shadow-md transition-all">
            <div className="flex flex-row items-center justify-between gap-4">
              <div className="flex-1 flex flex-col justify-center gap-2 min-w-0">
                <div>
                    <h3 className="text-base md:text-lg font-bold text-slate-800 truncate">
                        {monthlyFlow < 0 ? (language === 'tr' ? "Bütçe Aşıldı! 🚨" : "Over Budget! 🚨") : monthlyFlow < dangerLimit ? (language === 'tr' ? "Dikkatli Ol! 🚨" : "Watch Out! 🚨") : monthlyFlow < safeLimit ? (language === 'tr' ? "İdare Eder 👍" : "Not Bad 👍") : (language === 'tr' ? "Süper Gidiyorsun! 🚀" : "Great Job! 🚀")}
                    </h3>
                    <p className="text-xs text-slate-500 line-clamp-1">{monthlyFlow < 0 ? `${formatMoney(Math.abs(monthlyFlow))} ${language==='tr'?'aşıldı':'over'}` : `${language==='tr'?'Tasarruf':'Saving'}`}</p>
                </div>
                <div className="relative w-full h-3 bg-slate-100 rounded-full overflow-hidden border border-slate-200">
                    <div className={`relative h-full transition-all duration-1000 ease-out shadow-sm overflow-hidden ${monthlyFlow >= 0 ? 'bg-gradient-to-r from-emerald-400 to-emerald-500' : 'bg-gradient-to-r from-red-500 to-red-600'}`} style={{ width: monthlyFlow >= 0 ? `${monthlyIncome > 0 ? Math.min((monthlyFlow / monthlyIncome) * 100, 100) : 0}%` : '100%' }}><div className="absolute top-0 left-0 w-full h-full bg-gradient-to-r from-transparent via-white/60 to-transparent -skew-x-12 animate-shimmer"></div></div>
                </div>
              </div>
              <div className={`h-16 w-16 md:h-20 md:w-20 shrink-0 flex items-center justify-center rounded-2xl border-2 md:border-4 shadow-sm transition-all ${monthlyFlow < 0 ? 'bg-red-50 border-red-200' : monthlyFlow < safeLimit ? 'bg-orange-50 border-orange-200' : savingsRate < 0.65 ? 'bg-blue-50 border-blue-200' : 'bg-emerald-50 border-emerald-200' }`}>
                {monthlyFlow < 0 ? <img src="/unhappy.gif" className="h-14 w-14 md:h-16 md:w-16 object-contain scale-x-[-1]"/> : monthlyFlow < safeLimit ? <img src="/notr.gif" className="h-14 w-14 md:h-16 md:w-16 object-contain scale-x-[-1]"/> : savingsRate < 0.65 ? <img src="/good.gif" className="h-14 w-14 md:h-16 md:w-16 object-contain scale-x-[-1]"/> : <img src="/happy.gif" className="h-14 w-14 md:h-16 md:w-16 object-contain scale-x-[-1]"/>}
              </div>
            </div>
          </div>
          
          {/* --- GRAFİK ALANI --- */}
          <div className="w-full bg-white rounded-2xl border border-slate-200 p-6 shadow-sm mt-6 flex flex-col">
              <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-bold uppercase tracking-widest text-slate-500">
                    {language === 'tr' ? 'Net Bakiye Durumu' : 'Net Balance Status'}
                  </h3>
                  
                  {/* TAB BUTONLARI (ANİMASYON EKLENDİ) */}
                  <div className="bg-slate-100 p-1 rounded-lg flex gap-1">
                      <button 
                        onClick={() => setChartView('monthly')}
                        className={`px-3 py-1 rounded-md text-xs font-bold transition-all active:scale-95 duration-200 ${chartView === 'monthly' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
                      >
                        {language === 'tr' ? 'Aylık' : 'Monthly'}
                      </button>
                      <button 
                        onClick={() => setChartView('yearly')}
                        className={`px-3 py-1 rounded-md text-xs font-bold transition-all active:scale-95 duration-200 ${chartView === 'yearly' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
                      >
                        {language === 'tr' ? 'Yıllık' : 'Yearly'}
                      </button>
                  </div>
              </div>
              <div className="h-[300px]">
                <NetBalanceChart data={displayData} currency={currency} />
              </div>
          </div>

          <FlowAnalysis chartData={chartData} categoryData={categoryData} language={language} />

          {/* LİSTE */}
          <div className="flex flex-col gap-6 rounded-2xl p-6 border border-slate-200 bg-white shadow-sm">
              <div className="flex items-center justify-between border-b border-slate-100 pb-4">
                <h3 className="text-lg font-bold text-slate-800">{language === 'tr' ? 'Cüzdan' : 'Wallet'}</h3>
                {/* DEVİR BUTONU (ANİMASYON EKLENDİ) */}
                <button 
                    onClick={() => { setTempBalance(startingBalance); setIsSettingsOpen(true); }} 
                    className="px-3 py-1 bg-slate-50 border rounded text-xs font-bold text-slate-600 transition-transform active:scale-95 hover:bg-slate-100"
                >
                    {language === 'tr' ? 'Devir:' : 'Start:'} {formatMoney(startingBalance)}
                </button>
              </div>
              <div className="text-center py-6"><p className="text-5xl font-bold text-slate-800">{formatMoney(totalBalance)}</p></div>
              <div className="flex flex-col gap-3">
                  {transactions.map((t) => (
                    <div key={t.id} className="flex items-center justify-between p-3 bg-white border border-slate-100 rounded-xl hover:border-blue-200 transition-colors">
                         <div className="flex items-center gap-3">
                            <div className={`w-10 h-10 rounded-full flex items-center justify-center ${t.amount < 0 ? 'bg-orange-50 text-orange-500' : 'bg-green-50 text-green-500'}`}><span className="material-symbols-outlined text-[20px]">{t.amount < 0 ? 'shopping_cart' : 'payments'}</span></div>
                            <div><div className="text-sm font-bold text-slate-700">{t.desc}</div><div className="text-[10px] text-slate-400">{t.category} • {t.date?.toDate ? t.date.toDate().toLocaleDateString(language==='tr'?'tr-TR':'ja-JP') : ''}</div></div>
                         </div>
                         <div className="flex items-center gap-3">
                            <span className={`text-sm font-bold ${t.amount < 0 ? 'text-slate-800' : 'text-green-600'}`}>{t.amount < 0 ? '' : '+'}{formatMoney(t.amount)}</span>
                            {/* DÜZENLE / SİL İKONLARI (ANİMASYON EKLENDİ) */}
                            <button onClick={() => openEditModal(t)} className="text-slate-300 hover:text-blue-500 transition-transform active:scale-75 p-1"><span className="material-symbols-outlined text-lg">edit</span></button>
                            <button onClick={() => confirmDelete(t.id)} className="text-slate-300 hover:text-red-500 transition-transform active:scale-75 p-1"><span className="material-symbols-outlined text-lg">delete</span></button>
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
                <button onClick={() => setIsChatOpen(false)} className="active:scale-90 transition-transform"><span className="material-symbols-outlined text-lg">close</span></button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 bg-slate-50 flex flex-col gap-3">
                {messages.map((msg, index) => (<div key={index} className={`flex flex-col max-w-[85%] ${msg.role === 'user' ? 'self-end items-end' : 'self-start items-start'}`}><div className={`px-4 py-2 rounded-2xl text-sm shadow-sm ${msg.role === 'user' ? 'bg-blue-600 text-white' : 'bg-white border border-slate-200'}`}>{msg.text}</div></div>))}
                {loading && <div className="ml-2 text-xs text-slate-400">Yazıyor...</div>}<div ref={chatEndRef} />
            </div>
            <form onSubmit={handleSend} className="p-3 bg-white border-t border-slate-100 flex gap-2 shrink-0">
                <input className="flex-1 bg-slate-100 rounded-full px-4 text-sm focus:outline-none" placeholder={language === 'tr' ? "Harcama yaz..." : "Type expense..."} value={input} onChange={(e) => setInput(e.target.value)} />
                {/* GÖNDER BUTONU (ANİMASYON EKLENDİ) */}
                <button type="submit" className="h-10 w-10 bg-blue-600 text-white rounded-full flex items-center justify-center transition-transform active:scale-90 shadow-md active:shadow-none"><span className="material-symbols-outlined text-lg">send</span></button>
            </form>
        </div>
        <button onClick={() => setIsChatOpen(!isChatOpen)} className={`h-16 w-16 rounded-full shadow-2xl flex items-center justify-center transition-all duration-300 transform hover:scale-110 active:scale-90 ${isChatOpen ? 'bg-slate-700 text-white rotate-90' : 'bg-blue-600 text-white'}`}><span className="material-symbols-outlined text-3xl">{isChatOpen ? 'close' : 'chat_bubble'}</span></button>
      </div>
      
      {/* EDIT MODAL */}
      {editModalOpen && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm px-4">
            <div className="bg-white p-6 rounded-2xl w-full max-w-sm shadow-2xl transform transition-all scale-100">
                <h3 className="font-bold mb-4 text-slate-800 text-lg">İşlemi Düzenle</h3>
                <div className="flex flex-col gap-3">
                    <div><label className="text-xs text-slate-500 font-bold ml-1">Açıklama</label><input className="w-full border p-2 rounded-lg bg-slate-50 focus:ring-2 focus:ring-blue-500 outline-none" value={editForm.desc} onChange={(e) => setEditForm({...editForm, desc: e.target.value})} /></div>
                    <div><label className="text-xs text-slate-500 font-bold ml-1">Tutar (Negatif=Harcama)</label><input type="number" className="w-full border p-2 rounded-lg bg-slate-50 focus:ring-2 focus:ring-blue-500 outline-none" value={editForm.amount} onChange={(e) => setEditForm({...editForm, amount: e.target.value})} /></div>
                    <div><label className="text-xs text-slate-500 font-bold ml-1">Kategori</label><select className="w-full border p-2 rounded-lg bg-slate-50 focus:ring-2 focus:ring-blue-500 outline-none" value={editForm.category} onChange={(e) => setEditForm({...editForm, category: e.target.value})}>{CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}</select></div>
                    <div><label className="text-xs text-slate-500 font-bold ml-1">Tarih</label><input type="date" className="w-full border p-2 rounded-lg bg-slate-50 focus:ring-2 focus:ring-blue-500 outline-none" value={editForm.date} onChange={(e) => setEditForm({...editForm, date: e.target.value})} /></div>
                </div>
                <div className="flex gap-2 mt-6">
                    {/* MODAL BUTONLARI (ANİMASYON EKLENDİ) */}
                    <button onClick={handleUpdate} className="flex-1 bg-blue-600 text-white py-3 rounded-xl font-bold hover:bg-blue-700 transition-all active:scale-95 shadow-md active:shadow-none">Kaydet</button>
                    <button onClick={() => setEditModalOpen(false)} className="flex-1 bg-slate-100 text-slate-600 py-3 rounded-xl font-bold hover:bg-slate-200 transition-all active:scale-95">İptal</button>
                </div>
            </div>
        </div>
      )}

      {/* SİLME MODALI */}
      {modalOpen && ( 
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm">
            <div className="bg-white p-6 rounded-2xl shadow-2xl transform transition-all scale-100">
                <h3 className="font-bold mb-4 text-lg">Silinsin mi?</h3>
                <div className="flex gap-2">
                    {/* SIL BUTONLARI (ANİMASYON EKLENDİ) */}
                    <button onClick={handleDelete} className="bg-red-500 text-white px-6 py-3 rounded-xl font-bold transition-all active:scale-95 shadow-lg shadow-red-500/30 active:shadow-none">Evet, Sil</button>
                    <button onClick={() => setModalOpen(false)} className="bg-slate-100 text-slate-700 px-6 py-3 rounded-xl font-bold transition-all active:scale-95 hover:bg-slate-200">Vazgeç</button>
                </div>
            </div>
        </div> 
      )}
      
      {isSettingsOpen && ( <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm"><div className="bg-white p-6 rounded-2xl shadow-2xl"><h3 className="font-bold mb-4">Devir Bakiyesi</h3><input type="number" value={tempBalance} onChange={(e) => setTempBalance(e.target.value)} className="border p-2 w-full rounded mb-4 focus:ring-2 focus:ring-blue-500 outline-none" /><div className="flex gap-2"><button onClick={handleSaveSettings} className="flex-1 bg-blue-600 text-white px-4 py-2 rounded-lg transition-all active:scale-95 shadow-md">Kaydet</button><button onClick={() => setIsSettingsOpen(false)} className="flex-1 bg-slate-100 text-slate-600 px-4 py-2 rounded-lg transition-all active:scale-95">İptal</button></div></div></div> )}
      
      {showLanguageModal && ( 
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-900/60 backdrop-blur-md">
            <div className="bg-white p-8 rounded-3xl shadow-2xl max-w-lg w-full text-center border border-slate-200">
                <h2 className="text-2xl font-bold text-slate-800 mb-8">Bölge Seçimi</h2>
                <div className="grid grid-cols-1 gap-4">
                    {/* DİL SEÇİM BUTONLARI (ANİMASYON EKLENDİ) */}
                    <button onClick={() => handleSelectPreference('tr', 'TRY')} className="flex items-center gap-4 p-4 border-2 border-slate-100 rounded-2xl hover:border-blue-600 hover:bg-blue-50 transition-all active:scale-95 duration-200"><div className="h-12 w-12 rounded-full bg-red-100 flex items-center justify-center text-xl">🇹🇷</div><div className="text-left"><h3 className="font-bold text-slate-800">Türkçe</h3><p className="text-xs text-slate-500">TRY (₺)</p></div></button>
                    <button onClick={() => handleSelectPreference('en', 'JPY')} className="flex items-center gap-4 p-4 border-2 border-slate-100 rounded-2xl hover:border-blue-600 hover:bg-blue-50 transition-all active:scale-95 duration-200"><div className="h-12 w-12 rounded-full bg-slate-100 flex items-center justify-center text-xl">🇯🇵</div><div className="text-left"><h3 className="font-bold text-slate-800">English (Japan)</h3><p className="text-xs text-slate-500">JPY (¥)</p></div></button>
                    <button onClick={() => handleSelectPreference('en', 'USD')} className="flex items-center gap-4 p-4 border-2 border-slate-100 rounded-2xl hover:border-blue-600 hover:bg-blue-50 transition-all active:scale-95 duration-200"><div className="h-12 w-12 rounded-full bg-green-100 flex items-center justify-center text-xl">🇺🇸</div><div className="text-left"><h3 className="font-bold text-slate-800">English (USA)</h3><p className="text-xs text-slate-500">USD ($)</p></div></button>
                </div>
            </div>
        </div> 
      )}

    </div>
  );
}