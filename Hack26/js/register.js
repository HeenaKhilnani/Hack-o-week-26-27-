/* ==========================================================================
   Hack-O-Week — registration form (js/register.js)
   Validates input, submits to Supabase through an atomic database function,
   and only shows success after the database confirms the write.
   ========================================================================== */
(function () {
  "use strict";

  var DB = window.HackDB;

  var form = document.getElementById("registrationForm");
  var submitBtn = document.getElementById("submitBtn");
  var submitLabel = document.getElementById("submitLabel");
  var submitSpinner = document.getElementById("submitSpinner");
  var alertBox = document.getElementById("registrationAlert");
  var successPanel = document.getElementById("successPanel");

  var isSubmitting = false; // guards against double submission
  var selectedEvents = [];

  /* ------------------------------------------------------------ helpers */

  function escapeHtml(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  function showError(fieldId, message) {
    var field = document.getElementById(fieldId);
    var error = document.getElementById(fieldId + "-error");
    if (field) {
      field.setAttribute("aria-invalid", "true");
      if (error) field.setAttribute("aria-describedby", error.id);
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

  function showAlert(message, type) {
    if (!alertBox) return;
    alertBox.className = "alert alert--" + (type || "error");
    alertBox.innerHTML =
      '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 8v5M12 16h.01"/></svg>' +
      "<span>" + escapeHtml(message) + "</span>";
    alertBox.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  function hideAlert() {
    if (alertBox) {
      alertBox.className = "alert alert--error hidden";
      alertBox.textContent = "";
    }
  }

  function setLoading(loading) {
    isSubmitting = loading;
    submitBtn.disabled = loading;
    submitLabel.textContent = loading ? "Submitting…" : "Submit registration";
    submitSpinner.classList.toggle("hidden", !loading);
    form.querySelectorAll("input, select, textarea").forEach(function (el) {
      el.disabled = loading;
    });
  }

  /* ------------------------------------------------------------ events */

  function participationLabel(p) {
    if (p === "team") return "Team";
    if (p === "both") return "Individual or team";
    return "Individual";
  }

  function renderEventChoices(events) {
    var host = document.getElementById("eventChoices");
    if (!host) return;
    host.innerHTML = "";

    if (!events.length) {
      host.innerHTML =
        '<div class="state" style="grid-column:1/-1;padding:26px 10px">' +
        "<h3>No events open yet</h3>" +
        "<p>The organising committee has not published any events for registration. Check the home page for announcements.</p>" +
        "</div>";
      return;
    }

    events.forEach(function (ev) {
      var open = ev.registration_open !== false;
      var label = document.createElement("label");
      label.className = "choice" + (open ? "" : " is-disabled");
      label.innerHTML =
        '<input type="checkbox" name="events" value="' + escapeHtml(ev.id || ev.name) + '"' + (open ? "" : " disabled") + " />" +
        "<span><strong>" + escapeHtml(ev.name) + "</strong><small>" +
        escapeHtml(participationLabel(ev.participation)) +
        (open ? " · open" : " · closed") +
        "</small></span>";
      host.appendChild(label);

      var input = label.querySelector("input");
      if (input) {
        input.addEventListener("change", function () {
          clearError("events");
          if (input.checked) selectedEvents.push(input.value);
          else selectedEvents = selectedEvents.filter(function (v) { return v !== input.value; });
        });
      }
    });
  }

  function loadEvents() {
    if (!DB.isConfigured()) {
      // Preview mode — lets the design be reviewed before Supabase exists.
      renderEventChoices(window.HACK_PREVIEW_EVENTS || []);
      submitBtn.disabled = true;
      submitLabel.textContent = "Connect Supabase to enable registration";
      return;
    }
    DB.fetchPublishedEvents()
      .then(function (events) {
        renderEventChoices(events);
      })
      .catch(function (err) {
        console.error("[HackOWeek] event list load failed:", err.message);
        var host = document.getElementById("eventChoices");
        if (host) {
          host.innerHTML =
            '<div class="state state--error" style="grid-column:1/-1;padding:26px 10px">' +
            "<h3>Could not load events</h3><p>" + escapeHtml(DB.friendlyError(err)) + "</p>" +
            '<button class="btn btn--soft btn--sm" type="button" id="retryChoices">Try again</button></div>';
        }
        var retry = document.getElementById("retryChoices");
        if (retry) retry.addEventListener("click", loadEvents);
      });
  }

  /* -------------------------------------------------------- validation */

  var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
  var PHONE_RE = /^\+?[0-9][0-9\s\-()]{6,17}$/;

  function validate() {
    var errors = [];
    ["fullName", "email", "phone", "college", "department", "year", "teamName", "events", "consent"].forEach(clearError);

    if (document.getElementById("fullName").value.trim().length < 2) {
      showError("fullName", "Please enter your full name."); errors.push("fullName");
    }

    var email = document.getElementById("email").value.trim();
    if (!email) { showError("email", "An email address is required."); errors.push("email"); }
    else if (!EMAIL_RE.test(email)) { showError("email", "Enter a valid email address, e.g. you@example.com."); errors.push("email"); }

    var phone = document.getElementById("phone").value.trim();
    if (!phone) { showError("phone", "A phone number is required."); errors.push("phone"); }
    else if (!PHONE_RE.test(phone)) { showError("phone", "Enter a valid phone number (7–18 digits, + optional)."); errors.push("phone"); }

    if (document.getElementById("college").value.trim().length < 2) {
      showError("college", "Please enter your college or institution."); errors.push("college");
    }
    if (document.getElementById("department").value.trim().length < 2) {
      showError("department", "Please enter your department or course."); errors.push("department");
    }
    if (!document.getElementById("year").value) {
      showError("year", "Please select your year of study."); errors.push("year");
    }

    if (document.getElementById("participation").value === "team" &&
        document.getElementById("teamName").value.trim().length < 2) {
      showError("teamName", "Team events need a team name."); errors.push("teamName");
    }

    if (!selectedEvents.length) { showError("events", "Select at least one event."); errors.push("events"); }

    if (!document.getElementById("consent").checked) {
      showError("consent", "You must agree to the privacy notice to register."); errors.push("consent");
    }

    return errors;
  }

  // Live re-validation: clear the error as soon as the user fixes it.
  ["fullName", "email", "phone", "college", "department", "year", "teamName"].forEach(function (id) {
    var el = document.getElementById(id);
    if (el) {
      el.addEventListener("input", function () { clearError(id); });
      el.addEventListener("change", function () { clearError(id); });
    }
  });
  var consentEl = document.getElementById("consent");
  if (consentEl) consentEl.addEventListener("change", function () { clearError("consent"); });

  var participationEl = document.getElementById("participation");
  if (participationEl) {
    participationEl.addEventListener("change", function () {
      var isTeam = participationEl.value === "team";
      document.getElementById("teamFields").classList.toggle("hidden", !isTeam);
      if (!isTeam) clearError("teamName");
    });
  }

  /* ----------------------------------------------------------- submit */

  function buildPayload() {
    var teamMembers = document.getElementById("teamMembers").value
      .split("\n")
      .map(function (line) { return line.trim(); })
      .filter(Boolean);

    return {
      full_name: document.getElementById("fullName").value.trim(),
      email: document.getElementById("email").value.trim().toLowerCase(),
      phone: document.getElementById("phone").value.trim(),
      college: document.getElementById("college").value.trim(),
      department: document.getElementById("department").value.trim(),
      year: document.getElementById("year").value,
      participation_type: document.getElementById("participation").value,
      team_name: document.getElementById("participation").value === "team" ? document.getElementById("teamName").value.trim() : null,
      team_members: teamMembers,
      event_ids: selectedEvents.slice(),
      consent: true
    };
  }

  function handleSubmit(e) {
    e.preventDefault();
    if (isSubmitting) return; // ignore repeated clicks / Enter presses

    hideAlert();
    var errors = validate();
    if (errors.length) {
      showAlert("Please fix the highlighted fields and try again.", "warning");
      var first = document.getElementById(errors[0]);
      if (first) first.focus();
      return;
    }

    if (!DB.isConfigured()) {
      showAlert(
        "Registration is not connected yet. Create your Supabase project, run supabase/schema.sql and add your keys to js/config.js (README steps 5–8).",
        "warning"
      );
      return;
    }

    setLoading(true);

    DB.submitRegistration(buildPayload())
      .then(function (result) {
        var id = typeof result === "string" ? result : (result && (result.id || result.registration_id)) || "";
        var ref = id ? "HOW-" + String(id).replace(/-/g, "").slice(0, 8).toUpperCase() : "CONFIRMED";

        var chosen = Array.prototype.slice
          .call(document.querySelectorAll("#eventChoices input:checked"))
          .map(function (i) {
            var label = i.closest(".choice");
            var strong = label ? label.querySelector("strong") : null;
            return strong ? strong.textContent : "";
          })
          .filter(Boolean);

        document.getElementById("regRef").textContent = ref;
        document.getElementById("successSummary").textContent =
          chosen.length > 1
            ? "Registered for " + chosen.length + " events: " + chosen.join(", ") + "."
            : "Registered for: " + (chosen[0] || "your selected event") + ".";

        form.classList.add("hidden");
        successPanel.classList.remove("hidden");
        successPanel.scrollIntoView({ behavior: "smooth", block: "center" });
      })
      .catch(function (err) {
        // Log the technical cause (no passwords, tokens or private data).
        console.error("[HackOWeek] registration submit failed:", err.code || "", err.message || err);
        showAlert(DB.friendlyError(err), "error");
      })
      .finally(function () {
        // ALWAYS reset the loading state — success, failure or timeout.
        setLoading(false);
      });
  }

  if (form) form.addEventListener("submit", handleSubmit);

  var againBtn = document.getElementById("registerAnother");
  if (againBtn) {
    againBtn.addEventListener("click", function () {
      form.reset();
      selectedEvents = [];
      hideAlert();
      successPanel.classList.add("hidden");
      form.classList.remove("hidden");
      loadEvents();
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
  }

  /* -------------------------------------------------------------- boot */

  function boot() {
    var nav = document.querySelector(".nav");
    var toggle = document.getElementById("navToggle");
    if (nav && toggle) {
      toggle.addEventListener("click", function () {
        var open = nav.classList.toggle("is-open");
        toggle.setAttribute("aria-expanded", String(open));
      });
    }
    var footYear = document.getElementById("footYear");
    if (footYear) footYear.textContent = String(new Date().getFullYear());

    DB.mountSetupNotice();
    loadEvents();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
