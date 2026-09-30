"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { gsap } from "gsap";
import { ConversationProvider, useConversation } from "@elevenlabs/react";
import { signIn } from "next-auth/react";
import Image from "next/image";
import {
  ArrowUpRight,
  CalendarCheck2,
  CalendarDays,
  Check,
  ChevronRight,
  Mic,
  Waves,
} from "lucide-react";
import callieLogo from "../../withoutbg.png";
import Strands from "@/components/Strands";
import { Bubble, BubbleContent, BubbleGroup } from "@/components/ui/bubble";
import { Calendar } from "@/components/ui/calendar";
import { GradientWave } from "@/components/ui/gradient-wave";
import { enUS } from "date-fns/locale";
import { toVisibleTranscriptText } from "@/lib/transcript";

type CurrentUser = {
  name?: string | null;
  image?: string | null;
  email?: string | null;
};

type TranscriptMessage = {
  id: string;
  role: "user" | "agent";
  text: string;
};

const initialTranscript: TranscriptMessage[] = [
  {
    id: "callie-welcome",
    role: "agent",
    text: "Hi, I’m Callie. Ask me to find a time, move a meeting, or protect your focus.",
  },
];

const calendarPreviewDate = new Date(2026, 8, 30);

function Glyph({ children }: { children: ReactNode }) {
  return <span className="glyph" aria-hidden="true">{children}</span>;
}

function GitHubMark({ size = 17 }: { size?: number }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" width={size} height={size} fill="currentColor">
      <path d="M12 2C6.48 2 2 6.58 2 12.23c0 4.52 2.87 8.35 6.84 9.71.5.1.68-.22.68-.49 0-.24-.01-1.04-.01-1.89-2.78.62-3.37-1.2-3.37-1.2-.45-1.18-1.11-1.49-1.11-1.49-.91-.64.07-.63.07-.63 1 .07 1.53 1.05 1.53 1.05.9 1.57 2.35 1.12 2.92.85.09-.67.35-1.12.64-1.38-2.22-.26-4.56-1.15-4.56-5.11 0-1.13.39-2.05 1.04-2.78-.1-.26-.45-1.31.1-2.74 0 0 .85-.28 2.75 1.06A9.33 9.33 0 0 1 12 6.35c.85 0 1.71.12 2.51.35 1.9-1.34 2.75-1.06 2.75-1.06.55 1.43.2 2.48.1 2.74.65.73 1.04 1.65 1.04 2.78 0 3.97-2.35 4.84-4.58 5.1.36.32.68.93.68 1.87 0 1.35-.01 2.43-.01 2.76 0 .27.18.59.69.49A10.25 10.25 0 0 0 22 12.23C22 6.58 17.52 2 12 2Z" />
    </svg>
  );
}

export function VoiceExperience({ user }: { user?: CurrentUser | null }) {
  return (
    <ConversationProvider>
      <VoiceExperienceContent user={user} />
    </ConversationProvider>
  );
}

