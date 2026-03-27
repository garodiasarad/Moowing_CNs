const { getSessionFromRequest } = require("./_lib/session");
const { supabaseAdmin } = require("./_lib/supabaseAdmin");

function json(res, status, payload) {
  res.status(status).setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(payload));
}

module.exports = async function handler(req, res) {
  if (req.method !== "GET") {
    return json(res, 405, { error: "Method not allowed" });
  }

  try {
    const session = getSessionFromRequest(req);
    if (!session?.email) {
      return json(res, 401, { error: "Not authenticated" });
    }

    const { data: profile, error } = await supabaseAdmin
      .from("profiles")
      .select("*")
      .eq("email", session.email)
      .maybeSingle();

    if (error) {
      return json(res, 500, { error: error.message });
    }

    if (!profile || !profile.active) {
      return json(res, 403, { error: "User not active" });
    }

    return json(res, 200, {
      ok: true,
      user: {
        id: profile.id,
        email: profile.email,
        full_name: profile.full_name || profile.email,
        role: profile.role || "maker"
      }
    });
  } catch (err) {
    return json(res, 500, { error: err.message || "Unexpected error" });
  }
};
