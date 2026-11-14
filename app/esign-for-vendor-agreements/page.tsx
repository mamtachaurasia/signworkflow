import UseCaseLandingPage from '@/components/marketing/UseCaseLandingPage';

export default function EsignForVendorAgreementsPage() {
  return (
    <UseCaseLandingPage
      eyebrow="Vendor agreement signing"
      title="Move vendor agreements from internal approval to signed record without losing control."
      description="SignWorkflow helps finance, legal, and operations teams manage vendor contracts, service agreements, purchase approvals, and authorizations with AI-assisted review before signature and visibility after completion."
      primaryLabel="Start Vendor Workflow"
      ocidPrefix="vendor_landing"
      painTitle="Where vendor agreements get messy"
      painPoints={[
        'Finance, legal, and operations all need input before the agreement is sent.',
        'Dense vendor clauses, renewal terms, and risk points take time to understand before approval.',
        'Approvals happen outside the signing tool, so the final record lacks context.',
        'Teams lose track of which vendor agreements are waiting, signed, or ready to archive.',
        'Completed contracts need to be easy to find when renewals, audits, or disputes come up.',
      ]}
      outcomes={[
        {
          title: 'Review before signature',
          description: 'Use AI summaries, clause explanations, translation, and risk analysis before the vendor receives the agreement.',
        },
        {
          title: 'Track every agreement',
          description: 'Give teams a clearer view of status, ownership, and signer progress from one workspace.',
        },
        {
          title: 'Keep records explainable',
          description: 'Preserve completed files with activity and audit context for future review.',
        },
      ]}
      steps={[
        {
          title: 'Upload the agreement',
          description: 'Prepare vendor contracts, service agreements, purchase documents, or authorization forms.',
        },
        {
          title: 'Analyze key terms',
          description: 'Summarize the agreement, explain clauses, translate selected text, and surface risk points before approval.',
        },
        {
          title: 'Route it through your team',
          description: 'Send documents through reviewers and approvers before collecting vendor signatures.',
        },
      ]}
      proofTitle="Built for documents that involve more than one team"
      proofItems={[
        'Useful for vendor onboarding, service agreements, purchase approvals, and contract renewals.',
        'AI-assisted review helps teams spot obligations, unclear wording, and risk areas before sending.',
        'Helps teams reduce side-channel approvals that happen in chat or email.',
        'Supports clearer ownership when finance, legal, operations, and vendors are involved.',
        'Makes the signed record easier to review after the workflow is complete.',
      ]}
      finalTitle="Start with the vendor document that causes the most follow-up."
      finalDescription="Use SignWorkflow for one recurring vendor agreement first. If it reduces review confusion and manual tracking, you have a strong reason to expand it across more agreements."
    />
  );
}
