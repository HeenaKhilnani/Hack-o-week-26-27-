/* ==========================================================================
   Hack-O-Week — administrator sign-in (js/admin-login.js)
   --------------------------------------------------------------------------
   Three separate, predictable steps (this ordering prevents the classic
   "stuck on Signing in…" deadlock):
     1. Restore any existing session      → getSession()
     2. Authenticate                      → signInWithPassword()
     3. Verify administrator authorisation→ profiles table (Row Level Security)

   The loading state is always reset in a `finally` block, every promise has a
   timeout, and authorisation FAILS CLOSED: any error means no dashboard.
   ========================================================================== */
(function () {
  "use strict";

  var DB = window.HackDB;

  var form = document.getElementById("loginForm");
  var loginBtn = document.getElementById("loginBtn");
  var loginLabel = document.getElementById("loginLabel");
  var loginSpinner = document.getElementById("loginSpinner");
  var alertBox = document.getElementById("loginAlert");
  var unauthorizedPanel = document.getElementById("unauthorizedPanel");
  var expiredPanel = document.getElementById("expiredPanel");

  var busy = false; // prevents duplicate submissions and double handlers

  /* ----------------------------------------------------------- helpers */

  function escapeHtml(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  function showAlert(message, type) {
    alertBox.className = "alert alert--" + (type || "error");
    alertBox.innerHTML =
      '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 8v5M12 16h.01"/></svg>' +
      "<span>" + escapeHtml(message) + "</span>";
  }

  function hideAlert() {
    alertBox.className = "alert alert--error hidden";
    alertBox.textContent = "";
  }

  function showError(fieldId, message) {
    var field = document.getElementById(fieldId);
    var error = document.getElementById(fieldId + "-error");
    if (field) {
      field.setAttribute("aria-invalid", "true");
      field.setAttribute("aria-describedby", fieldId + "-error");
    }
    if (error) {
      error.innerHTML =
        '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 8v5M12 16h.01"/></svg>' +
        "<span>" + escapeHtml(message) + "</span>";
      error.classList.add("is-visible");
    }
  }

  function clearError(fieldId) {
    var field = document.getElementById(fieldId);
    var error = document.getElementById(fieldId + "-error");
    if (field) field.removeAttribute("aria-invalid");
    if (error) {
      error.classList.remove("is-visible");
      error.textContent = "";
    }
  }

  function setLoading(loading) {
    busy = loading;
    loginBtn.disabled = loading;
    loginLabel.textContent = loading ? "Signing in…" : "Sign in";
    loginSpinner.classList.toggle("hidden", !loading);
    document.getElementById("email").disabled = loading;
    document.getElementById("password").disabled = loading;
  }

  function goToDashboard() {
    // Small delay so the browser starts the navigation from a clean state.
    window.location.replace("admin.html");
  }

  function showUnauthorized(reason) {
    if (reason) {
      document.getElementById("unauthorizedText").textContent = reason;
    }
    form.classList.add("hidden");
    hideAlert();
    unauthorizedPanel.classList.remove("hidden");
  }

  /* ------------------------------------------------- authorisation check */

  /* Returns a Promise<boolean>. Fails CLOSED: any error → false. */
  function verifyAdmin(user) {
    if (!user) return Promise.resolve(false);
    return DB.fetchAdminProfile(user.id)
      .then(function (profile) {
        return Boolean(profile && profile.role === "admin");
      })
      .catch(function (err) {
        console.error("[HackOWeek] admin verification failed:", err.code || "", err.message || err);
        showAlert(
          "Could not verify administrator access. " + DB.friendlyError(err) + " You have not been granted dashboard access.",
          "error"
        );
        return false;
      });
  }

  /* ---------------------------------------------------- session restore */

  function restoreSession() {
    DB.getSession()
      .then(function (res) {
        if (res.error) throw res.error;
        var session = res.data && res.data.session;
        if (!session || !session.user) return null; // signed out — show the form

        return verifyAdmin(session.user).then(function (isAdmin) {
          if (isAdmin) {
            goToDashboard();
            return null;
          }
          // A session exists but this user is not an administrator:
          // remove the session so it cannot be reused, then explain why.
          return DB.signOut()
            .catch(function () { /* reported by the screen below anyway */ })
            .then(function () { showUnauthorized(); });
        });
      })
      .catch(function (err) {
        // Never block the form because a session check failed.
        console.warn("[HackOWeek] session restore skipped:", err.message);
      });
  }

  /* --------------------------------------------------------- validation */

  var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

  function validate() {
    var errors = [];
    clearError("email");
    clearError("password");

    var email = document.getElementById("email").value.trim();
    var password = document.getElementById("password").value;

    if (!email) { showError("email", "Enter your administrator email."); errors.push("email"); }
    else if (!EMAIL_RE.test(email)) { showError("email", "Enter a valid email address."); errors.push("email"); }

    if (!password) { showError("password", "Enter your password."); errors.push("password"); }
    else if (password.length < 6) { showError("password", "Passwords are at least 6 characters."); errors.push("password"); }

    return errors;
  }

  ["email", "password"].forEach(function (id) {
    var el = document.getElementById(id);
    if (el) {
      el.addEventListener("input", function () { clearError(id); hideAlert(); });
    }
  });

  /* ------------------------------------------------------------- submit */

  function handleSubmit(e) {
    e.preventDefault();
    if (busy) return; // ignore double-clicks / repeated Enter presses

    hideAlert();
    var errors = validate();
    if (errors.length) {
      document.getElementById(errors[0]).focus();
      return;
    }

    if (!DB.isConfigured()) {
      showAlert("Supabase is not configured yet — add your keys to js/config.js first (README steps 5–8).", "warning");
      return;
    }

    var email = document.getElementById("email").value.trim();
    var password = document.getElementById("password").value;

    setLoading(true);

    DB.signInWithPassword(email, password)
      .then(function (res) {
        if (res.error) throw res.error;
        var user = res.data && res.data.user;
        if (!user) throw new Error("Sign-in returned no user. Please try again.");

        // Step 3 — verify authorisation independently of the login itself.
        return verifyAdmin(user).then(function (isAdmin) {
          if (isAdmin) {
            goToDashboard();
            return;
          }
          // Not an admin: remove the session so it cannot be reused.
          return DB.signOut()
            .catch(function () { /* reported below either way */ })
            .then(function () {
              showUnauthorized(
                "This account signed in successfully but is not an authorised Hack-O-Week administrator. " +
                "The organising committee must add your account as an admin in Supabase (see README step 8)."
              );
            });
        });
      })
      .catch(function (err) {
        console.error("[HackOWeek] sign-in failed:", err.code || "", err.message || err);
        showAlert(DB.friendlyError(err), "error");
        document.getElementById("password").value = "";
        document.getElementById("password").focus();
      })
      .finally(function () {
        // ALWAYS reset the loading state — success, failure or timeout.
        setLoading(false);
      });
  }

  if (form) form.addEventListener("submit", handleSubmit);

  /* ------------------------------------------------------- extra controls */

  var pwToggle = document.getElementById("pwToggle");
  if (pwToggle) {
    pwToggle.addEventListener("click", function () {
      var input = document.getElementById("password");
      var showing = input.type === "text";
      input.type = showing ? "password" : "text";
      pwToggle.textContent = showing ? "Show" : "Hide";
      pwToggle.setAttribute("aria-pressed", String(!showing));
      input.focus();
    });
  }

  var unauthBack = document.getElementById("unauthBack");
  if (unauthBack) unauthBack.addEventListener("click", function () { window.location.href = "index.html"; });

  var unauthSignOut = document.getElementById("unauthSignOut");
  if (unauthSignOut) {
    unauthSignOut.addEventListener("click", function () {
      var btn = unauthSignOut;
      btn.disabled = true;
      DB.signOut()
        .catch(function () { /* signing out locally is enough */ })
        .finally(function () {
          unauthorizedPanel.classList.add("hidden");
          form.classList.remove("hidden");
          document.getElementById("email").value = "";
          document.getElementById("password").value = "";
          document.getElementById("email").focus();
          btn.disabled = false;
        });
    });
  }

  /* --------------------------------------------------------------- boot */

  function boot() {
    DB.mountSetupNotice();

    // Explain why the user landed back on the login page.
    try {
      var params = new URLSearchParams(window.location.search);
      if (params.get("expired") === "1" || params.get("reason") === "expired") {
        expiredPanel.classList.remove("hidden");
      } else if (params.get("reason") === "unauthorized") {
        showUnauthorized();
      }
    } catch (e) {
      /* URL parsing is best-effort only */
    }

    if (!DB.isConfigured()) {
      // Show the setup notice and keep the form visible but non-functional.
      showAlert("Supabase is not configured yet. Add your Project URL and Publishable key to js/config.js (README steps 5–8).", "warning");
      return;
    }

    restoreSession();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
