#!/usr/bin/env node

require('dotenv').config({ quiet: true });

const mongoose = require('mongoose');

const TRIAL_DAYS = 30;
const DAY_IN_MS = 24 * 60 * 60 * 1000;
const dryRun = process.argv.includes('--dry-run');

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error('MONGODB_URI is not defined in the environment.');
  }

  await mongoose.connect(uri);
  const collection = mongoose.connection.db.collection('organizations');
  const now = new Date();
  const cursor = collection.find({
    plan: 'trial',
    trialEndsAt: { $gt: now },
  }).project({ createdAt: 1, trialEndsAt: 1 });
  const updates = [];
  let skippedMissingDates = 0;

  for await (const organization of cursor) {
    if (!(organization.createdAt instanceof Date) || !(organization.trialEndsAt instanceof Date)) {
      skippedMissingDates += 1;
      continue;
    }

    const targetTrialEnd = new Date(organization.createdAt.getTime() + TRIAL_DAYS * DAY_IN_MS);
    if (targetTrialEnd <= organization.trialEndsAt) {
      continue;
    }

    updates.push({
      updateOne: {
        filter: {
          _id: organization._id,
          plan: 'trial',
          trialEndsAt: { $gt: now, $eq: organization.trialEndsAt },
        },
        update: { $set: { trialEndsAt: targetTrialEnd } },
      },
    });
  }

  if (dryRun) {
    console.log(
      `Dry run: ${updates.length} active trial(s) would be extended to 30 days; ${skippedMissingDates} skipped due to missing dates.`
    );
    return;
  }

  const result = updates.length > 0
    ? await collection.bulkWrite(updates, { ordered: false })
    : null;
  console.log(
    `Updated ${result?.modifiedCount ?? 0} active trial(s) to 30 days; ${skippedMissingDates} skipped due to missing dates. Expired trials were not changed.`
  );
}

main()
  .catch((error) => {
    console.error('Trial duration migration failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect().catch((error) => {
      console.error('Failed to disconnect from MongoDB:', error);
      process.exitCode = 1;
    });
  });
