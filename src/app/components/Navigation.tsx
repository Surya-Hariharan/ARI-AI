import React, { useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Power, Cpu, Sliders, Fingerprint, Mic, X, Loader2, Play } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useSystem } from '../context/SystemContext';

interface NavigationProps {
  // Props are now optional/deprecated as we use context, but kept for compatibility during refactor if needed
  isListening?: boolean;
  onToggleMic?: () => void;
}

const navItems = [
  { name: 'Home', path: '/', icon: Power },
  { name: 'System', path: '/system', icon: Cpu },
  { name: 'Control', path: '/dashboard', icon: Sliders },
  { name: 'Account', path: '/account', icon: Fingerprint },
];

export function Navigation({ onToggleMic }: NavigationProps) {
  const location = useLocation();
  const { state, simulateVoiceCommand } = useSystem();

  // Helper to determine visual state
  const isListening = state === 'LISTENING';
  const isProcessing = state === 'PROCESSING';
  const isError = state === 'ERROR';
  const isAction = state === 'ACTION_EXECUTED';

  // For the simulation, we'll hook the button to the simulator if no prop provided
  const handleMicClick = () => {
    if (onToggleMic) {
      onToggleMic(); // Keep legacy behavior if passed
      // Also trigger simulation for now
      simulateVoiceCommand("turn on the flashlight");
    } else {
      simulateVoiceCommand("turn on the flashlight");
    }
  };

  const renderNavItem = (item: typeof navItems[0]) => {
    const isActive = location.pathname === item.path;
    return (
      <Link
        key={item.name}
        to={item.path}
        className="flex flex-col items-center justify-center w-full h-full gap-1 active:scale-95 transition-transform duration-200"
      >
        <div className="relative p-1">
          <item.icon
            size={20}
            strokeWidth={isActive ? 2.5 : 2}
            className={`transition-all duration-300 ${isActive ? 'text-[#39FF14] drop-shadow-[0_0_5px_rgba(57,255,20,0.5)]' : 'text-white/40'
              }`}
          />
        </div>
        <span className={`text-[8px] font-bold tracking-widest uppercase transition-colors duration-200 ${isActive ? 'text-[#39FF14]' : 'text-white/40'
          }`}>
          {item.name}
        </span>
      </Link>
    );
  };

  return (
    <>
      <nav
        className="fixed bottom-3 left-4 right-4 z-[100] bg-black/80 backdrop-blur-3xl border border-[#39FF14]/30 rounded-2xl shadow-[0_0_15px_rgba(57,255,20,0.15)]"
      >
        <div className="flex items-center h-16 px-4">
          <div className="flex-1 flex justify-center">{renderNavItem(navItems[0])}</div>
          <div className="flex-1 flex justify-center">{renderNavItem(navItems[1])}</div>

          {/* Assistant Trigger - Central */}
          <div className="flex-1 flex justify-center">
            <button
              onClick={handleMicClick}
              className={`flex-shrink-0 relative w-12 h-12 rounded-full flex items-center justify-center transition-all duration-500 active:scale-95 group overflow-hidden
                ${isListening || isProcessing ? 'bg-black shadow-[0_0_30px_rgba(57,255,20,0.4)] scale-110' :
                  isError ? 'bg-black border-red-500 shadow-[0_0_30px_rgba(255,0,0,0.4)]' :
                    'bg-black border border-[#333333] hover:border-[#39FF14]/50'}`}
            >
              <AnimatePresence mode="wait">
                {isListening ? (
                  <motion.div
                    key="listening"
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    exit={{ scale: 0 }}
                  >
                    <X className="w-5 h-5 text-[#39FF14] z-10" />
                  </motion.div>
                ) : isProcessing ? (
                  <motion.div
                    key="processing"
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    exit={{ scale: 0 }}
                    className="z-10"
                  >
                    <Loader2 className="w-5 h-5 text-[#39FF14] animate-spin" />
                  </motion.div>
                ) : isAction ? (
                  <motion.div
                    key="action"
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    exit={{ scale: 0 }}
                    className="z-10"
                  >
                    <Play className="w-5 h-5 text-[#39FF14] fill-[#39FF14]" />
                  </motion.div>
                ) : (
                  <motion.div
                    key="idle"
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    exit={{ scale: 0 }}
                    className="relative w-5 h-5 flex items-center justify-center"
                  >
                    <div className="absolute inset-0 rounded-full bg-white opacity-20 group-hover:opacity-40 transition-opacity" />
                    <div className="w-2.5 h-2.5 rounded-full bg-white group-hover:bg-[#39FF14] transition-colors shadow-[0_0_10px_rgba(255,255,255,0.5)]" />
                    <motion.div
                      animate={{ scale: [1, 1.2, 1], opacity: [0.3, 0.6, 0.3] }}
                      transition={{ repeat: Infinity, duration: 3 }}
                      className="absolute inset-[-4px] rounded-full border border-white/20"
                    />
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Status Glows */}
              <AnimatePresence>
                {(isListening || isProcessing) && (
                  <motion.div
                    key="mic-glow-outer"
                    initial={{ scale: 1, opacity: 0.5 }}
                    animate={{ scale: 1.5, opacity: 0 }}
                    exit={{ opacity: 0 }}
                    transition={{ repeat: Infinity, duration: 1.5 }}
                    className="absolute inset-0 bg-[#39FF14] rounded-full -z-10"
                  />
                )}
                {isError && (
                  <motion.div
                    key="error-glow"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: [0, 0.5, 0] }}
                    exit={{ opacity: 0 }}
                    className="absolute inset-0 bg-red-500/50 rounded-full -z-10"
                  />
                )}
              </AnimatePresence>

              <AnimatePresence>
                {(isListening || isProcessing) && (
                  <motion.div
                    key="mic-glow-inner"
                    animate={{ rotate: 360 }}
                    exit={{ opacity: 0 }}
                    transition={{ repeat: Infinity, duration: 2, ease: "linear" }}
                    className="absolute inset-1 rounded-full bg-black z-0 border border-[#39FF14]/40"
                  />
                )}
              </AnimatePresence>
            </button>
          </div>

          <div className="flex-1 flex justify-center">{renderNavItem(navItems[2])}</div>
          <div className="flex-1 flex justify-center">{renderNavItem(navItems[3])}</div>
        </div>
      </nav>
    </>
  );
}
