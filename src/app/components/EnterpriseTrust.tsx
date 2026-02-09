import React from 'react';
import { ShieldCheck, Lock, Building2 } from 'lucide-react';

const trustMarkers = [
    {
        label: "Verified",
        icon: ShieldCheck
    },
    {
        label: "Secure",
        icon: Lock
    },
    {
        label: "Enterprise-grade",
        icon: Building2
    }
];

export function EnterpriseTrust() {
    return (
        <section className="py-20 px-6 bg-white">
            <div className="max-w-4xl mx-auto">
                {/* Section Header */}
                <div className="text-center mb-12">
                    <h2 className="text-xl md:text-2xl font-medium text-[#0B0B0B] mb-4">
                        Built for Enterprise
                    </h2>
                    <p className="text-sm text-[#0B0B0B]/60 max-w-md mx-auto">
                        Designed to meet the most demanding security and compliance requirements.
                    </p>
                </div>

                {/* Trust Markers - Gold accents */}
                <div className="flex flex-wrap justify-center items-center gap-x-12 gap-y-6">
                    {trustMarkers.map((marker, index) => (
                        <div
                            key={index}
                            className="flex items-center gap-2.5 min-w-[120px] justify-center md:justify-start"
                        >
                            <marker.icon
                                className="w-5 h-5 text-[#C9A44C]"
                                strokeWidth={1.5}
                            />
                            <span className="text-[11px] font-bold text-[#0B0B0B] tracking-wider uppercase">
                                {marker.label}
                            </span>
                        </div>
                    ))}
                </div>

                {/* Divider + Centered Certs */}
                <div className="mt-16 pt-10 border-t border-[#BFC3C7]/20 flex flex-col items-center gap-6">
                    <div className="flex flex-wrap justify-center items-center gap-x-4 gap-y-2 text-[10px] font-mono text-[#BFC3C7] uppercase tracking-[0.2em]">
                        <span>SOC 2 Compliant</span>
                        <span className="opacity-30">•</span>
                        <span>ISO 27001</span>
                        <span className="opacity-30">•</span>
                        <span>GDPR Ready</span>
                    </div>
                </div>
            </div>
        </section>
    );
}
