import { ArrowRight, Sparkles } from "lucide-react";
import Reveal from "./Reveal";
import { Badge, Button } from "@ui";
import Link from "next/link";
import useContextStore from "@/hooks/useContextStore";
{/* ═══════════════════════════════════════════════════════
    FOOTER CTA
═══════════════════════════════════════════════════════ */}
const FooterCTA = () => {

    const { user } = useContextStore();
    const primaryHref = user ? '/dashboard' : '/register';
    const primaryLabel = user ? 'Go to Dashboard' : 'Start Signing';


  return (
     <section className="py-20 sidebar-gradient relative overflow-hidden">
        <div className="absolute inset-0">
          <div
            className="absolute top-0 left-1/2 h-full -translate-x-1/2 rounded-full opacity-15"
            style={{
              width: 'min(800px, calc(100vw - 2rem))',
              background:
                "radial-gradient(circle, oklch(0.54 0.22 264) 0%, transparent 70%)",
            }}
          />
        </div>
        <div className="relative max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <Reveal>
           <Badge  className="border-white/10 bg-white/5 !text-brand-200">
              <Sparkles className="h-4 w-4" />
              Ready to move faster
            </Badge>
            <h2 className="text-3xl sm:text-5xl font-bold text-white mt-6 mb-4 leading-tight">
              Ready to go paperless without losing control of the record?
            </h2>
            <p className="text-xl text-white/60 mb-10 max-w-xl mx-auto">
              Start signing documents in minutes with approval flows, audit-ready records,
              and workspace controls for growing teams.
            </p>
            <div className="mt-8 flex flex-col items-center justify-center gap-4 sm:flex-row">
              <Button asChild variant="brand" size="lg">
                <Link href={primaryHref}>
                  {primaryLabel}
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
              <Button
                variant="inverse"
                size="lg"
               >
                <Link href='/#how-it-works'>
                 Watch Demo
                </Link>
              </Button>
            </div>
          </Reveal>
        </div>
      </section>
  )
};

export default FooterCTA;
