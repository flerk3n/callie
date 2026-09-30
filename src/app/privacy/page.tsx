import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy — Callie",
  description: "How Callie handles scheduling and calendar data.",
};

export default function PrivacyPage() {
  return (
    <main className="legal-shell">
      <article className="legal-card">
        <p className="legal-kicker">Callie</p>
        <h1>Privacy Policy</h1>
        <p className="legal-updated">Last updated: September 30, 2026</p>

        <section>
          <h2>What this policy covers</h2>
          <p>
            Callie is a voice-first scheduling assistant. This policy explains how we handle
            information when you connect Google Calendar and use Callie to find or book time.
          </p>
        </section>

        <section>
          <h2>Information we process</h2>
          <p>To operate the service, Callie may process:</p>
          <ul>
            <li>your Google account profile information, including your email address;</li>
            <li>
              Google Calendar availability, event details needed to resolve scheduling requests,
              and events you explicitly ask Callie to create;
            </li>
            <li>
              your scheduling preferences and the status of a scheduling conversation; and
            </li>
            <li>basic technical information required to authenticate and operate the service.</li>
          </ul>
        </section>

        <section>
          <h2>How we use it</h2>
          <p>
            We use this information only to authenticate you, check availability, answer your
            scheduling request, create an event after your confirmation, secure the service, and
            diagnose operational problems.
          </p>
        </section>

        <section>
          <h2>Calendar access and security</h2>
          <p>
            Callie requests only the Google Calendar permissions needed to read availability,
            locate relevant events, and create events you confirm. Google refresh tokens are
            encrypted before storage. Calendar data is handled by Callie&apos;s server and is not
            exposed directly to the browser or voice agent tools.
          </p>
        </section>

        <section>
          <h2>Voice processing</h2>
          <p>
            Voice conversations are processed through Callie&apos;s voice provider to provide the
            real-time interaction. That provider&apos;s handling of audio and transcripts is governed
            by its own privacy terms. Callie does not intentionally store raw audio recordings in
            its application database.
          </p>
        </section>

        <section>
          <h2>Sharing and retention</h2>
          <p>
            We do not sell personal information. We share data only with service providers needed
            to run Callie, including Google Calendar, the voice provider, hosting, and database
            infrastructure. We retain data only for as long as needed to provide the service,
            meet legal obligations, resolve disputes, and enforce agreements.
          </p>
        </section>

        <section>
          <h2>Your choices</h2>
          <p>
            You can disconnect Google Calendar through Callie or revoke Callie&apos;s access in your
            Google Account. You may also request access, correction, or deletion of your
            information using the contact details made available by the service operator.
          </p>
        </section>

        <section>
          <h2>Changes</h2>
          <p>
            We may update this policy as Callie evolves. We will post the updated version here and
            change the date above when we do.
          </p>
        </section>
      </article>
    </main>
  );
}
