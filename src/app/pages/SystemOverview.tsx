import React from 'react';
import { motion } from 'motion/react';

import { Footer } from '../components/Footer';
import { GridBackground } from '../components/GridBackground';


export function SystemOverview() {
    return (
        <main className="min-h-screen bg-[#0B0B0B] text-white font-[Inter] selection:bg-[#39FF14] selection:text-[#0B0B0B]">
            <GridBackground gridSize={48} opacity={0.04} waveDuration={3} />

            {/* Page Content */}
            <div className="relative pt-24 pb-8 px-6 z-10">
                <div className="max-w-3xl mx-auto">

                    {/* Page Header */}
                    <motion.div
                        initial={{ opacity: 0, y: 12 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.5 }}
                        className="mb-16"
                    >
                        <h1 className="text-3xl md:text-4xl font-medium text-white mb-4">
                            System Overview
                        </h1>
                        <p className="text-base text-[#BFC3C7] max-w-lg">
                            Technical architecture and operational philosophy behind ARI's enterprise control infrastructure.
                        </p>
                    </motion.div>
                </div>
            </div>

            {/* Architecture Section - White Block */}
            <section className="bg-white py-24 px-6 relative overflow-hidden">
                {/* Local Grid for White Section */}
                <div
                    className="absolute inset-0 opacity-[0.05]"
                    style={{
                        backgroundImage: `
                            linear-gradient(to right, #000 1px, transparent 1px),
                            linear-gradient(to bottom, #000 1px, transparent 1px)
                        `,
                        backgroundSize: '48px 48px'
                    }}
                />

                <div className="max-w-3xl mx-auto relative z-10">
                    <motion.div
                        initial={{ opacity: 0, y: 12 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        transition={{ duration: 0.5 }}
                    >
                        <h2 className="text-xl font-medium text-black mb-4 uppercase tracking-widest">Architecture</h2>
                        <div className="w-8 h-[2px] bg-[#39FF14] mb-6" />
                        <div className="space-y-4 text-black/70 text-base leading-relaxed">
                            <p>
                                ARI is built on a distributed architecture designed for resilience, scalability, and complete observability. Every component operates independently while maintaining strict coordination through a centralized control plane.
                            </p>
                            <p>
                                The system employs an event-driven design where all state changes are immutably logged, enabling full auditability and point-in-time recovery of any system state.
                            </p>
                        </div>
                    </motion.div>
                </div>
            </section>

            {/* Permission Model Section - Dark Block */}
            <div className="relative py-24 px-6 z-10">
                <div className="max-w-3xl mx-auto">
                    <motion.section
                        initial={{ opacity: 0, y: 12 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        transition={{ duration: 0.5 }}
                    >
                        <h2 className="text-xl font-medium text-white mb-4">Permission Model</h2>
                        <div className="w-8 h-[2px] bg-[#39FF14]/50 mb-6" />
                        <div className="space-y-4 text-[#BFC3C7]/80 text-base leading-relaxed">
                            <p>
                                ARI implements a capability-based permission system. Rather than role-based access, each action is explicitly granted as a discrete capability that can be enabled, disabled, or time-limited.
                            </p>
                            <div className="bg-black/50 backdrop-blur-md border border-[#39FF14]/30 p-6 my-6 rounded-[24px]">
                                <div className="font-mono text-sm text-[#BFC3C7] space-y-2">
                                    <div><span className="text-[#39FF14]">capability:</span> data.read</div>
                                    <div><span className="text-[#39FF14]">scope:</span> production/analytics/*</div>
                                    <div><span className="text-[#39FF14]">expires:</span> 2026-02-10T00:00:00Z</div>
                                    <div><span className="text-[#39FF14]">approved_by:</span> admin@company.com</div>
                                </div>
                            </div>
                            <p>
                                Every capability is auditable, revocable, and tied to a specific approval chain. No implicit permissions exist.
                            </p>
                        </div>
                    </motion.section>
                </div>
            </div>

            {/* Control Philosophy Section - White Block */}
            <section className="bg-white py-24 px-6 relative overflow-hidden">
                {/* Local Grid for White Section */}
                <div
                    className="absolute inset-0 opacity-[0.05]"
                    style={{
                        backgroundImage: `
                            linear-gradient(to right, #000 1px, transparent 1px),
                            linear-gradient(to bottom, #000 1px, transparent 1px)
                        `,
                        backgroundSize: '48px 48px'
                    }}
                />

                <div className="max-w-3xl mx-auto relative z-10">
                    <motion.div
                        initial={{ opacity: 0, y: 12 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        transition={{ duration: 0.5 }}
                    >
                        <h2 className="text-xl font-medium text-black mb-4 uppercase tracking-widest">Control Philosophy</h2>
                        <div className="w-8 h-[2px] bg-[#39FF14] mb-6" />
                        <div className="space-y-4 text-black/70 text-base leading-relaxed">
                            <p>
                                The core principle is simple: humans remain in control. AI systems execute within explicitly defined boundaries, with every action traceable to a human decision.
                            </p>
                            <div className="mt-12 space-y-8">
                                <div>
                                    <h3 className="text-lg font-bold text-black mb-2 uppercase tracking-wide">Observe</h3>
                                    <p className="text-black/70 leading-relaxed">
                                        Real-time telemetry and complete observability into all AI operations. Nothing is hidden from the control plane.
                                    </p>
                                </div>
                                <div>
                                    <h3 className="text-lg font-bold text-black mb-2 uppercase tracking-wide">Intervene</h3>
                                    <p className="text-black/70 leading-relaxed">
                                        Immediate human override capability. Terminate, pause, or redirect any active process with a single command.
                                    </p>
                                </div>
                                <div>
                                    <h3 className="text-lg font-bold text-black mb-2 uppercase tracking-wide">Audit</h3>
                                    <p className="text-black/70 leading-relaxed">
                                        Immutable, cryptographic logging of every decision and action. Full historical replay capability for forensic analysis.
                                    </p>
                                </div>
                            </div>
                        </div>
                    </motion.div>
                </div>
            </section>

            <Footer />
        </main>
    );
}
