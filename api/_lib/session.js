const crypto = require("crypto");
const { APP_SESSION_SECRET, COOKIE_NAME } = require("./env");

function b64url(input) {
  return Buffer.from(input).toString("base64url");
}

function signPayload(payload) {
  const body = b64url(JSON.stringify(payload));
  const sig = crypto
    .createHmac("sha256", APP_SESSION_SECRET)
    .update(body)
    .digest("base64url");
  return `${body}.${sig}`;
}

function verifyToken(token) {
  if (!token || !token.includes(".")) return null;
  const [body, sig] = token.split(".");
  const expected = crypto
    .createHmac("sha256", APP_SESSION_SECRET)
    .update(body)
    .digest("base64url");

  if (sig !== expected) return null;

  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    if (!payload || !payload.email) return null;
    if (payload.exp && Date.now() > payload.exp) return null;
    return payload;
  } catch {
    return null;
  }
}

function parseCookies(req) {
  const raw = req.headers.cookie || "";
  const out = {};
  raw.split(";").forEach((part) => {
    const idx = part.indexOf("=");
    if (idx === -1) return;
    const key = part.slice(0, idx).trim();
    const value = part.slice(idx + 1).trim();
    out[key] = decodeURIComponent(value);
  });
  return out;
}

function getSessionFromRequest(req) {
  const cookies = parseCookies(req);
  const token = cookies[COOKIE_NAME];
  return verifyToken(token);
}

function buildSessionCookie(user) {
  const payload = {
    email: String(user.email || "").toLowerCase(),
    full_name: user.full_name || user.email || "",
    role: user.role || "maker",
    exp: Date.now() + 1000 * 60 * 60 * 24 * 7
  };

  const token = signPayload(payload);

  return `${COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Secure; Max-Age=604800`;
}

function clearSessionCookie() {
  return `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Secure; Max-Age=0`;
}

module.exports = {
  getSessionFromRequest,
  buildSessionCookie,
  clearSessionCookie
};
