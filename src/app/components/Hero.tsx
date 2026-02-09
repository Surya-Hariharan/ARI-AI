import React, { useEffect, useRef } from 'react';
import { motion } from 'motion/react';
import { ArrowRight } from 'lucide-react';
import { Link } from 'react-router-dom';

export function Hero() {
  // Animation handled via Framer Motion in render

  return (
    <section className="relative min-h-screen w-full bg-[#0B0B0B] overflow-hidden flex flex-col justify-start pt-32 px-6">
      {/* Base Grid (Silver) - Fixed Background */}
      <div
        className="fixed inset-0 pointer-events-none"
        style={{
          backgroundImage: `
            linear-gradient(to right, rgba(191, 195, 199, 0.03) 1px, transparent 1px),
            linear-gradient(to bottom, rgba(191, 195, 199, 0.03) 1px, transparent 1px)
          `,
          backgroundSize: '48px 48px',
          maskImage: 'linear-gradient(to bottom, black 80%, transparent)',
          zIndex: 0
        }}
      />

      {/* Vertical Neon Wave Grid (Overlay) - Smoother & Pure Green */}
      <motion.div
        className="fixed inset-0 pointer-events-none mix-blend-screen"
        style={{
          backgroundImage: `
            linear-gradient(to right, rgba(57, 255, 20, 0.2) 1px, transparent 1px),
            linear-gradient(to bottom, rgba(57, 255, 20, 0.2) 1px, transparent 1px)
          `,
          backgroundSize: '48px 48px',
          zIndex: 0
        }}
        animate={{
          maskImage: [
            'linear-gradient(to bottom, transparent -100%, black -50%, transparent 0%)',
            'linear-gradient(to bottom, transparent 100%, black 150%, transparent 200%)'
          ]
        }}
        transition={{
          duration: 6,
          repeat: Infinity,
          ease: "linear",
          repeatDelay: 0
        }}
      />

      <div className="relative z-10 w-full max-w-3xl mx-auto flex flex-col items-start gap-8">
        {/* Status Badge */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: 'easeOut' }}
        >
          <div className="inline-block px-4 py-2 border border-white bg-transparent">
            <span className="text-[10px] font-mono tracking-[0.2em] text-white uppercase text-center block">
              System Online
            </span>
          </div>
        </motion.div>

        {/* Main Headline - Stacked Layout with Motion Reveal */}
        <div className="flex flex-col items-start gap-1">
          {['Control', 'Intelligent', 'Systems.'].map((word, i) => (
            <div key={word} className="overflow-hidden pb-1 -mb-1">
              <motion.h1
                initial={{ y: 40, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{
                  duration: 0.8,
                  ease: [0.2, 0.65, 0.3, 0.9],
                  delay: 0.2 + (i * 0.1)
                }}
                className="text-4xl md:text-5xl font-medium tracking-tight text-white leading-none"
              >
                {word}
              </motion.h1>
            </div>
          ))}
        </div>

        {/* Subtext in silver */}
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.6, delay: 0.6 }}
          className="text-base md:text-lg text-[#BFC3C7] font-light max-w-md leading-relaxed"
        >
          Enterprise-grade AI orchestration designed for precision, security, and long-term trust.
        </motion.p>

        {/* CTAs */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.8 }}
          className="flex flex-col items-start gap-6 w-full mt-8"
        >
          {/* Primary CTA - Neon Green Outline (Less Flashy) */}
          <Link to="/dashboard" className="w-full sm:w-auto">
            <button className="group w-full sm:w-auto px-8 py-4 bg-transparent border border-[#39FF14]/50 hover:bg-[#39FF14]/10 rounded-full transition-all duration-300 active:scale-[0.98]">
              <span className="flex items-center justify-center gap-2 text-[#39FF14] font-bold tracking-wide uppercase text-sm">
                Access Dashboard <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
              </span>
            </button>
          </Link>

          {/* Secondary CTA - Text Link Only */}
          <Link to="/system" className="ml-2">
            <button className="text-[#BFC3C7] font-mono text-xs tracking-widest uppercase hover:text-white transition-colors flex items-center gap-2 group">
              Learn More <span className="opacity-0 group-hover:opacity-100 transition-opacity">→</span>
            </button>
          </Link>
        </motion.div>
      </div>

      {/* Scroll Indicator */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.2, duration: 0.8 }}
        className="absolute bottom-12 left-1/2 -translate-x-1/2 flex flex-col items-center gap-3 pointer-events-none"
      >
        <div className="w-[1px] h-10 bg-gradient-to-b from-[#BFC3C7] to-transparent" />
        <span className="text-[9px] text-[#BFC3C7] uppercase tracking-[0.2em]">Scroll</span>
      </motion.div>

      {/* CSS for split text animation */}
      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </section>
  );
}
