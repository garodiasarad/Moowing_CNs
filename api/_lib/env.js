function required(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

module.exports = {
  SUPABASE_URL: required("SUPABASE_URL"),
  SUPABASE_SERVICE_ROLE_KEY: required("SUPABASE_SERVICE_ROLE_KEY"),
  APP_SESSION_SECRET: required("APP_SESSION_SECRET"),
  OTP_TTL_MINUTES: Number(process.env.OTP_TTL_MINUTES || 10),
  COOKIE_NAME: process.env.COOKIE_NAME || "trade_offer_session"
};
