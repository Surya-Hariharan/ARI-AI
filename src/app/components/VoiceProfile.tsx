import React, { useState } from 'react';
import { Mic, AlertTriangle, Activity, Trash, RefreshCw, Download } from 'lucide-react';
import { Link } from 'react-router-dom';

export function VoiceProfile() {
    const [profileExists, setProfileExists] = useState(true);

    if (!profileExists) {
        return (
            <div className="bg-white border border-[#E5E7EB] rounded-2xl p-6">
                <div className="flex items-center gap-4 mb-4">
                    <div className="w-10 h-10 bg-gray-100 rounded-full flex items-center justify-center">
                        <Mic className="w-5 h-5 text-gray-500" />
                    </div>
                    <div>
                        <h3 className="text-[#0B0B0B] font-medium">Voice Profile</h3>
                        <p className="text-gray-500 text-sm">Not trained</p>
                    </div>
                </div>
                <Link to="/voice-setup">
                    <button className="w-full py-3 bg-[#0B0B0B] text-white rounded-lg font-medium text-sm hover:opacity-90 transition-opacity">
                        Set Up Voice Recognition
                    </button>
                </Link>
            </div>
        );
    }

    return (
        <div className="bg-white border border-[#E5E7EB] rounded-2xl overflow-hidden">
            <div className="p-6 border-b border-[#E5E7EB] flex justify-between items-start">
                <div className="flex items-center gap-4">
                    <div className="w-10 h-10 bg-[#39FF14]/10 rounded-full flex items-center justify-center border border-[#39FF14]/50">
                        <Mic className="w-5 h-5 text-green-700" />
                    </div>
                    <div>
                        <h3 className="text-[#0B0B0B] font-medium">Voice Profile</h3>
                        <div className="flex items-center gap-2 mt-1">
                            <span className="w-2 h-2 bg-[#39FF14] rounded-full animate-pulse" />
                            <p className="text-gray-500 text-sm font-mono">ACTIVE • Trained Feb 09</p>
                        </div>
                    </div>
                </div>
            </div>

            <div className="p-6 bg-gray-50/50 space-y-4">
                <div className="grid grid-cols-2 gap-4">
                    <div className="bg-white p-3 rounded-xl border border-gray-200">
                        <p className="text-xs text-gray-400 mb-1">Samples Learned</p>
                        <p className="text-lg font-medium text-[#0B0B0B]">12</p>
                    </div>
                    <div className="bg-white p-3 rounded-xl border border-gray-200">
                        <p className="text-xs text-gray-400 mb-1">Phrases Recognized</p>
                        <p className="text-lg font-medium text-[#0B0B0B]">4</p>
                    </div>
                </div>

                <div className="pt-4 border-t border-gray-200 space-y-3">
                    <Link to="/voice-setup">
                        <button className="w-full flex items-center justify-center gap-2 py-2.5 bg-[#0B0B0B] text-white rounded-lg text-sm font-medium hover:opacity-90 transition-opacity">
                            <RefreshCw className="w-4 h-4" /> Retrain Voice
                        </button>
                    </Link>
                    <button
                        onClick={() => setProfileExists(false)}
                        className="w-full flex items-center justify-center gap-2 py-2.5 bg-red-50 text-red-600 border border-red-200 rounded-lg text-sm font-medium hover:bg-red-100"
                    >
                        <Trash className="w-4 h-4" /> Delete Voice Data
                    </button>
                    <button
                        onClick={() => alert("Diagnostic info exported: metadata version 1.0.4, pitch range extracted, tempo patterns stored locally.")}
                        className="w-full flex items-center justify-center gap-2 py-2 text-gray-400 text-[10px] font-medium hover:text-gray-600 border border-dashed border-gray-200 rounded-lg"
                    >
                        <Download className="w-3 h-3" /> Export Diagnostic Info (Non-audio only)
                    </button>
                </div>

                <div className="pt-2 px-2">
                    <p className="text-[10px] text-gray-400 text-center leading-relaxed">
                        "Voice samples are processed locally and stay on this device. No raw audio is uploaded or stored remotely."
                    </p>
                </div>
            </div>
        </div>
    );
}
