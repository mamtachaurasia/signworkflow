import { Accordion, AccordionContent, AccordionItem, AccordionTrigger, Badge } from "@ui";
import Reveal from "./Reveal";

type Faq = {
  q: string;
  a: string;
};

export const faqs: Faq[] = [
  {
    q: "Are SignWorkflow e-signatures legally binding?",
    a: "Electronic signature validity depends on the laws, facts, consent language, signer identity process, and workflow requirements that apply to your transaction. SignWorkflow supports evidence-oriented signing flows with signer events, document history, completion records, and audit visibility, but teams should review their own legal requirements before relying on any specific legal claim.",
  },
  {
    q: "How does SHA-256 document verification work?",
    a: "When a document is uploaded or finalized, SignWorkflow can record a SHA-256 hash of the file contents. If the PDF changes later, the recomputed hash will no longer match the stored value, which gives reviewers a practical tamper-evidence check alongside the audit trail and signing history.",
  },
  {
    q: "Does SignWorkflow support the contract lifecycle?",
    a: "Yes. SignWorkflow brings contract preparation, AI review, approval routing, electronic signing, execution records, retention controls, and export into one workspace. Teams can also start amendment and renewal workflows from reusable templates while keeping the related records connected.",
  },
  {
    q: "Can I integrate SignWorkflow with my existing tools?",
    a: "SignWorkflow supports Google Drive and Dropbox export workflows, a public developer API with scoped API keys for document workflows, and signed outbound webhooks for supported lifecycle events. Embedded signing and CRM-specific native connectors are not currently provided.",
  },
  {
    q: "How is my data protected?",
    a: "The product includes authenticated routes, secure session handling, CSRF checks, role-aware workspace access, MFA-aware sensitive actions, audit logging, and document storage controls. Production security also depends on environment configuration, storage policies, email provider settings, and the access practices used by each workspace.",
  },
  {
    q: "What is bulk signing and how does it work?",
    a: "Bulk signing lets eligible workspaces send a reusable template to many recipients without rebuilding the same packet each time. Each recipient receives their own signing flow, while senders track status, completion, and follow-up from the workspace. Common use cases include NDAs, consent forms, policy acknowledgments, vendor forms, and employee onboarding.",
  },
  {
    q: "Is there a free plan and what does it include?",
    a: "SignWorkflow starts with a free trial workspace that includes Business Plus-style features during evaluation. Teams can then upgrade the same workspace into Business, Business Plus, or Enterprise when they are ready. Check the pricing page for the current packaging and rollout path.",
  },

  /*orginal */
  {
    q: 'Can I start from a template or upload my own document?',
    a:
      'Yes. SignWorkflow supports direct uploads and reusable template-driven starts, including system templates for common agreements and internal forms.',
  },
  {
    q: 'Does the platform support multi-step approvals?',
    a:
      'Yes. You can assign signer, approver, and viewer roles and choose sequential or parallel routing depending on how tightly controlled the workflow needs to be. That helps legal, HR, finance, and operations teams keep review steps separate from signature collection.',
  },
  {
    q: 'What happens after a document is completed?',
    a:
      'You can download the signed PDF, optionally attach completion evidence, keep it in the workspace archive, and export it to Google Drive or Dropbox when you choose. Completed records are designed to remain reviewable through document status, signer activity, version context, and audit-related metadata.',
  },
  {
    q: 'What do paid workspaces add over the trial?',
    a:
      'Business adds shared team operations and audit visibility, Business Plus adds multi-team administration with bulk send and retention controls, and Enterprise adds legal holds with audit export and verification.',
  },
  {
    q: 'Which teams are the best fit for SignWorkflow?',
    a:
      'SignWorkflow is best suited to B2B teams that need controlled document signing rather than one-off personal signatures. Legal teams use it for contracts and reviewable evidence, HR teams for onboarding and acknowledgments, finance teams for approvals and payment-assisted signing, and operations teams for repeatable vendor or internal workflows.',
  },
  {
    q: 'How does SignWorkflow support audits and retention?',
    a:
      'The workflow keeps signing events, document status changes, completion context, and governance metadata close to the signed record. Depending on the workspace plan, teams can use retention-aware controls, legal holds, audit exports, and verification flows to support later review.',
  },
  {
    q: 'Can completed documents be exported outside SignWorkflow?',
    a:
      'Yes. Completed signed PDFs can remain in the workspace archive and can also be exported to connected Google Drive or Dropbox accounts when a user chooses. This supports teams that need an internal system of record plus a controlled external copy.',
  },
];

interface FAQProps {
  faqs?: Faq[];
}

const FAQ = ({ faqs: faqsList = faqs }: FAQProps) => {
    return (
        <div id="faq" className="scroll-mt-24">
          <Reveal className="text-center mb-12">
            <Badge className="mb-4 bg-brand/10 text-brand border-brand/20 uppercase tracking-wider text-xs font-semibold">
              FAQ
            </Badge>
            <h2 className="text-3xl sm:text-4xl font-bold text-foreground mb-4">
              Frequently Asked Questions
            </h2>
            <p className="text-lg text-muted-foreground">
              Everything you need to know about SignWorkflow.
            </p>
          </Reveal>

          <Reveal>
            <Accordion type="single" collapsible className="space-y-3">
              {faqsList.map((faq, i) => (
                <AccordionItem
                  key={faq.q}
                  value={`faq-${i}`}
                  className="rounded-xl border border-slate-200 bg-white px-6 shadow-sm transition-colors data-[state=open]:border-brand/25"
                  data-ocid={`faq.item.${i + 1}`}
                >
                  <AccordionTrigger className="text-left font-semibold text-foreground py-5 hover:no-underline hover:text-brand">
                    {faq.q}
                  </AccordionTrigger>
                  <AccordionContent className="text-muted-foreground text-sm leading-relaxed pb-5">
                    {faq.a}
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </Reveal>
        </div>

    )
}
export default FAQ;
