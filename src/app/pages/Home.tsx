import React, { useState } from 'react';
import { Hero } from '../components/Hero';
import { SystemPhilosophy } from '../components/SystemPhilosophy';
import { CapabilityPreview } from '../components/CapabilityPreview';
import { VisualBreak } from '../components/VisualBreak';
import { EnterpriseTrust } from '../components/EnterpriseTrust';
import { Footer } from '../components/Footer';
import { Mic, X } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useNavigate } from 'react-router-dom';

export function Home() {
    const navigate = useNavigate();

    return (
        <main className="min-h-screen bg-white font-[Inter] selection:bg-[#39FF14] selection:text-[#0B0B0B] relative">
            <Hero />
            <SystemPhilosophy />
            <CapabilityPreview />
            <VisualBreak />
            <EnterpriseTrust />
            <Footer />
        </main>
    );
}
