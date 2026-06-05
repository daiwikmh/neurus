import { Nav } from "@/components/landing/Nav";
import { Hero } from "@/components/landing/Hero";
import { PlatformShowcase } from "@/components/landing/PlatformShowcase";
import { FeatureCarousel } from "@/components/landing/FeatureCarousel";
import { Security } from "@/components/landing/Security";
import { TrustedBy } from "@/components/landing/TrustedBy";
import { DeployAgents } from "@/components/landing/DeployAgents";
import { Footer } from "@/components/landing/Footer";

export default function Home() {
  return (
    <div className="min-h-screen bg-black text-white">
      <Nav />
      <Hero />
      <PlatformShowcase />
      <FeatureCarousel />
      <Security />
      <TrustedBy />
      <DeployAgents />
      <Footer />
    </div>
  );
}
