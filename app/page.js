// app/page.js
"use client";
import { useState, useEffect, useRef } from 'react';
// Firebase kütüphaneleri
import { auth, googleProvider, db } from '../firebase'; 
import { signInWithPopup, signOut, onAuthStateChanged } from "firebase/auth";
import { collection, addDoc, query, where, onSnapshot, deleteDoc, doc, orderBy, serverTimestamp, setDoc, getDoc, Timestamp } from "firebase/firestore";

export default function Home() {
  const [user, setUser] = useState(null); // Kullanıcı giriş yaptı mı?
  const [messages, setMessages] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [itemToDelete, setItemToDelete] = useState(null);
  // Ayarlar Modalı için State
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [tempBalance, setTempBalance] = useState(""); // Input içindeki geçici değer
  
  // Geçen aydan devreden bakiye (Sabit)
  const [startingBalance, setStartingBalance] = useState(10000);

  const chatEndRef = useRef(null);

  // --- 1. KULLANICI TAKİBİ (Oturum Açık mı?) ---
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        // Kullanıcı giriş yaptıysa verilerini çekmeye başla
        listenToTransactions(currentUser.uid);
      } else {
        setTransactions([]); // Çıkış yaparsa veriyi temizle
      }
    });
    return () => unsubscribe();
  }, []);

  // --- 2. GERÇEK ZAMANLI VERİ DİNLEME (Realtime) ---
  const listenToTransactions = (uid) => {
    // Sadece bu kullanıcıya ait verileri (uid == currentUser.uid) getir
    const q = query(
      collection(db, "transactions"), 
      where("uid", "==", uid),
      orderBy("createdAt", "desc") // En yeniden eskiye
    );

    // onSnapshot: Veritabanında bir şey değiştiği an burası çalışır (Refresh gerekmez)
    onSnapshot(q, (snapshot) => {
      const transData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setTransactions(transData);
    });
  };

  // Sohbet geçmişini LocalStorage'da tutmaya devam edebiliriz (Şimdilik basit olsun)
  useEffect(() => {
    const savedMsgs = JSON.parse(localStorage.getItem("chatHistory")) || [];
    setMessages(savedMsgs);
  }, []);

  useEffect(() => {
    localStorage.setItem("chatHistory", JSON.stringify(messages));
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);
  // Sayfa açılınca veya kullanıcı değişince ayarı çek
  useEffect(() => {
    const fetchSettings = async () => {
      if (user) {
        const docRef = doc(db, "user_settings", user.uid);
        const docSnap = await getDoc(docRef);
        
        if (docSnap.exists()) {
          setStartingBalance(docSnap.data().startingBalance);
        } else {
          // Eğer hiç ayar yoksa varsayılan 0 veya 10000 olsun
          setStartingBalance(0); 
        }
      }
    };
    fetchSettings();
  }, [user]);

  // Ayarı Kaydetme Fonksiyonu
  const handleSaveSettings = async () => {
    if (!user) return;
    const newBalance = parseFloat(tempBalance);
    if (isNaN(newBalance)) return;

    try {
      // user_settings koleksiyonunda, kullanıcının ID'si ile bir döküman oluştur/güncelle
      await setDoc(doc(db, "user_settings", user.uid), {
        startingBalance: newBalance
      }, { merge: true }); // merge: true -> Diğer ayarları silmeden sadece bunu güncelle

      setStartingBalance(newBalance);
      setIsSettingsOpen(false);
    } catch (error) {
      console.error("Ayar kaydedilemedi:", error);
    }
  };
  // --- HESAPLAMALAR ---
  const income = transactions.filter(t => Number(t.amount) > 0).reduce((acc, t) => acc + Number(t.amount), 0);
  const expense = transactions.filter(t => Number(t.amount) < 0).reduce((acc, t) => acc + Math.abs(Number(t.amount)), 0);
  const monthlyFlow = income - expense;
  const totalBalance = monthlyFlow + startingBalance;

  // --- GİRİŞ / ÇIKIŞ İŞLEMLERİ ---
  const handleLogin = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (error) {
      console.error("Giriş hatası:", error);
    }
  };

  const handleLogout = async () => {
    await signOut(auth);
    setMessages([]); // Ekrandaki mesajları sil
    localStorage.removeItem("chatHistory"); // DİKKAT: Tarayıcı hafızasını da sil
  };

  // --- VERİ EKLEME VE SİLME (Firestore) ---
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
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: userMsg.text })
      });
      const data = await res.json();
      console.log("AI Cevabı:", data); // Konsoldan takip etmek için

      setMessages(prev => [...prev, { 
        role: 'ai', 
        text: data.reply || "Kaydedildi.", 
        time: new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) 
      }]);

      // Firebase'e Kaydetme Kısmı
      let newTransactions = [];
      if (data.transactions && Array.isArray(data.transactions)) {
        newTransactions = data.transactions;
      } else if (data.transaction) {
        newTransactions = [data.transaction];
      }
      
      if (newTransactions.length > 0 && user) {
        newTransactions.forEach(async (t) => {
          const safeAmount = parseFloat(t.amount);
          
          if (!isNaN(safeAmount)) {
              // TARİH AYARLAMASI
              let transactionDate = new Date(); // Varsayılan: Şu an
              
              if (t.date) {
                  // AI'dan gelen YYYY-MM-DD stringini Date objesine çevir
                  transactionDate = new Date(t.date); 
              }

              await addDoc(collection(db, "transactions"), {
                uid: user.uid,
                desc: t.desc || "Genel",
                category: t.category || "Diğer",
                amount: safeAmount,
                date: Timestamp.fromDate(transactionDate), // YENİ ALAN: İşlem Tarihi
                createdAt: serverTimestamp() // YENİ ALAN: Kayıt edilme zamanı (Sıralama için)
              });
          }
        });
      }

    } catch (error) {
      console.error(error);
      setMessages(prev => [...prev, { role: 'ai', text: "Hata oluştu.", time: "Now" }]);
    } finally {
      setLoading(false);
    }
  };

  const confirmDelete = (id) => {
    setItemToDelete(id); // Artık index değil, Firebase ID'si tutuyoruz
    setModalOpen(true);
  };

  const handleDelete = async () => {
    if (!itemToDelete) return;
    // Firebase'den sil
    await deleteDoc(doc(db, "transactions", itemToDelete));
    setModalOpen(false);
    setItemToDelete(null);
  };

  const formatMoney = (amount) => {
    // Japonya'da ondalık (kuruş) yoktur, bu yüzden fractionDigits 0 yaptık.
    return new Intl.NumberFormat('ja-JP', { 
        style: 'currency', 
        currency: 'JPY',
        maximumFractionDigits: 0 
    }).format(amount);
  };

  // --- EĞER KULLANICI GİRİŞ YAPMADIYSA: LOGIN EKRANI GÖSTER ---
  if (!user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 relative overflow-hidden">
         {/* Arka Plan Efektleri */}
        <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-blue-200/40 blur-[120px] rounded-full"></div>
        <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-indigo-200/40 blur-[120px] rounded-full"></div>

        <div className="z-10 flex flex-col items-center gap-6 p-10 bg-white/70 backdrop-blur-xl border border-slate-200 rounded-3xl shadow-2xl max-w-md text-center">
            <div className="h-20 w-20 bg-blue-600 rounded-2xl flex items-center justify-center shadow-lg shadow-blue-500/30 text-white mb-2">
                <span className="material-symbols-outlined text-4xl">account_balance_wallet</span>
            </div>
            <div>
                <h1 className="text-3xl font-bold text-slate-800 mb-2">Finans AI</h1>
                <p className="text-slate-500">Yapay zeka destekli kişisel muhasebe asistanınız.</p>
            </div>
            <button 
                onClick={handleLogin}
                className="flex items-center gap-3 px-6 py-3 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 hover:border-blue-200 transition-all shadow-sm group w-full justify-center">
                <img src="https://www.svgrepo.com/show/475656/google-color.svg" className="w-6 h-6" alt="Google" />
                <span className="font-semibold text-slate-700 group-hover:text-blue-600">Google ile Giriş Yap</span>
            </button>
        </div>
      </div>
    );
  }

  // --- KULLANICI GİRİŞ YAPTIYSA: DASHBOARD GÖSTER ---
  return (
    <div className="relative flex min-h-screen w-full flex-col overflow-x-hidden bg-slate-50 text-slate-800 font-['Manrope']">
      
      {/* Arka Plan Efektleri */}
      <div className="fixed top-[-10%] left-[-10%] w-[40%] h-[40%] bg-blue-200/40 blur-[100px] rounded-full pointer-events-none z-0"></div>
      <div className="fixed bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-indigo-200/40 blur-[100px] rounded-full pointer-events-none z-0"></div>

      {/* HEADER: EN ÜST KATMAN (z-50) */}
      <header className="fixed top-0 left-0 w-full z-[50] h-15 flex items-center justify-between border-b border-slate-200 bg-white/80 backdrop-blur-xl px-6 md:px-10">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-600 text-white shadow-lg shadow-blue-500/30">
            <span className="material-symbols-outlined text-2xl">account_balance_wallet</span>
          </div>
          <h2 className="text-xl font-bold tracking-tight text-slate-800">Finans AI</h2>
        </div>
        
        {/* Kullanıcı Profili */}
        <div className="flex items-center gap-4">
          <div className="hidden md:flex flex-col items-end">
             <span className="text-sm font-bold text-slate-700">{user.displayName}</span>
             <span className="text-xs text-slate-400">{user.email}</span>
          </div>
          <div className="h-10 w-10 overflow-hidden rounded-full border border-slate-200 bg-slate-100 shadow-inner">
             <img src={user.photoURL || "https://i.pravatar.cc/150"} alt="User" />
          </div>
          <button onClick={handleLogout} className="p-2 text-slate-400 hover:text-red-500 transition-colors" title="Çıkış Yap">
            <span className="material-symbols-outlined">logout</span>
          </button>
        </div>
      </header>

      {/* MAIN CONTENT: ALT KATMAN (z-0) ve ÜST BOŞLUK (pt-28) */}
      <main className="relative z-0 flex-1 overflow-y-auto p-4 lg:px-20 pt-20">
        <div className="mx-auto flex max-w-[1200px] flex-col gap-8">
          
          {/* İstatistik Kartları */}
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            
            {/* Gelir Kartı */}
            <div className="relative z-0 overflow-hidden rounded-2xl p-6 transition-all hover:shadow-lg border border-slate-200 bg-white shadow-sm group">
              <div className="absolute right-0 top-0 h-32 w-32 -translate-y-8 translate-x-8 rounded-full bg-blue-50 transition-all group-hover:bg-blue-100"></div>
              <div className="relative flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-slate-500 uppercase tracking-wider">Bu Ay Gelen</p>
                  <span className="rounded-full bg-green-100 px-2.5 py-1 text-xs font-bold text-green-700 flex items-center gap-1 border border-green-200">
                    <span className="material-symbols-outlined text-[14px]">trending_up</span> +Gelir
                  </span>
                </div>
                <p className="text-3xl font-bold tracking-tight md:text-4xl text-slate-800">
                   {formatMoney(income)}
                </p>
                <p className="text-xs text-slate-400">Bu ayki toplam kazanç</p>
              </div>
            </div>

            {/* Gider Kartı */}
            <div className="relative z-0 overflow-hidden rounded-2xl p-6 transition-all hover:shadow-lg border border-slate-200 bg-white shadow-sm group">
              <div className="absolute right-0 top-0 h-32 w-32 -translate-y-8 translate-x-8 rounded-full bg-red-50 transition-all group-hover:bg-red-100"></div>
              <div className="relative flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-slate-500 uppercase tracking-wider">Bu Ay Giden</p>
                  <span className="rounded-full bg-red-100 px-2.5 py-1 text-xs font-bold text-red-700 flex items-center gap-1 border border-red-200">
                    <span className="material-symbols-outlined text-[14px]">trending_down</span> -Gider
                  </span>
                </div>
                <p className="text-3xl font-bold tracking-tight md:text-4xl text-slate-800">
                  {formatMoney(expense)}
                </p>
                <p className="text-xs text-slate-400">Bu ayki toplam harcama</p>
              </div>
            </div>
          </div>
{/* --- YENİ EKLENEN: FİNANSAL SAĞLIK & ANİMASYON --- */}
          <div className="relative z-0 w-full rounded-2xl bg-white border border-slate-200 p-6 shadow-sm overflow-hidden group hover:shadow-md transition-all">
            <div className="flex items-center justify-between gap-6">
              
              {/* SOL TARA: Durum Mesajı ve Bar */}
              <div className="flex-1 flex flex-col justify-center gap-3">
                <h3 title ='Finansal Durum' className="text-sm font-semibold text-slate-500 uppercase tracking-wider">Finansal Durumun</h3>
                <div>
                    {/* BAŞLIK KISMI */}
                    <h3 className="text-lg font-bold text-slate-800">
                        {totalBalance < 0 ? "Dikkatli Olmalısın ⚠️" : 
                         totalBalance < 50000 ? "Tasarruf Zamanı 📉" : "Harika Gidiyorsun! 🎉"}
                    </h3>
                    
                    {/* AÇIKLAMA / TAVSİYE KISMI */}
                    <p className="text-sm text-slate-500">
                        {totalBalance < 0 
                            ? "Harcamaların gelirini aşmış durumda. Acil durum planı yapmalısın!" 
                            : totalBalance < 50000 
                                ? "Henüz güvendesin ama sınır dasın. Bu ay harcamalarına biraz daha dikkat et." 
                                : "Gelirlerin giderlerinden fazla, cüzdanın keyfi yerinde. Yatırım düşünebilirsin."}
                    </p>
                </div>

                {/* İNDEX ÇUBUĞU (Bar) */}
                <div className="relative w-full h-4 bg-slate-100 rounded-full overflow-hidden border border-slate-200">
                    {/* Arka plan çizgileri */}
                    <div className="absolute inset-0 opacity-20 bg-[linear-gradient(45deg,transparent_25%,rgba(0,0,0,.1)_25%,rgba(0,0,0,.1)_50%,transparent_50%,transparent_75%,rgba(0,0,0,.1)_75%,rgba(0,0,0,.1))] [background-size:1rem_1rem]"></div>
                    <div 
                        className={`h-full transition-all duration-1000 ease-out flex items-center justify-end pr-2 text-[10px] font-bold text-white shadow-[0_0_20px_rgba(0,0,0,0.2)] 
                        ${totalBalance < 0 ? 'bg-gradient-to-r from-red-400 to-red-600 w-full' : 
                          totalBalance < 50000 ? 'bg-gradient-to-r from-orange-400 to-orange-500 w-[50%]' : 'bg-gradient-to-r from-green-400 to-green-500 w-[85%]'}`}
                    >
                        {totalBalance < 0 ? 'LİMİT AŞILDI' : totalBalance < 50000 ? 'DİKKAT' : 'GÜVENLİ'}
                    </div>
                    {/* Hareketli Bar */}
                    <div 
                        className={`h-full transition-all duration-1000 ease-out flex items-center justify-end pr-2 text-[10px] font-bold text-white shadow-[0_0_20px_rgba(0,0,0,0.2)] ${totalBalance >= 0 ? 'bg-gradient-to-r from-green-400 to-green-500 w-[70%] sm:w-[85%]' : 'bg-gradient-to-r from-red-400 to-red-600 w-[90%]'}`}
                        style={{ 
                            width: totalBalance >= 0 
                                ? `${Math.min((totalBalance / (income || 1)) * 100 + 20, 100)}%` // Gelir durumuna göre doluluk
                                : '100%' // Negatifse bar full kırmızı olsun
                        }}
                    >
                        {totalBalance >= 0 ? '' : 'LİMİT AŞILDI'}
                    </div>
                </div>
              </div>

              {/* SAĞ TARAF: 3 Aşamalı Animasyonlu Karakter */}
              <div className={`h-20 w-20 shrink-0 flex items-center justify-center rounded-full border-4 shadow-xl transition-all 
                ${totalBalance < 0 ? 'bg-red-100 border-red-200' : 
                  totalBalance < 5000 ? 'bg-orange-100 border-orange-200' : 'bg-green-100 border-green-200'
                }`}>
                
                {(() => {
                    // 1. DURUM: EKSİ BAKİYE (ÜZGÜN)
                    if (totalBalance < 0) {
                        return (
                            <img 
                                src="/unhappy.gif" 
                                alt="İflas" 
                                className="h-15 w-15 object-contain scale-x-[-1]"
                            />
                        );
                    } 
                    // 2. DURUM: 0 - 50000 YEN ARASI (ORTA/ENDİŞELİ)
                    else if (totalBalance < 5000) {
                        return (
                            <img 
                                src="/notr.gif" 
                                alt="İdare Eder" 
                                className="h-15 w-15 object-contain scale-x-[-1]"
                            />
                        );
                    } 
                    // 3. DURUM: 50000 YEN ÜSTÜ (MUTLU)
                    else {
                        return (
                            <img 
                                src="/happy.gif" 
                                alt="Zengin" 
                                className="h-15 w-15 object-contain scale-x-[-1]"
                            />
                        );
                    }
                })()}
              </div>

            </div>
          </div>
          {/* --- SAĞLIK BÖLÜMÜ SONU --- */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3 items-start">
            
            
            {/* 1. KUTU: Chatbot */}
            <div className="flex flex-col rounded-2xl overflow-hidden border border-slate-200 bg-white shadow-sm h-[525px] order-2 lg:order-1 sticky top-24 z-0">
              <div className="border-b border-slate-100 bg-slate-50/50 px-6 py-4 backdrop-blur-sm">
                <div className="flex items-center gap-2">
                  <div className="h-2 w-2 rounded-full bg-green-500 animate-pulse"></div>
                  <span className="material-symbols-outlined text-blue-600 text-xl">robot</span>
                  <h3 className="text-sm font-bold uppercase tracking-widest text-slate-700">AI Asistan</h3>
                </div>
              </div>

              {/* Chat Mesajları */}
              <div className="flex flex-col gap-4 p-4 md:p-6 flex-1 overflow-y-auto bg-slate-50/30">
                {messages.map((msg, index) => (
                    <div key={index} className={`flex items-start gap-3 max-w-[90%] ${msg.role === 'user' ? 'flex-row-reverse self-end' : ''}`}>
                        <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border shadow-sm ${msg.role === 'user' ? 'bg-slate-800 text-white border-slate-700' : 'bg-white text-blue-600 border-slate-200'}`}>
                            <span className="material-symbols-outlined text-sm">{msg.role === 'user' ? 'face_left' : 'robot'}</span>
                        </div>
                        <div className="flex flex-col gap-1">
                            <span className={`text-[10px] font-bold text-slate-400 uppercase tracking-wider ${msg.role === 'user' ? 'text-right' : ''}`}>
                                {msg.role === 'user' ? 'Siz' : 'Asistan'} • {msg.time}
                            </span>
                            <div className={`rounded-2xl px-5 py-3 text-sm shadow-sm leading-relaxed ${msg.role === 'user' ? 'rounded-tr-none bg-blue-600 text-white' : 'rounded-tl-none bg-white border border-slate-200 text-slate-600'}`}>
                                <p>{msg.text}</p>
                            </div>
                        </div>
                    </div>
                ))}
                {loading && (
                    <div className="flex items-center gap-2 ml-12">
                        <span className="h-2 w-2 bg-slate-300 rounded-full animate-bounce"></span>
                        <span className="h-2 w-2 bg-slate-300 rounded-full animate-bounce delay-75"></span>
                        <span className="h-2 w-2 bg-slate-300 rounded-full animate-bounce delay-150"></span>
                    </div>
                )}
                <div ref={chatEndRef} />
              </div>

              {/* Input Alanı */}
              <div className="mt-auto p-4 border-t border-slate-100 bg-white">
                <form onSubmit={handleSend} className="relative flex items-center rounded-full bg-slate-50 border border-slate-200 shadow-inner focus-within:border-blue-400 focus-within:ring-2 focus-within:ring-blue-100 transition-all">
                  <button type="button" className="ml-2 flex h-10 w-10 items-center justify-center rounded-full text-slate-400 hover:text-blue-600 transition-colors">
                    <span className="material-symbols-outlined">add_circle</span>
                  </button>
                  <input 
                    className="h-12 flex-1 bg-transparent px-2 text-sm text-slate-800 placeholder-slate-400 focus:outline-none border-none focus:ring-0" 
                    placeholder="İşlem girin... (Örn: 500 TL market)" 
                    type="text"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                  />
                  <button type="submit" className="mr-1.5 flex h-9 w-9 items-center justify-center rounded-full bg-blue-600 text-white hover:bg-blue-700 shadow-md transition-all transform hover:scale-105 active:scale-95">
                    <span className="material-symbols-outlined text-lg">arrow_upward</span>
                  </button>
                </form>
              </div>
            </div>
            
            {/* 2. KUTU: Cüzdan Durumu */}
            <div className="col-span-1 flex flex-col gap-6 rounded-2xl p-6 lg:col-span-2 border border-slate-200 bg-white shadow-sm order-1 lg:order-2 z-0">
              <div className="flex items-center justify-between border-b border-slate-100 pb-4">
                <div>
                  <h3 className="text-lg font-bold text-slate-800">Cüzdan Durumu</h3>
                  <p className="text-sm text-slate-400">Toplam Varlıklar</p>
                </div>
              </div>
              
              <div className="relative h-48 w-full flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 rounded-xl border border-slate-200 shadow-inner overflow-hidden">
                 <div className="text-center z-10 flex flex-col items-center">
                    
                    {/* TIKLANABİLİR DEVİR BAKİYE ALANI */}
                    <button 
                        onClick={() => {
                            setTempBalance(startingBalance);
                            setIsSettingsOpen(true);
                        }}
                        className="mb-3 inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-blue-50 border border-blue-100 shadow-sm hover:bg-blue-100 hover:border-blue-200 transition-all cursor-pointer group"
                    >
                        <span className="material-symbols-outlined text-blue-600 text-[18px]">assured_workload</span>
                        <span className="text-xs font-bold text-blue-700">
                            Geçen Aydan: {formatMoney(startingBalance)}
                        </span>
                        <span className="material-symbols-outlined text-blue-400 text-[14px] group-hover:text-blue-600">edit</span>
                    </button>

                    <p className="text-slate-400 mb-1 text-sm font-medium uppercase tracking-widest">Toplam Net Varlık</p>
                    <p className="text-5xl font-bold text-slate-800 drop-shadow-sm">
                      {formatMoney(totalBalance)}
                    </p>
                    <p className={`text-xs mt-2 font-medium ${monthlyFlow >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                        (Bu Ay: {monthlyFlow >= 0 ? '+' : ''}{formatMoney(monthlyFlow)})
                    </p>
                 </div>
                 <div className="absolute inset-0 opacity-5 bg-[radial-gradient(#2536f4_1px,transparent_1px)] [background-size:16px_16px]"></div>
              </div>
              
               <div className="flex flex-col gap-3 mt-2">
                  <h3 className="text-slate-800 font-bold text-sm uppercase tracking-wide">Son Hareketler</h3>
                  <div className="flex flex-col gap-3 max-h-[350px] overflow-y-auto pr-2">
                    {transactions.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-10 text-slate-400 bg-slate-50 rounded-xl border border-dashed border-slate-200">
                            <span className="material-symbols-outlined text-4xl mb-2 opacity-50">receipt_long</span>
                            <p className="text-sm">Henüz bir işlem yok.</p>
                        </div>
                    ) : (
                        transactions.map((t) => (
                            <div key={t.id} className="group flex items-center justify-between rounded-xl bg-white border border-slate-100 p-3 hover:border-blue-200 hover:shadow-md transition-all">
                                <div className="flex items-center gap-4">
                                    <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full shadow-sm ${t.amount < 0 ? 'bg-white text-orange-500 border border-orange-100' : 'bg-white text-green-500 border border-green-100'}`}>
                                        <span className="material-symbols-outlined text-[24px]">
                                            {t.amount < 0 ? 'remove' : 'add'}
                                        </span>
                                    </div>
                                    <div className="flex flex-col gap-0.5">
                                        <span className="text-sm font-bold text-slate-700">{t.desc}</span>
                                        {/* TARİH VE KATEGORİ YAN YANA */}
                                        <div className="flex items-center gap-2">
                                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wide bg-slate-50 px-2 py-0.5 rounded-md">
                                                {t.category}
                                            </span>
                                            {/* Tarih Gösterimi */}
                                            <span className="text-[10px] text-slate-400 flex items-center gap-1">
                                                <span className="material-symbols-outlined text-[10px]">calendar_today</span>
                                                {t.date?.toDate().toLocaleDateString('tr-TR', {day: 'numeric', month: 'short'}) || 'Bugün'}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                                <div className="flex items-center gap-4">
                                    <div className="flex flex-col items-end gap-0.5">
                                        <span className={`text-sm font-bold ${t.amount < 0 ? 'text-slate-700' : 'text-green-600'}`}>
                                            {t.amount < 0 ? '-' : '+'}{Math.abs(t.amount)} TL
                                        </span>
                                        <span className="text-[10px] text-slate-400">İşlendi</span>
                                    </div>
                                    <button onClick={() => confirmDelete(t.id)} className="opacity-0 group-hover:opacity-100 p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-full transition-all">
                                         <span className="material-symbols-outlined text-lg">delete</span>
                                    </button>
                                </div>
                            </div>
                        ))
                    )}
                  </div>
               </div>
            </div>

          </div>
        </div>
      </main>

      {/* SİLME MODALI */}
      {modalOpen && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4">
          <div className="bg-white p-6 rounded-2xl w-full max-w-sm border border-slate-200 shadow-2xl transform scale-100 transition-all">
            <div className="h-12 w-12 rounded-full bg-red-50 text-red-500 flex items-center justify-center mb-4 mx-auto">
              <span className="material-symbols-outlined text-2xl">warning</span>
            </div>
            <h3 className="text-xl font-bold text-slate-800 mb-2 text-center">Emin misiniz?</h3>
            <p className="text-slate-500 text-sm mb-6 text-center">Bu işlemi silmek bakiyeni güncelleyecektir. Bu işlem geri alınamaz.</p>
            <div className="flex justify-center gap-3">
              <button onClick={() => setModalOpen(false)} className="px-5 py-2.5 rounded-xl text-sm font-semibold text-slate-500 hover:bg-slate-100 transition-colors">Vazgeç</button>
              <button onClick={handleDelete} className="px-5 py-2.5 rounded-xl text-sm font-semibold bg-red-500 hover:bg-red-600 text-white shadow-lg shadow-red-200 transition-colors">Evet, Sil</button>
            </div>
          </div>
        </div>
      )}

      {/* BAKİYE DÜZENLEME MODALI */}
      {isSettingsOpen && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4">
          <div className="bg-white p-6 rounded-2xl w-full max-w-sm border border-slate-200 shadow-2xl transform scale-100 transition-all">
            <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-bold text-slate-800">Başlangıç Bakiyesi</h3>
                <button onClick={() => setIsSettingsOpen(false)} className="text-slate-400 hover:text-slate-600">
                    <span className="material-symbols-outlined">close</span>
                </button>
            </div>
            
            <p className="text-slate-500 text-sm mb-4">
                Geçen aydan devreden veya bankada halihazırda bulunan nakit miktarını girin.
            </p>

            <div className="mb-6">
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Tutar (TL)</label>
                <input 
                    type="number" 
                    value={tempBalance}
                    onChange={(e) => setTempBalance(e.target.value)}
                    className="w-full h-12 px-4 rounded-xl border border-slate-200 bg-slate-50 text-slate-800 font-bold focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition-all"
                    placeholder="0"
                />
            </div>

            <div className="flex justify-end gap-3">
              <button onClick={() => setIsSettingsOpen(false)} className="px-5 py-2.5 rounded-xl text-sm font-semibold text-slate-500 hover:bg-slate-100 transition-colors">Vazgeç</button>
              <button onClick={handleSaveSettings} className="px-5 py-2.5 rounded-xl text-sm font-semibold bg-blue-600 hover:bg-blue-700 text-white shadow-lg shadow-blue-200 transition-colors">Kaydet</button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}