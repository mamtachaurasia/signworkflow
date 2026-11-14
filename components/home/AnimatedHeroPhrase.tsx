'use client';

import { useEffect, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';

/*const phrases = [
  'Lease Agreements',
  'Employee Onboarding',
  'Sales Contracts',
  'Legal Agreements',
  'Patient Consent Forms',
  'Vendor Agreements',
  'Purchase Approvals',
  'NDAs',
  'Policy Acknowledgements',
  'Client Agreements',
] as const;*/
const phrases=[
'Real Estate',
'Healthcare',
'Financial Services',
'Legal Services',
'Education',
'Professional Services',
'Technology & SaaS'
] as const

const rotationIntervalMs = 2800;

export default function AnimatedHeroPhrase() {
  const [phraseIndex, setPhraseIndex] = useState(0);
  const reduceMotion = useReducedMotion();
  const phrase = phrases[phraseIndex];

  useEffect(() => {
    if (reduceMotion) {
      return;
    }

    const intervalId = window.setInterval(() => {
      setPhraseIndex((currentIndex) => (currentIndex + 1) % phrases.length);
    }, rotationIntervalMs);

    return () => window.clearInterval(intervalId);
  }, [reduceMotion]);

  return (
    <span
      
      role="status"
      aria-live="polite"
      aria-atomic="true"
      aria-label={phrase}
    >
      <AnimatePresence initial={false} mode="wait">
        <motion.span
          key={phrase}
          aria-hidden="true"
          className="inline-block"
          initial={reduceMotion ? false : { opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={reduceMotion ? undefined : { opacity: 0, y: -12 }}
          transition={{ duration: 0.45, ease: 'easeOut' }}
        >
          {phrase}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}
