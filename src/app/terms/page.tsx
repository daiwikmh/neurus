import type { Metadata } from "next";
import { Nav } from "@/components/landing/Nav";
import { Footer } from "@/components/landing/Footer";

export const metadata: Metadata = {
  title: "Terms of Service — Neurus",
  description: "Terms governing your use of Neurus.",
};

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-black text-white">
      <Nav />
      <main className="mx-auto max-w-3xl px-6 pb-28 pt-32">
        <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-white/40">Legal</p>
        <h1 className="mt-3 text-4xl font-bold tracking-tight">Terms of Service</h1>
        <p className="mt-3 text-sm text-white/40">Last updated: June 2026</p>

        <div className="mt-12 space-y-10 text-[15px] leading-relaxed text-white/70">

          <section>
            <h2 className="mb-3 text-lg font-semibold text-white">1. Acceptance</h2>
            <p>
              By using Neurus (the "Service") you agree to these terms. If you do not agree, do not use the Service.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-lg font-semibold text-white">2. What Neurus is</h2>
            <p>
              Neurus is a memory layer that lets you store, recall, and query your own data across AI models. It uses Walrus for decentralised storage, Seal for encryption, and Sui for ownership. We do not own or control your memory — you do.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-lg font-semibold text-white">3. Your account</h2>
            <ul className="list-disc space-y-2 pl-5">
              <li>You may sign in with a Google account or a Sui wallet.</li>
              <li>You are responsible for keeping your credentials and wallet keys secure. We cannot recover lost private keys.</li>
              <li>You must be at least 13 years old to use the Service.</li>
            </ul>
          </section>

          <section>
            <h2 className="mb-3 text-lg font-semibold text-white">4. Your content</h2>
            <ul className="list-disc space-y-2 pl-5">
              <li>You own everything you store in Neurus. We do not claim any rights to your memory content.</li>
              <li>You are responsible for ensuring that what you store does not violate applicable laws or third-party rights.</li>
              <li>You must not use the Service to store or process illegal content, personal data of others without authorisation, or content that violates third-party intellectual property.</li>
            </ul>
          </section>

          <section>
            <h2 className="mb-3 text-lg font-semibold text-white">5. Acceptable use</h2>
            <p className="mb-3">You must not:</p>
            <ul className="list-disc space-y-2 pl-5">
              <li>Attempt to gain unauthorised access to other users' memory or the infrastructure.</li>
              <li>Use the Service to generate or store spam, malware, or harmful content.</li>
              <li>Reverse-engineer, scrape, or abuse the API at a rate that degrades service for others.</li>
              <li>Misrepresent your identity or impersonate another person.</li>
            </ul>
          </section>

          <section>
            <h2 className="mb-3 text-lg font-semibold text-white">6. Third-party services</h2>
            <p>
              The Service integrates with Google (sign-in, Calendar), Walrus, MemWal, Upstash, NVIDIA, and OpenRouter. Your use of those services is governed by their own terms. We are not responsible for their availability or actions.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-lg font-semibold text-white">7. Blockchain and decentralised storage</h2>
            <p>
              Data stored on Walrus and records on Sui are permanent and public by the nature of those networks. Once a blob is published on-chain it cannot be fully deleted. Understand this before storing sensitive information.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-lg font-semibold text-white">8. Service availability</h2>
            <p>
              We provide the Service on an "as is" and "as available" basis. We do not guarantee uptime, and we may modify or discontinue features at any time. We will try to give reasonable notice of significant changes.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-lg font-semibold text-white">9. Limitation of liability</h2>
            <p>
              To the fullest extent permitted by law, Neurus and its developers are not liable for any indirect, incidental, or consequential damages arising from your use of the Service, including loss of data or loss of access to on-chain assets.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-lg font-semibold text-white">10. Termination</h2>
            <p>
              We may suspend or terminate access to the Service if you violate these terms. You may stop using the Service at any time. Sections 4, 7, 9, and 11 survive termination.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-lg font-semibold text-white">11. Governing law</h2>
            <p>
              These terms are governed by the laws of India. Disputes shall be resolved in the courts of India.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-lg font-semibold text-white">12. Changes</h2>
            <p>
              We may update these terms. Continued use after the updated date constitutes acceptance. We will update the date above when changes are made.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-lg font-semibold text-white">13. Contact</h2>
            <p>
              Questions?{" "}
              <a href="mailto:daiwikvitthal@gmail.com" className="text-[#9aa8f0] hover:text-[#aeb9f4]">
                daiwikvitthal@gmail.com
              </a>
            </p>
          </section>

        </div>
      </main>
      <Footer />
    </div>
  );
}
