import type { Metadata } from "next";
import { Nav } from "@/components/landing/Nav";
import { Footer } from "@/components/landing/Footer";

export const metadata: Metadata = {
  title: "Privacy Policy — Neurus",
  description: "How Neurus collects, stores, and protects your data.",
};

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-black text-white">
      <Nav />
      <main className="mx-auto max-w-3xl px-6 pb-28 pt-32">
        <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-white/40">Legal</p>
        <h1 className="mt-3 text-4xl font-bold tracking-tight">Privacy Policy</h1>
        <p className="mt-3 text-sm text-white/40">Last updated: June 2026</p>

        <div className="mt-12 space-y-10 text-[15px] leading-relaxed text-white/70">

          <section>
            <h2 className="mb-3 text-lg font-semibold text-white">1. Who we are</h2>
            <p>
              Neurus is a memory layer for AI agents that lets you own, encrypt, and recall your data across models.
              This policy explains what data we handle and how.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-lg font-semibold text-white">2. Data you give us</h2>
            <ul className="list-disc space-y-2 pl-5">
              <li><span className="text-white/90">Account information</span> — your email address when you sign in with Google, or your Sui wallet address when you connect a wallet.</li>
              <li><span className="text-white/90">Memory content</span> — notes, files, and text you upload or write into your sets. This is the core of the product.</li>
              <li><span className="text-white/90">Calendar events</span> — only if you explicitly connect Google Calendar. We read and write events on your behalf with your permission.</li>
            </ul>
          </section>

          <section>
            <h2 className="mb-3 text-lg font-semibold text-white">3. Where your data lives</h2>
            <ul className="list-disc space-y-2 pl-5">
              <li><span className="text-white/90">Walrus</span> — memory bodies are stored as encrypted blobs on Walrus, a decentralised storage network. We do not operate the storage layer.</li>
              <li><span className="text-white/90">MemWal</span> — a vector index maintained by Mysten Labs that stores embeddings of your memory for semantic recall.</li>
              <li><span className="text-white/90">Upstash Redis</span> — a hot cache for session data, dataset metadata, and your encrypted credential vault.</li>
              <li><span className="text-white/90">Sui</span> — ownership records and access grants are anchored on the Sui blockchain. These are public by nature of the chain.</li>
            </ul>
          </section>

          <section>
            <h2 className="mb-3 text-lg font-semibold text-white">4. How we use your data</h2>
            <ul className="list-disc space-y-2 pl-5">
              <li>To provide memory recall, ask, and grounded answers — the core service.</li>
              <li>To authenticate you and route your requests to your own memory namespace.</li>
              <li>To read and write Google Calendar events when you use the calendar sync feature.</li>
              <li>We do not sell your data. We do not use your memory content to train models.</li>
            </ul>
          </section>

          <section>
            <h2 className="mb-3 text-lg font-semibold text-white">5. Third-party services</h2>
            <p className="mb-3">We send data to the following services to operate the product:</p>
            <ul className="list-disc space-y-2 pl-5">
              <li><span className="text-white/90">Google OAuth / Calendar API</span> — for sign-in and calendar access.</li>
              <li><span className="text-white/90">NVIDIA NIM / OpenRouter</span> — your memory content (retrieved excerpts only, not the full set) is sent to a language model to compose answers. No memory is stored by the model provider beyond the request.</li>
              <li><span className="text-white/90">Walrus / MemWal / Upstash</span> — storage and caching as described above.</li>
            </ul>
          </section>

          <section>
            <h2 className="mb-3 text-lg font-semibold text-white">6. Your rights</h2>
            <ul className="list-disc space-y-2 pl-5">
              <li><span className="text-white/90">Delete</span> — you can forget individual neurons or delete entire datasets from the dashboard at any time.</li>
              <li><span className="text-white/90">Export</span> — you can publish your memory set as a Walrus blob and download it.</li>
              <li><span className="text-white/90">Revoke access</span> — disconnect Google Calendar or your wallet from the profile settings at any time.</li>
              <li><span className="text-white/90">Account deletion</span> — email us and we will remove your session data and vault credentials from our cache. On-chain records on Walrus and Sui are permanent by the nature of those networks.</li>
            </ul>
          </section>

          <section>
            <h2 className="mb-3 text-lg font-semibold text-white">7. Security</h2>
            <p>
              Memory bodies are Seal-encrypted at rest on Walrus. Your per-user credential vault is encrypted with AES-256-GCM under a server key. We use HTTPS for all data in transit. No system is perfectly secure — if you discover a vulnerability, please email us.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-lg font-semibold text-white">8. Children</h2>
            <p>Neurus is not intended for anyone under 13. We do not knowingly collect data from children.</p>
          </section>

          <section>
            <h2 className="mb-3 text-lg font-semibold text-white">9. Changes</h2>
            <p>We may update this policy. If changes are material we will update the date above and, where possible, notify you via the dashboard.</p>
          </section>

          <section>
            <h2 className="mb-3 text-lg font-semibold text-white">10. Contact</h2>
            <p>
              Questions? Email{" "}
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
