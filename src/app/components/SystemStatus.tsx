import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Wifi, WifiOff, Zap, ShieldAlert, Radio } from 'lucide-react';
import { useSystem } from '../context/SystemContext';

export function SystemStatus() {
    const { state, backgroundState } = useSystem();

    // Determine if we should show a warning
    const isOffline = state === 'OFFLINE';
    const isError = state === 'ERROR';
    const isBackgroundActive = backgroundState === 'ACTIVE';

    if (!isOffline && !isError && backgroundState === 'IDLE') return null;

    return (
        <div className="fixed top-6 right-6 z-[80] flex flex-col items-end gap-2 pointer-events-none">
            <AnimatePresence>
                {/* Background Service Indicator */}
                {isBackgroundActive && (
                    <motion.div
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: 20 }}
                        className="flex items-center gap-2 bg-[#39FF14]/10 backdrop-blur-md px-3 py-1.5 rounded-full border border-[#39FF14]/30"
                    >
                        <motion.div
                            animate={{ scale: [1, 1.2, 1] }}
                            transition={{ repeat: Infinity, duration: 2 }}
                            className="relative w-2 h-2"
                        >
                            <div className="absolute inset-0 bg-[#39FF14] rounded-full" />
                            <div className="absolute inset-0 bg-[#39FF14] rounded-full animate-ping" />
                        </motion.div>
                        <span className="text-[10px] font-mono text-[#39FF14] uppercase tracking-wider">
                            BG Service Active
                        </span>
                    </motion.div>
                )}

                {/* Offline/Error State */}
                {(isOffline || isError) && (
                    <motion.div
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: 20 }}
                        className={`flex items-center gap-2 px-3 py-1.5 rounded-full border backdrop-blur-md ${isOffline
                                ? 'bg-red-500/10 border-red-500/30'
                                : 'bg-yellow-500/10 border-yellow-500/30'
                            }`}
                    >
                        {isOffline ? (
                            <WifiOff size={12} className="text-red-500" />
                        ) : (
                            <ShieldAlert size={12} className="text-yellow-500" />
                        )}
                        <span className={`text-[10px] font-mono uppercase tracking-wider ${isOffline ? 'text-red-500' : 'text-yellow-500'
                            }`}>
                            {isOffline ? 'System Offline' : 'System Check Required'}
                        </span>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
