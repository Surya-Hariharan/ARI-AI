import React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { MobileWrapper } from './components/MobileWrapper';
import { Home } from './pages/Home';
import { SystemOverview } from './pages/SystemOverview';
import { VoiceSetup } from './pages/VoiceSetup';
import { ControlDashboard } from './pages/ControlDashboard';
import { UserSecurity } from './pages/UserSecurity';

import { Navigation } from './components/Navigation';
import { motion, AnimatePresence } from 'motion/react';
import { Mic, X } from 'lucide-react';

function App() {
  const [isListening, setIsListening] = React.useState(false);
  const timerRef = React.useRef<any>(null);

  const toggleListening = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }

    if (!isListening) {
      setIsListening(true);
      timerRef.current = setTimeout(() => {
        setIsListening(false);
        timerRef.current = null;
      }, 5000);
    } else {
      setIsListening(false);
    }
  };

  return (
    <MobileWrapper>
      <BrowserRouter>
        <div className="relative w-full h-full overflow-hidden">
          {/* Edge Glow Animation - Global "Living" Effect */}
          <AnimatePresence>
            {isListening && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{
                  opacity: [0.5, 0.85, 0.5],
                  boxShadow: [
                    'inset 0 0 30px rgba(57,255,20,0.2)',
                    'inset 0 0 80px rgba(57,255,20,0.5)',
                    'inset 0 0 30px rgba(57,255,20,0.2)'
                  ]
                }}
                exit={{ opacity: 0 }}
                transition={{
                  repeat: Infinity,
                  duration: 4,
                  ease: "easeInOut"
                }}
                className="fixed inset-0 pointer-events-none z-[60] border-[2px] border-[#39FF14]/60 rounded-none md:rounded-[40px]"
              />
            )}
          </AnimatePresence>

          {/* Listening Indicator - Global */}
          <div className="fixed top-24 left-0 right-0 z-[70] flex justify-center pointer-events-none">
            <AnimatePresence>
              {isListening && (
                <motion.div
                  initial={{ y: -20, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  exit={{ y: -20, opacity: 0 }}
                  className="bg-[#39FF14]/10 backdrop-blur-md px-4 py-1.5 rounded-full border border-[#39FF14]/30"
                >
                  <p className="text-[#39FF14] font-mono text-[10px] tracking-[0.2em] uppercase">Listening...</p>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <div className="absolute inset-0 overflow-y-auto no-scrollbar">
            {/* ... Status Area ... */}
            <div className="absolute top-0 left-0 w-full px-6 pt-12 pb-4 bg-gradient-to-b from-[#0B0B0B]/80 to-transparent z-10 pointer-events-none">
              <div className="flex justify-center items-center opacity-80">
                <span className="text-[10px] font-mono tracking-[0.3em] text-[#BFC3C7] uppercase">ARI SYSTEM</span>
              </div>
            </div>

            <Routes>
              <Route path="/" element={<Home />} />
              <Route path="/system" element={<SystemOverview />} />
              <Route path="/voice-setup" element={<VoiceSetup />} />
              <Route path="/dashboard" element={<ControlDashboard />} />
              <Route path="/account" element={<UserSecurity />} />
            </Routes>
            <div className="h-20 w-full bg-[#0B0B0B]" />
          </div>

          <Navigation isListening={isListening} onToggleMic={toggleListening} />
        </div>
      </BrowserRouter>
    </MobileWrapper>
  );
}

export default App;