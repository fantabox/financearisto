"use client";
import { useState, useEffect, useRef } from 'react';
// Firebase
import { auth, googleProvider, db } from '../firebase'; 
import { signInWithPopup, signOut, onAuthStateChanged } from "firebase/auth";
import { collection, addDoc, query, where, onSnapshot, deleteDoc, doc, orderBy, serverTimestamp, setDoc, getDoc, Timestamp} from "firebase/firestore";
// Grafik Kütüphanesi (Bar ve Pie Chart)
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts';

// Kategoriler için Renk Paleti
const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#A28DFF', '#FF6699', '#36A2EB', '#FF6384', '#4BC0C0'];

export default function Home() {
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

  // --- 1. KULLANICI TAKİBİ ---
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        listenToTransactions(currentUser.uid);
        fetchSettings(currentUser.uid);
      } else {
        setTransactions([]);
      }
    });
    return () => unsubscribe();
  }, []);

  // --- 2. VERİ DİNLEME ---
  const listenToTransactions = (uid) => {
    const q = query(
      collection(db, "transactions"), 
      where("uid", "==", uid),
      orderBy("createdAt", "desc")
    );
    onSnapshot(q, (snapshot) => {
      const transData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setTransactions(transData);
    });
  };

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
  const income = transactions.filter(t => Number(t.amount) > 0).reduce((acc, t) => acc + Number(t.amount), 0);
  const expense = transactions.filter(t => Number(t.amount) < 0).reduce((acc, t) => acc + Math.abs(Number(t.amount)), 0);
  const monthlyFlow = income - expense;
  const totalBalance = monthlyFlow + startingBalance;

  // --- GRAFİK 1: GÜNLÜK AKIŞ (Son 30 Gün) ---
  const processChartData = () => {
    const last30Days = [];
    for (let i = 29; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const dateKey = d.toLocaleDateString('ja-JP', { month: 'numeric', day: 'numeric' });
        
        const dayTransactions = transactions.filter(t => {
            if(!t.date) return false;
            const tDate = t.date.toDate();
            return tDate.getDate() === d.getDate() && tDate.getMonth() === d.getMonth();
        });

        const dayIncome = dayTransactions.filter(t => t.amount > 0).reduce((acc, t) => acc + t.amount, 0);
        const dayExpense = dayTransactions.filter(t => t.amount < 0).reduce((acc, t) => acc + Math.abs(t.amount), 0);

        last30Days.push({ name: dateKey, Gelir: dayIncome, Gider: dayExpense });
    }
    return last30Days;
  };

  // --- GRAFİK 2: KATEGORİ DAĞILIMI (Donut Chart) ---
  const processCategoryData = () => {
    // Sadece giderleri al
    const expenses = transactions.filter(t => t.amount < 0);
    const categoryMap = {};

    expenses.forEach(t => {
        // Kategori isminden emojiyi temizleyebiliriz veya olduğu gibi bırakabiliriz.
        // Şimdilik olduğu gibi alıyoruz: "🍔 Yeme-İçme"
        const cat = t.category || "Diğer";
        if (!categoryMap[cat]) categoryMap[cat] = 0;
        categoryMap[cat] += Math.abs(t.amount);
    });

    // PieChart formatına çevir
    const data = Object.keys(categoryMap).map(key => ({
        name: key,
        value: categoryMap[key]
    }));

    // Büyükten küçüğe sırala (Görsel olarak daha güzel durur)
    return data.sort((a, b) => b.value - a.value);
  };
  
  const chartData = processChartData();
  const categoryData = processCategoryData();

  // --- DİĞER FONKSİYONLAR ---
  const handleLogin = async () => { await signInWithPopup(auth, googleProvider); };
  const handleLogout = async () => { await signOut(auth); setMessages([]); localStorage.removeItem("chatHistory"); };
  
  const handleSend = async (e) => {
    e.preventDefault();
    if (!input.trim()) return;
    const userMsg = { role: 'user', text: input, time: new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) };
    setMessages(prev => [...prev, userMsg]);
    setInput("");
    setLoading(true);
    try {
      const res = await fetch('/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message: userMsg.text }) });
      const data = await res.json();
      setMessages(prev => [...prev, { role: 'ai', text: data.reply || "Kaydedildi.", time: new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) }]);
      if (data.transactions && Array.isArray(data.transactions) && user) {
        data.transactions.forEach(async (t) => {
          const safeAmount = parseFloat(t.amount);
          if (!isNaN(safeAmount)) {
              let transactionDate = new Date();
              if (t.date) transactionDate = new Date(t.date);
              await addDoc(collection(db, "transactions"), {
                uid: user.uid, desc: t.desc || "Genel", category: t.category || "Diğer", amount: safeAmount, date: Timestamp.fromDate(transactionDate), createdAt: serverTimestamp()
              });
          }
        });
      }
    } catch (error) { console.error(error); setMessages(prev => [...prev, { role: 'ai', text: "Hata oluştu.", time: "Now" }]); } finally { setLoading(false); }
  };

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, isChatOpen]);
  const confirmDelete = (id) => { setItemToDelete(id); setModalOpen(true); };
  const handleDelete = async () => { if (!itemToDelete) return; await deleteDoc(doc(db, "transactions", itemToDelete)); setModalOpen(false); setItemToDelete(null); };
  
  const formatMoney = (amount) => {
    return new Intl.NumberFormat('ja-JP', { style: 'currency', currency: 'JPY', maximumFractionDigits: 0 }).format(amount);
  };

  // --- LOGIN UI ---
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

  // --- MAIN UI ---
  return (
    <div className="relative flex min-h-screen w-full flex-col overflow-x-hidden bg-slate-50 text-slate-800 font-['Manrope']">
      
      {/* HEADER */}
      <header className="fixed top-0 left-0 w-full z-[40] h-20 flex items-center justify-between border-b border-slate-200 bg-white/80 backdrop-blur-xl px-6 md:px-10">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gray-600 text-white shadow-lg shadow-blue-500/30">
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
          
          {/* 1. KISIM: ÖZET KART (Cüzdan + Karakter) */}
          <div className="relative z-0 w-full rounded-2xl bg-white border border-slate-200 p-6 shadow-sm overflow-hidden group hover:shadow-md transition-all">
            <div className="flex flex-col md:flex-row items-center justify-between gap-6">
              <div className="flex-1 flex flex-col justify-center gap-3 w-full">
                <div>
                    <h3 className="text-lg font-bold text-slate-800">
                        {totalBalance < 0 ? "Dikkatli Olmalısın ⚠️" : totalBalance < 50000 ? "Tasarruf Zamanı 📉" : "Harika Gidiyorsun! 🎉"}
                    </h3>
                    <p className="text-sm text-slate-500">
                        {totalBalance < 0 ? "Harcamaların gelirini aşmış durumda." : totalBalance < 50000 ? "Henüz güvendesin ama sınırdasın." : "Gelirlerin giderlerinden fazla, cüzdanın keyfi yerinde."}
                    </p>
                </div>
                {/* Bar */}
                <div className="relative w-full h-4 bg-slate-100 rounded-full overflow-hidden border border-slate-200">
                    <div className={`h-full transition-all duration-1000 ease-out flex items-center justify-end pr-2 text-[10px] font-bold text-white ${totalBalance >= 0 ? 'bg-gradient-to-r from-green-400 to-green-500' : 'bg-gradient-to-r from-red-400 to-red-600'}`} style={{ width: totalBalance >= 0 ? `${Math.min((totalBalance / (income || 1)) * 100 + 20, 100)}%` : '100%' }}></div>
                </div>
              </div>
              <div className={`h-24 w-24 shrink-0 flex items-center justify-center rounded-full border-4 shadow-xl transition-all ${totalBalance < 0 ? 'bg-red-100 border-red-200' : totalBalance < 50000 ? 'bg-orange-100 border-orange-200' : 'bg-green-100 border-green-200'}`}>
                {totalBalance < 0 ? <img src="/unhappy.gif" className="h-20 w-20 object-contain scale-x-[-1]"/> : totalBalance < 50000 ? <img src="/notr.gif" className="h-20 w-20 object-contain scale-x-[-1]"/> : <img src="/happy.gif" className="h-20 w-20 object-contain scale-x-[-1]"/>}
              </div>
            </div>
          </div>

          {/* 2. KISIM: GRAFİKLER (YAN YANA DÜZEN) */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
             
             {/* SOL GRAFİK: BAR CHART (Gidişat) */}
             <div className="w-full h-[350px] bg-white rounded-2xl border border-slate-200 p-6 shadow-sm flex flex-col">
                 <div className="flex items-center justify-between mb-4 shrink-0">
                    <h3 className="text-sm font-bold uppercase tracking-widest text-slate-500">30 Günlük Akış</h3>
                    <div className="flex gap-3 text-xs font-bold">
                        <div className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-green-400"></span> Gelir</div>
                        <div className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-orange-400"></span> Gider</div>
                    </div>
                 </div>
                 <div className="flex-1 min-h-0">
                    <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={chartData} margin={{ top: 5, right: 0, left: -20, bottom: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                            <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fill: '#94a3b8', fontSize: 11}} dy={10} />
                            <YAxis axisLine={false} tickLine={false} tick={{fill: '#94a3b8', fontSize: 11}} tickFormatter={(value) => `¥${value/1000}k`} />
                            <RechartsTooltip cursor={{fill: '#f8fafc'}} contentStyle={{borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)'}} />
                            <Bar dataKey="Gelir" fill="#4ade80" radius={[4, 4, 0, 0]} barSize={12} />
                            <Bar dataKey="Gider" fill="#fb923c" radius={[4, 4, 0, 0]} barSize={12} />
                        </BarChart>
                    </ResponsiveContainer>
                 </div>
             </div>

             {/* SAĞ GRAFİK: DONUT CHART (Harcama Dağılımı) */}
             <div className="w-full h-[350px] bg-white rounded-2xl border border-slate-200 p-6 shadow-sm flex flex-col">
                 <div className="flex items-center justify-between mb-2 shrink-0">
                    <h3 className="text-sm font-bold uppercase tracking-widest text-slate-500">Kategori Dağılımı</h3>
                 </div>
                 <div className="flex-1 min-h-0 flex items-center justify-center">
                    {categoryData.length > 0 ? (
                        <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                                <Pie
                                    data={categoryData}
                                    cx="50%"
                                    cy="50%"
                                    innerRadius={60}
                                    outerRadius={90}
                                    paddingAngle={5}
                                    dataKey="value"
                                >
                                    {categoryData.map((entry, index) => (
                                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                    ))}
                                </Pie>
                                <RechartsTooltip 
                                    formatter={(value) => formatMoney(value)}
                                    contentStyle={{borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)'}}
                                />
                                <Legend 
                                    layout="vertical" 
                                    verticalAlign="middle" 
                                    align="right"
                                    iconType="circle"
                                    wrapperStyle={{fontSize: '11px', color: '#64748b'}}
                                />
                            </PieChart>
                        </ResponsiveContainer>
                    ) : (
                        <div className="text-slate-400 text-sm">Henüz veri yok.</div>
                    )}
                 </div>
             </div>

          </div>

          {/* 3. KISIM: İSTATİSTİK KARTLARI */}
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            <div className="rounded-2xl p-6 border border-slate-200 bg-white shadow-sm h-32 flex flex-col justify-between">
               <p className="text-sm font-semibold text-slate-500 uppercase">Bu Ay Gelen</p>
               <p className="text-3xl font-bold text-slate-800">{formatMoney(income)}</p>
            </div>
            <div className="rounded-2xl p-6 border border-slate-200 bg-white shadow-sm h-32 flex flex-col justify-between">
               <p className="text-sm font-semibold text-slate-500 uppercase">Bu Ay Giden</p>
               <p className="text-3xl font-bold text-slate-800">{formatMoney(expense)}</p>
            </div>
          </div>

          {/* 4. KISIM: CÜZDAN & GEÇMİŞ */}
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
                    <div key={t.id} className="flex items-center justify-between p-3 bg-white border border-slate-100 rounded-xl">
                         <div className="flex items-center gap-3">
                            <div className={`w-10 h-10 rounded-full flex items-center justify-center ${t.amount < 0 ? 'bg-orange-50 text-orange-500' : 'bg-green-50 text-green-500'}`}>
                                <span className="material-symbols-outlined text-[20px]">{t.amount < 0 ? 'remove' : 'payments'}</span>
                            </div>
                            <div>
                                <div className="text-sm font-bold text-slate-700">{t.desc}</div>
                                <div className="text-[10px] text-slate-400">{t.category} • {t.date?.toDate().toLocaleDateString('ja-JP') || 'Bugün'}</div>
                            </div>
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

      {/* CHAT PENCERESİ VE MODALLAR (AYNI) */}
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
      
      {modalOpen && <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm"><div className="bg-white p-6 rounded-2xl"><h3 className="font-bold mb-4">Silinsin mi?</h3><button onClick={handleDelete} className="bg-red-500 text-white px-4 py-2 rounded-lg">Sil</button><button onClick={()=>setModalOpen(false)} className="ml-2 px-4 py-2">İptal</button></div></div>}
      {isSettingsOpen && <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm"><div className="bg-white p-6 rounded-2xl"><h3 className="font-bold mb-4">Devir Bakiyesi</h3><input type="number" value={tempBalance} onChange={(e)=>setTempBalance(e.target.value)} className="border p-2 w-full rounded mb-4"/><button onClick={handleSaveSettings} className="bg-blue-600 text-white px-4 py-2 rounded-lg">Kaydet</button><button onClick={()=>setIsSettingsOpen(false)} className="ml-2 px-4 py-2">İptal</button></div></div>}
    </div>
  );
}