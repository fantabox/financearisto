"use client";
import { useState, useEffect } from 'react';
import { doc, updateDoc, serverTimestamp, Timestamp } from "firebase/firestore";
import { db } from "../../firebase"; // Yolun doğru olduğundan emin ol

// Kategorileri buraya da eklememiz gerekiyor (Select menüsü için)
const CATEGORIES = [
  "🍔 Yeme-İçme", "🎉 Eğlence/Sosyal", "🏠 Ev/Yaşam", "🚌 Ulaşım",
  "💡 Faturalar", "🛍️ Alışveriş", "🏥 Sağlık", "💰 Gelir/Yatırım", "📦 Diğer"
];

export default function EditModal({ isOpen, onClose, itemToEdit }) {
  const [editForm, setEditForm] = useState({ desc: "", amount: "", category: "", date: "" });

  // Dışarıdan gelen veri değiştiğinde formu doldur
  useEffect(() => {
    if (itemToEdit) {
      setEditForm({
        desc: itemToEdit.desc,
        amount: itemToEdit.amount,
        category: itemToEdit.category,
        // Eğer dateString yoksa (eski veri), tarihi yyyy-mm-dd formatına çevir
        date: itemToEdit.dateString || (itemToEdit.date?.toDate ? itemToEdit.date.toDate().toISOString().split('T')[0] : new Date().toISOString().split('T')[0])
      });
    }
  }, [itemToEdit]);

  // Modal kapalıysa hiçbir şey çizme
  if (!isOpen) return null; 

  // Zaman dilimi (Timezone) sorununu çözen fonksiyon
  const createSafeDate = (dateString) => {
    const [year, month, day] = dateString.split('-');
    return new Date(year, month - 1, day, 12, 0, 0); 
  };

  const handleUpdate = async () => {
    if (!itemToEdit) return;

    try {
      const transactionRef = doc(db, "transactions", itemToEdit.id);
      const safeDateObj = createSafeDate(editForm.date);

      await updateDoc(transactionRef, {
        amount: parseFloat(editForm.amount),
        category: editForm.category,
        desc: editForm.desc,
        date: Timestamp.fromDate(safeDateObj),
        dateString: editForm.date,
        updatedAt: serverTimestamp()
      });

      onClose(); // İşlem bitince modalı kapat
    } catch (error) {
      console.error("Güncellenirken hata:", error);
    }
  };

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm px-4">
      <div className="bg-white p-6 rounded-2xl w-full max-w-sm shadow-2xl transform transition-all scale-100">
        <h3 className="font-bold mb-4 text-slate-800 text-lg">İşlemi Düzenle</h3>
        
        <div className="flex flex-col gap-3">
          <div>
            <label className="text-xs text-slate-500 font-bold ml-1">Açıklama</label>
            <input className="w-full border p-2 rounded-lg bg-slate-50 focus:ring-2 focus:ring-blue-500 outline-none" value={editForm.desc} onChange={(e) => setEditForm({ ...editForm, desc: e.target.value })} />
          </div>
          <div>
            <label className="text-xs text-slate-500 font-bold ml-1">Tutar (Negatif=Harcama)</label>
            <input type="number" className="w-full border p-2 rounded-lg bg-slate-50 focus:ring-2 focus:ring-blue-500 outline-none" value={editForm.amount} onChange={(e) => setEditForm({ ...editForm, amount: e.target.value })} />
          </div>
          <div>
            <label className="text-xs text-slate-500 font-bold ml-1">Kategori</label>
            <select className="w-full border p-2 rounded-lg bg-slate-50 focus:ring-2 focus:ring-blue-500 outline-none" value={editForm.category} onChange={(e) => setEditForm({ ...editForm, category: e.target.value })}>
              {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-slate-500 font-bold ml-1">Tarih</label>
            <input type="date" className="w-full border p-2 rounded-lg bg-slate-50 focus:ring-2 focus:ring-blue-500 outline-none" value={editForm.date} max={new Date().toISOString().split('T')[0]} onChange={(e) => setEditForm({ ...editForm, date: e.target.value })} />
          </div>
        </div>

        <div className="flex gap-2 mt-6">
          <button onClick={handleUpdate} className="flex-1 bg-blue-600 text-white py-3 rounded-xl font-bold hover:bg-blue-700 transition-all active:scale-95 shadow-md active:shadow-none">Kaydet</button>
          <button onClick={onClose} className="flex-1 bg-slate-100 text-slate-600 py-3 rounded-xl font-bold hover:bg-slate-200 transition-all active:scale-95">İptal</button>
        </div>

      </div>
    </div>
  );
}