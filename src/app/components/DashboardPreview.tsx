import React from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { motion } from 'motion/react';
import { Activity, ShieldCheck, Server, Globe } from 'lucide-react';

const data = [
  { name: '00:00', value: 4000 },
  { name: '04:00', value: 3000 },
  { name: '08:00', value: 2000 },
  { name: '12:00', value: 2780 },
  { name: '16:00', value: 1890 },
  { name: '20:00', value: 2390 },
  { name: '24:00', value: 3490 },
];

const stats = [
  { label: 'Active Nodes', value: '8,492', icon: Server, color: '#39FF14' },
  { label: 'Global Latency', value: '12ms', icon: Globe, color: '#C9A44C' },
  { label: 'Threats Blocked', value: '142', icon: ShieldCheck, color: '#BFC3C7' },
];

export function DashboardPreview() {
  return (
    <section className="py-24 px-4 md:px-6 bg-white flex flex-col items-center">
      <div className="max-w-6xl w-full">
        <div className="mb-12 text-center md:text-left">
          <h2 className="text-3xl font-bold text-[#0B0B0B] mb-2">System Architecture</h2>
          <p className="text-[#0B0B0B]/60 max-w-xl">
            Real-time visualization of global data streams and neural processing units.
          </p>
        </div>

        {/* Dashboard Container */}
        <motion.div 
          initial={{ opacity: 0, scale: 0.98 }}
          whileInView={{ opacity: 1, scale: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.8 }}
          className="bg-[#0B0B0B] rounded-sm shadow-2xl border border-[#BFC3C7] overflow-hidden p-6 md:p-8"
        >
          {/* Header */}
          <div className="flex justify-between items-center mb-8 border-b border-[#333] pb-4">
            <div className="flex items-center gap-3">
              <Activity className="text-[#39FF14] w-5 h-5 animate-pulse" />
              <span className="text-white font-mono text-sm tracking-widest uppercase">Live Monitor</span>
            </div>
            <div className="flex items-center gap-4">
               <span className="text-[#333] text-xs font-mono hidden sm:inline">ID: 994-Alpha</span>
               <div className="flex gap-1">
                 <div className="w-2 h-2 rounded-full bg-[#39FF14]" />
                 <div className="w-2 h-2 rounded-full bg-[#333]" />
                 <div className="w-2 h-2 rounded-full bg-[#333]" />
               </div>
            </div>
          </div>

          {/* Stats Grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
            {stats.map((stat, i) => (
              <div key={i} className="bg-[#111] p-4 border border-[#222] flex items-center justify-between">
                <div>
                  <p className="text-[#666] text-xs font-['Space_Mono'] uppercase mb-1">{stat.label}</p>
                  <p className="text-2xl font-['Space_Mono'] text-white tracking-tighter">{stat.value}</p>
                </div>
                <stat.icon style={{ color: stat.color }} className="w-6 h-6 opacity-80" />
              </div>
            ))}
          </div>

          {/* Chart Area */}
          <div className="h-[300px] w-full bg-[#111] border border-[#222] p-4 relative">
             <div className="absolute top-4 left-4 z-10">
               <p className="text-[#666] text-xs font-['Space_Mono'] uppercase">Data Throughput (GB/s)</p>
             </div>
             <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={data}>
                  <defs>
                    <linearGradient id="colorValue" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#39FF14" stopOpacity={0.2}/>
                      <stop offset="95%" stopColor="#39FF14" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#222" vertical={false} />
                  <XAxis dataKey="name" stroke="#444" tick={{fontSize: 10, fill: '#666'}} axisLine={false} tickLine={false} />
                  <YAxis stroke="#444" tick={{fontSize: 10, fill: '#666'}} axisLine={false} tickLine={false} />
                  <Tooltip 
                    contentStyle={{ backgroundColor: '#0B0B0B', border: '1px solid #333', borderRadius: '0px' }}
                    itemStyle={{ color: '#39FF14', fontFamily: 'monospace' }}
                  />
                  <Area 
                    type="monotone" 
                    dataKey="value" 
                    stroke="#39FF14" 
                    strokeWidth={2}
                    fillOpacity={1} 
                    fill="url(#colorValue)" 
                  />
                </AreaChart>
             </ResponsiveContainer>
          </div>
          
          {/* Footer of Dashboard */}
          <div className="mt-4 flex justify-between items-center text-[#444] text-[10px] font-mono">
            <span>Server: US-EAST-1</span>
            <span>Uptime: 99.999%</span>
          </div>

        </motion.div>
      </div>
    </section>
  );
}
