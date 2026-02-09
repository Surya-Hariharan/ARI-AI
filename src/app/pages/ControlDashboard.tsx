import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Activity, Shield, Eye, Cpu, Network, Clock, Zap, Lock, Unlock } from 'lucide-react';
import { VoiceCommands } from '../components/VoiceCommands';
import { GridBackground } from '../components/GridBackground';

interface Feature {
    id: string;
    name: string;
    description: string;
    enabled: boolean;
    icon: React.ComponentType<{ className?: string, size?: number, fill?: string }>;
}

const initialFeatures: Feature[] = [
    { id: 'data-read', name: 'Data Access', description: 'Read production data sources', enabled: true, icon: Eye },
    { id: 'processing', name: 'Processing', description: 'Execute compute workloads', enabled: true, icon: Cpu },
    { id: 'network', name: 'Network', description: 'External API connections', enabled: false, icon: Network },
    { id: 'security', name: 'Security', description: 'Access control management', enabled: true, icon: Shield },
];

const recentActivity = [
    { time: '2m ago', action: 'Data Access enabled', user: 'admin@company.com', status: 'success' },
    { time: '15m ago', action: 'Processing task completed', user: 'system', status: 'success' },
    { time: '1h ago', action: 'Network access disabled', user: 'admin@company.com', status: 'warning' },
    { time: '2h ago', action: 'Security audit initiated', user: 'system', status: 'info' },
];

// Custom Modern Toggle Component
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
    const [features, setFeatures] = useState(initialFeatures);
    const [globalEnabled, setGlobalEnabled] = useState(true);

    const toggleFeature = (id: string) => {
        setFeatures(features.map(f =>
            f.id === id ? { ...f, enabled: !f.enabled } : f
        ));
    };

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
                            <div className="w-1.5 h-1.5 rounded-full bg-[#39FF14] animate-pulse" />
                            <span className="text-[10px] font-mono text-[#39FF14] uppercase tracking-wider">High Auth</span>
                        </div>
                    </div>
                </motion.div>

                {/* Master Switch Card */}
                <motion.div
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: 0.1 }}
                    className={`relative overflow-hidden p-6 rounded-2xl border transition-all duration-500 ${globalEnabled
                        ? 'bg-[#39FF14]/5 border-[#39FF14]/30 shadow-[0_0_30px_rgba(57,255,20,0.1)]'
                        : 'bg-[#1A1A1A] border-[#39FF14]/0 shadow-none'
                        }`}
                >
                    <div className="absolute top-0 right-0 p-4 opacity-10">
                        <Activity size={100} className={globalEnabled ? 'text-[#39FF14]' : 'text-white'} />
                    </div>

                    <div className="relative z-10 flex items-center justify-between">
                        <div className="flex items-center gap-4">
                            <div className={`p-3 rounded-xl ${globalEnabled ? 'bg-[#39FF14] text-black' : 'bg-white/10 text-white'}`}>
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
                            initial={{ opacity: 0, x: -10 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: 0.2 + (i * 0.05) }}
                            className={`group flex items-center justify-between p-4 rounded-xl border backdrop-blur-sm transition-all duration-300 ${feature.enabled && globalEnabled
                                ? 'bg-black/40 border-[#39FF14]/30 hover:border-[#39FF14]/50'
                                : 'bg-black/20 border-white/5 hover:border-white/10 opacity-75'
                                }`}
                        >
                            <div className="flex items-center gap-4">
                                <div className={`p-2 rounded-lg transition-colors ${feature.enabled && globalEnabled
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
                    className="mt-4 p-5 rounded-2xl border backdrop-blur-md bg-black/40 border-white/10"
                >
                    <div className="flex items-center gap-2 mb-4">
                        <Clock size={14} className="text-[#39FF14]" />
                        <h3 className="text-xs font-bold uppercase tracking-wider text-white">Audit Log</h3>
                    </div>
                    <div className="space-y-4">
                        {recentActivity.map((log, i) => (
                            <div key={i} className="relative pl-4 border-l border-white/10">
                                <div className={`absolute left-[-2.5px] top-1.5 w-[5px] h-[5px] rounded-full ${log.status === 'success' ? 'bg-[#39FF14]' :
                                    log.status === 'warning' ? 'bg-[#C9A44C]' : 'bg-[#BFC3C7]'
                                    }`} />
                                <div className="flex justify-between items-start">
                                    <p className="text-xs leading-tight text-[#BFC3C7]">{log.action}</p>
                                    <span className="text-[10px] font-mono whitespace-nowrap ml-2 text-[#BFC3C7]/40">{log.time}</span>
                                </div>
                                <p className="text-[10px] font-mono mt-1 text-[#BFC3C7]/30">{log.user}</p>
                            </div>
                        ))}
                    </div>
                </motion.div>

            </div>
        </main>
    );
}
