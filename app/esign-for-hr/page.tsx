import UseCaseLandingPage from '@/components/marketing/UseCaseLandingPage';

export default function EsignForHrPage() {
  return (
    <UseCaseLandingPage
      eyebrow="eSignature for HR"
      title="HR document signing with approvals, visibility, and cleaner employee records."
      description="SignWorkflow helps HR teams move offer letters, onboarding forms, policy acknowledgements, and employee documents through AI-assisted review, signature, and storage without relying on scattered email threads."
      primaryLabel="Start HR Workflow"
      ocidPrefix="hr_landing"
      painTitle="Common HR signing problems"
      painPoints={[
        'Offer letters need approval before they reach a candidate.',
        'Employees and candidates may need plain-language summaries or translations before signing.',
        'Policy acknowledgements are hard to track across teams or locations.',
        'Completed employee documents end up in inboxes, drives, and personal folders.',
        'Managers need visibility without giving everyone full document access.',
      ]}
      outcomes={[
        {
          title: 'Clarify before signature',
          description: 'Use AI summaries, translation, and clause explanations to help HR documents become easier to review before they are signed.',
        },
        {
          title: 'Approve before sending',
          description: 'Route sensitive HR documents to the right reviewer before asking an employee or candidate to sign.',
        },
        {
          title: 'Track employee documents',
          description: 'Keep signing progress, ownership, and completed records easier for HR admins to review.',
        },
      ]}
      steps={[
        {
          title: 'Prepare the HR document',
          description: 'Upload an offer letter, policy acknowledgement, employee form, or onboarding document and place the required fields.',
        },
        {
          title: 'Review with AI',
          description: 'Summarize long policies, translate selected text, and explain dense clauses before the document goes out.',
        },
        {
          title: 'Send for review and signature',
          description: 'Use a controlled workflow so internal approvals and external signatures stay part of one process.',
        },
      ]}
      proofTitle="A better fit than one-off signature links"
      proofItems={[
        'Useful for offer letters, onboarding documents, NDAs, policy acknowledgements, and employee authorizations.',
        'AI review helps summarize policies, translate selected text, and explain clauses before employees sign.',
        'Helps HR teams reduce manual follow-up when documents are waiting on reviewers or signers.',
        'Keeps document ownership clearer when HR, managers, and candidates are all involved.',
        'Creates a repeatable process for documents your team sends every week or month.',
      ]}
      finalTitle="Start with one HR document your team sends repeatedly."
      finalDescription="Pick an offer letter, onboarding form, NDA, or policy acknowledgement. SignWorkflow is easiest to evaluate when it improves a workflow HR already runs often."
    />
  );
}
