import React from 'react';
import { Mic, Plus, Trash2 } from 'lucide-react';
import { motion } from 'motion/react';

const SYSTEM_ACTIONS = [
    { id: 'flashlight', label: 'Flashlight', defaultPhrase: 'Turn on flashlight', custom: ['Torch on', 'Lumos'] },
    { id: 'wifi', label: 'Wi-Fi', defaultPhrase: 'Enable Wi-Fi', custom: [] },
    { id: 'screenshot', label: 'Screenshot', defaultPhrase: 'Take a screenshot', custom: ['Capture screen'] },
];

export function VoiceCommands() {
    return (
        <div className="bg-[#111111] border border-[#333333] rounded-2xl overflow-hidden mt-6">
            <div className="p-6 border-b border-[#333333]">
                <div className="flex items-center gap-3 mb-2">
                    <Mic className="w-5 h-5 text-[#39FF14]" />
                    <h3 className="text-white font-medium text-lg">Voice Commands</h3>
                </div>
                <p className="text-[#BFC3C7] text-sm">Manage how you talk to ARI.</p>
            </div>

            <div className="divide-y divide-[#333333]">
                {SYSTEM_ACTIONS.map(action => (
                    <div key={action.id} className="p-6 hover:bg-[#1A1A1A] transition-colors">
                        <div className="flex justify-between items-start mb-4">
                            <div>
                                <h4 className="text-white font-medium">{action.label}</h4>
                                <div className="flex items-center gap-2 mt-1">
                                    <p className="text-xs text-[#BFC3C7]/60 font-mono">Default: "{action.defaultPhrase}"</p>
                                    <span className="text-[10px] text-[#39FF14]/40 font-mono">• Trained (92%)</span>
                                </div>
                            </div>
                            <span className="text-[10px] bg-[#39FF14]/10 text-[#39FF14] border border-[#39FF14]/30 px-2 py-1 rounded">
                                ACTIVE
                            </span>
                        </div>

                        <div className="space-y-2">
                            {action.custom.map((phrase, idx) => (
                                <div key={idx} className="flex items-center justify-between bg-black/40 px-3 py-2 rounded-lg border border-[#333333]">
                                    <span className="text-[#BFC3C7] text-sm">"{phrase}"</span>
                                    <button className="text-[#BFC3C7]/40 hover:text-red-400 transition-colors">
                                        <Trash2 className="w-3 h-3" />
                                    </button>
                                </div>
                            ))}
                            <button className="flex items-center gap-2 text-xs text-[#39FF14] font-medium mt-2 hover:opacity-80">
                                <Plus className="w-3 h-3" /> Add Phrase
                            </button>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
