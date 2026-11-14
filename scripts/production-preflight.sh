#!/usr/bin/env bash
set -e

echo "==> Production preflight"

if ! node <<'NODE'
const fs = require('fs');

const env = { ...process.env };

for (const file of ['.env.local', '.env']) {
  if (!fs.existsSync(file)) continue;
  const raw = fs.readFileSync(file, 'utf8');
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const idx = line.indexOf('=');
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    if (!key) continue;
    const value = line.slice(idx + 1).trim();
    if (!env[key]) {
      env[key] = value.replace(/^['"]|['"]$/g, '');
    }
  }
}

const usingNewPlanNames = Boolean(
  env.RAZORPAY_PLAN_BUSINESS_PLUS_MONTHLY ||
    env.RAZORPAY_PLAN_BUSINESS_PLUS_ANNUALLY ||
  env.RAZORPAY_PLAN_BUSINESS_PREMIUM_MONTHLY || env.RAZORPAY_PLAN_BUSINESS_PREMIUM_ANNUALLY
);

const required = [
  'MONGODB_URI',
  'JWT_SECRET',
  'NEXTAUTH_SECRET',
  'NEXTAUTH_URL',
  'NEXT_PUBLIC_BASE_URL',
  'STORAGE_PROVIDER',
  'SMTP_HOST',
  'SMTP_PORT',
  'SMTP_USER',
  'SMTP_PASS',
  'SMTP_FROM',
  'CONTACT_EMAIL',
  'SALES_EMAIL',
  'PRESS_EMAIL',
  'CRON_SECRET',
  'ADMIN_BOOTSTRAP_TOKEN',
  'AUDIT_LOG_HASH_PEPPER',
  'SIGNING_TOKEN_ENCRYPTION_KEY',
  'SUPPORT_SSO_SECRET',
  // India domestic billing via Razorpay (INR)
  'RAZORPAY_KEY_ID',
  'RAZORPAY_KEY_SECRET',
  'RAZORPAY_WEBHOOK_SECRET',
  ...(usingNewPlanNames
    ? [
        'RAZORPAY_PLAN_BUSINESS_MONTHLY',
        'RAZORPAY_PLAN_BUSINESS_ANNUALLY',
        ...(env.RAZORPAY_PLAN_BUSINESS_PLUS_MONTHLY || env.RAZORPAY_PLAN_BUSINESS_PLUS_ANNUALLY
          ? [
              'RAZORPAY_PLAN_BUSINESS_PLUS_MONTHLY',
              'RAZORPAY_PLAN_BUSINESS_PLUS_ANNUALLY',
            ]
          : [
              'RAZORPAY_PLAN_BUSINESS_PREMIUM_MONTHLY',
              'RAZORPAY_PLAN_BUSINESS_PREMIUM_ANNUALLY',
            ]),
        'RAZORPAY_PLAN_ENTERPRISE_MONTHLY',
        'RAZORPAY_PLAN_ENTERPRISE_ANNUALLY',
      ]
    : [
        'RAZORPAY_PLAN_GROWTH_MONTHLY',
        'RAZORPAY_PLAN_GROWTH_ANNUALLY',
        'RAZORPAY_PLAN_BUSINESS_MONTHLY',
        'RAZORPAY_PLAN_BUSINESS_ANNUALLY',
        'RAZORPAY_PLAN_ENTERPRISE_MONTHLY',
        'RAZORPAY_PLAN_ENTERPRISE_ANNUALLY',
      ]),
  // International billing via PayPal (USD)
  'PAYPAL_ENVIRONMENT',
  'PAYPAL_CLIENT_ID',
  'PAYPAL_CLIENT_SECRET',
  'PAYPAL_WEBHOOK_ID',
];

const rawStorageProvider = String(env.STORAGE_PROVIDER || '').trim().toLowerCase();
if (rawStorageProvider && rawStorageProvider !== 's3' && rawStorageProvider !== 'r2') {
  console.log('Invalid env var: STORAGE_PROVIDER must be either "s3" or "r2".');
  process.exit(1);
}
const storageProvider = rawStorageProvider || 's3';

const storageRequired =
  storageProvider === 'r2'
    ? [
        'R2_ACCESS_KEY_ID',
        'R2_SECRET_ACCESS_KEY',
        ...(env.R2_ENDPOINT || env.R2_ACCOUNT_ID ? [] : ['R2_ENDPOINT or R2_ACCOUNT_ID']),
        ...(env.R2_BUCKET_NAME || env.S3_BUCKET_NAME ? [] : ['R2_BUCKET_NAME or S3_BUCKET_NAME']),
      ]
    : [
        'ACCESS_AWS_KEY_ID',
        'SECRET_AWS_ACCESS_KEY',
        'REGION_AWS',
        'S3_BUCKET_NAME',
      ];

    const isVercelDeployment = Boolean(env.VERCEL || env.VERCEL_ENV);
    if (!isVercelDeployment && !env.TRUSTED_PROXY_IP_HEADER) {
      required.push('TRUSTED_PROXY_IP_HEADER (self-hosted production)');
    }

    if (
      env.TRUSTED_PROXY_IP_HEADER &&
      !/^[a-z0-9-]+$/i.test(String(env.TRUSTED_PROXY_IP_HEADER).trim())
    ) {
      console.log('Invalid env var: TRUSTED_PROXY_IP_HEADER must be an HTTP header name.');
      process.exit(1);
    }

const missing = [];
for (const key of required) {
  if (!env[key]) missing.push(key);
}
for (const key of storageRequired) {
  if (key.includes(' or ')) {
    missing.push(key);
    continue;
  }
  if (!env[key]) missing.push(key);
}

for (const key of [...missing]) {
  if (key === 'R2_ENDPOINT or R2_ACCOUNT_ID' && (env.R2_ENDPOINT || env.R2_ACCOUNT_ID)) {
    missing.splice(missing.indexOf(key), 1);
  }
  if (key === 'R2_BUCKET_NAME or S3_BUCKET_NAME' && (env.R2_BUCKET_NAME || env.S3_BUCKET_NAME)) {
    missing.splice(missing.indexOf(key), 1);
  }
}

const optionalProviderGroups = [
  {
    label: 'Google Drive cloud export',
    keys: ['GOOGLE_DRIVE_CLIENT_ID', 'GOOGLE_DRIVE_CLIENT_SECRET'],
  },
  {
    label: 'Dropbox cloud export',
    keys: ['DROPBOX_CLIENT_ID', 'DROPBOX_CLIENT_SECRET'],
  },
];

const enabledProviderGroups = optionalProviderGroups.filter((group) =>
  group.keys.some((key) => Boolean(env[key]))
);

for (const group of enabledProviderGroups) {
  for (const key of group.keys) {
    if (!env[key]) {
      missing.push(key);
    }
  }
}

if (enabledProviderGroups.length > 0 && !env.CLOUD_CONNECTIONS_ENCRYPTION_KEY) {
  missing.push('CLOUD_CONNECTIONS_ENCRYPTION_KEY');
}

if (missing.length > 0) {
  for (const key of missing) {
    console.log(`Missing env var: ${key}`);
  }
  console.log('One or more required env vars are missing.');
  process.exit(1);
}

const signingEncryptionKey = String(env.SIGNING_TOKEN_ENCRYPTION_KEY || '').trim()
  .replace(/^['"]|['"]$/g, '');
const signingKeyIsHex = /^[0-9a-fA-F]{64}$/.test(signingEncryptionKey);
const signingKeyIsBase64 = /^[A-Za-z0-9+/]+={0,2}$/.test(signingEncryptionKey)
  && signingEncryptionKey.length % 4 === 0
  && Buffer.from(signingEncryptionKey, 'base64').length === 32;
if (!signingKeyIsHex && !signingKeyIsBase64 && Buffer.byteLength(signingEncryptionKey, 'utf8') !== 32) {
  console.log('Invalid env var: SIGNING_TOKEN_ENCRYPTION_KEY must be 32 bytes (hex/base64/plain).');
  process.exit(1);
}

const paypalEnvironment = String(env.PAYPAL_ENVIRONMENT || '').trim().toLowerCase();
if (paypalEnvironment !== 'sandbox' && paypalEnvironment !== 'live') {
  console.log('Invalid env var: PAYPAL_ENVIRONMENT must be either "sandbox" or "live".');
  process.exit(1);
}

if (
  String(env.PAYPAL_CLIENT_ID || '').trim() &&
  String(env.PAYPAL_CLIENT_SECRET || '').trim() &&
  String(env.PAYPAL_CLIENT_ID || '').trim() === String(env.PAYPAL_CLIENT_SECRET || '').trim()
) {
  console.log(
    'Invalid env vars: PAYPAL_CLIENT_SECRET must be the secret from your PayPal app and cannot match PAYPAL_CLIENT_ID.'
  );
  process.exit(1);
}

const paypalPlaceholderValues = [
  env.PAYPAL_CLIENT_ID,
  env.PAYPAL_CLIENT_SECRET,
  env.PAYPAL_WEBHOOK_ID,
].filter(Boolean);

const usingPayPalPlaceholders =
  paypalEnvironment === 'sandbox' ||
  paypalPlaceholderValues.some((value) => /dummy|sandbox/i.test(String(value)));

console.log('Billing providers: India -> Razorpay (INR), International -> PayPal (USD)');
console.log(`Storage provider: ${storageProvider}`);
console.log('Razorpay domestic subscriptions and PayPal advanced card checkout with vaulted renewals are configured for this release.');
if (usingPayPalPlaceholders) {
  console.log(
    'Warning: PayPal is configured with sandbox or dummy placeholder values. Replace them before accepting live international payments.'
  );
}
console.log(`Plan env naming mode: ${usingNewPlanNames ? 'business/business-plus/enterprise' : 'growth/business/enterprise (legacy)'}`);
if (enabledProviderGroups.length > 0) {
  console.log(`Cloud export providers enabled: ${enabledProviderGroups.map((group) => group.label).join(', ')}`);
} else {
  console.log('Cloud export providers enabled: none (third-party cloud exports will stay unavailable until configured).');
}
NODE
then
  exit 1
fi

if [[ "${SKIP_TESTS}" != "1" ]]; then
  echo "==> Running unit tests"
  npm run test:unit
fi

if [[ "${SKIP_INTEGRATION}" != "1" ]]; then
  echo "==> Running integration tests"
  npm run test:integration
fi

echo "==> Running production build"
npm run build

if [[ "${SKIP_E2E}" != "1" ]]; then
  echo "==> Running E2E tests"
  npm run test:e2e:run
fi

echo "==> Preflight complete"
