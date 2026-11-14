import UseCaseLandingPage from '@/components/marketing/UseCaseLandingPage';

export default function DocusignAlternativeIndiaPage() {
  return (
    <UseCaseLandingPage
      eyebrow="eSignature alternative"
      title="A practical DocuSign alternative for teams that need more than a signature link."
      description="If your team is comparing eSignature tools, SignWorkflow gives you a workflow-first option for approvals, signing, team access, audit visibility, and completed document records."
      primaryLabel="Try SignWorkflow"
      ocidPrefix="india_alt_landing"
      painTitle="What teams often need beyond basic signing"
      painPoints={[
        'Documents often need internal approval before they are sent to customers, vendors, or employees.',
        'Small teams need simple pricing and workflows without feeling forced into a heavy enterprise rollout.',
        'Completed contracts, HR documents, and vendor agreements need to remain easy to find later.',
        'Teams want a signing tool that fits everyday business workflows, not just one-off signature requests.',
      ]}
      outcomes={[
        {
          title: 'Workflow-first signing',
          description: 'Manage approvals, signatures, and completed records in the same product experience.',
        },
        {
          title: 'Useful for SMEs',
          description: 'A focused option for agencies, HR teams, finance teams, consultants, and growing businesses.',
        },
        {
          title: 'Designed for team control',
          description: 'Use shared workspaces, role-aware access, and audit context to keep document work organized.',
        },
      ]}
      steps={[
        {
          title: 'Choose one recurring workflow',
          description: 'Start with offer letters, client contracts, vendor agreements, NDAs, or policy acknowledgements.',
        },
        {
          title: 'Add reviewers and signers',
          description: 'Keep the approval path visible before the document goes out for signature.',
        },
        {
          title: 'Review the completed record',
          description: 'Keep the signed document and activity context easier to find when your team needs it again.',
        },
      ]}
      proofTitle="A focused option for growing businesses"
      proofItems={[
        'Good fit for teams that currently manage approvals in email, WhatsApp, chat, or spreadsheets.',
        'Supports use cases across HR, finance, legal, operations, agencies, and service businesses.',
        'Helps teams adopt signing around a real workflow instead of buying a generic tool and hoping people use it.',
        'Keeps the message clear: SignWorkflow is about document workflows, not only signatures.',
      ]}
      finalTitle="Try it on one document your team already sends often."
      finalDescription="The best way to evaluate SignWorkflow is with a real workflow: one approval path, one document type, and one team that wants less manual follow-up."
    />
  );
}
