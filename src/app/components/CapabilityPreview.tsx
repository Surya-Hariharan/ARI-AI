import React from 'react';
import { Shield, Eye, Cpu, Network } from 'lucide-react';
import { motion } from 'motion/react';
import GlareHover from './GlareHover';

const capabilities = [
    {
        title: "Permission Control",
        description: "Granular access management for every system capability.",
        icon: Shield,
        active: true
    },
    {
        title: "Real-time Monitoring",
        description: "Live visibility into all AI operations and decisions.",
        icon: Eye,
        active: true
    },
    {
        title: "Processing Units",
        description: "Distributed compute orchestration across infrastructure.",
        icon: Cpu,
        active: false
    },
    {
        title: "Network Integration",
        description: "Secure API connections to external systems and services.",
        icon: Network,
        active: true
    }
];

export function CapabilityPreview() {
    return (
        <section className="pt-24 pb-0 px-6 bg-[#0B0B0B] overflow-hidden">
            <div className="max-w-5xl mx-auto">
                {/* Section Header */}
                <div className="mb-12">
                    <motion.h2
                        initial={{ opacity: 0, y: 20 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        transition={{ duration: 0.6 }}
                        className="text-2xl md:text-3xl font-medium text-white mb-4"
                    >
                        Core Capabilities
                    </motion.h2>
                    <motion.div
                        initial={{ scaleX: 0, originX: 0 }}
                        whileInView={{ scaleX: 1 }}
                        viewport={{ once: true }}
                        transition={{ duration: 0.6, delay: 0.2 }}
                        className="w-8 h-[2px] bg-[#BFC3C7]"
                    />
                </div>

                {/* Capability Cards */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {capabilities.map((cap, index) => (
                        <motion.div
                            key={index}
                            initial={{ opacity: 0, y: 30 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            viewport={{ once: true }}
                            transition={{ duration: 0.5, delay: index * 0.1 }}
                            className="h-full"
                        >
                            <GlareHover
                                width="100%"
                                height="100%"
                                background="transparent"
                                borderColor="#333333"
                                glareColor="#FFFFFF"
                                glareOpacity={0.1}
                                glareSize={200}
                                borderRadius="0px"
                                className="group hover:!border-white transition-colors duration-300"
                                style={{
                                    backgroundImage: `
                                        linear-gradient(to right, rgba(191, 195, 199, 0.05) 1px, transparent 1px),
                                        linear-gradient(to bottom, rgba(191, 195, 199, 0.05) 1px, transparent 1px)
                                    `,
                                    backgroundSize: '24px 24px'
                                }}
                            >
                                <div className="p-6 h-full flex flex-col items-start relative">
                                    {/* Active indicator dot */}
                                    <div className="absolute top-6 right-6 z-10">
                                        <div
                                            className={`w-2 h-2 rounded-full ${cap.active ? 'bg-[#39FF14]' : 'bg-[#333333]'
                                                }`}
                                        />
                                    </div>

                                    <div className="mb-4 relative z-10">
                                        <cap.icon className="w-6 h-6 text-white" strokeWidth={1.5} />
                                    </div>

                                    <h3 className="text-lg font-medium text-white mb-2 relative z-10">
                                        {cap.title}
                                    </h3>
                                    <p className="text-sm text-[#BFC3C7] relative z-10">
                                        {cap.description}
                                    </p>
                                </div>
                            </GlareHover>
                        </motion.div>
                    ))}
                </div>
            </div>
        </section>
    );
}
