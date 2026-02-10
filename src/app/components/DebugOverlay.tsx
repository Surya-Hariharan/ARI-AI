import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Terminal, Activity, Database, X, ChevronRight, Play } from 'lucide-react';
import { useSystem } from '../context/SystemContext';

export function DebugOverlay() {
    const { state, backgroundState, lastVoiceEvent, lastIntent, auditLog, simulateVoiceCommand } = useSystem();
    const [isOpen, setIsOpen] = useState(false);
    const [activeTab, setActiveTab] = useState<'state' | 'resolution' | 'logs'>('state');
    const [simInput, setSimInput] = useState('');

    // Toggle with Ctrl + `
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.ctrlKey && e.key === '`') {
                setIsOpen(prev => !prev);
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, []);

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[100] pointer-events-none flex items-center justify-center font-mono">
            <div className="absolute inset-0 bg-black/50 backdrop-blur-sm pointer-events-auto" onClick={() => setIsOpen(false)} />

            <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="bg-[#111] border border-[#333] w-full max-w-4xl h-[80vh] rounded-xl shadow-2xl pointer-events-auto flex flex-col overflow-hidden text-xs"
            >
                {/* Header */}
                <div className="flex items-center justify-between px-4 py-3 border-b border-[#333] bg-[#000]">
                    <div className="flex items-center gap-3">
                        <Terminal size={16} className="text-[#39FF14]" />
                        <span className="font-bold text-[#EAEAEA]">ARI DEBUG KERNEL</span>
                        <span className="px-3 py-1 rounded-full bg-[#333] text-[#888]">{state}</span>
                        {backgroundState === 'ACTIVE' && (
                            <span className="px-3 py-1 rounded-full bg-[#39FF14]/20 text-[#39FF14]">BG:ACTIVE</span>
                        )}
                    </div>
                    <button onClick={() => setIsOpen(false)} className="text-[#666] hover:text-white">
                        <X size={16} />
                    </button>
                </div>

                {/* Tabs */}
                <div className="flex border-b border-[#333] bg-[#1a1a1a]">
                    {[
                        { id: 'state', icon: Database, label: 'System State' },
                        { id: 'resolution', icon: Activity, label: 'Intent Resolution' },
                        { id: 'logs', icon: ChevronRight, label: 'Audit Stream' }
                    ].map(tab => (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id as any)}
                            className={`flex items-center gap-2 px-4 py-3 hover:bg-[#222] transition-colors ${activeTab === tab.id ? 'bg-[#222] text-[#39FF14] border-t-2 border-[#39FF14]' : 'text-[#888]'
                                }`}
                        >
                            <tab.icon size={14} />
                            {tab.label}
                        </button>
                    ))}
                </div>

                {/* Content */}
                <div className="flex-1 overflow-auto p-4 bg-[#0B0B0B]">

                    {activeTab === 'state' && (
                        <div className="grid grid-cols-2 gap-4 h-full">
                            <div className="space-y-4">
                                <div className="p-4 rounded bg-[#111] border border-[#333]">
                                    <h3 className="text-[#666] mb-2 uppercase tracking-widest">Global State</h3>
                                    <pre className="text-[#39FF14]">{JSON.stringify({
                                        state,
                                        backgroundState,
                                    }, null, 2)}</pre>
                                </div>
                                <div className="p-4 rounded bg-[#111] border border-[#333]">
                                    <h3 className="text-[#666] mb-2 uppercase tracking-widest">Simulation</h3>
                                    <div className="flex gap-2">
                                        <input
                                            type="text"
                                            value={simInput}
                                            onChange={(e) => setSimInput(e.target.value)}
                                            placeholder="Simulate voice command..."
                                            className="flex-1 bg-[#222] border border-[#333] rounded px-3 py-2 text-white focus:border-[#39FF14] outline-none"
                                            onKeyDown={(e) => e.key === 'Enter' && simulateVoiceCommand(simInput)}
                                        />
                                        <button
                                            onClick={() => simulateVoiceCommand(simInput)}
                                            className="bg-[#39FF14] text-black px-4 rounded font-bold hover:opacity-90"
                                        >
                                            <Play size={14} />
                                        </button>
                                    </div>
                                    <div className="mt-2 flex gap-2">
                                        <button onClick={() => simulateVoiceCommand("turn on the flashlight")} className="text-[10px] bg-[#333] px-3 py-1.5 rounded-full hover:bg-[#444] transition-colors">Quick: Flashlight</button>
                                        <button onClick={() => simulateVoiceCommand("unknown command test")} className="text-[10px] bg-[#333] px-3 py-1.5 rounded-full hover:bg-[#444] transition-colors">Quick: Error</button>
                                    </div>
                                </div>
                            </div>
                            <div className="p-4 rounded bg-[#111] border border-[#333] overflow-auto">
                                <h3 className="text-[#666] mb-2 uppercase tracking-widest">Context Dump</h3>
                                <pre className="text-[#888]">{JSON.stringify({
                                    lastVoiceEvent,
                                    lastIntent
                                }, null, 2)}</pre>
                            </div>
                        </div>
                    )}

                    {activeTab === 'resolution' && (
                        <div className="max-w-2xl mx-auto space-y-8">
                            {!lastIntent ? (
                                <div className="text-center text-[#444] mt-20">No intent resolution history</div>
                            ) : (
                                <>
                                    <div className="flex items-center gap-4">
                                        <div className="w-12 h-12 rounded-full bg-[#111] border border-[#333] flex items-center justify-center text-[#666]">
                                            IN
                                        </div>
                                        <div>
                                            <p className="text-[#666]">Transcript Input</p>
                                            <p className="text-xl text-white">"{lastIntent.originalTranscript}"</p>
                                        </div>
                                    </div>

                                    <div className="h-8 border-l-2 border-[#333] ml-6 border-dashed" />

                                    <div className="p-6 rounded-lg bg-[#111] border border-[#333]">
                                        <div className="flex justify-between mb-4">
                                            <span className="text-[#39FF14] font-bold">INTENT ENGINE</span>
                                            <span className="text-[#666]">{lastIntent.resolutionTimeMs}ms</span>
                                        </div>
                                        <div className="grid grid-cols-2 gap-4">
                                            <div>
                                                <p className="text-[#666] mb-1">Detected Intent</p>
                                                <div className="inline-block px-3 py-1 rounded bg-[#39FF14]/20 text-[#39FF14] border border-[#39FF14]/40">
                                                    {lastIntent.intent}
                                                </div>
                                            </div>
                                            <div>
                                                <p className="text-[#666] mb-1">Confidence</p>
                                                <div className="flex items-center gap-2">
                                                    <div className="flex-1 h-2 bg-[#333] rounded-full overflow-hidden">
                                                        <div
                                                            className="h-full bg-[#39FF14]"
                                                            style={{ width: `${(lastIntent.confidence || 0) * 100}%` }}
                                                        />
                                                    </div>
                                                    <span>{Math.round((lastIntent.confidence || 0) * 100)}%</span>
                                                </div>
                                            </div>
                                        </div>

                                        <div className="mt-4 pt-4 border-t border-[#333]">
                                            <p className="text-[#666] mb-1">Target Subsystem</p>
                                            <p className="text-white flex items-center gap-2">
                                                <Database size={12} /> {lastIntent.targetSubsystem}
                                            </p>
                                        </div>
                                    </div>

                                    <div className="h-8 border-l-2 border-[#333] ml-6 border-dashed" />

                                    <div className="flex items-center gap-4">
                                        <div className={`w-12 h-12 rounded-full border flex items-center justify-center ${lastIntent.intent === 'UNKNOWN_INTENT'
                                            ? 'bg-red-900/20 border-red-500/50 text-red-500'
                                            : 'bg-green-900/20 border-green-500/50 text-green-500'
                                            }`}>
                                            OUT
                                        </div>
                                        <div>
                                            <p className="text-[#666]">Execution Result</p>
                                            <p className={`text-xl ${lastIntent.intent === 'UNKNOWN_INTENT' ? 'text-red-500' : 'text-green-500'
                                                }`}>
                                                {lastIntent.intent === 'UNKNOWN_INTENT' ? 'FAILED' : 'SUCCESS'}
                                            </p>
                                        </div>
                                    </div>
                                </>
                            )}
                        </div>
                    )}

                    {activeTab === 'logs' && (
                        <div className="space-y-2">
                            {auditLog.map(log => (
                                <div key={log.id} className="flex gap-4 p-3 rounded bg-[#111] border border-[#333] hover:border-[#555]">
                                    <div className="w-20 text-[#666] shrink-0">
                                        {new Date(log.timestamp).toLocaleTimeString().split(' ')[0]}
                                    </div>
                                    <div className={`w-20 font-bold shrink-0 ${log.severity === 'ERROR' ? 'text-red-500' :
                                        log.severity === 'WARNING' ? 'text-yellow-500' : 'text-[#39FF14]'
                                        }`}>
                                        {log.severity}
                                    </div>
                                    <div className="w-24 text-[#888] shrink-0">{log.category}</div>
                                    <div className="flex-1 text-white">{log.action}</div>
                                    <div className="text-[#666]">{log.details}</div>
                                </div>
                            ))}
                            {auditLog.length === 0 && (
                                <div className="text-center text-[#444] mt-10">System Audit Log Empty</div>
                            )}
                        </div>
                    )}

                </div>
            </motion.div>
        </div>
    );
}
