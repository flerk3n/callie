"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { gsap } from "gsap";

const slots = [
  { id: "1", time: "2:00 PM", duration: "45 min" },
  { id: "2", time: "4:30 PM", duration: "45 min" },
  { id: "3", time: "10:00 AM", duration: "45 min" },
];

function Glyph({ children }: { children: ReactNode }) {
  return <span className="glyph" aria-hidden="true">{children}</span>;
}

export function VoiceExperience() {
  const scope = useRef<HTMLElement>(null);
  const orb = useRef<HTMLButtonElement>(null);
  const [isListening, setIsListening] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState("2");

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const context = gsap.context(() => {
      gsap.fromTo(".reveal", { autoAlpha: 0, y: 20 }, { autoAlpha: 1, y: 0, duration: 0.8, stagger: 0.1, ease: "power3.out" });
      gsap.to(".orb-core", { scale: 1.06, duration: 2.5, yoyo: true, repeat: -1, ease: "sine.inOut" });
      gsap.to(".orbit-one", { rotation: 360, duration: 24, repeat: -1, ease: "none" });
      gsap.to(".orbit-two", { rotation: -360, duration: 18, repeat: -1, ease: "none" });
      gsap.to(".signal", { x: 460, duration: 4, stagger: 1.3, repeat: -1, ease: "none" });
    }, scope);
    return () => context.revert();
  }, []);

  useEffect(() => {
    if (orb.current) gsap.to(orb.current, { scale: isListening ? 1.05 : 1, duration: 0.25, ease: "power2.out" });
  }, [isListening]);

  const toggleListening = () => setIsListening((current) => !current);

  return (
    <main className="site-shell" ref={scope}>
      <div className="ambient ambient-one" /><div className="ambient ambient-two" />
      <nav className="topbar reveal" aria-label="Primary navigation">
        <a className="brand" href="#top"><span className="brand-mark" /><span>Callie</span></a>
        <div className="nav-actions"><span className="secure"><i /> Private &amp; secure</span><button className="connect" type="button"><Glyph>▣</Glyph> Connect calendar</button></div>
      </nav>

      <section className="hero" id="top">
        <div className="hero-copy">
          <p className="eyebrow reveal"><span>✦</span> Your time, on your terms</p>
          <h1 className="reveal">Meet your new<br /><em>calendar instinct.</em></h1>
          <p className="subtitle reveal">Just say what you need. Callie finds the moment, protects your focus, and makes it happen.</p>
          <div className="people-chip reveal"><span className="faces"><i>J</i><i>M</i><i>+</i></span>3 focus blocks protected this week</div>
        </div>

        <section className="voice-console reveal" aria-label="Voice scheduling assistant">
          <div className="console-glow" />
          <div className="console-meta"><span className="agent-state"><i className={isListening ? "active" : ""} />{isListening ? "Listening" : "Ready when you are"}</span><span>◷ GMT +5:30</span></div>
          <div className="orb-stage" aria-hidden="true"><div className="orbit orbit-one"><b /><b /><b /></div><div className="orbit orbit-two"><b /><b /></div>
            <button ref={orb} className={`voice-orb ${isListening ? "listening" : ""}`} onClick={toggleListening} type="button" aria-label={isListening ? "Stop listening" : "Start voice conversation"} aria-pressed={isListening}>
              <span className="orb-core">{isListening ? "Ⅱ" : "♩"}</span><span className="orb-shine" />
            </button>
          </div>
          <div className="transcript"><div><span>⌁ Live conversation</span><small>00:18</small></div><p><b>You</b> Find me 45 minutes next Tuesday afternoon.</p><p className="callie-line"><b>Callie</b> I found a few calm spots that work beautifully.</p></div>
          <button className="talk-button" type="button" onClick={toggleListening}><span>{isListening ? "Listening now" : "Talk to Callie"}</span><i>{isListening ? "⌁" : "→"}</i></button>
          <p className="shortcut"><kbd>Space</kbd> to talk <span>•</span> You can always type instead</p>
        </section>

        <aside className="suggestion-card reveal" aria-label="Suggested times">
          <div className="suggestion-title"><b>Best windows</b><button type="button" aria-label="Open calendar">▣</button></div>
          <div className="days"><span>MON</span><span className="today">TUE <b>6</b></span><span>WED</span></div>
          <div className="slots">{slots.map((slot) => <button key={slot.id} className={selectedSlot === slot.id ? "slot selected" : "slot"} onClick={() => setSelectedSlot(slot.id)} type="button" aria-pressed={selectedSlot === slot.id}><span><b>{slot.time}</b><small>{slot.duration}</small></span><i>{selectedSlot === slot.id ? "✓" : "→"}</i></button>)}</div>
          <div className="focus-row"><i /> Built around your focus hours</div>
        </aside>
      </section>

      <section className="benefits reveal" aria-label="Product benefits"><span><b>01</b> Speaks human</span><span><b>02</b> Knows your time</span><span><b>03</b> Books with intent</span></section>

      <section className="how-it-works" id="how-it-works">
        <div className="how-copy"><p className="eyebrow"><span>✦</span> Quietly capable</p><h2>How the calm<br />gets created.</h2><p>One natural conversation. A lot of thoughtful work in the background.</p></div>
        <div className="flow-card">
          <div className="flow-grid" /><div className="flow-line"><i className="signal" /><i className="signal second" /><i className="signal third" /></div>
          <article className="flow-node first"><span className="node-icon">♩</span><div><b>Say it naturally</b><p>“Tuesday afternoon, 45 minutes.”</p></div><small>01</small></article>
          <article className="flow-node second-node"><span className="node-icon violet">✦</span><div><b>Callie thinks ahead</b><p>Understands intent, timezone, and pace.</p></div><small>02</small></article>
          <article className="flow-node third-node"><span className="node-icon mint">▣</span><div><b>Your calendar stays clear</b><p>Only confirmed moments become meetings.</p></div><small>03</small></article>
          <div className="flow-caption"><i /> Checking availability safely, in real time</div>
        </div>
      </section>
      <footer><a className="brand" href="#top"><span className="brand-mark" /><span>Callie</span></a><p>Your schedule has a softer side.</p><a href="#top">Back to top <span>→</span></a></footer>
    </main>
  );
}
