import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Terms of Service — Callie",
  description: "Terms for using Callie, the voice-first scheduling assistant.",
};

export default function TermsPage() {
  return (
    <main className="legal-shell">
      <article className="legal-card">
        <p className="legal-kicker">Callie</p>
        <h1>Terms of Service</h1>
        <p className="legal-updated">Last updated: September 30, 2026</p>

        <section>
          <h2>Acceptance</h2>
          <p>
            By accessing or using Callie, you agree to these Terms of Service. If you do not
            agree, do not use the service.
          </p>
        </section>

        <section>
          <h2>The service</h2>
          <p>
            Callie helps you schedule meetings through voice interactions and Google Calendar. It
            can check availability, suggest times, and create calendar events only after you
            expressly confirm a specific option.
          </p>
        </section>

        <section>
          <h2>Your responsibilities</h2>
          <p>
            You must provide accurate information, protect your account and devices, maintain the
            authority to connect any Google Calendar you use, and review proposed event details
            before confirming a booking.
          </p>
        </section>

        <section>
          <h2>Google Calendar</h2>
          <p>
            Your use of Google Calendar through Callie is also subject to Google&apos;s applicable
            terms and policies. You may revoke Callie&apos;s Google access at any time through your
            Google Account or the service.
          </p>
        </section>

        <section>
          <h2>Availability and accuracy</h2>
          <p>
            Callie checks calendar availability before offering and again before creating an
            event, but third-party service delays, changes made by others, or connectivity issues
            can affect results. You remain responsible for reviewing your calendar and the final
            event details.
          </p>
        </section>

        <section>
          <h2>Acceptable use</h2>
          <p>
            Do not misuse Callie, interfere with its operation, access it without authorization,
            use it to violate another person&apos;s rights, or submit harmful or unlawful content.
          </p>
        </section>

        <section>
          <h2>Service changes and termination</h2>
          <p>
            We may change, suspend, or discontinue Callie at any time. We may suspend or end
            access if we reasonably believe these terms have been violated or the service is at
            risk.
          </p>
        </section>

        <section>
          <h2>Disclaimers and liability</h2>
          <p>
            Callie is provided on an “as is” and “as available” basis. To the extent permitted by
            law, we disclaim warranties not expressly stated in these terms and are not liable for
            indirect, incidental, special, consequential, or punitive damages arising from your
            use of the service.
          </p>
        </section>

        <section>
          <h2>Changes to these terms</h2>
          <p>
            We may update these terms from time to time. Continued use of Callie after an update
            means you accept the revised terms.
          </p>
        </section>
      </article>
    </main>
  );
}
