import React, { useState, useEffect } from 'react';
import QRCode from "react-qr-code";

interface MobileWrapperProps {
    children: React.ReactNode;
}

export function MobileWrapper({ children }: MobileWrapperProps) {
    const [localIp, setLocalIp] = useState("192.168.0.101"); // Default to detected IP
    const [port, setPort] = useState("5173");
    const [isEditing, setIsEditing] = useState(false);

    useEffect(() => {
        setPort(window.location.port || "5173");
    }, []);

    const currentUrl = `http://${localIp}:${port}`;

    return (
        // ROOT: Always fixed to viewport. Full Native App simulation.
        // On Desktop: Flex center with padding.
        // On Mobile: Full screen, no padding.
        <div className="fixed inset-0 w-full h-full bg-[#1a1a1a] flex items-center justify-center p-0 md:p-4 overflow-hidden">

            {/* Desktop Background Ambience (Hidden on Mobile) */}
            <div
                className="hidden md:block absolute inset-0 pointer-events-none opacity-20"
                style={{
                    backgroundImage: 'radial-gradient(#4a4a4a 1px, transparent 1px)',
                    backgroundSize: '24px 24px'
                }}
            />

            <div className="w-full h-full md:w-auto md:h-auto md:flex md:flex-row md:items-center md:gap-12 md:z-10 relative">
                {/* Phone Frame Container */}
                {/* On Mobile: w-full h-full, no border/radius. On Desktop: fixed size, radius, shadow */}
                <div
                    className="w-full h-full md:relative md:w-[390px] md:h-[844px] bg-white md:bg-black md:rounded-[40px] md:shadow-[0_0_0_12px_#000,0_20px_50px_rgba(0,0,0,0.5)] overflow-hidden md:border md:border-[#333]"
                >
                    {/* Dynamic Island / Notch (Hidden on Mobile) */}
                    <div className="hidden md:block absolute top-0 left-1/2 -translate-x-1/2 w-[120px] h-[35px] bg-black rounded-b-[20px] z-[9999] pointer-events-none" />

                    {/* Status Bar Time (Fake - Hidden on Mobile) */}
                    <div className="hidden md:block absolute top-3 left-8 text-white text-[13px] font-medium z-[9999] pointer-events-none select-none">
                        9:41
                    </div>

                    {/* Status Bar Icons (Fake - Hidden on Mobile) */}
                    <div className="hidden md:block absolute top-3 right-8 flex gap-1.5 z-[9999] pointer-events-none select-none">
                        <div className="w-4 h-3 bg-white to-transparent opacity-80" style={{ clipPath: 'polygon(0 100%, 100% 100%, 100% 0)' }}></div>
                        <div className="w-4 h-3 border border-white rounded-[2px] opacity-80 relative">
                            <div className="absolute inset-[1px] bg-white rounded-[1px]" />
                        </div>
                    </div>

                    {/* Home Indicator (Hidden on Mobile) */}
                    <div className="hidden md:block absolute bottom-2 left-1/2 -translate-x-1/2 w-[130px] h-[5px] bg-white rounded-full opacity-40 z-[9999] pointer-events-none" />

                    {/* 
             Content Area 
             - w-full h-full: Fills the frame (or screen on mobile)
             - transform: translateZ(0): Keeps fixed elements (Navigation) contained to this div on Desktop
             - On mobile, we might NOT want transform if it interferes with fixed viewport behavior, 
               BUT since we refactored Navigation to be inside App layout, it's fine.
          */}
                    <div className="w-full h-full bg-white relative overflow-hidden" style={{ transform: 'translateZ(0)' }}>
                        {children}
                    </div>
                </div>

                {/* QR Code Section (Hidden on Mobile) */}
                <div className="hidden md:flex flex-col items-center bg-white/5 backdrop-blur-md p-6 rounded-2xl border border-white/10 max-w-xs">
                    <h3 className="text-white font-medium mb-4 text-sm tracking-widest uppercase">Scan to View on Mobile</h3>

                    <div className="bg-white p-4 rounded-xl mb-4">
                        <QRCode value={currentUrl} size={160} />
                    </div>

                    <div className="w-full space-y-2">
                        <p className="text-xs text-white/50 text-center">
                            Scan to view on phone
                        </p>

                        <div className="flex items-center gap-2 bg-black/30 p-2 rounded-lg border border-white/10 justify-between">
                            <div className="flex items-center gap-0.5 w-full justify-center">
                                <span className="text-xs text-white/40 font-mono">http://</span>
                                {isEditing ? (
                                    <input
                                        type="text"
                                        value={localIp}
                                        onChange={(e) => setLocalIp(e.target.value)}
                                        onBlur={() => setIsEditing(false)}
                                        autoFocus
                                        className="bg-transparent text-white text-xs font-mono w-24 outline-none border-b border-white/20"
                                    />
                                ) : (
                                    <span
                                        onClick={() => setIsEditing(true)}
                                        className="text-white text-xs font-mono cursor-pointer hover:text-green-400 decoration-dotted underline underline-offset-2"
                                    >
                                        {localIp}
                                    </span>
                                )}
                                <span className="text-xs text-white/40 font-mono">:{port}</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
