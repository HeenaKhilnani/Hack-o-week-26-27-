/* ==========================================================================
   Hack-O-Week — Supabase client wrapper (js/supabase-client.js)
   --------------------------------------------------------------------------
   One small module used by every page. It:
     - validates that configuration exists (clear setup message, no spinner)
     - creates the browser Supabase client with the PUBLIC publishable key
     - adds timeouts so no request can hang forever
     - maps raw errors to messages a beginner can understand

   The browser client only ever uses the publishable (anon) key. Row Level
   Security in the database decides what each visitor is allowed to do.
   ========================================================================== */
(function () {
  "use strict";

  var CFG = window.HACK_CONFIG || {};
  var TIMEOUT_MS = 15000; // never let a request hang longer than 15 seconds

  var client = null;
  var clientError = null;

  /* ---------------------------------------------------------------- utils */

  function isConfigured() {
    var url = CFG.SUPABASE_URL;
    var key = CFG.SUPABASE_ANON_KEY;
    if (typeof url !== "string" || typeof key !== "string") return false;
    if (url.indexOf("YOUR_SUPABASE") !== -1 || key.indexOf("YOUR_SUPABASE") !== -1) return false;
    return /^https?:\/\/.+/.test(url) && key.length > 30;
  }

  function withTimeout(promise, ms, label) {
    ms = ms || TIMEOUT_MS;
    label = label || "Request";
    return new Promise(function (resolve, reject) {
      var settled = false;
      var timer = setTimeout(function () {
        if (settled) return;
        settled = true;
        reject(new Error(label + " timed out. Please check your internet connection and try again."));
      }, ms);
      promise.then(
        function (value) {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          resolve(value);
        },
        function (err) {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          reject(err);
        }
      );
    });
  }

  /* Maps raw Supabase/auth errors to safe, human-readable messages.
     Never includes tokens, keys or private participant data. */
  function friendlyError(err) {
    if (!err) return "Something went wrong. Please try again.";
    var msg = err.message || String(err);
    var code = err.code || err.error_code || "";

    if (/timed out/i.test(msg)) return msg;
    if (code === "invalid_credentials" || /Invalid login credentials/i.test(msg)) {
      return "Incorrect email or password. Please check your details and try again.";
    }
    if (code === "email_not_confirmed" || /Email not confirmed/i.test(msg)) {
      return "This administrator email has not been confirmed yet. Open the confirmation email from Supabase, or confirm the user in the Supabase dashboard.";
    }
    if (code === "user_already_exists" || /already been registered/i.test(msg)) {
      return "An account with this email already exists.";
    }
    if (/Failed to fetch|NetworkError|network/i.test(msg)) {
      return "Could not reach the server. Check your internet connection and try again.";
    }
    if (code === "23505" || /duplicate key|unique constraint/i.test(msg)) {
      return "A registration with this email address already exists. Use a different email or contact the organisers to update your entry.";
    }
    if (code === "42501" || /permission denied|row-level security/i.test(msg)) {
      return "You do not have permission to perform this action.";
    }
    if (code === "PGRST301" || /JWT|token expired/i.test(msg)) {
      return "Your session has expired. Please sign in again.";
    }
    if (code === "PGRST116") {
      return "No matching record was found.";
    }
    // Never let a credential or key reach the screen.
    if (/sb_publishable_|sb_secret_|service_role|eyJ[A-Za-z0-9_-]{20,}/.test(msg)) {
      console.error("[HackOWeek] suppressed unsafe error detail:", err.name);
      return "A configuration error occurred. Check js/config.js against the README.";
    }
    return msg.length > 240 ? msg.slice(0, 240) + "…" : msg;
  }

  /* ------------------------------------------------------------- client */

  function getClient() {
    if (clientError) throw clientError;
    if (client) return client;

    if (!isConfigured()) {
      clientError = new Error(
        "Supabase is not configured yet. Open js/config.js and add your Project URL and Publishable key (see README, step 5)."
      );
      clientError.isConfigError = true;
      throw clientError;
    }
    if (typeof window.supabase === "undefined" || typeof window.supabase.createClient !== "function") {
      clientError = new Error(
        "The Supabase library failed to load from the CDN. Check your internet connection and reload the page."
      );
      throw clientError;
    }
    client = window.supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_ANON_KEY, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false,
        storageKey: "hackoweek-admin-session" // isolated from any other project
      }
    });
    return client;
  }

  /* ------------------------------------------------------- setup notice */

  /* Renders a clear setup message instead of a blank page or endless spinner. */
  function setupNoticeHTML() {
    return (
      '<div class="state-note state-note--info" role="status">' +
      '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg>' +
      "<div><strong>Setup in progress.</strong> This page shows a preview because Supabase is not connected yet. " +
      "Create your Supabase project, run <code>supabase/schema.sql</code>, then add your Project URL and Publishable key " +
      "to <code>js/config.js</code> to load live events and accept registrations. See README steps 5–8.</div></div>"
    );
  }

  function mountSetupNotice() {
    var host = document.querySelector("[data-setup-notice]");
    if (host && !isConfigured()) host.innerHTML = setupNoticeHTML();
  }

  /* --------------------------------------------------------------- API */

  function fetchPublishedEvents() {
    var supabase = getClient();
    return withTimeout(
      supabase
        .from("events")
        .select("*")
        .eq("is_published", true)
        .eq("is_archived", false)
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: true }),
      TIMEOUT_MS,
      "Loading events"
    ).then(function (res) {
      if (res.error) throw res.error;
      return res.data || [];
    });
  }

  /* Atomic registration submit — implemented as a Postgres function so the
     registration and its event links are saved together, validated server-side. */
  function submitRegistration(payload) {
    var supabase = getClient();
    return withTimeout(
      supabase.rpc("submit_registration", { payload: payload }),
      TIMEOUT_MS,
      "Submitting your registration"
    ).then(function (res) {
      if (res.error) throw res.error;
      return res.data;
    });
  }

  /* ------------------------------------------------------------ auth API */

  function getSession() {
    return withTimeout(getClient().auth.getSession(), TIMEOUT_MS, "Checking your session");
  }

  function signInWithPassword(email, password) {
    return withTimeout(
      getClient().auth.signInWithPassword({ email: email, password: password }),
      TIMEOUT_MS,
      "Signing in"
    );
  }

  function signOut() {
    return withTimeout(getClient().auth.signOut(), TIMEOUT_MS, "Signing out");
  }

  /* Independently verifies that the signed-in user is an authorised admin.
     The database's Row Level Security enforces this server-side too: a normal
     participant gets zero rows back here even if they reach this page. */
  function fetchAdminProfile(userId) {
    return withTimeout(
      getClient().from("profiles").select("user_id, role, created_at").eq("user_id", userId).maybeSingle(),
      TIMEOUT_MS,
      "Checking administrator access"
    ).then(function (res) {
      if (res.error) throw res.error;
      return res.data; // null when the user is NOT an administrator
    });
  }

  function onAuthStateChange(callback) {
    try {
      return getClient().auth.onAuthStateChange(function (event, session) {
        callback(event, session);
      });
    } catch (e) {
      return { data: { subscription: null } };
    }
  }

  /* ------------------------------------------------------------- export */

  window.HackDB = {
    config: CFG,
    isConfigured: isConfigured,
    getClient: getClient,
    withTimeout: withTimeout,
    friendlyError: friendlyError,
    setupNoticeHTML: setupNoticeHTML,
    mountSetupNotice: mountSetupNotice,
    fetchPublishedEvents: fetchPublishedEvents,
    submitRegistration: submitRegistration,
    getSession: getSession,
    signInWithPassword: signInWithPassword,
    signOut: signOut,
    fetchAdminProfile: fetchAdminProfile,
    onAuthStateChange: onAuthStateChange
  };
})();
