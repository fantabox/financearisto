"use client";
import { useState, useEffect, useRef } from 'react';
import { db } from '../../firebase';
import { collection, addDoc, serverTimestamp, Timestamp } from "firebase/firestore";

export default function ChatAssistant({ user, currency, language }) {
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const chatEndRef = useRef(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isChatOpen]);

  const handleSend = async (e) => {
    e.preventDefault();
    if (!input.trim() || !user) return;

    const userMsg = { 
      role: 'user', 
      text: input, 
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) 
    };
    
    setMessages(prev => [...prev, userMsg]);
    setInput("");
    setLoading(true);

    try {
      const localDate = new Date().toLocaleDateString('en-CA');

      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: userMsg.text,
          userName: user.displayName || "Dostum",
          currency: currency,
          language: language,
          userDate: localDate
        })
      });

      const data = await res.json();
      
      setMessages(prev => [...prev, { 
        role: 'ai', 
        text: data.reply || (language === 'tr' ? "İşlendi." : "Processed."), 
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) 
      }]);

      if (data.transactions && Array.isArray(data.transactions) && user) {
        for (const t of data.transactions) {
          const safeAmount = parseFloat(t.amount);
          if (!isNaN(safeAmount)) {
            let finalDate = new Date();
            const todayStr = new Date().toLocaleDateString('en-CA');
            
            if (t.date && t.date !== todayStr) {
              finalDate = new Date(t.date);
            }

            const today = new Date();
            if (finalDate > today) finalDate = today;

            await addDoc(collection(db, "transactions"), {
              uid: user.uid,
              desc: t.desc || "Genel",
              category: t.category || "Diğer",
              amount: safeAmount,
              date: Timestamp.fromDate(finalDate),
              createdAt: serverTimestamp()
            });
          }
        }
      }
    } catch (error) {
      console.error(error);
      setMessages(prev => [...prev, { 
        role: 'ai', 
        text: language === 'tr' ? "Hata oluştu." : "Error occurred.", 
        time: "Now" 
      }]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed bottom-6 right-6 z-[9999] flex flex-col items-end gap-4">
      <div className={`bg-white border border-slate-200 shadow-2xl rounded-2xl overflow-hidden flex flex-col transition-all duration-300 ease-in-out origin-bottom-right ${isChatOpen ? 'w-[350px] h-[500px] opacity-100 scale-100' : 'w-0 h-0 opacity-0 scale-50 pointer-events-none'}`}>
        <div className="bg-blue-600 p-4 flex items-center justify-between text-white shrink-0">
          <span className="font-bold text-sm">
            {language === 'tr' ? 'Finans Asistanı' : 'Finance Assistant'}
          </span>
          <button onClick={() => setIsChatOpen(false)} className="active:scale-90 transition-transform">
            <span className="material-symbols-outlined text-lg">close</span>
          </button>
        </div>
        
        <div className="flex-1 overflow-y-auto p-4 bg-slate-50 flex flex-col gap-3">
          {messages.map((msg, index) => (
            <div key={index} className={`flex flex-col max-w-[85%] ${msg.role === 'user' ? 'self-end items-end' : 'self-start items-start'}`}>
              <div className={`px-4 py-2 rounded-2xl text-sm shadow-sm ${msg.role === 'user' ? 'bg-blue-600 text-white' : 'bg-white border border-slate-200'}`}>
                {msg.text}
              </div>
            </div>
          ))}
          {loading && <div className="ml-2 text-xs text-slate-400">{language === 'tr' ? 'Yazıyor...' : 'Typing...'}</div>}
          <div ref={chatEndRef} />
        </div>

        <form onSubmit={handleSend} className="p-3 bg-white border-t border-slate-100 flex gap-2 shrink-0">
          <input 
            className="flex-1 bg-slate-100 rounded-full px-4 text-sm focus:outline-none" 
            placeholder={language === 'tr' ? "Harcama yaz..." : "Type expense..."} 
            value={input} 
            onChange={(e) => setInput(e.target.value)} 
          />
          <button type="submit" className="h-10 w-10 bg-blue-600 text-white rounded-full flex items-center justify-center transition-transform active:scale-90 shadow-md active:shadow-none">
            <span className="material-symbols-outlined text-lg">send</span>
          </button>
        </form>
      </div>

      <button 
        onClick={() => setIsChatOpen(!isChatOpen)} 
        className={`h-16 w-16 rounded-full shadow-2xl flex items-center justify-center transition-all duration-300 transform hover:scale-110 active:scale-90 ${isChatOpen ? 'bg-slate-700 text-white rotate-90' : 'bg-blue-600 text-white'}`}
      >
        <span className="material-symbols-outlined text-3xl">{isChatOpen ? 'close' : 'chat_bubble'}</span>
      </button>
    </div>
  );
}
