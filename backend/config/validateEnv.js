const REQUIRED_ENV_VARS = [
  'MONGO_URI',
  'JWT_SECRET',
  'RESEND_API_KEY',
  'ALLOWED_ORIGIN',
  'NODE_ENV',
  'FIREBASE_SERVICE_ACCOUNT_BASE64',
];

const validateEnv = () => {
  const missing = REQUIRED_ENV_VARS.filter((key) => !process.env[key]);

  if (missing.length > 0) {
    console.error('[ENV] Missing required environment variables:');
    missing.forEach((key) => console.error(`  - ${key}`));
    console.error('[ENV] Server will not start until all required variables are set.');
    process.exit(1);
  }

  if (process.env.JWT_SECRET === 'your-super-secret-key-change-this-in-production') {
    console.error('[ENV] JWT_SECRET is still set to the default placeholder. Change it before running.');
    process.exit(1);
  }

  console.log('[ENV] All environment variables validated.');
};

module.exports = validateEnv;