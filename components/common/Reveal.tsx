import { motion, useReducedMotion } from "motion/react";
import { ReactNode } from "react";

const revealEase = [0.22, 1, 0.36, 1] as const;
export default function Reveal({
  children,
  className,
  delay = 0,
  y = 24,
  amount = 0.2,
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
  y?: number;
  amount?: number;
}) {
  const reduceMotion = useReducedMotion();

  if (reduceMotion) {
    return <div className={className}>{children}</div>;
  }

  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount }}
      transition={{ duration: 0.65, delay, ease: revealEase }}
    >
      {children}
    </motion.div>
  );
}