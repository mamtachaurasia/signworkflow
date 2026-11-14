#!/usr/bin/env node

/**
 * Backward-compatible entry point for deployments that previously seeded only
 * the professional Mutual NDA. New installations should use
 * `npm run seed:system-templates` to provision the complete catalog.
 */

const { systemTemplates } = require('./system-templates/catalog.cjs');
const { run } = require('./seed-system-templates.js');

const mutualNda = systemTemplates.find((template) => template.slug === 'professional-mutual-nda');

if (!mutualNda) {
  throw new Error('The professional Mutual NDA is missing from the system template catalog.');
}

run({ definitions: [mutualNda] }).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
