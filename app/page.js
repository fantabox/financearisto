"use client";
import { useState, useEffect, useRef, useMemo } from 'react';
// Firebase
import { auth, googleProvider, db } from '../firebase'; 
import { signInWithPopup, signOut, onAuthStateChanged, setPersistence, browserLocalPersistence  } from "firebase/auth";
import { collection, addDoc, query, where, onSnapshot, deleteDoc, doc, orderBy, serverTimestamp, setDoc, getDoc, Timestamp} from "firebase/firestore";
// Grafik Kütüphanesi
import { AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts';

// Kategoriler için Renk Paleti
const COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#6366F1', '#14B8A6'];

const CustomTooltip = ({ active, payload, label, }) => {
  if (active && payload && payload.length) {
    const title = label ? label : payload[0].name;
    return (
      <div className="bg-white/95 backdrop-blur-sm p-2 border border-slate-100 shadow-md rounded-lg text-xs z-50">
        <p className="font-bold text-slate-700 mb-1 border-b border-slate-100 pb-1">
          {title}
        </p>
        {payload.map((entry, index) => (
          <div key={index} className="flex items-center justify-between gap-3 min-w-[100px]">
            <span className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full" style={{ backgroundColor: entry.color }}></span>
              <span className="text-slate-500 font-medium"></span>
            </span>
            <span className="font-bold font-mono" style={{ color: entry.color }}>
              ¥{new Intl.NumberFormat('ja-JP').format(entry.value)}
            </span>
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
  const [modalOpen, setModalOpen] = useState(false);
  const [itemToDelete, setItemToDelete] = useState(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [tempBalance, setTempBalance] = useState("");
  const [startingBalance, setStartingBalance] = useState(0); 
  const [isChatOpen, setIsChatOpen] = useState(false);
  const chatEndRef = useRef(null);
  const [chartView, setChartView] = useState('monthly');

  const listenToTransactions = (uid) => {
    const q = query(
      collection(db, "transactions"),
      where("uid", "==", uid)
      // orderBy sildik, JS ile sıralıyoruz.
    );

    const unsubscribe = onSnapshot(q, (querySnapshot) => {
      const transactionsData = [];
      querySnapshot.forEach((doc) => {
        transactionsData.push({ ...doc.data(), id: doc.id });
      });

      // --- SIRALAMA MANTIĞI ---
      transactionsData.sort((a, b) => {
        // 1. Önce Tarihe Göre Sırala
        const dateA = a.date && a.date.toDate ? a.date.toDate() : new Date(a.date || 0);
        const dateB = b.date && b.date.toDate ? b.date.toDate() : new Date(b.date || 0);
        
        // Eğer tarihler tamamen eşitse (milisaniyesine kadar), oluşturulma zamanına bak
        if (dateB.getTime() === dateA.getTime()) {
            const createdA = a.createdAt && a.createdAt.toDate ? a.createdAt.toDate() : new Date(0);
            const createdB = b.createdAt && b.createdAt.toDate ? b.createdAt.toDate() : new Date(0);
            return createdB - createdA;
        }

        return dateB - dateA; // En yeni tarih en üstte
      });

      setTransactions(transactionsData);
    });
  };

  // --- KULLANICI DOĞRULAMA (AUTH) ---
  useEffect(() => {
    const initAuth = async () => {
      try {
        await setPersistence(auth, browserLocalPersistence);
      } catch (error) {
        console.error("Kalıcılık hatası:", error);
      }

      const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
        setUser(currentUser);
        if (currentUser) {
          listenToTransactions(currentUser.uid);
          fetchSettings(currentUser.uid);
        } else {
          setTransactions([]);
        }
        // Yükleme animasyonunu bitir
        setAuthLoading(false);
      });
      return unsubscribe;
    };

    const unsubscribePromise = initAuth();
    return () => { unsubscribePromise.then(unsub => unsub && unsub()); };
  }, []);

  // --- AYARLAR VE DİĞER FONKSİYONLAR ---
  const fetchSettings = async (uid) => {
      const docRef = doc(db, "user_settings", uid);
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) setStartingBalance(docSnap.data().startingBalance);
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

  // --- HESAPLAMALAR ---
  const allTimeIncome = transactions.filter(t => Number(t.amount) > 0).reduce((acc, t) => acc + Number(t.amount), 0);
  const allTimeExpense = transactions.filter(t => Number(t.amount) < 0).reduce((acc, t) => acc + Math.abs(Number(t.amount)), 0);
  const totalBalance = (allTimeIncome - allTimeExpense) + startingBalance;

  const now = new Date();
  const currentMonth = now.getMonth(); 
  const currentYear = now.getFullYear();
  const currentMonthLabel = now.toLocaleDateString('tr-TR', { month: '2-digit', year: 'numeric' });

  const thisMonthTransactions = transactions.filter(t => {
      if (!t.date) return false;
      const tDate = t.date.toDate ? t.date.toDate() : new Date(t.date || 0);
      return tDate.getMonth() === currentMonth && tDate.getFullYear() === currentYear;
  });

  const monthlyIncome = thisMonthTransactions.filter(t => t.amount > 0).reduce((acc, t) => acc + t.amount, 0);
  const monthlyExpense = thisMonthTransactions.filter(t => t.amount < 0).reduce((acc, t) => acc + Math.abs(t.amount), 0);
  const monthlyFlow = monthlyIncome - monthlyExpense;
  const savingsRate = monthlyIncome > 0 ? monthlyFlow / monthlyIncome : 0;

  // --- GRAFİK VERİ HAZIRLAMA ---
  const processChartData = () => {
    const last30Days = [];
    for (let i = 29; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const dateKey = d.toLocaleDateString('ja-JP', { month: 'numeric', day: 'numeric' });
        
        const dayTransactions = transactions.filter(t => {
            if(!t.date) return false;
            const tDate = t.date.toDate ? t.date.toDate() : new Date(t.date || 0);
            return tDate.getDate() === d.getDate() && tDate.getMonth() === d.getMonth();
        });

        const dayIncome = dayTransactions.filter(t => t.amount > 0).reduce((acc, t) => acc + t.amount, 0);
        const dayExpense = dayTransactions.filter(t => t.amount < 0).reduce((acc, t) => acc + Math.abs(t.amount), 0);

        last30Days.push({ name: dateKey, Gelir: dayIncome, Gider: dayExpense });
    }
    return last30Days;
  };

  const processCategoryData = () => {
    const expenses = transactions.filter(t => t.amount < 0);
    const categoryMap = {};
    expenses.forEach(t => {
        const cat = t.category || "Diğer";
        if (!categoryMap[cat]) categoryMap[cat] = 0;
        categoryMap[cat] += Math.abs(t.amount);
    });
    const data = Object.keys(categoryMap).map(key => ({ name: key, value: categoryMap[key] }));
    return data.sort((a, b) => b.value - a.value);
  };
  
  const chartData = useMemo(() => processChartData(), [transactions]);
  const categoryData = useMemo(() => processCategoryData(), [transactions]);

  const processMonthlyTrendData = () => {
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth();
    const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
    const data = [];
    for (let i = 1; i <= daysInMonth; i++) {
        const dayTransactions = transactions.filter(t => {
            if(!t.date) return false;
            const tDate = t.date.toDate ? t.date.toDate() : new Date(t.date || 0);
            return tDate.getDate() === i && tDate.getMonth() === currentMonth && tDate.getFullYear() === currentYear;
        });
        const dayIncome = dayTransactions.filter(t => t.amount > 0).reduce((acc, t) => acc + t.amount, 0);
        const dayExpense = dayTransactions.filter(t => t.amount < 0).reduce((acc, t) => acc + Math.abs(t.amount), 0);
        const netFlow = dayIncome - dayExpense; 
        data.push({ day: i, net: netFlow, income: dayIncome, expense: dayExpense });
    }
    return data;
  };

  const processYearlyTrendData = () => {
    const currentYear = new Date().getFullYear();
    const months = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];
    const data = months.map((monthName, index) => {
        const monthTransactions = transactions.filter(t => {
            if(!t.date) return false;
            const tDate = t.date.toDate ? t.date.toDate() : new Date(t.date || 0);
            return tDate.getMonth() === index && tDate.getFullYear() === currentYear;
        });
        const mIncome = monthTransactions.filter(t => t.amount > 0).reduce((acc, t) => acc + t.amount, 0);
        const mExpense = monthTransactions.filter(t => t.amount < 0).reduce((acc, t) => acc + Math.abs(t.amount), 0);
        const netFlow = mIncome - mExpense;
        return { name: monthName, shortName: (index + 1).toString(), net: netFlow, income: mIncome, expense: mExpense };
    });
    return data;
  };
  
  const displayData = useMemo(() => {
    if (chartView === 'yearly') return processYearlyTrendData();
    return processMonthlyTrendData();
  }, [chartView, transactions]);

  // --- ACTION HANDLERS ---
  const handleLogin = async () => { await signInWithPopup(auth, googleProvider); };
  const handleLogout = async () => { await signOut(auth); setMessages([]); localStorage.removeItem("chatHistory"); };
  
  const handleSend = async (e) => {
    e.preventDefault();
    if (!input.trim()) return;
    
    // 1. Kullanıcı mesajını ekle
    const userMsg = { 
        role: 'user', 
        text: input, 
        time: new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) 
    };
    
    setMessages(prev => [...prev, userMsg]);
    setInput("");
    setLoading(true);

    try {
      // 2. API'ye gönder (İsim bilgisiyle birlikte)
      const res = await fetch('/api/chat', { 
        method: 'POST', 
        headers: { 
            'Content-Type': 'application/json'
        }, 
        body: JSON.stringify({ 
            message: userMsg.text,
            userName: user.displayName || "Dostum" 
        }) 
      });
      
      const data = await res.json();

      // 3. Yapay Zekanın Cevabını Ekle (ÖNEMLİ: data.reply kullanıyoruz)
      setMessages(prev => [...prev, { 
          role: 'ai', 
          text: data.reply || "İşleminizi kaydettim.", // Eğer cevap boş gelirse bunu yaz
          time: new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) 
      }]);
      
      // 4. Eğer işlem varsa veritabanına kaydet
      if (data.transactions && Array.isArray(data.transactions) && user) {
        // ✅ FİX: forEach yerine Promise.all kullan (forEach async'i beklemez!)
        await Promise.all(data.transactions.map(async (t) => {
          try {
            const safeAmount = parseFloat(t.amount);
            
            if (!isNaN(safeAmount)) {
                let finalDate = new Date(); // Varsayılan: ŞU AN

                if (t.date) {
                  const aiDate = new Date(t.date);
                  const today = new Date();
                  const isSameDay = aiDate.getDate() === today.getDate() &&
                                    aiDate.getMonth() === today.getMonth() &&
                                    aiDate.getFullYear() === today.getFullYear();
                  
                  // Eğer bugün değilse AI tarihini kullan
                  if (!isSameDay) finalDate = aiDate;
                }

                const docRef = await addDoc(collection(db, "transactions"), {
                  uid: user.uid, 
                  desc: t.desc || "Genel", 
                  category: t.category || "Diğer", 
                  amount: safeAmount, 
                  date: Timestamp.fromDate(finalDate), 
                  createdAt: serverTimestamp()
                });
                
                console.log("✅ İşlem kaydedildi:", docRef.id, t.desc, safeAmount);
            }
          } catch (txError) {
            console.error("❌ İşlem kayıt hatası:", txError, t);
          }
        }));
      }
    } catch (error) { 
        console.error("❌ Chat Hatası:", error);
        setMessages(prev => [...prev, { role: 'ai', text: "Bağlantı hatası oluştu.", time: "Now" }]); 
    } finally { 
        setLoading(false); 
    }
  };

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, isChatOpen]);

  // --- SİLME İŞLEMİ ---
  const confirmDelete = (id) => { 
    if(!id) {
        console.error("Silinecek ID bulunamadı!");
        return;
    }
    setItemToDelete(id); 
    setModalOpen(true); 
  };
  
  const handleDelete = async () => { 
    if (!itemToDelete) return; 
    try {
        await deleteDoc(doc(db, "transactions", itemToDelete)); 
        setModalOpen(false); 
        setItemToDelete(null); 
    } catch(err) {
        console.error("Silme hatası:", err);
    }
  };
  
  const formatMoney = (amount) => {
    return new Intl.NumberFormat('ja-JP', { style: 'currency', currency: 'JPY', maximumFractionDigits: 0 }).format(amount);
  };
  
  // --- UI RENDER ---

  // 1. Loading Ekranı
  if (authLoading) {
      return (
        <div className="flex min-h-screen items-center justify-center bg-slate-50">
          <div className="flex flex-col items-center gap-4">
            <div className="relative flex h-20 w-20 items-center justify-center rounded-2xl bg-white shadow-xl shadow-blue-500/20">
              <span className="material-symbols-outlined text-4xl text-blue-600 animate-pulse">calculate</span>
              <div className="absolute inset-0 rounded-2xl border-2 border-blue-100"></div>
              <div className="absolute inset-0 rounded-2xl border-t-2 border-blue-600 animate-spin"></div>
            </div>
            <div className="text-center">
              <h2 className="text-lg font-bold text-slate-700">Finans AI</h2>
              <p className="text-xs text-slate-400 font-medium animate-pulse">Verileriniz hazırlanıyor...</p>
            </div>
          </div>
        </div>
      );
  }

  // 2. Login Ekranı
  if (!user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 relative overflow-hidden">
        <div className="z-10 flex flex-col items-center gap-6 p-10 bg-white/70 backdrop-blur-xl border border-slate-200 rounded-3xl shadow-2xl max-w-md text-center">
            <h1 className="text-3xl font-bold text-slate-800">Finans AI (JP)</h1>
            <button onClick={handleLogin} className="px-6 py-3 bg-white border rounded-xl shadow-sm hover:bg-slate-50 font-bold text-slate-700">Google ile Giriş Yap</button>
        </div>
      </div>
    );
  }

  // 3. Ana Ekran
  return (
    <div className="relative flex min-h-screen w-full flex-col overflow-x-hidden bg-slate-50 text-slate-800 font-['Manrope']">
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
          <button onClick={handleLogout} className="p-2 text-slate-400 hover:text-red-500"><span className="material-symbols-outlined">logout</span></button>
        </div>
      </header>

      {/* MAIN CONTENT */}
      <main className="relative z-0 flex-1 overflow-y-auto p-4 pt-24 mt-0 pb-32">
        <div className="mx-auto flex max-w-[1200px] flex-col gap-6">
          
          {/* 1. ÖZET KART */}
          <div className="relative z-0 w-full rounded-2xl bg-white border border-slate-200 p-5 shadow-sm overflow-hidden group hover:shadow-md transition-all">
            <div className="flex flex-row items-center justify-between gap-4">
              <div className="flex-1 flex flex-col justify-center gap-2 min-w-0">
                <div>
                    <h3 className="text-base md:text-lg font-bold text-slate-800 truncate">
                        {monthlyFlow < 0 ? "Bütçe Aşıldı! 🚨" : monthlyFlow < 20000 ? "Dikkatli Ol! 🚨" : monthlyFlow < 40000 ? "İdare Eder 👍" : monthlyFlow < 50000 ? "İyi Durumda 🤔" : savingsRate < 0.65 ? "İyi Gidiyorsun 👍" : "Süper Tasarruf! 🚀"}
                    </h3>
                    <p className="text-xs text-slate-500 line-clamp-1">
                        {monthlyFlow < 0 ? `${formatMoney(Math.abs(monthlyFlow))} aşıldı.` : `%${monthlyIncome > 0 ? Math.round((monthlyFlow / monthlyIncome) * 100) : 0} tasarruf.`}
                    </p>
                </div>
                <div className="relative w-full h-3 bg-slate-100 rounded-full overflow-hidden border border-slate-200">
                    <div 
                        className={`relative h-full transition-all duration-1000 ease-out shadow-sm overflow-hidden
                        ${monthlyFlow >= 0 ? 'bg-gradient-to-r from-emerald-400 to-emerald-500' : 'bg-gradient-to-r from-red-500 to-red-600'}`} 
                        style={{ width: monthlyFlow >= 0 ? `${monthlyIncome > 0 ? Math.min((monthlyFlow / monthlyIncome) * 100, 100) : 0}%` : '100%' }}
                    >
                      <div className="absolute top-0 left-0 w-full h-full bg-gradient-to-r from-transparent via-white/60 to-transparent -skew-x-12 animate-shimmer"></div>
                    </div>
                </div>
              </div>
              <div className={`h-16 w-16 md:h-20 md:w-20 shrink-0 flex items-center justify-center rounded-2xl border-2 md:border-4 shadow-sm transition-all 
                ${monthlyFlow < 0 ? 'bg-red-50 border-red-200' : monthlyFlow < 50000 ? 'bg-orange-50 border-orange-200' : savingsRate < 0.65 ? 'bg-blue-50 border-blue-200' : 'bg-emerald-50 border-emerald-200' }`}>
                {monthlyFlow < 0 ? <img src="/unhappy.gif" className="h-14 w-14 md:h-16 md:w-16 object-contain scale-x-[-1]"/> : 
                 monthlyFlow < 50000 ? <img src="/notr.gif" className="h-14 w-14 md:h-16 md:w-16 object-contain scale-x-[-1]"/> : 
                 savingsRate < 0.65 ? <img src="/good.gif" className="h-14 w-14 md:h-16 md:w-16 object-contain scale-x-[-1]"/> : 
                 <img src="/happy.gif" className="h-14 w-14 md:h-16 md:w-16 object-contain scale-x-[-1]"/>}
              </div>
            </div>
          </div>
          
          {/* 2. AREA CHART (DALGA) */}
          <div className="w-full h-72 bg-white rounded-2xl border border-slate-200 p-6 shadow-sm mt-0">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-bold uppercase tracking-widest text-slate-500">
                  {chartView === 'monthly' ? 'Bu Ayın Gidişatı' : 'Yıllık Genel Bakış'}
                </h3>
                <div className="bg-slate-100 p-1 rounded-lg flex text-xs font-bold">
                  <button onClick={() => setChartView('monthly')} className={`px-3 py-1.5 rounded-md transition-all ${chartView === 'monthly' ? 'bg-white shadow text-blue-600' : 'text-slate-500 hover:text-slate-700'}`}>Bu Ay</button>
                  <button onClick={() => setChartView('yearly')} className={`px-3 py-1.5 rounded-md transition-all ${chartView === 'yearly' ? 'bg-white shadow text-blue-600' : 'text-slate-500 hover:text-slate-700'}`}>Yıl</button>
                </div>
              </div>
              <div className="w-full h-full min-h-[200px]">
                  <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={displayData} margin={{ top: 10, right: 0, left: -20, bottom: 25 }}>
                          <defs>
                              <linearGradient id="colorNet" x1="0" y1="0" x2="0" y2="1">
                                  <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.8}/>
                                  <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                              </linearGradient>
                          </defs>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                          <XAxis 
                            dataKey={chartView === 'yearly' ? "name" : "day"} 
                            axisLine={false} tickLine={false} tick={{fill: '#94a3b8', fontSize: 11}} 
                            interval={chartView === 'yearly' ? 0 : 'preserveStartEnd'}
                            tickFormatter={(val) => chartView === 'yearly' ? val.substring(0, 3) : val}
                          />
                          <YAxis axisLine={false} tickLine={false} tick={{fill: '#94a3b8', fontSize: 11}} tickFormatter={(value) => `¥${value/1000}k`}/>
                          <Tooltip content={<CustomTooltip />} />
                          <Area type="monotone" dataKey="net" stroke="#3b82f6" fillOpacity={1} fill="url(#colorNet)" strokeWidth={3} name="Net Akış" animationDuration={1000} />
                      </AreaChart>
                  </ResponsiveContainer>
              </div>
          </div>

          {/* 3. İKİLİ GRAFİK (BAR + PIE) */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
             <div className="w-full h-80 bg-white rounded-2xl border border-slate-200 p-6 shadow-sm flex flex-col">
                 <h3 className="text-sm font-bold uppercase tracking-widest text-slate-500 mb-4 shrink-0">30 Günlük Akış</h3>
                 <div className="flex-1 w-full min-h-0 relative overflow-hidden">
                    <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={chartData} margin={{ top: 5, right: 0, left: -20, bottom: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                            <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fill: '#94a3b8', fontSize: 11}} dy={10} />
                            <YAxis axisLine={false} tickLine={false} tick={{fill: '#94a3b8', fontSize: 11}} tickFormatter={(value) => `¥${value/1000}k`} />
                            <Tooltip content={<CustomTooltip />} cursor={{fill: '#f1f5f9', opacity: 0.5}} />
                            <Bar dataKey="Gelir" fill="#10B981" radius={[4, 4, 0, 0]} barSize={12} />
                            <Bar dataKey="Gider" fill="#F43F5E" radius={[4, 4, 0, 0]} barSize={12} />
                        </BarChart>
                    </ResponsiveContainer>
                 </div>
             </div>

             <div className="w-full h-80 bg-white rounded-2xl border border-slate-200 p-6 shadow-sm flex flex-col">
                 <h3 className="text-sm font-bold uppercase tracking-widest text-slate-500 mb-2 shrink-0">Kategori Dağılımı</h3>
                 <div className="flex-1 w-full min-h-0 relative overflow-hidden flex items-center justify-center">
                    {categoryData.length > 0 ? (
                        <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                                <Pie data={categoryData} cx="50%" cy="50%" innerRadius={70} outerRadius={100} paddingAngle={3} dataKey="value">
                                    {categoryData.map((entry, index) => (
                                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} stroke="none" />
                                    ))}
                                </Pie>
                                <Tooltip content={<CustomTooltip />} />
                                <Legend layout="vertical" verticalAlign="middle" align="right" iconType="circle" wrapperStyle={{fontSize: '11px', color: '#64748b'}} />
                            </PieChart>
                        </ResponsiveContainer>
                    ) : (
                        <div className="text-slate-400 text-sm">Henüz veri yok.</div>
                    )}
                 </div>
             </div>
          </div>

          {/* 4. İSTATİSTİK KARTLARI */}
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            <div className="rounded-2xl p-6 border border-slate-200 bg-white shadow-sm h-32 flex flex-col justify-between relative">
               <div className="flex justify-between items-start">
                   <p className="text-sm font-semibold text-slate-500 uppercase">Bu Ay Gelen</p>
                   <span className="text-[12px] text-slate-500 font-mono border border-slate-300 px-1.5 rounded">{currentMonthLabel}</span>
               </div>
               <p className="text-3xl font-bold text-slate-800">{formatMoney(monthlyIncome)}</p>
            </div>
            <div className="rounded-2xl p-6 border border-slate-200 bg-white shadow-sm h-32 flex flex-col justify-between relative">
               <div className="flex justify-between items-start">
                   <p className="text-sm font-semibold text-slate-500 uppercase">Bu Ay Giden</p>
                   <span className="text-[12px] text-slate-500 font-mono border border-slate-300 px-1.5 rounded">{currentMonthLabel}</span>
               </div>
               <p className="text-3xl font-bold text-slate-800">{formatMoney(monthlyExpense)}</p>
            </div>
          </div>

          {/* 5. CÜZDAN & GEÇMİŞ LİSTESİ */}
          <div className="flex flex-col gap-6 rounded-2xl p-6 border border-slate-200 bg-white shadow-sm">
              <div className="flex items-center justify-between border-b border-slate-100 pb-4">
                <h3 className="text-lg font-bold text-slate-800">Cüzdan Durumu</h3>
                <button onClick={() => { setTempBalance(startingBalance); setIsSettingsOpen(true); }} className="px-3 py-1 bg-slate-50 border rounded text-xs font-bold text-slate-600">Devir: {formatMoney(startingBalance)}</button>
              </div>
              <div className="text-center py-6">
                 <p className="text-5xl font-bold text-slate-800">{formatMoney(totalBalance)}</p>
              </div>
              
              <div className="flex flex-col gap-3">
                  <h3 className="text-slate-800 font-bold text-sm uppercase tracking-wide">Son Hareketler</h3>
                  {transactions.map((t) => (
                    <div key={t.id || Math.random()} className="flex items-center justify-between p-3 bg-white border border-slate-100 rounded-xl">
                         <div className="flex items-center gap-3">
                            <div className={`w-10 h-10 rounded-full flex items-center justify-center ${t.amount < 0 ? 'bg-orange-50 text-orange-500' : 'bg-green-50 text-green-500'}`}>
                                <span className="material-symbols-outlined text-[20px]">{t.amount < 0 ? 'shopping_cart' : 'payments'}</span>
                            </div>
                            <div>
                                <div className="text-sm font-bold text-slate-700">{t.desc}</div>
                                <div className="text-[10px] text-slate-400">{t.category} • {t.date?.toDate ? t.date.toDate().toLocaleDateString('ja-JP') : 'Tarih Yok'}</div>
                            </div>
                         </div>
                         <div className="flex items-center gap-3">
                            <span className={`text-sm font-bold ${t.amount < 0 ? 'text-slate-800' : 'text-green-600'}`}>{t.amount < 0 ? '' : '+'}{formatMoney(t.amount)}</span>
                            {/* Silme Butonu */}
                            <button onClick={() => confirmDelete(t.id)} className="text-slate-300 hover:text-red-500"><span className="material-symbols-outlined text-lg">delete</span></button>
                         </div>
                    </div>
                  ))}
              </div>
          </div>
        </div>
      </main>

      {/* CHAT BÖLÜMÜ */}
      <div className="fixed bottom-6 right-6 z-[9999] flex flex-col items-end gap-4">
        <div className={`bg-white border border-slate-200 shadow-2xl rounded-2xl overflow-hidden flex flex-col transition-all duration-300 ease-in-out origin-bottom-right ${isChatOpen ? 'w-[350px] h-[500px] opacity-100 scale-100' : 'w-0 h-0 opacity-0 scale-50 pointer-events-none'}`}>
            <div className="bg-blue-600 p-4 flex items-center justify-between text-white shrink-0">
                <span className="font-bold text-sm">Finans Asistanı</span>
                <button onClick={() => setIsChatOpen(false)}><span className="material-symbols-outlined text-lg">close</span></button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 bg-slate-50 flex flex-col gap-3">
                {messages.map((msg, index) => (
                    <div key={index} className={`flex flex-col max-w-[85%] ${msg.role === 'user' ? 'self-end items-end' : 'self-start items-start'}`}>
                        <div className={`px-4 py-2 rounded-2xl text-sm shadow-sm ${msg.role === 'user' ? 'bg-blue-600 text-white' : 'bg-white border border-slate-200'}`}>{msg.text}</div>
                    </div>
                ))}
                {loading && <div className="ml-2 text-xs text-slate-400">Yazıyor...</div>}
                <div ref={chatEndRef} />
            </div>
            <form onSubmit={handleSend} className="p-3 bg-white border-t border-slate-100 flex gap-2 shrink-0">
                <input className="flex-1 bg-slate-100 rounded-full px-4 text-sm focus:outline-none" placeholder="Harcama yaz..." value={input} onChange={(e) => setInput(e.target.value)} />
                <button type="submit" className="h-10 w-10 bg-blue-600 text-white rounded-full flex items-center justify-center"><span className="material-symbols-outlined text-lg">send</span></button>
            </form>
        </div>
        <button onClick={() => setIsChatOpen(!isChatOpen)} className={`h-16 w-16 rounded-full shadow-2xl flex items-center justify-center transition-all duration-300 transform hover:scale-110 active:scale-95 ${isChatOpen ? 'bg-slate-700 text-white rotate-90' : 'bg-blue-600 text-white'}`}>
            <span className="material-symbols-outlined text-3xl">{isChatOpen ? 'close' : 'chat_bubble'}</span>
        </button>
      </div>
      
      {/* SİLME MODALI */}
      {modalOpen && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm">
            <div className="bg-white p-6 rounded-2xl shadow-2xl transform transition-all scale-100">
                <h3 className="font-bold mb-4 text-lg text-slate-800">Bu işlem silinsin mi?</h3>
                <div className="flex justify-end gap-2">
                    <button onClick={handleDelete} className="bg-red-500 hover:bg-red-600 text-white px-4 py-2 rounded-lg font-bold transition-colors">Sil</button>
                    <button onClick={()=>setModalOpen(false)} className="bg-slate-100 hover:bg-slate-200 text-slate-700 px-4 py-2 rounded-lg font-bold transition-colors">İptal</button>
                </div>
            </div>
        </div>
      )}
      
      {/* AYARLAR MODALI */}
      {isSettingsOpen && (
          <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm">
            <div className="bg-white p-6 rounded-2xl shadow-2xl w-80">
                <h3 className="font-bold mb-4 text-slate-800">Devir Bakiyesi</h3>
                <input type="number" value={tempBalance} onChange={(e)=>setTempBalance(e.target.value)} className="border p-2 w-full rounded-lg mb-4 focus:ring-2 focus:ring-blue-500 outline-none"/>
                <div className="flex justify-end gap-2">
                    <button onClick={handleSaveSettings} className="bg-blue-600 text-white px-4 py-2 rounded-lg font-bold">Kaydet</button>
                    <button onClick={()=>setIsSettingsOpen(false)} className="bg-slate-100 text-slate-700 px-4 py-2 rounded-lg font-bold">İptal</button>
                </div>
            </div>
          </div>
      )}
    </div>
  );
}