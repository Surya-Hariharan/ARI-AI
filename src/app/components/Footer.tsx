import React from 'react';
import { Link } from 'react-router-dom';

const footerLinks = {
  platform: [
    { label: 'Dashboard', path: '/dashboard' },
    { label: 'System Overview', path: '/system' },
    { label: 'Documentation', path: '#' },
    { label: 'API Reference', path: '#' }
  ],
  company: [
    { label: 'About', path: '#' },
    { label: 'Careers', path: '#' },
    { label: 'Press', path: '#' },
    { label: 'Contact', path: '#' }
  ],
  legal: [
    { label: 'Privacy', path: '#' },
    { label: 'Terms', path: '#' },
    { label: 'Security', path: '/account' }
  ]
};

export function Footer() {
  return (
    <footer className="bg-[#0B0B0B] border-t border-[#BFC3C7]/20 pt-12 pb-24 px-6">
      <div className="max-w-5xl mx-auto flex flex-col gap-12">

        {/* Top Section: Brand + Links */}
        <div className="flex flex-col md:flex-row justify-between gap-16 md:gap-8">

          {/* Brand Column */}
          <div className="md:w-1/4 flex flex-col items-start gap-4">
            <div className="flex items-center gap-3">
              <svg viewBox="0 0 32 32" className="w-6 h-6" fill="none" stroke="#C9A44C" strokeWidth="2.5">
                <path d="M16 4 L4 28" />
                <path d="M16 4 L28 28" />
                <path d="M8 20 L24 20" />
              </svg>
              <span className="text-sm font-extrabold tracking-[0.3em] text-white uppercase">ARI</span>
            </div>
            <p className="text-[11px] text-[#BFC3C7]/80 leading-relaxed">
              Enterprise AI control infrastructure built for precision and trust.
            </p>
          </div>

          {/* Links Grid - Balanced Spacing */}
          <div className="flex-1 grid grid-cols-2 md:grid-cols-3 gap-10 md:justify-items-center">
            {/* Platform */}
            <div className="flex flex-col gap-5">
              <h4 className="text-[10px] font-bold text-white uppercase tracking-[0.2em] opacity-80">Platform</h4>
              <ul className="flex flex-col gap-4">
                {footerLinks.platform.map((link, i) => (
                  <li key={i}>
                    <Link to={link.path} className="text-[11px] text-[#BFC3C7] hover:text-[#39FF14] transition-colors inline-block leading-tight">
                      {link.label === 'System Overview' ? (
                        <>System<br />Overview</>
                      ) : (
                        link.label
                      )}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>

            {/* Company */}
            <div className="flex flex-col gap-5">
              <h4 className="text-[10px] font-bold text-white uppercase tracking-[0.2em] opacity-80">Company</h4>
              <ul className="flex flex-col gap-4">
                {footerLinks.company.map((link, i) => (
                  <li key={i}>
                    <Link to={link.path} className="text-[11px] text-[#BFC3C7] hover:text-[#39FF14] transition-colors whitespace-nowrap">
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>

            {/* Legal */}
            <div className="flex flex-col gap-5">
              <h4 className="text-[10px] font-bold text-white uppercase tracking-[0.2em] opacity-80">Legal</h4>
              <ul className="flex flex-col gap-4">
                {footerLinks.legal.map((link, i) => (
                  <li key={i}>
                    <Link to={link.path} className="text-[11px] text-[#BFC3C7] hover:text-[#39FF14] transition-colors whitespace-nowrap">
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>

        {/* Bottom Bar - Centered on Mobile */}
        <div className="pt-8 border-t border-[#BFC3C7]/10 flex flex-col md:flex-row justify-between items-center gap-4 text-center md:text-left">
          <p className="text-[10px] text-[#BFC3C7]/60 font-mono uppercase tracking-wider">
            © 2026 ARI Systems.
          </p>

          <div className="flex items-center gap-2 bg-[#0B0B0B] border border-[#39FF14]/20 rounded-full px-3 py-1">
            <div className="w-1.5 h-1.5 rounded-full bg-[#39FF14] animate-pulse" />
            <p className="text-[10px] text-[#BFC3C7] font-mono uppercase tracking-wider">
              Status: <span className="text-[#39FF14]">Operational</span>
            </p>
          </div>
        </div>
      </div>
    </footer>
  );
}
