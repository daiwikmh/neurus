import Image from "next/image";
import { Container } from "./Container";
import { site } from "@/lib/site";

export function Footer() {
  return (
    <footer className="border-t border-white/10 px-6 py-16">
      <Container className="flex flex-col gap-10 px-0 sm:flex-row sm:items-start sm:justify-between">
        <Image src="/logo.png" alt="Neurus" width={36} height={36} />
        <div>
          <h4 className="text-sm font-medium text-white">Connect</h4>
          <ul className="mt-4 space-y-2.5">
            <li>
              <a
                href={site.x}
                target="_blank"
                rel="noreferrer"
                className="text-sm text-white/40 transition-colors hover:text-white/80"
              >
                X
              </a>
            </li>
            <li>
              <a href={`mailto:${site.contact}`} className="text-sm text-white/40 transition-colors hover:text-white/80">
                Contact
              </a>
            </li>
          </ul>
        </div>
      </Container>
      <Container className="mt-12 px-0">
        <div className="border-t border-white/5 pt-6 text-xs text-white/30">© {new Date().getFullYear()} Neurus.</div>
      </Container>
    </footer>
  );
}
