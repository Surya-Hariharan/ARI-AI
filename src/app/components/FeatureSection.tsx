import React from 'react';
import { motion } from 'motion/react';
import { Brain, Shield, Zap, Network } from 'lucide-react';

const features = [
  {
    title: "Predictive Modeling",
    description: "Anticipate market shifts with high-fidelity simulations before they manifest in reality.",
    icon: Brain
  },
  {
    title: "Neural Architecture",
    description: "Self-optimizing codebases that evolve and adapt to your data patterns instantly.",
    icon: Network
  },
  {
    title: "Encryption Grade",
    description: "Military-standard security protocols designed to protect your most sensitive assets.",
    icon: Shield
  },
  {
    title: "Real-time Synthesis",
    description: "Data processing at the speed of thought, converting raw inputs into actionable strategy.",
    icon: Zap
  }
];

export function FeatureSection() {
  return (
    <section className="py-24 px-6 bg-white">
      <div className="max-w-5xl mx-auto">
        <div className="mb-16">
          <h2 className="text-3xl md:text-4xl font-bold text-[#0B0B0B] mb-4">System Capabilities</h2>
          <div className="w-12 h-1 bg-[#39FF14]" />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {features.map((feature, index) => (
            <FeatureCard key={index} feature={feature} index={index} />
          ))}
        </div>
      </div>
    </section>
  );
}

function FeatureCard({ feature, index }: { feature: typeof features[0], index: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 30 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-50px" }}
      transition={{ duration: 0.6, delay: index * 0.1 }}
      className="group relative p-8 bg-white border border-[#BFC3C7] hover:border-[#39FF14] transition-colors duration-500 overflow-hidden"
    >
      {/* Neon Green Accent Line */}
      <div className="absolute left-0 top-0 bottom-0 w-[4px] bg-[#39FF14] opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
      <div className="absolute left-0 top-0 bottom-0 w-[1px] bg-[#39FF14] opacity-30 group-hover:opacity-0 transition-opacity duration-300" />
      
      <div className="mb-6">
        <feature.icon className="w-8 h-8 text-[#0B0B0B] stroke-[1.5px]" />
      </div>
      
      <h3 className="text-xl font-bold text-[#0B0B0B] mb-3 tracking-tight">{feature.title}</h3>
      <p className="text-[#0B0B0B]/70 font-light leading-relaxed">{feature.description}</p>
    </motion.div>
  );
}
