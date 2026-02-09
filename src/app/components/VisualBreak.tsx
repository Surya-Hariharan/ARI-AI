import React, { useRef } from 'react';
import { motion, useInView } from 'motion/react';

export function VisualBreak() {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true });

  return (
    <section
      ref={ref}
      className="relative pt-12 pb-24 bg-[#0B0B0B] overflow-hidden flex items-center justify-center"
    >
      {/* Thin silver grid lines */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage: `
            linear-gradient(to right, rgba(191, 195, 199, 0.05) 1px, transparent 1px),
            linear-gradient(to bottom, rgba(191, 195, 199, 0.05) 1px, transparent 1px)
          `,
          backgroundSize: '64px 64px'
        }}
      />

      {/* Single scanning line - animates ONCE on view */}
      <motion.div
        initial={{ scaleX: 0, opacity: 0 }}
        animate={isInView ? { scaleX: 1, opacity: 1 } : {}}
        transition={{ duration: 1.2, ease: 'easeInOut' }}
        className="w-full max-w-xs h-[1px] bg-gradient-to-r from-transparent via-[#BFC3C7] to-transparent"
      />
    </section>
  );
}
