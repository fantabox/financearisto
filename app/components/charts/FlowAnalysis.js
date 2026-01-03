"use client";
import { 
  BarChart, Bar, PieChart, Pie, Cell, Tooltip, 
  ResponsiveContainer, XAxis, YAxis, CartesianGrid 
} from 'recharts';

// Daha modern ve geniş bir renk paleti
const COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#6366F1', '#14B8A6', '#64748B'];

// --- YARDIMCI BİLEŞENLER ---

// 1. Şık Tooltip (Mouse ile üzerine gelince çıkan kutucuk)
const CustomTooltip = ({ active, payload, label, currency = 'JPY' }) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-white/95 backdrop-blur-sm p-3 border border-slate-100 shadow-xl rounded-xl min-w-[120px]">
        <p className="font-bold text-slate-700 text-sm mb-1">{label}</p>
        {payload.map((entry, index) => (
          <div key={index} className="flex items-center gap-2 text-xs font-medium">
            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: entry.color || entry.fill }}></div>
            <span className="text-slate-500">{entry.name}:</span>
            <span className="text-slate-800 ml-auto">
              {new Intl.NumberFormat('ja-JP', { style: 'currency', currency: currency }).format(entry.value)}
            </span>
          </div>
        ))}
      </div>
    );
  }
  return null;
};

// 2. Kısaltılmış Para Formatı (Eksenler için: 1000 -> 1k)
const formatYAxis = (tick) => {
  if (tick >= 1000000) return `${(tick / 1000000).toFixed(1)}M`;
  if (tick >= 1000) return `${(tick / 1000).toFixed(0)}k`;
  return tick;
};

export default function FlowAnalysis({ chartData, categoryData, language }) {
  
  // Toplam gideri hesapla (Yüzde hesabı için)
  const totalExpense = categoryData.reduce((acc, curr) => acc + curr.value, 0);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
      
      {/* --- 1. BAR CHART (GELİR / GİDER AKIŞI) --- */}
      <div className="w-full h-[350px] bg-white rounded-2xl border border-slate-200 p-6 shadow-sm flex flex-col">
        <div className="flex items-center justify-between mb-6">
           <h3 className="text-sm font-bold uppercase tracking-widest text-slate-500">
              {language === 'tr' ? 'Nakit Akışı' : 'Cash Flow'}
           </h3>
           {/* Basit Legend */}
           <div className="flex gap-3 text-[10px] font-bold uppercase tracking-wide">
              <div className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-500"></span> {language === 'tr' ? 'Gelir' : 'Income'}</div>
              <div className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-rose-500"></span> {language === 'tr' ? 'Gider' : 'Expense'}</div>
           </div>
        </div>

        <div className="flex-1 w-full min-h-[200px] relative overflow-hidden">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }} barGap={5}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                
                <XAxis 
                  dataKey="name" 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{ fill: '#94a3b8', fontSize: 10 }} 
                  dy={10}
                />
                <YAxis 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{ fill: '#94a3b8', fontSize: 10 }} 
                  tickFormatter={formatYAxis} 
                />
                
                <Tooltip content={<CustomTooltip currency="JPY" />} cursor={{ fill: '#f8fafc' }} />
                
                <Bar name={language === 'tr' ? 'Gelir' : 'Income'} dataKey="Gelir" fill="#10B981" radius={[4, 4, 4, 4]} barSize={12} />
                <Bar name={language === 'tr' ? 'Gider' : 'Expense'} dataKey="Gider" fill="#F43F5E" radius={[4, 4, 4, 4]} barSize={12} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* --- 2. PIE CHART (KATEGORİ DAĞILIMI) --- */}
      <div className="w-full h-[350px] bg-white rounded-2xl border border-slate-200 p-6 shadow-sm flex flex-col">
        <h3 className="text-sm font-bold uppercase tracking-widest text-slate-500 mb-4 shrink-0">
            {language === 'tr' ? 'Harcama Dağılımı' : 'Expense Dist.'}
        </h3>
        
        <div className="flex flex-col sm:flex-row items-center h-full gap-4">
            {/* Grafik Kısmı */}
            <div className="flex-1 w-full h-[200px] sm:h-full relative">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie 
                    data={categoryData} 
                    cx="50%" 
                    cy="50%" 
                    innerRadius={50} 
                    outerRadius={80} 
                    paddingAngle={4} 
                    dataKey="value"
                    stroke="none"
                  >
                    {categoryData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip content={<CustomTooltip currency="JPY" />} />
                </PieChart>
              </ResponsiveContainer>
              {/* Ortadaki Toplam Yazısı */}
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                 <span className="text-xs text-slate-400 font-medium">Total</span>
                 <span className="text-sm font-bold text-slate-700">
                    {totalExpense > 0 ? (totalExpense/1000).toFixed(1) + 'k' : '0'}
                 </span>
              </div>
            </div>

            {/* Yan Liste (Custom Legend) */}
            <div className="w-full sm:w-40 flex flex-col gap-2 max-h-[200px] overflow-y-auto pr-2 custom-scrollbar">
                {categoryData.length > 0 ? categoryData.map((entry, index) => (
                    <div key={index} className="flex items-center justify-between text-xs group">
                        <div className="flex items-center gap-2 overflow-hidden">
                            <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: COLORS[index % COLORS.length] }}></div>
                            <span className="text-slate-600 truncate group-hover:text-slate-900 transition-colors">{entry.name}</span>
                        </div>
                        <span className="font-bold text-slate-400">
                             %{totalExpense > 0 ? ((entry.value / totalExpense) * 100).toFixed(0) : 0}
                        </span>
                    </div>
                )) : (
                    <div className="text-xs text-slate-400 text-center py-4">Veri yok</div>
                )}
            </div>
        </div>
      </div>

      <style jsx global>{`
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: #f1f5f9; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 4px; }
      `}</style>
    </div>
  );
}