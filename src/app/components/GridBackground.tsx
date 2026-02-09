import React from 'react';
import { motion } from 'motion/react';

interface GridBackgroundProps {
    className?: string;
    gridSize?: number;
    opacity?: number;
    waveDuration?: number;
}

export function GridBackground({
    className = "",
    gridSize = 48,
    opacity = 0.03,
    waveDuration = 6
}: GridBackgroundProps) {
    return (
        <div className={`fixed inset-0 pointer-events-none z-0 ${className}`}>
            {/* Base Grid (Silver) */}
            <div
                className="absolute inset-0"
                style={{
                    backgroundImage: `
            linear-gradient(to right, rgba(191, 195, 199, ${opacity}) 1px, transparent 1px),
            linear-gradient(to bottom, rgba(191, 195, 199, ${opacity}) 1px, transparent 1px)
          `,
                    backgroundSize: `${gridSize}px ${gridSize}px`,
                    maskImage: 'linear-gradient(to bottom, black 80%, transparent)',
                }}
            />

            {/* Vertical Neon Wave Grid (Overlay) */}
            <motion.div
                className="absolute inset-0 mix-blend-screen"
                style={{
                    backgroundImage: `
            linear-gradient(to right, rgba(57, 255, 20, 0.2) 1px, transparent 1px),
            linear-gradient(to bottom, rgba(57, 255, 20, 0.2) 1px, transparent 1px)
          `,
                    backgroundSize: `${gridSize}px ${gridSize}px`,
                }}
                animate={{
                    maskImage: [
                        'linear-gradient(to bottom, transparent -100%, black -50%, transparent 0%)',
                        'linear-gradient(to bottom, transparent 100%, black 150%, transparent 200%)'
                    ]
                }}
                transition={{
                    duration: waveDuration,
                    repeat: Infinity,
                    ease: "linear",
                    repeatDelay: 0
                }}
            />
        </div>
    );
}
