"use client";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

const CustomTooltip = ({ active, payload, label, currency }) => {
  if (active && payload && payload.length) {
    const value = payload[0].value;
    return (
      <div className="bg-white/95 backdrop-blur-sm p-3 border border-slate-100 shadow-xl rounded-xl min-w-[120px]">
        {/* Label artık hem gün hem ay olabilir */}
        <p className="font-bold text-slate-700 text-sm mb-2 border-b border-slate-100 pb-1">{label}</p>
        <div className="flex items-center justify-between gap-4">
            <span className="text-xs text-slate-500 font-medium">Net Durum:</span>
            <span className={`text-sm font-bold ${value < 0 ? 'text-rose-500' : 'text-emerald-600'}`}>
                {new Intl.NumberFormat('ja-JP', { style: 'currency', currency: currency }).format(value)}
            </span>
        </div>
      </div>
    );
  }
  return null;
};

const formatYAxis = (tick) => {
    if (tick === 0) return '0';
    if (tick >= 1000000 || tick <= -1000000) return `${(tick / 1000000).toFixed(1)}M`;
    if (tick >= 1000 || tick <= -1000) return `${(tick / 1000).toFixed(0)}k`;
    return tick;
};

export default function NetBalanceChart({ data, currency }) {
  if (!data || data.length === 0) {
    return <div className="w-full h-72 bg-slate-50 rounded-2xl border border-slate-200 flex items-center justify-center text-slate-400 text-sm">Veri bekleniyor...</div>;
  }

  return (
    <div className="w-full h-full min-h-[250px]">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
            <defs>
              <linearGradient id="colorNet" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.6}/>
                <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
            
            <XAxis 
                dataKey="name" 
                axisLine={false} 
                tickLine={false} 
                tick={{fill: '#94a3b8', fontSize: 10}} 
                dy={10}
                interval="preserveStartEnd"
            />
            
            <YAxis 
                axisLine={false} 
                tickLine={false} 
                tick={{fill: '#94a3b8', fontSize: 10}} 
                tickFormatter={formatYAxis} 
            />
            
            <Tooltip content={<CustomTooltip currency={currency} />} cursor={{ stroke: '#3b82f6', strokeWidth: 1, strokeDasharray: '4 4' }} />
            
            <Area 
                type="monotone" 
                dataKey="net" 
                stroke="#3b82f6" 
                strokeWidth={3}
                fillOpacity={1} 
                fill="url(#colorNet)" 
                animationDuration={1500}
            />
          </AreaChart>
        </ResponsiveContainer>
    </div>
  );
}