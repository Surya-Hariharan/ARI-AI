import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Activity, Shield, Eye, Cpu, Network, Clock, Zap, Filter, PlayCircle } from 'lucide-react';
import { VoiceCommands } from '../components/VoiceCommands';
import { GridBackground } from '../components/GridBackground';
import { useSystem } from '../context/SystemContext';
import { Link } from 'react-router-dom';

// Modern Toggle Component
const ModernToggle = ({ checked, onChange, disabled }: { checked: boolean; onChange: () => void; disabled?: boolean }) => (
    <button
        onClick={onChange}
        disabled={disabled}
        className={`relative w-12 h-7 rounded-full transition-all duration-300 ${checked ? 'bg-[#39FF14]/20 border border-[#39FF14]' : 'bg-[#BFC3C7]/10 border border-[#BFC3C7]/30'
            } ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
    >
        <motion.div
            layout
            transition={{ type: "spring", stiffness: 500, damping: 30 }}
            className={`absolute top-1 bottom-1 w-5 h-5 rounded-full shadow-lg ${checked ? 'left-[calc(100%-1.4rem)] bg-[#39FF14] shadow-[0_0_10px_rgba(57,255,20,0.5)]' : 'left-1 bg-[#BFC3C7]'
                }`}
        />
    </button>
);

export function ControlDashboard() {
    const { auditLog, state } = useSystem();
    const [globalEnabled, setGlobalEnabled] = useState(true);
    const [filter, setFilter] = useState<'ALL' | 'VOICE' | 'SYSTEM' | 'SECURITY'>('ALL');

    const [features, setFeatures] = useState([
        { id: 'data-read', name: 'Data Access', description: 'Read production data sources', enabled: true, icon: Eye },
        { id: 'processing', name: 'Processing', description: 'Execute compute workloads', enabled: true, icon: Cpu },
        { id: 'network', name: 'Network', description: 'External API connections', enabled: false, icon: Network },
        { id: 'security', name: 'Security', description: 'Access control management', enabled: true, icon: Shield },
    ]);

    const toggleFeature = (id: string) => {
        setFeatures(features.map(f =>
            f.id === id ? { ...f, enabled: !f.enabled } : f
        ));
    };

    const filteredLogs = auditLog.filter(log =>
        filter === 'ALL' ? true : log.category === filter
    );

    return (
        <main className="min-h-screen font-[Inter] bg-[#0B0B0B] text-white selection:bg-[#39FF14] selection:text-[#0B0B0B]">

            {/* Background Grid Effect */}
            <GridBackground gridSize={24} opacity={0.05} />

            <div className="relative pt-24 pb-32 px-6 max-w-lg mx-auto flex flex-col gap-6">

                {/* Header */}
                <motion.div
                    initial={{ opacity: 0, y: -20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex items-center justify-between"
                >
                    <div>
                        <h1 className="text-2xl font-bold tracking-tight">System Control</h1>
                        <p className="text-xs mt-1 text-[#BFC3C7]">Manage active protocols and permissions</p>
                    </div>
                    <div className="flex items-center gap-3">
                        <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#39FF14]/10 border border-[#39FF14]/30">
                            <div className={`w-1.5 h-1.5 rounded-full bg-[#39FF14] ${state === 'PROCESSING' ? 'animate-ping' : 'animate-pulse'}`} />
                            <span className="text-[10px] font-mono text-[#39FF14] uppercase tracking-wider">{state}</span>
                        </div>
                    </div>
                </motion.div>

                {/* Master Switch Card */}
                <motion.div
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: 0.1 }}
                    className={`relative overflow-hidden p-6 rounded-[32px] border transition-all duration-500 ${globalEnabled
                        ? 'bg-[#39FF14]/5 border-[#39FF14]/30 shadow-[0_0_30px_rgba(57,255,20,0.1)]'
                        : 'bg-[#1A1A1A] border-[#39FF14]/0 shadow-none'
                        }`}
                >
                    <div className="absolute top-0 right-0 p-4 opacity-10">
                        <Activity size={100} className={globalEnabled ? 'text-[#39FF14]' : 'text-white'} />
                    </div>

                    <div className="relative z-10 flex items-center justify-between">
                        <div className="flex items-center gap-4">
                            <div className={`p-3 rounded-full ${globalEnabled ? 'bg-[#39FF14] text-black' : 'bg-white/10 text-white'}`}>
                                <Zap size={24} fill={globalEnabled ? "currentColor" : "none"} />
                            </div>
                            <div>
                                <h2 className="text-lg font-bold">Master Override</h2>
                                <p className="text-xs text-[#BFC3C7]/70 font-mono mt-0.5">
                                    {globalEnabled ? 'SYSTEM ENGAGED' : 'SYSTEM STANDBY'}
                                </p>
                            </div>
                        </div>
                        <div className="scale-125">
                            <ModernToggle
                                checked={globalEnabled}
                                onChange={() => setGlobalEnabled(!globalEnabled)}
                            />
                        </div>
                    </div>
                </motion.div>

                {/* Feature Toggles List */}
                <div className="space-y-3">
                    <h3 className="text-xs font-bold uppercase tracking-[0.2em] ml-1 text-[#BFC3C7]/50">Subsystems</h3>
                    {features.map((feature, i) => (
                        <motion.div
                            key={feature.id}
                            layout
                            initial={{ opacity: 0, x: -10 }}
                            animate={{ opacity: 1, x: 0 }}
                            whileHover={{ scale: 1.02, backgroundColor: "rgba(57, 255, 20, 0.05)" }}
                            whileTap={{ scale: 0.98 }}
                            transition={{ delay: 0.2 + (i * 0.05), layout: { duration: 0.2 } }}
                            className={`group flex items-center justify-between p-4 rounded-[24px] border backdrop-blur-sm transition-colors duration-300 ${feature.enabled && globalEnabled
                                ? 'bg-black/40 border-[#39FF14]/30'
                                : 'bg-black/20 border-white/5 opacity-75'
                                }`}
                        >
                            <div className="flex items-center gap-4">
                                <div className={`p-2 rounded-full transition-colors ${feature.enabled && globalEnabled
                                    ? 'text-[#39FF14] bg-[#39FF14]/10'
                                    : 'text-[#BFC3C7] bg-white/5'
                                    }`}>
                                    <feature.icon size={18} />
                                </div>
                                <div>
                                    <p className={`text-sm font-medium transition-colors ${feature.enabled && globalEnabled
                                        ? 'text-white'
                                        : 'text-[#BFC3C7]'
                                        }`}>
                                        {feature.name}
                                    </p>
                                    <p className="text-[10px] text-[#BFC3C7]/50">{feature.description}</p>
                                </div>
                            </div>
                            <ModernToggle
                                checked={feature.enabled}
                                onChange={() => toggleFeature(feature.id)}
                                disabled={!globalEnabled}
                            />
                        </motion.div>
                    ))}
                </div>

                {/* Voice Commands Section */}
                <VoiceCommands />

                {/* Recent Activity Log */}
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.5 }}
                    className="mt-4 p-5 rounded-[32px] border backdrop-blur-md bg-black/40 border-white/10"
                >
                    <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-2">
                            <Clock size={14} className="text-[#39FF14]" />
                            <h3 className="text-xs font-bold uppercase tracking-wider text-white">Audit Log</h3>
                        </div>
                        <div className="flex gap-2">
                            {(['ALL', 'VOICE', 'SYSTEM'] as const).map(f => (
                                <button
                                    key={f}
                                    onClick={() => setFilter(f)}
                                    className={`text-[9px] px-2 py-1 rounded border ${filter === f ? 'bg-[#39FF14]/20 border-[#39FF14] text-[#39FF14]' : 'border-transparent text-[#666] hover:text-white'
                                        }`}
                                >
                                    {f}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="space-y-4 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">
                        {filteredLogs.length === 0 ? (
                            <div className="text-center py-8 text-[#444] text-xs">No activity recorded</div>
                        ) : (
                            filteredLogs.slice(0, 10).map((log) => (
                                <motion.div
                                    layout
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    key={log.id}
                                    className="relative pl-4 border-l border-white/10 group"
                                >
                                    <div className={`absolute left-[-2.5px] top-1.5 w-[5px] h-[5px] rounded-full ${log.severity === 'INFO' ? 'bg-[#39FF14]' :
                                        log.severity === 'WARNING' ? 'bg-[#C9A44C]' :
                                            log.severity === 'ERROR' ? 'bg-red-500' : 'bg-[#BFC3C7]'
                                        }`} />
                                    <div className="flex justify-between items-start">
                                        <p className="text-xs leading-tight text-[#BFC3C7] group-hover:text-white transition-colors">{log.action}</p>
                                        <span className="text-[10px] font-mono whitespace-nowrap ml-2 text-[#BFC3C7]/40">
                                            {new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                                        </span>
                                    </div>
                                    <p className="text-[10px] font-mono mt-1 text-[#BFC3C7]/30 flex justify-between">
                                        <span>{log.user}</span>
                                        {/* Fake Replay Button */}
                                        <button className="opacity-0 group-hover:opacity-100 flex items-center gap-1 text-[#39FF14] hover:underline">
                                            <PlayCircle size={10} /> REPLAY
                                        </button>
                                    </p>
                                </motion.div>
                            ))
                        )}
                    </div>
                </motion.div>

            </div>
        </main>
    );
}
