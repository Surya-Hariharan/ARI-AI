import React, { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Footer } from '../components/Footer';
import { User, Monitor, Shield, FileText, Camera, Edit2, Save, X, Mail, CheckCircle, AlertTriangle } from 'lucide-react';
import { VoiceProfile } from '../components/VoiceProfile';

const deviceInfo = {
    browser: 'Chrome 121.0',
    os: 'Windows 11',
    ip: '192.168.1.***',
    lastLogin: '2026-02-09 18:30:00 IST'
};

const auditLogs = [
    { timestamp: '18:30:00', event: 'LOGIN_SUCCESS', details: 'Session initiated from Chrome/Windows', status: 'success' },
    { timestamp: '18:28:00', event: 'MFA_VERIFIED', details: 'Two-factor authentication completed', status: 'success' },
    { timestamp: '17:45:00', event: 'CAPABILITY_CHANGE', details: 'Network access disabled by admin', status: 'warning' },
    { timestamp: '16:00:00', event: 'SESSION_EXPIRED', details: 'Previous session terminated', status: 'error' },
];

export function UserSecurity() {
    const [isEditing, setIsEditing] = useState(false);
    const [profile, setProfile] = useState({
        name: 'Admin User',
        email: 'admin@company.com',
        role: 'System Administrator',
        avatar: null as string | null
    });
    const [pendingEmail, setPendingEmail] = useState('');
    const [verificationStatus, setVerificationStatus] = useState<'idle' | 'sending' | 'sent' | 'verified'>('idle');
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleSave = () => {
        setIsEditing(false);
        // Simulate API save
    };

    const handleVerifyEmail = () => {
        setVerificationStatus('sending');
        setTimeout(() => setVerificationStatus('sent'), 1500);
    };

    const handleAvatarClick = () => {
        if (isEditing) {
            fileInputRef.current?.click();
        }
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            const reader = new FileReader();
            reader.onloadend = () => {
                setProfile(prev => ({ ...prev, avatar: reader.result as string }));
            };
            reader.readAsDataURL(file);
        }
    };

    return (
        <main className="min-h-screen font-[Inter] bg-[#0B0B0B] text-white selection:bg-[#39FF14] selection:text-[#0B0B0B]">

            {/* Background Grid Effect */}
            <div className="fixed inset-0 pointer-events-none opacity-20"
                style={{
                    backgroundImage: `linear-gradient(to right, #1a1a1a 1px, transparent 1px), linear-gradient(to bottom, #1a1a1a 1px, transparent 1px)`,
                    backgroundSize: '24px 24px'
                }}
            />

            <div className="relative pt-24 pb-24 px-6 max-w-lg mx-auto flex flex-col gap-8">

                {/* Header */}
                <motion.div
                    initial={{ opacity: 0, y: -20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex items-center justify-between"
                >
                    <div>
                        <h1 className="text-2xl font-bold tracking-tight">Identity & Audit</h1>
                        <p className="text-xs mt-1 text-[#BFC3C7]">Manage personnel credentials and security logs</p>
                    </div>
                    <div className="flex items-center gap-3">
                        <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#39FF14]/10 border border-[#39FF14]/30">
                            <Shield className="w-3 h-3 text-[#39FF14]" />
                            <span className="text-[10px] font-mono text-[#39FF14] uppercase tracking-wider">Secure</span>
                        </div>
                    </div>
                </motion.div>

                {/* Profile Card */}
                <motion.div
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: 0.1 }}
                    className={`relative p-6 rounded-2xl border transition-all duration-500 overflow-hidden ${isEditing
                        ? 'bg-[#39FF14]/5 border-[#39FF14]/30 shadow-[0_0_30px_rgba(57,255,20,0.1)]'
                        : 'bg-[#1A1A1A] border-white/10'
                        }`}
                >
                    {/* Edit/Save Actions */}
                    <div className="absolute top-4 right-4 z-20">
                        {isEditing ? (
                            <div className="flex gap-2">
                                <button
                                    onClick={() => setIsEditing(false)}
                                    className="p-2 rounded-full bg-red-500/10 text-red-500 hover:bg-red-500/20 transition-colors"
                                >
                                    <X size={16} />
                                </button>
                                <button
                                    onClick={handleSave}
                                    className={`p-2 rounded-full transition-colors ${pendingEmail !== profile.email && verificationStatus !== 'verified'
                                        ? 'bg-white/5 text-[#BFC3C7] opacity-50 cursor-not-allowed'
                                        : 'bg-[#39FF14]/10 text-[#39FF14] hover:bg-[#39FF14]/20'
                                        }`}
                                >
                                    <Save size={16} />
                                </button>
                            </div>
                        ) : (
                            <button
                                onClick={() => setIsEditing(true)}
                                className="p-2 rounded-full bg-white/5 text-[#BFC3C7] hover:text-white hover:bg-white/10 transition-colors"
                            >
                                <Edit2 size={16} />
                            </button>
                        )}
                    </div>

                    <div className="flex flex-col items-center text-center relative z-10">
                        {/* Avatar */}
                        <div className="relative mb-6 group">
                            <div
                                onClick={handleAvatarClick}
                                className={`w-24 h-24 rounded-full border-2 overflow-hidden flex items-center justify-center transition-all ${isEditing
                                    ? 'border-[#39FF14] cursor-pointer hover:shadow-[0_0_20px_rgba(57,255,20,0.3)]'
                                    : 'border-white/10'
                                    } bg-black`}
                            >
                                {profile.avatar ? (
                                    <img src={profile.avatar} alt="Profile" className="w-full h-full object-cover" />
                                ) : (
                                    <User size={40} className="text-[#BFC3C7]/50" />
                                )}
                            </div>
                            {isEditing && (
                                <div className="absolute bottom-0 right-0 p-1.5 rounded-full bg-[#39FF14] text-black shadow-lg pointer-events-none">
                                    <Camera size={12} />
                                </div>
                            )}
                            <input
                                type="file"
                                ref={fileInputRef}
                                className="hidden"
                                accept="image/*"
                                onChange={handleFileChange}
                            />
                        </div>

                        {/* Editable Fields */}
                        <div className="relative w-full space-y-4">
                            {isEditing ? (
                                <>
                                    <div className="space-y-1">
                                        <label className="text-[10px] text-[#39FF14] uppercase tracking-wider font-bold">Full Name</label>
                                        <input
                                            value={profile.name}
                                            onChange={(e) => setProfile({ ...profile, name: e.target.value })}
                                            className="w-full bg-black/50 border border-[#39FF14]/50 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[#39FF14] transition-colors text-center"
                                        />
                                    </div>
                                    <div className="space-y-1">
                                        <label className="text-[10px] text-[#39FF14] uppercase tracking-wider font-bold">Email Address</label>
                                        <div className="relative">
                                            <input
                                                value={pendingEmail}
                                                onChange={(e) => {
                                                    setPendingEmail(e.target.value);
                                                    setVerificationStatus('idle');
                                                }}
                                                className={`w-full bg-black/50 border rounded-lg px-3 py-2 text-sm text-white focus:outline-none transition-colors text-center ${verificationStatus === 'verified' ? 'border-[#39FF14] text-[#39FF14]' : 'border-[#39FF14]/50'
                                                    }`}
                                            />
                                            {/* Verification UI */}
                                            {pendingEmail !== profile.email && (
                                                <div className="mt-2 flex justify-center">
                                                    {verificationStatus === 'idle' && (
                                                        <button
                                                            onClick={handleVerifyEmail}
                                                            className="text-[10px] bg-[#39FF14]/10 text-[#39FF14] px-3 py-1 rounded border border-[#39FF14]/30 hover:bg-[#39FF14]/20 transition-colors uppercase tracking-wider"
                                                        >
                                                            Verify Email
                                                        </button>
                                                    )}
                                                    {verificationStatus === 'sending' && (
                                                        <span className="text-[10px] text-[#BFC3C7] animate-pulse">Sending verification...</span>
                                                    )}
                                                    {verificationStatus === 'sent' && (
                                                        <span className="text-[10px] text-[#C9A44C]">Check your email to confirm...</span>
                                                    )}
                                                    {verificationStatus === 'verified' && (
                                                        <div className="flex items-center gap-1.5 text-[#39FF14]">
                                                            <CheckCircle size={12} />
                                                            <span className="text-[10px] uppercase tracking-wider">Verified</span>
                                                        </div>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                    <div className="space-y-1">
                                        <label className="text-[10px] text-[#39FF14] uppercase tracking-wider font-bold">Role Title</label>
                                        <input
                                            value={profile.role}
                                            onChange={(e) => setProfile({ ...profile, role: e.target.value })}
                                            className="w-full bg-black/50 border border-[#39FF14]/50 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[#39FF14] transition-colors text-center"
                                        />
                                    </div>
                                </>
                            ) : (
                                <>
                                    <div>
                                        <h2 className="text-xl font-bold text-white">{profile.name}</h2>
                                        <div className="flex items-center justify-center gap-2 mt-1">
                                            <Mail size={12} className="text-[#BFC3C7]" />
                                            <p className="text-xs text-[#BFC3C7]">{profile.email}</p>
                                        </div>
                                    </div>
                                    <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/5 border border-white/10">
                                        <div className="w-1.5 h-1.5 rounded-full bg-[#39FF14]" />
                                        <span className="text-[10px] text-[#BFC3C7] uppercase tracking-wider">{profile.role}</span>
                                    </div>
                                </>
                            )}
                        </div>
                    </div>
                </motion.div>

                {/* Voice Profile Section */}
                <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.15 }}
                >
                    <VoiceProfile />
                </motion.div>

                {/* Device Info */}
                <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.2 }}
                    className="rounded-xl p-5 backdrop-blur-sm border bg-black/20 border-white/10"
                >
                    <div className="flex items-center gap-2 mb-4">
                        <Monitor className="w-4 h-4 text-[#39FF14]" />
                        <h3 className="text-xs font-bold uppercase tracking-wider text-white">Active Session</h3>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div className="p-3 rounded-lg border bg-white/5 border-white/5">
                            <p className="text-[10px] uppercase tracking-wider mb-1 text-[#BFC3C7]/50">Device</p>
                            <p className="text-xs font-mono text-white">{deviceInfo.os}</p>
                        </div>
                        <div className="p-3 rounded-lg border bg-white/5 border-white/5">
                            <p className="text-[10px] uppercase tracking-wider mb-1 text-[#BFC3C7]/50">Browser</p>
                            <p className="text-xs font-mono text-white">{deviceInfo.browser}</p>
                        </div>
                        <div className="p-3 rounded-lg border col-span-2 flex justify-between items-center bg-white/5 border-white/5">
                            <div>
                                <p className="text-[10px] uppercase tracking-wider mb-1 text-[#BFC3C7]/50">Last Login</p>
                                <p className="text-xs font-mono text-white">{deviceInfo.lastLogin}</p>
                            </div>
                            <div className="px-2 py-1 rounded bg-[#39FF14]/10 border border-[#39FF14]/20">
                                <span className="text-[10px] text-[#39FF14] font-mono">Authenticated</span>
                            </div>
                        </div>
                    </div>
                </motion.div>

                {/* Audit Log */}
                <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.3 }}
                >
                    <div className="flex items-center gap-2 mb-4 px-1">
                        <FileText className="w-4 h-4 text-[#BFC3C7]" />
                        <h3 className="text-xs font-bold uppercase tracking-wider text-[#BFC3C7]">Security Log</h3>
                    </div>
                    <div className="space-y-3">
                        {auditLogs.map((log, i) => (
                            <div key={i} className="flex items-start gap-3 p-3 rounded-lg border transition-colors border-white/5 bg-black/20 hover:bg-white/5">
                                <div className={`mt-1 w-1.5 h-1.5 rounded-full shrink-0 ${log.status === 'success' ? 'bg-[#39FF14]' :
                                    log.status === 'warning' ? 'bg-[#C9A44C]' : 'bg-red-500'
                                    }`} />
                                <div className="flex-1 min-w-0">
                                    <div className="flex justify-between items-start mb-1">
                                        <p className="text-xs font-medium truncate text-white">{log.event}</p>
                                        <span className="text-[10px] font-mono whitespace-nowrap ml-2 text-[#BFC3C7]/50">{log.timestamp}</span>
                                    </div>
                                    <p className="text-[11px] truncate text-[#BFC3C7]/60">{log.details}</p>
                                </div>
                            </div>
                        ))}
                    </div>
                </motion.div>

            </div>
            <Footer />
        </main>
    );
}