function VoiceExperienceContent({ user }: { user?: CurrentUser | null }) {
  const scope = useRef<HTMLElement>(null);
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(calendarPreviewDate);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [isPreparingVoice, setIsPreparingVoice] = useState(false);
  const [voiceLevel, setVoiceLevel] = useState(0.16);
  const [messages, setMessages] = useState<TranscriptMessage[]>(initialTranscript);
  const conversation = useConversation({
    onError: (message) => {
      setVoiceError(message);
      setIsPreparingVoice(false);
    },
    onStatusChange: ({ status }) => {
      if (status === "connecting" || status === "connected") setIsPreparingVoice(false);
    },
    onMessage: (message) => {
      const text = toVisibleTranscriptText(message.message);
      if (!text) return;

      setMessages((current) => {
        const nextMessage = {
          id: `${message.event_id}-${message.role}`,
          role: message.role,
          text,
        } satisfies TranscriptMessage;
        const withoutDuplicate = current.filter((item) => item.id !== nextMessage.id);
        return [...withoutDuplicate, nextMessage].slice(-6);
      });
    },
  });

  const isConnected = conversation.status === "connected";
  const isListening = isConnected && conversation.isListening;
  const isSpeaking = isConnected && conversation.isSpeaking;
  const statusLabel = isPreparingVoice
    ? "Preparing a secure voice session"
    : conversation.status === "connecting"
    ? "Connecting"
    : isSpeaking
      ? "Callie is speaking"
      : isListening
        ? "Listening"
        : isConnected
          ? "Ready for your next thought"
          : "Ready when you are";

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const context = gsap.context(() => {
      gsap.fromTo(
        ".reveal",
        { autoAlpha: 0, y: 24 },
        { autoAlpha: 1, y: 0, duration: 0.8, stagger: 0.09, ease: "power3.out" },
      );
      gsap.to(".calendar-card", {
        y: -8,
        duration: 3.6,
        yoyo: true,
        repeat: -1,
        ease: "sine.inOut",
      });
      gsap.to(".flow-packet", {
        xPercent: 760,
        duration: 4.8,
        stagger: 1.6,
        repeat: -1,
        ease: "none",
      });
    }, scope);
    return () => context.revert();
  }, []);

  useEffect(() => {
    if (!isConnected) {
      return;
    }

    const timer = window.setInterval(() => {
      try {
        const input = conversation.getInputVolume();
        const output = conversation.getOutputVolume();
        const level = Math.min(1, Math.max(input, output) * 2.6 + (isSpeaking ? 0.26 : 0.08));
        setVoiceLevel(level);
      } catch {
        setVoiceLevel(isSpeaking ? 0.52 : 0.28);
      }
    }, 80);

    return () => window.clearInterval(timer);
  }, [conversation, isConnected, isSpeaking]);

  useEffect(() => {
    function handleShortcut(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      if (
        event.code !== "Space" ||
        target?.matches("input, textarea, select, button, [contenteditable='true']")
      ) return;
      event.preventDefault();
      void toggleListening();
    }

    window.addEventListener("keydown", handleShortcut);
    return () => window.removeEventListener("keydown", handleShortcut);
  });

  async function toggleListening() {
    if (!user) {
      await signIn("google", { callbackUrl: "/" });
      return;
    }

    if (isPreparingVoice) return;

    if (conversation.status === "connected" || conversation.status === "connecting") {
      conversation.endSession();
      return;
    }

    try {
      setIsPreparingVoice(true);
      setVoiceError(null);
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((track) => track.stop());
      const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      if (!timezone) throw new Error("Your browser could not determine a timezone.");
      const response = await fetch("/api/voice/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ timezone }),
      });
      const payload = await response.json() as { conversationToken?: string; error?: string };
      if (!response.ok || !payload.conversationToken) {
        throw new Error(payload.error ?? "Unable to start voice.");
      }
      conversation.startSession({
        conversationToken: payload.conversationToken,
        connectionType: "webrtc",
      });
    } catch (error) {
      setVoiceError(error instanceof Error ? error.message : "Microphone access is required to start Callie.");
      setIsPreparingVoice(false);
    }
  }

  const displayName = user?.name?.split(" ")[0] || user?.email?.split("@")[0] || "You";
  const initials = displayName.slice(0, 1).toUpperCase();
  const strandsIntensity = isConnected ? Math.min(1.12, 0.28 + voiceLevel) : 0.24;

  return (
    <main className="site-shell" ref={scope}>
      <GradientWave />
      <div className="page-glow page-glow-one" />
      <div className="page-glow page-glow-two" />

      <header className="topbar reveal" aria-label="Primary navigation">
        <a className="brand" href="#top" aria-label="Callie home">
          <Image className="brand-logo" src={callieLogo} alt="" priority />
          <span>Callie</span>
        </a>

        {user ? (
          <div className="account-chip" title={`Connected as ${user.name ?? user.email ?? "your Google account"}`}>
            {user.image ? (
              <Image className="account-avatar" src={user.image} alt="" width={34} height={34} />
            ) : (
              <span className="account-avatar account-initials" aria-hidden="true">{initials}</span>
            )}
            <span className="account-name">{displayName}</span>
            <span className="account-status"><Check size={12} /> Connected</span>
          </div>
        ) : (
          <button
            className="connect-button"
            type="button"
            onClick={() => void signIn("google", { callbackUrl: "/" })}
          >
            <Glyph><CalendarDays size={15} /></Glyph>
            Connect Google
            <ArrowUpRight size={15} />
          </button>
        )}
      </header>

      <section className="hero" id="top" aria-labelledby="hero-title">
        <div className="hero-copy">
          <h1 className="reveal" id="hero-title">Your calendar, clear enough to think.</h1>
          <p className="hero-support reveal">
            Tell Callie what needs to happen. It understands the intent, checks your real availability,
            and only writes to Google Calendar when you confirm.
          </p>
          <a className="hero-link reveal" href="#agent">
            Meet your scheduling agent <ChevronRight size={16} />
          </a>
        </div>

        <aside className="calendar-card reveal" aria-label="Calendar preview">
          <div className="calendar-card-topline">
            <span><i /> Calendar preview</span>
            <span>Local time</span>
          </div>
          <Calendar
            className="callie-calendar"
            mode="single"
            locale={enUS}
            selected={selectedDate}
            onSelect={setSelectedDate}
            defaultMonth={calendarPreviewDate}
          />
          <div className="calendar-card-footer">
            <span className="selected-date">
              <b>{selectedDate ? `${selectedDate.toLocaleString("en-US", { month: "short" })} ${selectedDate.getDate()}` : "Choose a day"}</b>
              A little more space for what matters
            </span>
            <CalendarCheck2 size={18} />
          </div>
        </aside>
      </section>

      <section className="agent-section reveal" id="agent" aria-labelledby="agent-title">
        <div className="window-bar">
          <span className="window-controls" aria-hidden="true"><i /><i /><i /></span>
          <p><span className={isConnected ? "live-dot" : ""} /> Voice workspace</p>
          <span className="window-state">{isConnected ? "Session live" : "Private by design"}</span>
        </div>

        <div className="agent-grid">
          <section className="voice-stage" aria-labelledby="agent-title">
            <div className="voice-stage-copy">
              <p className="section-label"><Waves size={15} /> Callie listens</p>
              <h2 id="agent-title">Say it the way you mean it.</h2>
              <p>{statusLabel}. Callie turns natural language into calendar-aware actions.</p>
            </div>
            <div className="strands-wrap" aria-hidden="true">
              <Strands
                colors={["#003dff", "#1e59ff", "#b75aff"]}
                count={isConnected ? 8 : 5}
                speed={isConnected ? 1.1 + voiceLevel * 0.9 : 0.32}
                amplitude={isConnected ? 1.35 + voiceLevel * 1.15 : 0.7}
                waviness={1.1}
                thickness={isConnected ? 0.95 : 0.56}
                glow={isConnected ? 3.4 : 2.1}
                intensity={strandsIntensity}
                saturation={1.25}
                opacity={0.94}
                scale={1.22}
              />
              <span className="strands-center" />
            </div>
            <button
              className={`voice-action ${isListening ? "is-listening" : ""} ${isPreparingVoice ? "is-preparing" : ""}`}
              type="button"
              onClick={() => void toggleListening()}
              aria-label={user ? isConnected ? "End voice conversation" : "Start voice conversation" : "Connect Google Calendar to start talking"}
              aria-pressed={isListening}
              aria-busy={isPreparingVoice}
              disabled={isPreparingVoice}
            >
              <span className="mic-disc">{isPreparingVoice ? <span className="button-spinner" /> : <Mic size={19} />}</span>
              <span>{isPreparingVoice ? "Preparing Callie" : conversation.status === "connecting" ? "Connecting" : isConnected ? "End conversation" : "Start talking"}</span>
              <kbd>Space</kbd>
            </button>
            {voiceError && <p className="voice-error" role="alert">{voiceError}</p>}
          </section>

          <section className="transcript-panel" aria-labelledby="transcript-title">
            <header className="transcript-header">
              <div>
                <p className="section-label">Live conversation</p>
                <h2 id="transcript-title">Transcript</h2>
              </div>
              <div className="transcript-metrics">
                <span className={`session-pill ${isConnected ? "is-live" : ""}`}>
                  <i /> {isConnected ? "Live" : "Standby"}
                </span>
              </div>
            </header>

            <div className="transcript-scroll" role="log" aria-live="polite" aria-label="Live conversation transcript">
              <BubbleGroup className="conversation-list">
                {messages.map((message) => (
                  <Bubble
                    key={message.id}
                    variant={message.role === "user" ? "default" : "secondary"}
                    align={message.role === "user" ? "end" : "start"}
                    className={`conversation-bubble ${message.role}`}
                  >
                    <span className="message-speaker">{message.role === "user" ? "You" : "Callie"}</span>
                    <BubbleContent className="conversation-content">{message.text}</BubbleContent>
                  </Bubble>
                ))}
              </BubbleGroup>
            </div>

          </section>
        </div>
      </section>

      <section className="how-it-works" aria-labelledby="how-title">
        <div className="how-heading reveal">
          <h2 id="how-title">A calm answer has a lot going on underneath.</h2>
          <p>Callie keeps identity, availability, time math, and event creation on the server where they belong.</p>
        </div>

        <div className="bento-grid">
          <article className="bento-card intent-card reveal">
            <span className="bento-number">01</span>
            <div className="quote-wave" aria-hidden="true"><i /><i /><i /><i /><i /><i /><i /><i /><i /></div>
            <div>
              <p className="card-kicker">Intent, not syntax</p>
              <h3>Speak naturally</h3>
              <p>Callie resolves names, duration, timing, and timezones from the way you already ask.</p>
            </div>
            <code>“45 minutes next Tuesday afternoon”</code>
          </article>

          <article className="bento-card availability-card reveal">
            <span className="bento-number">02</span>
            <div>
              <p className="card-kicker">Fresh availability</p>
              <h3>Check what is actually open</h3>
              <p>Google FreeBusy is checked against your connected calendar in real time.</p>
            </div>
          </article>

          <article className="bento-card confirm-card reveal">
            <span className="bento-number">03</span>
            <div className="confirmation-flow" aria-hidden="true">
              <span>Confirm</span><div><i className="flow-packet" /></div><CalendarDays size={18} />
            </div>
            <div>
              <p className="card-kicker">A deliberate final step</p>
              <h3>Recheck, then create</h3>
              <p>Availability is validated again immediately before Callie creates the event.</p>
            </div>
          </article>
        </div>
      </section>

      <footer>
        <p>Made with love by flerk3n</p>
        <a href="https://github.com/flerk3n/callie" target="_blank" rel="noreferrer">
          <GitHubMark /> GitHub <ArrowUpRight size={14} />
        </a>
      </footer>
    </main>
  );
}
