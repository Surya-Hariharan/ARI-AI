import React from 'react';
import { motion } from 'motion/react';
import FlowingMenu from './FlowingMenu';

import imgControl from '../../assets/philosophy-control.png';
import imgAudit from '../../assets/philosophy-audit.png';
import imgReversible from '../../assets/philosophy-reversible.png';
import imgTrust from '../../assets/philosophy-trust.png';

const philosophyItems = [
    {
        link: '#',
        text: 'Explicit Control',
        image: imgControl
    },
    {
        link: '#',
        text: 'Full Auditability',
        image: imgAudit
    },
    {
        link: '#',
        text: 'Reversible Actions',
        image: imgReversible
    },
    {
        link: '#',
        text: 'Zero Trust Core',
        image: imgTrust
    }
];

export function SystemPhilosophy() {
    return (
        <section className="py-24 bg-[#FFFFFF] relative overflow-hidden">
            <div className="max-w-5xl mx-auto px-6 mb-12 relative z-10">
                {/* Section Header */}
                <motion.h2
                    initial={{ opacity: 0, y: 20 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.6 }}
                    className="text-2xl md:text-3xl font-medium text-[#0B0B0B] mb-4"
                >
                    System Philosophy
                </motion.h2>
                <motion.div
                    initial={{ scaleX: 0, originX: 0 }}
                    whileInView={{ scaleX: 1 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.6, delay: 0.2 }}
                    className="w-8 h-[2px] bg-[#BFC3C7]"
                />
            </div>

            <div className="h-[600px] w-full relative z-10">
                <FlowingMenu
                    items={philosophyItems}
                    speed={15}
                    textColor="#0B0B0B"
                    bgColor="#FFFFFF"
                    marqueeBgColor="#0B0B0B"
                    marqueeTextColor="#FFFFFF"
                    borderColor="#BFC3C7"
                />
            </div>
        </section>
    );
}
