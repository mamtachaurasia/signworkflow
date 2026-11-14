import Reveal from "../common/Reveal"

type Stat = {
  value: string;
  label: string;
  detail?: string;
};
const stats: Stat[] = [
  {
    value: '30-day',
    label: 'Guided trial workspace',
    detail: 'Move from evaluation to a live contract workspace without restarting the rollout conversation.',
  },
  {
    value: '4',
    label: 'AI document review modes',
    detail: 'Summaries, translation, clause explanations, and risk analysis.',
  },
  {
    value: '100+',
    label: 'Recipients in bulk send',
    detail: 'Useful when your team needs one workflow to reach many signers at once.',
  },
  {
    value: '2',
    label: 'Cloud providers support',
    detail: 'Business-plan users can export completed signed PDFs to Google Drive or Dropbox.',
  },
  {
    value: '2',
    label: 'Routing modes',
    detail: 'Show sequential and parallel approval patterns in the same walkthrough.',
  },
];

const Stats= (props: { stat?: Stat[] })=>{
    const {stat = stats} = props;
    return (
      <section className="bg-navy-dark border-y border-white/10">
      <div className="container py-6">
        <div className="flex min-w-0 flex-col gap-6 md:flex-row md:gap-0 md:divide-x md:divide-white/10">

          {stat.map((stat, index) => (
            <Reveal key={stat.label} delay={index * 0.08} className="min-w-0 text-center md:flex-1 md:px-4 lg:px-8">
              <p className="text-3xl sm:text-4xl font-bold text-white mb-1">
                {stat.value}
              </p>
              <p className="text-sm text-white/50 font-medium">
                {stat.label}
              </p>
               <p className="mt-3 text-sm leading-6 text-slate-300">
                {stat?.detail}
              </p>
            </Reveal>
          ))}

        </div>
      </div>
      </section>
    )
}

export default Stats;
