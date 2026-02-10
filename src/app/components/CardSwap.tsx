import React, { Children, cloneElement, forwardRef, isValidElement, useEffect, useMemo, useRef } from 'react';
import { gsap } from 'gsap';
import './CardSwap.css';

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
    customClass?: string;
    label?: string;
}

export const Card = forwardRef<HTMLDivElement, CardProps>(({ customClass, children, label, ...rest }, ref) => (
    <div ref={ref} {...rest} className={`card ${customClass ?? ''} ${rest.className ?? ''}`.trim()}>
        {label && <div className="card-label">{label}</div>}
        {children}
    </div>
));
Card.displayName = 'Card';

const makeSlot = (i: number, distX: number, distY: number, total: number) => ({
    x: i * distX,
    y: -i * distY,
    z: -i * distX * 1.5,
    zIndex: total - i
});

const placeNow = (el: HTMLElement, slot: any, skew: number) =>
    gsap.set(el, {
        x: slot.x,
        y: slot.y,
        z: slot.z,
        xPercent: -50,
        yPercent: -50,
        skewY: skew,
        transformOrigin: 'center center',
        zIndex: slot.zIndex,
        force3D: true
    });

interface CardSwapProps {
    width?: number | string;
    height?: number | string;
    cardDistance?: number;
    verticalDistance?: number;
    delay?: number;
    pauseOnHover?: boolean;
    onCardClick?: (index: number) => void;
    skewAmount?: number;
    easing?: string;
    children: React.ReactNode;
}

const CardSwap: React.FC<CardSwapProps> = ({
    width = '100%',
    height = 600,
    cardDistance = 20, // Reduced for tighter stack
    verticalDistance = 40, // Reduced vertical offset
    delay = 4000,
    pauseOnHover = true,
    onCardClick,
    skewAmount = 0, // Minimized skew for cleaner look
    easing = 'elastic',
    children
}) => {
    const config =
        easing === 'elastic'
            ? {
                ease: 'elastic.out(0.6,0.9)',
                durDrop: 2,
                durMove: 2,
                durReturn: 2,
                promoteOverlap: 0.9,
                returnDelay: 0.05
            }
            : {
                ease: 'power1.inOut',
                durDrop: 0.8,
                durMove: 0.8,
                durReturn: 0.8,
                promoteOverlap: 0.45,
                returnDelay: 0.2
            };

    const childArr = useMemo(() => Children.toArray(children), [children]);
    // Fix: Explicitly type the ref array
    const refs = useMemo(
        () => childArr.map(() => React.createRef<HTMLDivElement>()),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [childArr.length]
    );

    const order = useRef(Array.from({ length: childArr.length }, (_, i) => i));

    const tlRef = useRef<gsap.core.Timeline | null>(null);
    const intervalRef = useRef<number | undefined>(undefined);
    const container = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const total = refs.length;
        refs.forEach((r, i) => {
            if (r.current) {
                placeNow(r.current, makeSlot(i, cardDistance, verticalDistance, total), skewAmount);
            }
        });

        const swap = () => {
            if (order.current.length < 2) return;

            const [front, ...rest] = order.current;
            const elFront = refs[front].current;
            if (!elFront) return;

            const tl = gsap.timeline();
            tlRef.current = tl;

            tl.to(elFront, {
                y: '+=300', // Reduced drop distance
                zIndex: 0, // Ensure it drops behind immediately visually? No, promote handles zIndex.
                duration: config.durDrop,
                ease: config.ease
            });

            tl.addLabel('promote', `-=${config.durDrop * config.promoteOverlap}`);
            rest.forEach((idx, i) => {
                const el = refs[idx].current;
                if (el) {
                    const slot = makeSlot(i, cardDistance, verticalDistance, refs.length);
                    tl.set(el, { zIndex: slot.zIndex }, 'promote');
                    tl.to(
                        el,
                        {
                            x: slot.x,
                            y: slot.y,
                            z: slot.z,
                            duration: config.durMove,
                            ease: config.ease
                        },
                        `promote+=${i * 0.1}` // Faster stagger
                    );
                }
            });

            const backSlot = makeSlot(refs.length - 1, cardDistance, verticalDistance, refs.length);
            tl.addLabel('return', `promote+=${config.durMove * config.returnDelay}`);

            // Fix: set zIndex before animating back
            tl.call(
                () => {
                    gsap.set(elFront, { zIndex: backSlot.zIndex });
                },
                [], // Params
                'return'
            );

            tl.to(
                elFront,
                {
                    x: backSlot.x,
                    y: backSlot.y,
                    z: backSlot.z,
                    duration: config.durReturn,
                    ease: config.ease
                },
                'return'
            );

            tl.call(() => {
                order.current = [...rest, front];
            });
        };

        // Initial Start
        intervalRef.current = window.setInterval(swap, delay);

        if (pauseOnHover && container.current) {
            const node = container.current;
            const pause = () => {
                tlRef.current?.pause();
                clearInterval(intervalRef.current);
            };
            const resume = () => {
                tlRef.current?.play();
                clearInterval(intervalRef.current); // Clear just in case
                intervalRef.current = window.setInterval(swap, delay);
            };
            node.addEventListener('mouseenter', pause);
            node.addEventListener('mouseleave', resume);
            return () => {
                node.removeEventListener('mouseenter', pause);
                node.removeEventListener('mouseleave', resume);
                clearInterval(intervalRef.current);
            };
        }
        return () => clearInterval(intervalRef.current);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [cardDistance, verticalDistance, delay, pauseOnHover, skewAmount, easing]);

    const rendered = childArr.map((child, i) =>
        isValidElement(child)
            ? cloneElement(child as React.ReactElement, {
                key: i,
                ref: refs[i],
                // style: { width, height, ...(child.props.style ?? {}) }, // Let CSS handle card size
                onClick: (e: React.MouseEvent) => {
                    const element = child as React.ReactElement<any>;
                    element.props.onClick?.(e);
                    onCardClick?.(i);
                }
            })
            : child
    );

    return (
        <div ref={container} className="card-swap-container" style={{ width, height }}>
            {rendered}
        </div>
    );
};

export default CardSwap;
