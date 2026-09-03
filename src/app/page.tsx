import React from "react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { MarketingNav } from "@/components/marketing/MarketingNav";
import { ProductSection } from "@/components/marketing/ProductSection";
import { TradeReadyLogo } from "@/components/brand/TradeReadyLogo";

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col bg-ink text-white font-body selection:bg-yellow-500/30">
      {/* ─── NAVBAR ──────────────────────────────────────────────── */}
      <MarketingNav />

      {/* ─── HERO SECTION ────────────────────────────────────────── */}
      <section className="relative min-h-screen flex items-center justify-center overflow-hidden">
        {/* Video Background */}
        <div className="absolute inset-0 z-0 bg-ink">
          <video
            autoPlay
            loop
            muted
            playsInline
            className="absolute inset-0 w-full h-full object-cover opacity-50"
          >
            <source src="/bg-video.mp4" type="video/mp4" />
          </video>
          {/* Much darker and richer gradient overlay to ensure text pops completely */}
          <div className="absolute inset-0 bg-gradient-to-br from-ink/95 via-ink/75 to-ink/95" />
        </div>

        {/* Hero Content */}
        <div className="relative z-10 mx-auto max-w-7xl w-full px-4 sm:px-6 lg:px-8 text-left pt-32 pb-20">
          {/* Badge */}
          <div className="hero-fade-in inline-flex items-center gap-2.5 rounded-full border border-yellow-400/40 bg-yellow-400/20 backdrop-blur-md px-6 py-2.5 text-sm font-bold text-yellow-300 mb-10 shadow-[0_0_20px_rgba(250,204,21,0.3)]">
            <span className="relative flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-yellow-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-yellow-400" />
            </span>
            Next-Generation Trade Intelligence
          </div>

          {/* Headline */}
          <h1 className="hero-fade-in hero-delay-1 max-w-4xl font-display text-5xl sm:text-6xl lg:text-7xl xl:text-[5.5rem] font-extrabold tracking-tight leading-[1.1] mb-6 drop-shadow-[0_4px_10px_rgba(0,0,0,0.8)]">
            <span className="text-white">Global trade compliance,</span>{" "}
            <br className="hidden md:block" />
            <span className="bg-gradient-to-r from-yellow-300 via-yellow-400 to-amber-500 bg-clip-text text-transparent drop-shadow-lg">
              simplified by AI.
            </span>
          </h1>

          {/* Subheadline */}
          <p className="hero-fade-in hero-delay-2 max-w-2xl text-lg sm:text-xl md:text-2xl leading-relaxed text-white mb-10 font-medium tracking-wide drop-shadow-[0_2px_8px_rgba(0,0,0,0.8)]">
            Accelerate your cross-border operations. TradeReady AI instantly
            analyzes requirements, extracts document data, and verifies
            compliance against official sources.
          </p>

          {/* CTA Buttons */}
          <div className="hero-fade-in hero-delay-3 flex flex-col sm:flex-row items-start sm:items-center justify-start gap-5 mb-14">
            <Link href="/auth/signup" className="w-full sm:w-auto">
              <Button
                size="lg"
                className="w-full sm:w-auto h-14 px-10 rounded-full text-lg font-extrabold bg-yellow-500 hover:bg-yellow-400 text-ink shadow-[0_0_30px_rgba(234,179,8,0.4)] transition-all duration-300 hover:shadow-[0_0_50px_rgba(234,179,8,0.6)] hover:-translate-y-1"
              >
                Start Free Workspace
              </Button>
            </Link>
            <Link href="/auth/signin" className="w-full sm:w-auto">
              <Button
                variant="primary"
                size="lg"
                className="w-full sm:w-auto h-14 px-10 rounded-full text-lg font-bold transition-all duration-300 hover:-translate-y-1 shadow-[0_4px_20px_rgba(0,0,0,0.5)]"
              >
                Log in
              </Button>
            </Link>
          </div>

          {/* Trust badges */}
          <div className="hero-fade-in hero-delay-4 relative z-20 mt-12 md:mt-16 w-full lg:w-max">
            <div className="relative overflow-hidden rounded-2xl sm:rounded-full bg-white/5 backdrop-blur-2xl border border-white/15 shadow-[0_8px_40px_rgba(0,0,0,0.6)] px-6 py-5 sm:py-6">
              {/* Subtle inner highlight */}
              <div className="absolute inset-0 bg-gradient-to-r from-yellow-500/5 via-white/5 to-yellow-500/5 pointer-events-none" />
              
              <div className="flex flex-col md:flex-row items-start md:items-center justify-start gap-6 sm:gap-10 md:gap-12">
                
                {/* Item 1 */}
                <div className="flex items-center gap-3.5 group cursor-default">
                  <div className="bg-yellow-500/10 p-2 rounded-full border border-yellow-500/20 group-hover:bg-yellow-500/25 group-hover:scale-110 transition-all duration-300 shadow-[inset_0_0_10px_rgba(250,204,21,0.1)]">
                    <CheckCircleIcon className="h-5 w-5 sm:h-6 sm:w-6 text-yellow-400 drop-shadow-[0_0_8px_rgba(250,204,21,0.6)]" />
                  </div>
                  <span className="text-white font-bold text-base sm:text-lg tracking-wide group-hover:text-yellow-50 transition-colors drop-shadow-md">
                    SOC2 Type II Certified
                  </span>
                </div>

                {/* Divider */}
                <div className="hidden md:block w-px h-10 bg-white/15" />

                {/* Item 2 */}
                <div className="flex items-center gap-3.5 group cursor-default">
                  <div className="bg-yellow-500/10 p-2 rounded-full border border-yellow-500/20 group-hover:bg-yellow-500/25 group-hover:scale-110 transition-all duration-300 shadow-[inset_0_0_10px_rgba(250,204,21,0.1)]">
                    <CheckCircleIcon className="h-5 w-5 sm:h-6 sm:w-6 text-yellow-400 drop-shadow-[0_0_8px_rgba(250,204,21,0.6)]" />
                  </div>
                  <span className="text-white font-bold text-base sm:text-lg tracking-wide group-hover:text-yellow-50 transition-colors drop-shadow-md">
                    End-to-End Encryption
                  </span>
                </div>

                {/* Divider */}
                <div className="hidden md:block w-px h-10 bg-white/15" />

                {/* Item 3 */}
                <div className="flex items-center gap-3.5 group cursor-default">
                  <div className="bg-yellow-500/10 p-2 rounded-full border border-yellow-500/20 group-hover:bg-yellow-500/25 group-hover:scale-110 transition-all duration-300 shadow-[inset_0_0_10px_rgba(250,204,21,0.1)]">
                    <CheckCircleIcon className="h-5 w-5 sm:h-6 sm:w-6 text-yellow-400 drop-shadow-[0_0_8px_rgba(250,204,21,0.6)]" />
                  </div>
                  <span className="text-white font-bold text-base sm:text-lg tracking-wide group-hover:text-yellow-50 transition-colors drop-shadow-md">
                    Zero-Trust Architecture
                  </span>
                </div>

              </div>
            </div>
          </div>
        </div>

        {/* Bottom gradient fade into next section */}
        <div className="absolute bottom-0 left-0 right-0 h-40 bg-gradient-to-t from-ink via-ink/90 to-transparent z-10" />
      </section>

      {/* ─── LOGO STRIP ──────────────────────────────────────────── */}
      <section className="py-14 bg-ink w-full border-b border-white/10 relative z-20 overflow-hidden">
        {/* Soft edge masks for infinite loop fading */}
        <div className="absolute left-0 top-0 bottom-0 w-16 md:w-32 bg-gradient-to-r from-ink to-transparent z-10 pointer-events-none" />
        <div className="absolute right-0 top-0 bottom-0 w-16 md:w-32 bg-gradient-to-l from-ink to-transparent z-10 pointer-events-none" />
        
        <div className="mx-auto w-full text-center relative z-0">
          <p className="text-xs sm:text-sm font-bold uppercase tracking-[0.25em] text-yellow-400 mb-10 drop-shadow-md px-4">
            Trusted by global trade networks
          </p>
          
          <div className="pause-marquee overflow-hidden w-full flex">
            <div className="animate-marquee gap-16 md:gap-24 items-center pl-8 md:pl-12">
              {[
                'Oceania', 'TransGlobal', 'SwiftFreight', 'Meridian', 'NexusTrade', 
                'ApexLogistics', 'TradeNova', 'Equinox', 'PioneerCargo',
                'Oceania', 'TransGlobal', 'SwiftFreight', 'Meridian', 'NexusTrade', 
                'ApexLogistics', 'TradeNova', 'Equinox', 'PioneerCargo'
              ].map((brand, i) => (
                <div 
                  key={i}
                  className="font-display flex items-center gap-3 text-2xl md:text-3xl font-extrabold tracking-tight text-white/40 transition-colors duration-300 hover:text-white cursor-default whitespace-nowrap"
                >
                  <div className="h-5 w-5 rounded bg-white/10 flex items-center justify-center opacity-80">
                    <div className="h-1.5 w-1.5 rounded-full bg-yellow-400/80" />
                  </div>
                  {brand}
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ─── PRODUCT SECTION ─────────────────────────────────────── */}
      <ProductSection />

      {/* ─── WORKFLOW SECTION ────────────────────────────────────── */}
      <section id="workflow" className="py-24 md:py-32 bg-ink w-full relative z-20 scroll-mt-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto mb-16 md:mb-24">
            <h2 className="font-display text-3xl md:text-5xl font-bold text-white mb-6">
              How TradeReady AI works
            </h2>
            <p className="text-lg text-white/60">
              Replace manual spreadsheets and endless regulatory searches with
              an intelligent, automated compliance pipeline.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            {[
              {
                icon: <DocumentAddIcon className="h-8 w-8" />,
                step: "1",
                title: "Ingest Documents",
                desc: "Upload your commercial invoices, packing lists, and bills of lading. Our OCR engine extracts key entities instantly.",
              },
              {
                icon: <CpuChipIcon className="h-8 w-8" />,
                step: "2",
                title: "AI Analysis",
                desc: "The RAG pipeline compares your shipment details against live customs requirements and tariff databases.",
              },
              {
                icon: <ShieldCheckIcon className="h-8 w-8" />,
                step: "3",
                title: "Verify & Ship",
                desc: "Review the AI-generated compliance dossier, address flagged missing requirements, and export your customs packet.",
              },
            ].map((item) => (
              <div
                key={item.step}
                className="relative bg-white/5 backdrop-blur-sm rounded-3xl p-8 border border-white/10 transition-all duration-300 hover:bg-white/10 hover:border-yellow-500/30 hover:-translate-y-2 group"
              >
                <div className="h-14 w-14 rounded-2xl bg-yellow-500/10 text-yellow-400 flex items-center justify-center mb-6 group-hover:bg-yellow-500/20 group-hover:scale-110 transition-all duration-300">
                  {item.icon}
                </div>
                <h3 className="font-display text-xl font-bold text-white mb-3">
                  {item.step}. {item.title}
                </h3>
                <p className="text-white/60 leading-relaxed">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── SECURITY SECTION ──────────────────────────────────────── */}
      <section id="security" className="py-24 md:py-32 bg-ink w-full relative z-20 scroll-mt-20 border-t border-white/10">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto mb-16">
            <h2 className="font-display text-3xl md:text-5xl font-bold text-white mb-6">
              Enterprise-Grade Security
            </h2>
            <p className="text-lg text-white/60">
              Your trade data is critical. We protect your supply chain information with industry-leading security standards and compliance frameworks.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            <div className="bg-white/5 backdrop-blur-sm rounded-3xl p-8 border border-white/10 text-center flex flex-col items-center">
              <div className="bg-yellow-500/10 p-4 rounded-full border border-yellow-500/20 mb-6">
                <CheckCircleIcon className="h-8 w-8 text-yellow-400" />
              </div>
              <h3 className="font-display text-xl font-bold text-white mb-3">
                SOC2 Type II Certified
              </h3>
              <p className="text-white/60 text-sm">
                Independently audited to ensure the highest standards for security, availability, processing integrity, confidentiality, and privacy.
              </p>
            </div>
            
            <div className="bg-white/5 backdrop-blur-sm rounded-3xl p-8 border border-white/10 text-center flex flex-col items-center">
              <div className="bg-yellow-500/10 p-4 rounded-full border border-yellow-500/20 mb-6">
                <CheckCircleIcon className="h-8 w-8 text-yellow-400" />
              </div>
              <h3 className="font-display text-xl font-bold text-white mb-3">
                End-to-End Encryption
              </h3>
              <p className="text-white/60 text-sm">
                All documents, customs forms, and trade data are encrypted in transit via TLS 1.3 and at rest using AES-256 encryption.
              </p>
            </div>

            <div className="bg-white/5 backdrop-blur-sm rounded-3xl p-8 border border-white/10 text-center flex flex-col items-center">
              <div className="bg-yellow-500/10 p-4 rounded-full border border-yellow-500/20 mb-6">
                <CheckCircleIcon className="h-8 w-8 text-yellow-400" />
              </div>
              <h3 className="font-display text-xl font-bold text-white mb-3">
                Zero-Trust Architecture
              </h3>
              <p className="text-white/60 text-sm">
                Strict access controls, continuous verification, and role-based permissions ensure that only authorized personnel can access sensitive cargo data.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ─── CTA / CONTACT SECTION ──────────────────────────────────────────── */}
      <section className="py-24 bg-ink w-full relative overflow-hidden border-t border-white/10">
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-yellow-500/5 to-transparent pointer-events-none" />
        <div className="relative mx-auto max-w-4xl px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="font-display text-3xl md:text-5xl font-bold text-white mb-6">
            Ready to simplify your trade compliance?
          </h2>
          <p className="text-lg md:text-xl text-white/60 mb-12 font-light max-w-2xl mx-auto">
            Join hundreds of logistics teams already using TradeReady AI to
            clear shipments faster and more confidently.
          </p>
          <Link href="/auth/signup">
            <Button
              size="lg"
              className="h-14 px-12 rounded-full text-lg font-bold bg-yellow-500 hover:bg-yellow-400 text-ink shadow-[0_0_30px_rgba(234,179,8,0.3)] transition-all duration-300 hover:shadow-[0_0_40px_rgba(234,179,8,0.5)] hover:-translate-y-1"
            >
              Start Free
            </Button>
          </Link>

          {/* CONTACT & SUPPORT SECTION */}
          <div className="mt-24 pt-16 border-t border-white/10 grid sm:grid-cols-3 gap-8 text-center max-w-3xl mx-auto">
            
            {/* Contact */}
            <div className="flex flex-col items-center">
              <div className="h-12 w-12 rounded-full bg-white/5 flex items-center justify-center text-white mb-4">
                <EnvelopeIcon className="h-5 w-5" />
              </div>
              <h4 className="text-white font-semibold mb-2">Contact</h4>
              <a 
                href="mailto:sudaisoo72@gmail.com?subject=TradeReady%20AI%20Contact&body=From%20TradeReadyAI%3A%0A%0A" 
                className="text-yellow-400 hover:text-yellow-300 font-medium transition-colors"
              >
                Send an email
              </a>
            </div>

            {/* Support */}
            <div className="flex flex-col items-center">
              <div className="h-12 w-12 rounded-full bg-white/5 flex items-center justify-center text-white mb-4">
                <LifebuoyIcon className="h-5 w-5" />
              </div>
              <h4 className="text-white font-semibold mb-2">Support</h4>
              <a 
                href="mailto:sudaisoo72@gmail.com?subject=TradeReady%20AI%20Contact&body=From%20TradeReadyAI%3A%0A%0A" 
                className="text-yellow-400 hover:text-yellow-300 font-medium transition-colors"
              >
                Get help
              </a>
            </div>

            {/* WhatsApp */}
            <div className="flex flex-col items-center">
              <div className="h-12 w-12 rounded-full bg-white/5 flex items-center justify-center text-white mb-4">
                <ChatBubbleIcon className="h-5 w-5" />
              </div>
              <h4 className="text-white font-semibold mb-2">Contact No.</h4>
              <a 
                href="https://wa.me/923474810818" 
                target="_blank" 
                rel="noopener noreferrer"
                className="text-yellow-400 hover:text-yellow-300 font-medium transition-colors flex flex-col items-center"
              >
                +92 347 4810818
                <span className="text-xs text-white/50 mt-1 font-normal">(WhatsApp only)</span>
              </a>
            </div>

          </div>
        </div>
      </section>

      {/* ─── FOOTER ──────────────────────────────────────────────── */}
      <footer className="border-t border-white/10 bg-ink py-12 w-full mt-auto relative z-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 flex flex-col md:flex-row justify-between items-center gap-6">
          <div className="flex items-center">
            <TradeReadyLogo variant="workspace" tone="inverted" />
          </div>

          <div className="text-sm text-white/40 text-center md:text-left max-w-md leading-relaxed">
            TradeReady AI provides decision-support information. Final customs
            decisions should be confirmed with the relevant authority.
          </div>

          <div className="text-sm text-white/40 font-medium">
            &copy; {new Date().getFullYear()} TradeReady AI. All rights reserved.
          </div>
        </div>
      </footer>
    </div>
  );
}

// Icons
function CheckCircleIcon(props: React.ComponentProps<"svg">) {
  return (
    <svg fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" {...props}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}

function DocumentAddIcon(props: React.ComponentProps<"svg">) {
  return (
    <svg fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" {...props}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m3.75 9v6m3-3H9m1.5-12H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
    </svg>
  );
}

function CpuChipIcon(props: React.ComponentProps<"svg">) {
  return (
    <svg fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" {...props}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 3v1.5M4.5 8.25H3m18 0h-1.5M4.5 12H3m18 0h-1.5m-15 3.75H3m18 0h-1.5M8.25 19.5V21M12 3v1.5m0 15V21m3.75-18v1.5m0 15V21m-9-1.5h10.5a2.25 2.25 0 002.25-2.25V6.75a2.25 2.25 0 00-2.25-2.25H6.75A2.25 2.25 0 004.5 6.75v10.5a2.25 2.25 0 002.25 2.25zm.75-12h9v9h-9v-9z" />
    </svg>
  );
}

function ShieldCheckIcon(props: React.ComponentProps<"svg">) {
  return (
    <svg fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" {...props}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
    </svg>
  );
}

function EnvelopeIcon(props: React.ComponentProps<"svg">) {
  return (
    <svg fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" {...props}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
    </svg>
  );
}

function LifebuoyIcon(props: React.ComponentProps<"svg">) {
  return (
    <svg fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" {...props}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M16.712 4.33a9.027 9.027 0 011.652 1.306c.51.51.944 1.064 1.306 1.652M16.712 4.33l-3.448 4.138m3.448-4.138a9.014 9.014 0 00-9.424 0M19.67 7.288l-4.138 3.448m4.138-3.448a9.014 9.014 0 010 9.424m-4.138-5.976a3.736 3.736 0 00-.88-1.388 3.737 3.737 0 00-1.388-.88m2.268 2.268a3.765 3.765 0 010 2.528m-2.268-4.796a3.765 3.765 0 00-2.528 0m4.796 4.796c-.181.506-.475.982-.88 1.388a3.736 3.736 0 01-1.388.88m2.268-2.268l4.138 3.448m0 0a9.027 9.027 0 01-1.306 1.652c-.51.51-1.064.944-1.652 1.306m0 0l-3.448-4.138m3.448 4.138a9.014 9.014 0 01-9.424 0m5.976-4.138a3.765 3.765 0 01-2.528 0m0 0a3.736 3.736 0 01-1.388-.88 3.737 3.737 0 01-.88-1.388m2.268 2.268l-4.138 3.448m0 0a9.027 9.027 0 01-1.652-1.306 9.027 9.027 0 01-1.306-1.652m0 0l4.138-3.448M4.33 16.712a9.014 9.014 0 010-9.424m4.138 5.976a3.765 3.765 0 010-2.528m0 0c.181-.506.475-.982.88-1.388a3.736 3.736 0 011.388-.88m-2.268 2.268L.882 7.288M4.33 7.288a9.027 9.027 0 011.306-1.652c.51-.51 1.064-.944 1.652-1.306m0 0L10.736 8.47" />
    </svg>
  );
}

function ChatBubbleIcon(props: React.ComponentProps<"svg">) {
  return (
    <svg fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" {...props}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 01-2.555-.337A5.972 5.972 0 015.41 20.97a5.969 5.969 0 01-.474-.065 4.48 4.48 0 00.978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25z" />
    </svg>
  );
}
