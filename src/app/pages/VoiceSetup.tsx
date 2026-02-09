import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Mic, Check, ArrowRight, RotateCcw, Volume2, Shield, Cpu } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';

const PHRASES = [
    "Hey Ari",
    "Ari, open system controls",
    "Ari, turn on the flashlight",
    "Ari, what's my battery status?"
];

const SAMPLES_PER_PHRASE = 2;

export function VoiceSetup() {
    const navigate = useNavigate();
    const [step, setStep] = useState<'intro' | 'calibration' | 'training' | 'processing' | 'success'>('intro');
    const [currentPhraseIndex, setCurrentPhraseIndex] = useState(0);
    const [currentSampleIndex, setCurrentSampleIndex] = useState(0);
    const [isRecording, setIsRecording] = useState(false);
    const [calibrationProgress, setCalibrationProgress] = useState(0);
    const [volumeLevel, setVolumeLevel] = useState(0);
    const [processingStep, setProcessingStep] = useState(0);
    const [micPermission, setMicPermission] = useState<'prompt' | 'granted' | 'denied'>('prompt');

    // Request Mic Permission Simulation
    const requestPermission = () => {
        setMicPermission('granted');
        setStep('calibration');
    };

    // Simulated audio visualizer
    useEffect(() => {
        let interval: NodeJS.Timeout;
        if (step === 'calibration' || (step === 'training' && isRecording)) {
            interval = setInterval(() => {
                setVolumeLevel(Math.random() * 100);
            }, 100);
        }
        return () => clearInterval(interval);
    }, [step, isRecording]);

    // Calibration Logic
    useEffect(() => {
        if (step === 'calibration') {
            const interval = setInterval(() => {
                setCalibrationProgress(prev => {
                    if (prev >= 100) {
                        clearInterval(interval);
                        setTimeout(() => setStep('training'), 500);
                        return 100;
                    }
                    return prev + 2;
                });
            }, 60);
            return () => clearInterval(interval);
        }
    }, [step]);

    // Processing Logic
    useEffect(() => {
        if (step === 'processing') {
            const timers = [
                setTimeout(() => setProcessingStep(1), 1500),
                setTimeout(() => setProcessingStep(2), 3000),
                setTimeout(() => setProcessingStep(3), 4500),
                setTimeout(() => setStep('success'), 6000),
            ];
            return () => timers.forEach(clearTimeout);
        }
    }, [step]);

    const handleStartRecording = () => {
        setIsRecording(true);
        // Simulate recording duration
        setTimeout(() => {
            setIsRecording(false);

            if (currentSampleIndex < SAMPLES_PER_PHRASE - 1) {
                setCurrentSampleIndex(prev => prev + 1);
            } else {
                setCurrentSampleIndex(0);
                if (currentPhraseIndex < PHRASES.length - 1) {
                    setCurrentPhraseIndex(prev => prev + 1);
                } else {
                    setStep('processing');
                }
            }
        }, 2000);
    };

    const handleRetryPhrase = () => {
        setCurrentSampleIndex(0);
        setIsRecording(false);
    };

    const skipTraining = () => {
        navigate('/account');
    };

    return (
        <div className="min-h-screen bg-[#0B0B0B] text-white flex flex-col items-center justify-center p-6 relative overflow-hidden">
            {/* Background Grid */}
            <div
                className="fixed inset-0 pointer-events-none opacity-20"
                style={{
                    backgroundImage: `
                linear-gradient(to right, rgba(191, 195, 199, 0.1) 1px, transparent 1px),
                linear-gradient(to bottom, rgba(191, 195, 199, 0.1) 1px, transparent 1px)
            `,
                    backgroundSize: '24px 24px'
                }}
            />

            {/* Top Bar */}
            <div className="absolute top-6 left-6 right-6 flex justify-between items-center z-20">
                <button onClick={skipTraining} className="text-[#BFC3C7] text-sm hover:text-white transition-colors">
                    Skip Setup
                </button>
                <div className="flex items-center gap-4">
                    <div className="flex items-center gap-1.5 px-2 py-1 rounded bg-white/5 border border-white/10">
                        <div className={`w-1.5 h-1.5 rounded-full ${micPermission === 'granted' ? 'bg-[#39FF14]' : 'bg-red-500'}`} />
                        <span className="text-[10px] font-mono text-[#BFC3C7] uppercase">Mic: {micPermission}</span>
                    </div>
                    <div className="flex gap-1">
                        {[0, 1, 2, 3].map(i => (
                            <div
                                key={i}
                                className={`w-2 h-2 rounded-full ${(step === 'calibration' && i === 0) ||
                                        (step === 'training' && i <= 1) ||
                                        (step === 'processing' && i <= 2) ||
                                        (step === 'success')
                                        ? 'bg-[#39FF14]'
                                        : 'bg-[#333333]'
                                    }`}
                            />
                        ))}
                    </div>
                </div>
            </div>

            <div className="max-w-md w-full relative z-10 flex flex-col items-center text-center">
                <AnimatePresence mode="wait">

                    {/* INTRO STEP */}
                    {step === 'intro' && (
                        <motion.div
                            key="intro"
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -20 }}
                            className="flex flex-col items-center gap-6"
                        >
                            <div className="w-20 h-20 bg-[#333333] rounded-full flex items-center justify-center mb-4">
                                <Mic className="w-10 h-10 text-white" />
                            </div>
                            <div className="space-y-2">
                                <h1 className="text-3xl font-medium">Voice Setup</h1>
                                <p className="text-[#BFC3C7] text-lg">Help ARI recognize how you speak.</p>
                            </div>

                            <div className="bg-[#333333]/30 border border-[#333333] rounded-xl p-4 mt-4 w-full text-left flex gap-3">
                                <Shield className="w-5 h-5 text-[#BFC3C7] shrink-0" />
                                <div>
                                    <h4 className="font-medium text-sm text-white">Private & Local</h4>
                                    <p className="text-xs text-[#BFC3C7] mt-1">
                                        Your voice data is processed locally on this device and is never uploaded to the cloud.
                                    </p>
                                </div>
                            </div>

                            <button
                                onClick={requestPermission}
                                className="mt-8 bg-[#39FF14] text-black font-semibold py-3 px-8 rounded-full hover:bg-[#32E612] transition-colors flex items-center gap-2"
                            >
                                Start Training <ArrowRight className="w-4 h-4" />
                            </button>
                        </motion.div>
                    )}

                    {/* CALIBRATION STEP */}
                    {step === 'calibration' && (
                        <motion.div
                            key="calibration"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="flex flex-col items-center w-full"
                        >
                            <Volume2 className="w-12 h-12 text-[#39FF14] mb-6 animate-pulse" />
                            <h2 className="text-2xl font-medium mb-2">Analyzing Environment</h2>
                            <p className="text-[#BFC3C7] mb-12">Please stay silent for a moment...</p>

                            {/* Waveform Visualization */}
                            <div className="h-16 flex items-center justify-center gap-1 mb-8 w-full max-w-[200px]">
                                {[...Array(20)].map((_, i) => (
                                    <motion.div
                                        key={i}
                                        className="w-1 bg-[#333333] rounded-full"
                                        animate={{
                                            height: Math.max(4, Math.random() * (volumeLevel * 0.5))
                                        }}
                                        transition={{ duration: 0.1 }}
                                    />
                                ))}
                            </div>

                            <div className="w-full bg-[#333333] h-1 rounded-full overflow-hidden">
                                <motion.div
                                    className="h-full bg-[#39FF14]"
                                    style={{ width: `${calibrationProgress}%` }}
                                />
                            </div>
                        </motion.div>
                    )}

                    {/* TRAINING STEP */}
                    {step === 'training' && (
                        <motion.div
                            key="training"
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 1.05 }}
                            className="flex flex-col items-center w-full"
                        >
                            <div className="flex flex-col items-center gap-2 mb-8">
                                <p className="text-[#BFC3C7] text-xs uppercase tracking-widest">
                                    Phrase {currentPhraseIndex + 1} of {PHRASES.length}
                                </p>
                                <div className="flex gap-2 mt-2">
                                    {[...Array(SAMPLES_PER_PHRASE)].map((_, i) => (
                                        <div
                                            key={i}
                                            className={`w-8 h-1 rounded-full transition-colors ${i < currentSampleIndex ? 'bg-[#39FF14]' :
                                                    (i === currentSampleIndex && isRecording) ? 'bg-[#39FF14] animate-pulse' : 'bg-[#333333]'
                                                }`}
                                        />
                                    ))}
                                </div>
                            </div>

                            <h2 className="text-3xl md:text-4xl font-medium leading-tight mb-12 px-4 h-32 flex items-center justify-center">
                                "{PHRASES[currentPhraseIndex]}"
                            </h2>

                            <div className="flex flex-col items-center gap-8">
                                <div className="relative">
                                    {isRecording && (
                                        <motion.div
                                            initial={{ scale: 1, opacity: 0.5 }}
                                            animate={{ scale: 1.5, opacity: 0 }}
                                            transition={{ repeat: Infinity, duration: 1.5 }}
                                            className="absolute inset-0 bg-[#39FF14] rounded-full"
                                        />
                                    )}
                                    <button
                                        onClick={handleStartRecording}
                                        disabled={isRecording}
                                        className={`w-20 h-20 rounded-full flex items-center justify-center transition-all ${isRecording
                                                ? 'bg-[#39FF14] text-black scale-110 shadow-[0_0_20px_rgba(57,255,20,0.4)]'
                                                : 'bg-[#333333] text-white hover:bg-[#444444]'
                                            }`}
                                    >
                                        <Mic className="w-8 h-8" />
                                    </button>

                                    {!isRecording && currentSampleIndex === 0 && (
                                        <button
                                            onClick={handleRetryPhrase}
                                            className="absolute -right-16 top-1/2 -translate-y-1/2 p-3 text-[#BFC3C7] hover:text-white"
                                            title="Retry Phrase"
                                        >
                                            <RotateCcw className="w-5 h-5" />
                                        </button>
                                    )}
                                </div>

                                <p className="text-[#BFC3C7] text-sm">
                                    {isRecording ? "Listening..." : `Say it clearly (${currentSampleIndex + 1}/${SAMPLES_PER_PHRASE})`}
                                </p>
                            </div>
                        </motion.div>
                    )}

                    {/* PROCESSING STEP */}
                    {step === 'processing' && (
                        <motion.div
                            key="processing"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="flex flex-col items-center w-full gap-8"
                        >
                            <div className="relative w-24 h-24">
                                <svg className="w-full h-full" viewBox="0 0 100 100">
                                    <circle cx="50" cy="50" r="45" stroke="#333333" strokeWidth="4" fill="none" />
                                    <motion.circle
                                        cx="50" cy="50" r="45"
                                        stroke="#39FF14" strokeWidth="4" fill="none"
                                        strokeDasharray="283"
                                        strokeDashoffset="0"
                                        initial={{ strokeDashoffset: 283 }}
                                        animate={{ strokeDashoffset: 0 }}
                                        transition={{ duration: 5, ease: "linear" }}
                                        transform="rotate(-90 50 50)"
                                    />
                                </svg>
                                <div className="absolute inset-0 flex items-center justify-center">
                                    <Cpu className="w-8 h-8 text-white" />
                                </div>
                            </div>

                            <div className="flex flex-col gap-3 text-center">
                                <h3 className="text-xl font-medium">Analyzing voice characteristics</h3>
                                <div className="space-y-1">
                                    <p className={`text-sm transition-colors duration-300 ${processingStep >= 1 ? 'text-[#39FF14]' : 'text-[#BFC3C7]/30'}`}>• Extracting spectral fingerprint...</p>
                                    <p className={`text-sm transition-colors duration-300 ${processingStep >= 2 ? 'text-[#39FF14]' : 'text-[#BFC3C7]/30'}`}>• Analyzing pitch modulation...</p>
                                    <p className={`text-sm transition-colors duration-300 ${processingStep >= 3 ? 'text-[#39FF14]' : 'text-[#BFC3C7]/30'}`}>• Encrypting local pattern...</p>
                                </div>
                            </div>
                        </motion.div>
                    )}

                    {/* SUCCESS STEP */}
                    {step === 'success' && (
                        <motion.div
                            key="success"
                            initial={{ opacity: 0, scale: 0.9 }}
                            animate={{ opacity: 1, scale: 1 }}
                            className="flex flex-col items-center w-full"
                        >
                            <div className="w-20 h-20 bg-[#39FF14]/10 border border-[#39FF14] rounded-full flex items-center justify-center mb-6">
                                <Check className="w-10 h-10 text-[#39FF14]" />
                            </div>

                            <h2 className="text-3xl font-medium mb-4">Voice Accepted</h2>
                            <p className="text-[#BFC3C7] mb-8 max-w-xs text-sm">
                                ARI is now trained to recognize your voice. Your voice data stays locally on this device.
                            </p>

                            <button
                                onClick={() => navigate('/dashboard')}
                                className="bg-[#39FF14] text-black font-semibold py-3 px-8 rounded-full hover:bg-gray-200 transition-colors w-full max-w-xs"
                            >
                                Go to Dashboard
                            </button>
                        </motion.div>
                    )}

                </AnimatePresence>
            </div>
        </div>
    );
}
