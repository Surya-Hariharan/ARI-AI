import React from 'react';
import { motion } from 'motion/react';

import { Footer } from '../components/Footer';

export function SystemOverview() {
    return (
        <main className="min-h-screen bg-white font-[Inter] selection:bg-[#39FF14] selection:text-[#0B0B0B]">
            {/* Page Content */}
            {/* Page Content */}
            <div className="pt-24 pb-16 px-6">
                <div className="max-w-3xl mx-auto">

                    {/* Page Header */}
                    <motion.div
                        initial={{ opacity: 0, y: 12 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.5 }}
                        className="mb-16"
                    >
                        <h1 className="text-3xl md:text-4xl font-medium text-[#0B0B0B] mb-4">
                            System Overview
                        </h1>
                        <p className="text-base text-[#0B0B0B]/60 max-w-lg">
                            Technical architecture and operational philosophy behind ARI's enterprise control infrastructure.
                        </p>
                    </motion.div>

                    {/* Architecture Section */}
                    <motion.section
                        initial={{ opacity: 0, y: 12 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        transition={{ duration: 0.5 }}
                        className="mb-16"
                    >
                        <h2 className="text-xl font-medium text-[#0B0B0B] mb-4">Architecture</h2>
                        <div className="w-8 h-[2px] bg-[#BFC3C7] mb-6" />
                        <div className="space-y-4 text-[#0B0B0B]/70 text-base leading-relaxed">
                            <p>
                                ARI is built on a distributed architecture designed for resilience, scalability, and complete observability. Every component operates independently while maintaining strict coordination through a centralized control plane.
                            </p>
                            <p>
                                The system employs an event-driven design where all state changes are immutably logged, enabling full auditability and point-in-time recovery of any system state.
                            </p>
                        </div>
                    </motion.section>

                    {/* Permission Model Section */}
                    <motion.section
                        initial={{ opacity: 0, y: 12 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        transition={{ duration: 0.5 }}
                        className="mb-16"
                    >
                        <h2 className="text-xl font-medium text-[#0B0B0B] mb-4">Permission Model</h2>
                        <div className="w-8 h-[2px] bg-[#BFC3C7] mb-6" />
                        <div className="space-y-4 text-[#0B0B0B]/70 text-base leading-relaxed">
                            <p>
                                ARI implements a capability-based permission system. Rather than role-based access, each action is explicitly granted as a discrete capability that can be enabled, disabled, or time-limited.
                            </p>
                            <div className="bg-[#0B0B0B] p-6 my-6">
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

                    {/* Control Philosophy Section */}
                    <motion.section
                        initial={{ opacity: 0, y: 12 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        transition={{ duration: 0.5 }}
                        className="mb-16"
                    >
                        <h2 className="text-xl font-medium text-[#0B0B0B] mb-4">Control Philosophy</h2>
                        <div className="w-8 h-[2px] bg-[#BFC3C7] mb-6" />
                        <div className="space-y-4 text-[#0B0B0B]/70 text-base leading-relaxed">
                            <p>
                                The core principle is simple: humans remain in control. AI systems execute within explicitly defined boundaries, with every action traceable to a human decision.
                            </p>
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-6">
                                <div className="border border-[#BFC3C7] p-4">
                                    <h3 className="text-sm font-medium text-[#0B0B0B] mb-2">Observe</h3>
                                    <p className="text-sm text-[#0B0B0B]/60">Complete visibility into all AI operations in real-time.</p>
                                </div>
                                <div className="border border-[#BFC3C7] p-4">
                                    <h3 className="text-sm font-medium text-[#0B0B0B] mb-2">Intervene</h3>
                                    <p className="text-sm text-[#0B0B0B]/60">Immediate ability to pause, modify, or terminate any process.</p>
                                </div>
                                <div className="border border-[#BFC3C7] p-4">
                                    <h3 className="text-sm font-medium text-[#0B0B0B] mb-2">Audit</h3>
                                    <p className="text-sm text-[#0B0B0B]/60">Complete historical record of every decision and action.</p>
                                </div>
                            </div>
                        </div>
                    </motion.section>

                </div>
            </div>

            <Footer />
        </main>
    );
}
