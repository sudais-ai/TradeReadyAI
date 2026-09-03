"use client";

import React, { useEffect, useRef, useState } from "react";

/* ── Icon components ── */

function BrainCircuitIcon(props: React.ComponentProps<"svg">) {
  return (
    <svg fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" {...props}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 3v1.5M4.5 8.25H3m18 0h-1.5M4.5 12H3m18 0h-1.5m-15 3.75H3m18 0h-1.5M8.25 19.5V21M12 3v1.5m0 15V21m3.75-18v1.5m0 15V21m-9-1.5h10.5a2.25 2.25 0 002.25-2.25V6.75a2.25 2.25 0 00-2.25-2.25H6.75A2.25 2.25 0 004.5 6.75v10.5a2.25 2.25 0 002.25 2.25zm.75-12h9v9h-9v-9z" />
    </svg>
  );
}

function DocumentScanIcon(props: React.ComponentProps<"svg">) {
  return (
    <svg fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" {...props}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m5.231 13.481L15 17.25m-4.5-15H5.625c-.621 0-1.125.504-1.125 1.125v16.5c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9zm3.75 11.625a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
    </svg>
  );
}

function GlobeShieldIcon(props: React.ComponentProps<"svg">) {
  return (
    <svg fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" {...props}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
    </svg>
  );
}

function ClipboardDossierIcon(props: React.ComponentProps<"svg">) {
  return (
    <svg fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" {...props}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15a2.25 2.25 0 012.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25zM6.75 12h.008v.008H6.75V12zm0 3h.008v.008H6.75V15zm0 3h.008v.008H6.75V18z" />
    </svg>
  );
}

/* ── Feature data ── */

const features = [
  {
    icon: BrainCircuitIcon,
    title: "AI Trade Compliance Analysis",
    description:
      "Our RAG pipeline compares your shipment details against live customs requirements and tariff databases in real-time, flagging risks before they become costly delays.",
    accent: "from-yellow-400 to-amber-500",
    glowColor: "rgba(250, 204, 21, 0.15)",
  },
  {
    icon: DocumentScanIcon,
    title: "Document Intelligence",
    description:
      "Advanced OCR and AI extraction instantly captures line items, HS codes, and entity data from commercial invoices, packing lists, and bills of lading — no manual data entry.",
    accent: "from-blue-400 to-cyan-400",
    glowColor: "rgba(59, 130, 246, 0.15)",
  },
  {
    icon: GlobeShieldIcon,
    title: "Regulatory Verification",
    description:
      "Automatically cross-reference extracted data against official international trade sources, restricted-party lists, and embargo databases to ensure full compliance.",
    accent: "from-emerald-400 to-teal-400",
    glowColor: "rgba(52, 211, 153, 0.15)",
  },
  {
    icon: ClipboardDossierIcon,
    title: "Compliance Dossiers",
    description:
      "Generate complete, export-ready compliance packets with AI-verified documentation, flagged gaps, and remediation steps — ready for customs clearance.",
    accent: "from-violet-400 to-purple-400",
    glowColor: "rgba(139, 92, 246, 0.15)",
  },
];

/* ── Main Component ── */

export function ProductSection() {
  const sectionRef = useRef<HTMLElement>(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          observer.disconnect();
        }
      },
      { threshold: 0.1 }
    );

    if (sectionRef.current) {
      observer.observe(sectionRef.current);
    }

    return () => observer.disconnect();
  }, []);

  return (
    <section
      ref={sectionRef}
      id="product"
      className="py-28 md:py-36 bg-ink w-full relative z-20 scroll-mt-20 overflow-hidden"
    >
      {/* ── Subtle background accents ── */}
      <div className="absolute inset-0 pointer-events-none">
        {/* Large radial glow top-left */}
        <div className="absolute -top-40 -left-40 w-[600px] h-[600px] rounded-full bg-yellow-500/[0.04] blur-3xl" />
        {/* Large radial glow bottom-right */}
        <div className="absolute -bottom-40 -right-40 w-[600px] h-[600px] rounded-full bg-blue-500/[0.04] blur-3xl" />
        {/* Faint grid pattern */}
        <div
          className="absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage:
              "linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)",
            backgroundSize: "64px 64px",
          }}
        />
      </div>

      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* ── Section Header ── */}
        <div
          className="text-center max-w-3xl mx-auto mb-20"
          style={{
            opacity: isVisible ? 1 : 0,
            transform: isVisible ? "translateY(0)" : "translateY(32px)",
            transition: "opacity 0.7s cubic-bezier(0.23,1,0.32,1), transform 0.7s cubic-bezier(0.23,1,0.32,1)",
          }}
        >
          <div className="inline-flex items-center gap-2 rounded-full border border-yellow-400/30 bg-yellow-400/10 px-5 py-2 text-sm font-bold text-yellow-300 mb-8">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-yellow-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-yellow-400" />
            </span>
            Platform Capabilities
          </div>

          <h2 className="font-display text-3xl sm:text-4xl md:text-5xl lg:text-[3.5rem] font-bold text-white mb-6 leading-tight tracking-tight">
            Everything you need for{" "}
            <span className="bg-gradient-to-r from-yellow-300 via-yellow-400 to-amber-500 bg-clip-text text-transparent">
              smarter global trade.
            </span>
          </h2>

          <p className="text-lg md:text-xl text-white/50 leading-relaxed max-w-2xl mx-auto">
            TradeReady AI combines advanced document intelligence, real-time regulatory verification, and AI-powered compliance analysis into a single platform — replacing manual research and spreadsheets.
          </p>
        </div>

        {/* ── Feature Cards Grid ── */}
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6 lg:gap-5">
          {features.map((feature, index) => (
            <div
              key={feature.title}
              className="group relative rounded-2xl border border-white/[0.08] bg-white/[0.03] backdrop-blur-sm p-7 transition-all duration-300 hover:bg-white/[0.07] hover:border-white/[0.15] hover:-translate-y-1.5 hover:shadow-[0_20px_60px_-15px_rgba(0,0,0,0.5)]"
              style={{
                opacity: isVisible ? 1 : 0,
                transform: isVisible ? "translateY(0)" : "translateY(40px)",
                transition: `opacity 0.6s cubic-bezier(0.23,1,0.32,1) ${0.15 + index * 0.12}s, transform 0.6s cubic-bezier(0.23,1,0.32,1) ${0.15 + index * 0.12}s`,
              }}
            >
              {/* Glow on hover */}
              <div
                className="absolute -inset-px rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none"
                style={{
                  background: `radial-gradient(400px circle at 50% 0%, ${feature.glowColor}, transparent 70%)`,
                }}
              />

              {/* Icon */}
              <div className="relative mb-6">
                <div
                  className={`inline-flex items-center justify-center h-12 w-12 rounded-xl bg-gradient-to-br ${feature.accent} p-[1px] shadow-lg group-hover:shadow-xl transition-shadow duration-300`}
                >
                  <div className="flex items-center justify-center h-full w-full rounded-[11px] bg-ink/80 group-hover:bg-ink/60 transition-colors duration-300">
                    <feature.icon className="h-5 w-5 text-white group-hover:scale-110 transition-transform duration-300" />
                  </div>
                </div>
              </div>

              {/* Content */}
              <div className="relative">
                <h3 className="font-display text-lg font-bold text-white mb-3 tracking-tight group-hover:text-yellow-50 transition-colors duration-300">
                  {feature.title}
                </h3>
                <p className="text-sm text-white/45 leading-relaxed group-hover:text-white/60 transition-colors duration-300">
                  {feature.description}
                </p>
              </div>

              {/* Bottom accent line */}
              <div
                className={`absolute bottom-0 left-6 right-6 h-px bg-gradient-to-r ${feature.accent} opacity-0 group-hover:opacity-30 transition-opacity duration-500`}
              />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
