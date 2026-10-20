/* ==========================================================================
   Hack-O-Week — admin dashboard (js/admin-dashboard.js)
   --------------------------------------------------------------------------
   Flow: authenticate session → verify admin role (database-enforced) → render.
   Every query runs with the signed-in admin's own session. No secret keys are
   used in the browser; Row Level Security in supabase/schema.sql decides what
   this page is allowed to read or change.
   ========================================================================== */
(function () {
  "use strict";

  // Guard against double initialisation (duplicate handlers, double requests).
  if (window.__HACK_ADMIN_BOOTED__) return;
  window.__HACK_ADMIN_BOOTED__ = true;

  var DB = window.HackDB;

  var state = {
    ready: false,
    view: "overview",
    events: [],
    currentReg: null,
    regs: {
      rows: [],
      count: 0,
      loaded: false,
      page: 1,
      perPage: 15,
      search: "",
      event: "",
      status: "",
      sortField: "created_at",
      sortDir: false, // false = descending
      loading: false
    }
  };

  var CATEGORY_LABELS = {
    hackathon: "Hackathon",
    technical: "Technical",
    showcase: "Showcase",
    gaming: "Gaming",
    cultural: "Cultural",
    arts: "Arts & General",
    workshop: "Workshop"
  };

  var STATUS_BADGES = {
    pending: "badge--amber",
    confirmed: "badge--green",
    waitlist: "badge--violet",
    cancelled: "badge--red"
  };

  /* ------------------------------------------------------------ helpers */

  function $(id) { return document.getElementById(id); }

  function escapeHtml(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  function fmtDate(value) {
    if (!value) return "—";
    var d = new Date(value);
    if (isNaN(d)) return "—";
    return d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
  }

  function fmtDay(value) {
    if (!value) return "—";
    var d = new Date(value);
    if (isNaN(d)) return "—";
    return d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
  }

  function showViewAlert(message, type) {
    var el = $("viewAlert");
    el.className = "alert alert--" + (type || "error");
    el.innerHTML =
      '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 8v5M12 16h.01"/></svg>' +
      "<span>" + escapeHtml(message) + "</span>";
    el.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  function hideViewAlert() { $("viewAlert").className = "alert alert--error hidden"; }

  function db() { return DB.getClient(); }

  /* Session/permission failures always fail closed → back to the login page. */
  function redirectLogin(reason) {
    window.location.replace("admin-login.html" + (reason ? "?reason=" + reason : ""));
  }

  function handleQueryError(err, context) {
    console.error("[HackOWeek] " + (context || "query") + " failed:", err && err.code, err && err.message);
    var code = err && err.code;
    var msg = (err && err.message) || "";
    if (code === "PGRST301" || /JWT expired|token/i.test(msg) || code === "401") {
      redirectLogin("expired");
      return;
    }
    if (code === "42501" || /row-level security|permission denied/i.test(msg)) {
      redirectLogin("unauthorized");
      return;
    }
    showViewAlert(DB.friendlyError(err) + " (" + (context || "request") + ")", "error");
  }

  /* ============================================================ AUTH GATE */

  function gateError(title, text) {
    $("gateTitle").textContent = title;
    $("gateText").textContent = text;
    $("gateError").classList.remove("hidden");
  }

  function checkAuth() {
    DB.getSession()
      .then(function (res) {
        if (res.error) throw res.error;
        var session = res.data && res.data.session;
        if (!session || !session.user) {
          redirectLogin(""); // never signed in
          return null;
        }
        // Independent authorisation check — enforced by RLS, not by the UI.
        return DB.fetchAdminProfile(session.user.id)
          .then(function (profile) {
            if (profile && profile.role === "admin") {
              $("adminEmail").textContent = session.user.email || "administrator";
              enterDashboard();
            } else {
              return DB.signOut().catch(function () {}).then(function () {
                redirectLogin("unauthorized");
              });
            }
          })
          .catch(function (err) {
            console.error("[HackOWeek] authorisation check failed:", err.code || "", err.message);
            gateError("Could not verify access", DB.friendlyError(err));
          });
      })
      .catch(function (err) {
        console.error("[HackOWeek] session check failed:", err.message);
        gateError("Could not check your session", DB.friendlyError(err));
      });
  }

  function enterDashboard() {
    if (state.ready) return;
    state.ready = true;
    $("authGate").classList.add("hidden");
    $("adminApp").classList.remove("hidden");
    bindNavigation();
    loadAll();

    // React to sign-out from another tab / session expiry.
    DB.onAuthStateChange(function (event) {
      if (event === "SIGNED_OUT" && state.ready) redirectLogin("expired");
    });
  }

  /* ========================================================== NAVIGATION */

  var VIEW_META = {
    overview: ["Overview", "Live figures from the festival database"],
    registrations: ["Registrations", "Search, review and export participant entries"],
    events: ["Events", "Manage the public event line-up"]
  };

  function bindNavigation() {
    $("adminNav").addEventListener("click", function (e) {
      var btn = e.target.closest("button[data-view]");
      if (btn) switchView(btn.getAttribute("data-view"));
    });

    document.querySelectorAll("[data-goto]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        switchView(btn.getAttribute("data-goto"));
      });
    });

    $("refreshBtn").addEventListener("click", function () {
      hideViewAlert();
      loadAll();
    });

    $("signOutBtn").addEventListener("click", function () {
      var btn = $("signOutBtn");
      btn.disabled = true;
      DB.signOut()
        .catch(function (err) { console.warn("[HackOWeek] sign-out:", err.message); })
        .finally(function () {
          // Local redirect happens even if the network call failed.
          window.location.replace("admin-login.html");
        });
    });

    // Mobile sidebar
    var menuBtn = $("menuBtn");
    var sidebar = $("sidebar");
    var scrim = $("sidebarScrim");
    function closeSidebar() {
      sidebar.classList.remove("is-open");
      scrim.classList.remove("is-open");
      menuBtn.setAttribute("aria-expanded", "false");
    }
    menuBtn.addEventListener("click", function () {
      var open = sidebar.classList.toggle("is-open");
      scrim.classList.toggle("is-open", open);
      menuBtn.setAttribute("aria-expanded", String(open));
    });
    scrim.addEventListener("click", closeSidebar);

    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") {
        closeSidebar();
        closeDrawer();
        closeModal("eventModal");
      }
    });
  }

  function switchView(view) {
    if (!VIEW_META[view]) return;
    state.view = view;
    ["overview", "registrations", "events"].forEach(function (v) {
      $("view-" + v).classList.toggle("hidden", v !== view);
    });
    document.querySelectorAll("#adminNav button[data-view]").forEach(function (b) {
      b.classList.toggle("is-active", b.getAttribute("data-view") === view);
    });
    $("viewTitle").textContent = VIEW_META[view][0];
    $("viewSub").textContent = VIEW_META[view][1];
    closeSidebarNow();
    hideViewAlert();

    if (view === "registrations" && !state.regs.loaded) loadRegistrations();
    if (view === "events" && !state.events.length) loadEvents();
  }

  function closeSidebarNow() {
    $("sidebar").classList.remove("is-open");
    $("sidebarScrim").classList.remove("is-open");
  }

  function loadAll() {
    loadOverview();
    loadEvents();
    if (state.view === "registrations" || state.regs.loaded) loadRegistrations();
  }

  /* ============================================================ OVERVIEW */

  function loadOverview() {
    var d = db();

    Promise.all([
      d.from("registrations").select("id", { count: "exact", head: true }),
      d.from("registrations").select("id", { count: "exact", head: true }).eq("participation_type", "team"),
      d.from("registrations").select("id", { count: "exact", head: true }).eq("status", "confirmed"),
      d.from("events").select("id", { count: "exact", head: true }).eq("is_published", true).eq("is_archived", false),
      d.from("registration_events").select("event_id, events(name, category)").limit(5000),
      d.from("registrations").select("id, full_name, email, status, created_at").order("created_at", { ascending: false }).limit(5)
    ])
      .then(function (results) {
        results.forEach(function (res) {
          if (res.error) throw res.error;
        });

        var total = results[0].count || 0;
        var teams = results[1].count || 0;
        var confirmed = results[2].count || 0;
        var published = results[3].count || 0;
        var links = results[4].data || [];
        var recent = results[5].data || [];

        $("statTotal").textContent = total.toLocaleString();
        $("statTeams").textContent = teams.toLocaleString();
        $("statEvents").textContent = published.toLocaleString();
        $("statConfirmed").textContent = confirmed.toLocaleString();

        var regCount = $("navRegCount");
        regCount.textContent = total > 999 ? "999+" : String(total);
        regCount.classList.toggle("hidden", total === 0);

        renderBars(links);
        renderRecent(recent);
      })
      .catch(function (err) {
        handleQueryError(err, "overview");
        $("byEventPanel").innerHTML =
          '<div class="state state--error" style="padding:26px 10px"><h3>Could not load statistics</h3><p>' +
          escapeHtml(DB.friendlyError(err)) +
          '</p><button class="btn btn--soft btn--sm" type="button" onclick="location.reload()">Reload</button></div>';
      });
  }

  function renderBars(links) {
    var byEvent = {};
    var byCategory = {};
    links.forEach(function (row) {
      var ev = row.events;
      var name = ev && ev.name ? ev.name : "Unknown event";
      var cat = ev && ev.category ? ev.category : "other";
      byEvent[name] = (byEvent[name] || 0) + 1;
      byCategory[cat] = (byCategory[cat] || 0) + 1;
    });

    var eventEntries = Object.keys(byEvent)
      .map(function (k) { return [k, byEvent[k]]; })
      .sort(function (a, b) { return b[1] - a[1]; })
      .slice(0, 8);

    var host = $("byEventPanel");
    if (!eventEntries.length) {
      host.innerHTML =
        '<div class="state" style="padding:26px 10px"><div class="state-icon">' +
        '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="4" width="18" height="17" rx="3"/><path d="M8 2v4M16 2v4M3 10h18"/></svg>' +
        "</div><h3>No registrations yet</h3><p>Once participants sign up, numbers will appear here grouped by event.</p></div>";
    } else {
      var max = eventEntries[0][1];
      host.innerHTML =
        '<div class="bar-list">' +
        eventEntries
          .map(function (entry) {
            var pct = Math.max(6, Math.round((entry[1] / max) * 100));
            return (
              '<div class="bar-row"><div class="bar-top"><strong>' + escapeHtml(entry[0]) +
              "</strong><span>" + entry[1] + "</span></div>" +
              '<div class="bar-track"><div class="bar-fill" style="width:' + pct + '%"></div></div></div>'
            );
          })
          .join("") +
        "</div>";
    }

    var catHost = $("byCategoryPanel");
    var catEntries = Object.keys(byCategory)
      .map(function (k) { return [k, byCategory[k]]; })
      .sort(function (a, b) { return b[1] - a[1]; });
    var catTotal = catEntries.reduce(function (sum, e) { return sum + e[1]; }, 0);

    if (!catEntries.length) {
      catHost.innerHTML = '<p class="muted small mb-0">No registration data yet — the technical and cultural split will show up here.</p>';
    } else {
      var maxCat = catEntries[0][1];
      catHost.innerHTML =
        '<div class="bar-list">' +
        catEntries
          .map(function (entry) {
            var pct = Math.max(6, Math.round((entry[1] / maxCat) * 100));
            var label = CATEGORY_LABELS[entry[0]] || entry[0];
            var share = Math.round((entry[1] / catTotal) * 100);
            return (
              '<div class="bar-row"><div class="bar-top"><strong>' + escapeHtml(label) +
              '</strong><span>' + entry[1] + " · " + share + "%</span></div>" +
              '<div class="bar-track"><div class="bar-fill" style="width:' + pct + '%"></div></div></div>'
            );
          })
          .join("") +
        "</div>";
    }
  }

  function renderRecent(recent) {
    var host = $("recentPanel");
    if (!recent.length) {
      host.innerHTML =
        '<div class="state" style="padding:30px 16px"><div class="state-icon">' +
        '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>' +
        "</div><h3>No registrations yet</h3><p>The latest participants will appear here as soon as they sign up.</p></div>";
      return;
    }
    host.innerHTML =
      '<table class="data-table"><tbody>' +
      recent
        .map(function (r) {
          return (
            '<tr><td><div class="cell-main">' + escapeHtml(r.full_name) + "</div>" +
            '<div class="cell-sub">' + escapeHtml(r.email) + "</div></td>" +
            '<td><span class="badge ' + (STATUS_BADGES[r.status] || "badge--neutral") + '">' +
            escapeHtml(r.status) + "</span></td>" +
            '<td class="cell-sub num">' + fmtDay(r.created_at) + "</td></tr>"
          );
        })
        .join("") +
      "</tbody></table>";
  }

  /* ======================================================= REGISTRATIONS */

  function loadRegistrations() {
    var s = state.regs;
    s.loading = true;
    s.loaded = true;
    renderRegTable();

    var query = db()
      .from("registrations")
      .select("*, registration_events(event_id, events(name))", { count: "exact" });

    // Strip characters that would break PostgREST's or() syntax.
    var safe = s.search.trim().replace(/[%_,()']/g, " ").trim();
    if (safe) {
      query = query.or(
        "full_name.ilike.%" + safe + "%,email.ilike.%" + safe + "%,college.ilike.%" + safe + "%,team_name.ilike.%" + safe + "%"
      );
    }
    if (s.status) query = query.eq("status", s.status);
    if (s.event) query = query.eq("registration_events.event_id", s.event);

    var from = (s.page - 1) * s.perPage;
    query = query
      .order(s.sortField, { ascending: s.sortDir })
      .order("id", { ascending: true }) // stable pagination
      .range(from, from + s.perPage - 1);

    query
      .then(function (res) {
        if (res.error) throw res.error;
        s.rows = res.data || [];
        s.count = typeof res.count === "number" ? res.count : s.rows.length;
        s.loading = false;
        renderRegTable();
        renderPagination();
      })
      .catch(function (err) {
        s.loading = false;
        s.rows = [];
        s.count = 0;
        handleQueryError(err, "registrations");
        renderRegTable();
        renderPagination();
      });
  }

  function renderRegTable() {
    var s = state.regs;
    var body = $("regTableBody");
    var stateHost = $("regTableState");
    var table = $("regTable");
    var countText = $("regCountText");

    if (s.loading) {
      table.classList.add("hidden");
      stateHost.innerHTML =
        '<div class="panel-body">' +
        new Array(6).fill('<div class="skeleton" style="height:16px;margin-bottom:16px"></div>').join("") +
        "</div>";
      countText.textContent = "Loading…";
      return;
    }

    countText.textContent = s.count === 0 ? "No matching registrations" : s.count + " registration" + (s.count === 1 ? "" : "s");

    if (!s.rows.length) {
      table.classList.add("hidden");
      var filtered = s.search || s.event || s.status;
      stateHost.innerHTML =
        '<div class="state"><div class="state-icon">' +
        '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>' +
        "</div><h3>" + (filtered ? "No matches found" : "No registrations yet") + "</h3><p>" +
        (filtered
          ? "Try a different search term or clear the filters."
          : "When participants register on the website, their entries will appear here.") +
        "</p>" +
        (filtered ? '<button class="btn btn--soft btn--sm" type="button" id="clearFilters">Clear filters</button>' : "") +
        "</div>";
      var clear = $("clearFilters");
      if (clear) {
        clear.addEventListener("click", function () {
          s.search = "";
          s.event = "";
          s.status = "";
          s.page = 1;
          $("searchInput").value = "";
          $("eventFilter").value = "";
          $("statusFilter").value = "";
          loadRegistrations();
        });
      }
      return;
    }

    table.classList.remove("hidden");
    stateHost.innerHTML = "";

    body.innerHTML = s.rows
      .map(function (r) {
        var events = (r.registration_events || [])
          .map(function (link) { return (link.events && link.events.name) || "—"; })
          .filter(Boolean);
        var eventCell = events.length
          ? escapeHtml(events.slice(0, 2).join(", ")) + (events.length > 2 ? ' <span class="cell-sub">+' + (events.length - 2) + " more</span>" : "")
          : '<span class="cell-sub">—</span>';

        return (
          '<tr data-id="' + escapeHtml(r.id) + '">' +
          '<td><div class="cell-main">' + escapeHtml(r.full_name) + "</div>" +
          '<div class="cell-sub">' + escapeHtml(r.department || "") + (r.year ? " · " + escapeHtml(r.year) : "") + "</div></td>" +
          '<td><div class="cell-sub">' + escapeHtml(r.email) + "</div>" +
          '<div class="cell-sub">' + escapeHtml(r.phone || "") + "</div></td>" +
          "<td>" + eventCell + "</td>" +
          '<td><span class="badge ' + (r.participation_type === "team" ? "badge--violet" : "badge--blue") + '">' +
          escapeHtml(r.participation_type === "team" ? "Team" : "Individual") + "</span>" +
          (r.team_name ? '<div class="cell-sub">' + escapeHtml(r.team_name) + "</div>" : "") +
          "</td>" +
          '<td><span class="badge ' + (STATUS_BADGES[r.status] || "badge--neutral") + '">' + escapeHtml(r.status) + "</span></td>" +
          '<td class="cell-sub num">' + fmtDate(r.created_at) + "</td>" +
          '<td class="actions">' +
          '<button class="icon-btn" type="button" data-view-reg="' + escapeHtml(r.id) + '" title="View details" aria-label="View ' + escapeHtml(r.full_name) + '">' +
          '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/></svg>' +
          "</button></td>" +
          "</tr>"
        );
      })
      .join("");
  }

  function renderPagination() {
    var s = state.regs;
    var pages = Math.max(1, Math.ceil(s.count / s.perPage));
    if (s.page > pages) s.page = pages;
    var from = s.count === 0 ? 0 : (s.page - 1) * s.perPage + 1;
    var to = Math.min(s.count, s.page * s.perPage);

    $("pageInfo").textContent = s.count === 0 ? "0 results" : from + "–" + to + " of " + s.count + " (page " + s.page + " of " + pages + ")";
    $("prevPage").disabled = s.page <= 1 || s.loading;
    $("nextPage").disabled = s.page >= pages || s.loading;
  }

  function bindRegistrations() {
    var s = state.regs;
    var timer = null;

    $("searchInput").addEventListener("input", function (e) {
      clearTimeout(timer);
      timer = setTimeout(function () {
        s.search = e.target.value;
        s.page = 1;
        loadRegistrations();
      }, 300);
    });

    $("eventFilter").addEventListener("change", function (e) {
      s.event = e.target.value;
      s.page = 1;
      loadRegistrations();
    });

    $("statusFilter").addEventListener("change", function (e) {
      s.status = e.target.value;
      s.page = 1;
      loadRegistrations();
    });

    $("sortSelect").addEventListener("change", function (e) {
      var parts = e.target.value.split(".");
      s.sortField = parts[0];
      s.sortDir = parts[1] === "asc";
      s.page = 1;
      loadRegistrations();
    });

    $("prevPage").addEventListener("click", function () {
      if (s.page > 1) { s.page--; loadRegistrations(); }
    });
    $("nextPage").addEventListener("click", function () {
      s.page++;
      loadRegistrations();
    });

    $("regTableBody").addEventListener("click", function (e) {
      var btn = e.target.closest("[data-view-reg]");
      if (!btn) return;
      var row = s.rows.find(function (r) { return r.id === btn.getAttribute("data-view-reg"); });
      if (row) openDrawer(row);
    });

    $("exportBtn").addEventListener("click", exportCSV);
  }

  /* ---------------------------------------------------------- CSV export */

  function csvCell(value) {
    if (value == null) return "";
    var str = String(value);
    return /[",\n]/.test(str) ? '"' + str.replace(/"/g, '""') + '"' : str;
  }

  function exportCSV() {
    var s = state.regs;
    var btn = $("exportBtn");
    btn.disabled = true;

    // Fetch every row matching the CURRENT filters (up to 5,000 rows).
    var query = db().from("registrations").select("*, registration_events(event_id, events(name))");
    var safe = s.search.trim().replace(/[%_,()']/g, " ").trim();
    if (safe) {
      query = query.or(
        "full_name.ilike.%" + safe + "%,email.ilike.%" + safe + "%,college.ilike.%" + safe + "%,team_name.ilike.%" + safe + "%"
      );
    }
    if (s.status) query = query.eq("status", s.status);
    if (s.event) query = query.eq("registration_events.event_id", s.event);
    query = query.order("created_at", { ascending: false }).limit(5000);

    query
      .then(function (res) {
        if (res.error) throw res.error;
        var rows = res.data || [];
        if (!rows.length) {
          showViewAlert("There are no registrations matching the current filters to export.", "warning");
          return;
        }

        var header = [
          "Full name", "Email", "Phone", "College", "Department", "Year",
          "Participation", "Team name", "Team members", "Events", "Status", "Registered at"
        ];
        var lines = [header.map(csvCell).join(",")];

        rows.forEach(function (r) {
          var events = (r.registration_events || [])
            .map(function (l) { return (l.events && l.events.name) || ""; })
            .filter(Boolean)
            .join("; ");
          var members = Array.isArray(r.team_members) ? r.team_members.join("; ") : "";
          lines.push(
            [
              r.full_name, r.email, r.phone, r.college, r.department, r.year,
              r.participation_type, r.team_name, members, events, r.status, r.created_at
            ]
              .map(csvCell)
              .join(",")
          );
        });

        var blob = new Blob(["\uFEFF" + lines.join("\r\n")], { type: "text/csv;charset=utf-8;" });
        var url = URL.createObjectURL(blob);
        var a = document.createElement("a");
        a.href = url;
        a.download = "hackoweek-registrations-" + new Date().toISOString().slice(0, 10) + ".csv";
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(function () { URL.revokeObjectURL(url); }, 1500);

        showViewAlert("Exported " + rows.length + " registration" + (rows.length === 1 ? "" : "s") + " to CSV.", "success");
      })
      .catch(function (err) {
        handleQueryError(err, "CSV export");
      })
      .finally(function () {
        btn.disabled = false;
      });
  }

  /* -------------------------------------------------------------- drawer */

  function openDrawer(reg) {
    state.currentReg = reg;
    $("drawerTitle").textContent = reg.full_name;
    $("drawerSub").textContent = reg.email + " · " + fmtDate(reg.created_at);

    var events = (reg.registration_events || [])
      .map(function (l) { return (l.events && l.events.name) || "Unknown event"; })
      .filter(Boolean);
    var members = Array.isArray(reg.team_members) ? reg.team_members : [];

    $("drawerBody").innerHTML =
      '<dl class="detail-grid">' +
      '<div class="detail-item"><dt>Status</dt><dd><select class="select" id="drawerStatus">' +
      ["pending", "confirmed", "waitlist", "cancelled"]
        .map(function (st) {
          return '<option value="' + st + '"' + (reg.status === st ? " selected" : "") + ">" + st.charAt(0).toUpperCase() + st.slice(1) + "</option>";
        })
        .join("") +
      "</select></dd></div>" +
      '<div class="detail-item"><dt>Phone</dt><dd>' + escapeHtml(reg.phone || "—") + "</dd></div>" +
      '<div class="detail-item"><dt>College</dt><dd>' + escapeHtml(reg.college || "—") + "</dd></div>" +
      '<div class="detail-item"><dt>Department / year</dt><dd>' + escapeHtml(reg.department || "—") + (reg.year ? " · " + escapeHtml(reg.year) : "") + "</dd></div>" +
      "</dl>" +
      '<div class="detail-block"><h4>Events registered</h4><div class="tag-list">' +
      (events.length
        ? events.map(function (n) { return '<span class="badge badge--blue">' + escapeHtml(n) + "</span>"; }).join("")
        : '<span class="small muted">No linked events</span>') +
      "</div></div>" +
      '<div class="detail-block"><h4>Participation</h4>' +
      '<p class="small mb-0"><strong>' + (reg.participation_type === "team" ? "Team" : "Individual") + "</strong>" +
      (reg.team_name ? " — " + escapeHtml(reg.team_name) : "") + "</p>" +
      (members.length
        ? '<ul class="small muted" style="margin:8px 0 0;padding-left:18px">' +
          members.map(function (m) { return "<li>" + escapeHtml(m) + "</li>"; }).join("") +
          "</ul>"
        : "") +
      "</div>" +
      '<div class="detail-block"><h4>Consent</h4><p class="small mb-0">' +
      (reg.consent ? "Privacy notice accepted on submission." : "No consent recorded.") +
      "</p></div>" +
      '<p class="small muted mb-0">Reference: <code>' + escapeHtml(String(reg.id).replace(/-/g, "").slice(0, 8).toUpperCase()) + "</code></p>";

    $("regDrawer").classList.add("is-open");
    $("regDrawer").setAttribute("aria-hidden", "false");
    $("drawerBackdrop").classList.add("is-open");
    $("drawerClose").focus();
  }

  function closeDrawer() {
    $("regDrawer").classList.remove("is-open");
    $("regDrawer").setAttribute("aria-hidden", "true");
    $("drawerBackdrop").classList.remove("is-open");
    state.currentReg = null;
  }

  function bindDrawer() {
    $("drawerClose").addEventListener("click", closeDrawer);
    $("drawerBackdrop").addEventListener("click", closeDrawer);

    $("saveStatusBtn").addEventListener("click", function () {
      var reg = state.currentReg;
      var select = $("drawerStatus");
      if (!reg || !select) return;
      var btn = $("saveStatusBtn");
      var newStatus = select.value;
      if (newStatus === reg.status) {
        closeDrawer();
        return;
      }
      btn.disabled = true;
      btn.textContent = "Saving…";

      db()
        .from("registrations")
        .update({ status: newStatus })
        .eq("id", reg.id)
        .then(function (res) {
          if (res.error) throw res.error;
          reg.status = newStatus;
          closeDrawer();
          showViewAlert("Status updated to " + newStatus + ".", "success");
          loadRegistrations();
          loadOverview();
        })
        .catch(function (err) {
          handleQueryError(err, "status update");
        })
        .finally(function () {
          btn.disabled = false;
          btn.textContent = "Save status";
        });
    });

    $("deleteRegBtn").addEventListener("click", function () {
      var reg = state.currentReg;
      if (!reg) return;
      askConfirm(
        "Delete this registration?",
        "The entry for " + reg.full_name + " (" + reg.email + ") will be permanently removed, along with its event links.",
        "Delete"
      ).then(function (ok) {
        if (!ok) return;
        var btn = $("deleteRegBtn");
        btn.disabled = true;
        db()
          .from("registrations")
          .delete()
          .eq("id", reg.id)
          .then(function (res) {
            if (res.error) throw res.error;
            closeDrawer();
            showViewAlert("Registration deleted.", "success");
            loadRegistrations();
            loadOverview();
          })
          .catch(function (err) {
            handleQueryError(err, "delete");
          })
          .finally(function () {
            btn.disabled = false;
          });
      });
    });
  }

  /* ============================================================== EVENTS */

  function loadEvents() {
    db()
      .from("events")
      .select("*")
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true })
      .then(function (res) {
        if (res.error) throw res.error;
        state.events = res.data || [];
        renderEvents();
        renderEventFilterOptions();
      })
      .catch(function (err) {
        handleQueryError(err, "events");
        $("eventTableState").innerHTML =
          '<div class="state state--error"><div class="state-icon">' +
          '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M12 8v5M12 16h.01"/><circle cx="12" cy="12" r="9"/></svg>' +
          "</div><h3>Could not load events</h3><p>" + escapeHtml(DB.friendlyError(err)) + "</p></div>";
      });
  }

  function renderEventFilterOptions() {
    var select = $("eventFilter");
    var current = select.value;
    select.innerHTML =
      '<option value="">All events</option>' +
      state.events
        .map(function (e) {
          return '<option value="' + escapeHtml(e.id) + '">' + escapeHtml(e.name) + "</option>";
        })
        .join("");
    select.value = current;
  }

  function renderEvents() {
    var body = $("eventTableBody");
    var stateHost = $("eventTableState");
    var table = body.closest("table");

    if (!state.events.length) {
      table.classList.add("hidden");
      stateHost.innerHTML =
        '<div class="state"><div class="state-icon">' +
        '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="4" width="18" height="17" rx="3"/><path d="M8 2v4M16 2v4M3 10h18"/></svg>' +
        "</div><h3>No events yet</h3><p>Create your first event — it stays private until you publish it.</p></div>";
      return;
    }

    table.classList.remove("hidden");
    stateHost.innerHTML = "";

    body.innerHTML = state.events
      .map(function (e) {
        var statusBadge = e.is_archived
          ? '<span class="badge badge--neutral">Archived</span>'
          : e.is_published
            ? '<span class="badge badge--green">Published</span>'
            : '<span class="badge badge--amber">Draft</span>';
        var regBadge = e.registration_open ? '<span class="badge badge--blue">Reg. open</span>' : '<span class="badge badge--neutral">Reg. closed</span>';
        var when = e.starts_at ? fmtDate(e.starts_at) : '<span class="cell-sub">Not scheduled</span>';

        return (
          '<tr data-event-id="' + escapeHtml(e.id) + '">' +
          '<td><div class="cell-main">' + escapeHtml(e.name) + "</div>" +
          '<div class="cell-sub">' + escapeHtml((e.description || "").slice(0, 70)) + ((e.description || "").length > 70 ? "…" : "") + "</div></td>" +
          "<td>" + escapeHtml(CATEGORY_LABELS[e.category] || e.category || "—") + "</td>" +
          "<td>" + escapeHtml(e.participation === "team" ? "Team" : e.participation === "both" ? "Individual / team" : "Individual") + "</td>" +
          '<td class="num">' + when + (e.venue ? '<div class="cell-sub">' + escapeHtml(e.venue) + "</div>" : "") + "</td>" +
          "<td>" + statusBadge + " " + regBadge + "</td>" +
          '<td class="actions">' +
          '<button class="icon-btn" type="button" data-edit-event="' + escapeHtml(e.id) + '" title="Edit" aria-label="Edit ' + escapeHtml(e.name) + '">' +
          '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg></button>' +
          '<button class="icon-btn" type="button" data-toggle-publish="' + escapeHtml(e.id) + '" title="' + (e.is_published ? "Unpublish" : "Publish") + '" aria-label="' + (e.is_published ? "Unpublish " : "Publish ") + escapeHtml(e.name) + '">' +
          (e.is_published
            ? '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M2 12s3.5-7 10-7c2 0 3.7.7 5.1 1.6M22 12s-3.5 7-10 7c-2 0-3.7-.7-5.1-1.6"/><path d="M3 3l18 18"/></svg>'
            : '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/></svg>') +
          "</button>" +
          '<button class="icon-btn icon-btn--danger" type="button" data-archive-event="' + escapeHtml(e.id) + '" title="' + (e.is_archived ? "Restore" : "Archive") + '" aria-label="' + (e.is_archived ? "Restore " : "Archive ") + escapeHtml(e.name) + '">' +
          '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="5" rx="1.5"/><path d="M5 9v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V9M10 13h4"/></svg></button>' +
          "</td></tr>"
        );
      })
      .join("");
  }

  function bindEvents() {
    $("eventTableBody").addEventListener("click", function (e) {
      var editBtn = e.target.closest("[data-edit-event]");
      var pubBtn = e.target.closest("[data-toggle-publish]");
      var archBtn = e.target.closest("[data-archive-event]");

      if (editBtn) {
        var ev = state.events.find(function (x) { return x.id === editBtn.getAttribute("data-edit-event"); });
        if (ev) openEventModal(ev);
        return;
      }

      if (pubBtn) {
        var id = pubBtn.getAttribute("data-toggle-publish");
        var target = state.events.find(function (x) { return x.id === id; });
        if (!target) return;
        pubBtn.disabled = true;
        db()
          .from("events")
          .update({ is_published: !target.is_published })
          .eq("id", id)
          .then(function (res) {
            if (res.error) throw res.error;
            showViewAlert(target.name + (target.is_published ? " is now hidden from the site." : " is now live on the site."), "success");
            loadEvents();
            loadOverview();
          })
          .catch(function (err) { handleQueryError(err, "publish"); })
          .finally(function () { pubBtn.disabled = false; });
        return;
      }

      if (archBtn) {
        var archId = archBtn.getAttribute("data-archive-event");
        var archEv = state.events.find(function (x) { return x.id === archId; });
        if (!archEv) return;
        var willArchive = !archEv.is_archived;
        askConfirm(
          willArchive ? "Archive this event?" : "Restore this event?",
          willArchive
            ? archEv.name + " will be hidden from the public site and from new registrations. Existing registrations are kept."
            : archEv.name + " will return to the site as a draft until you publish it.",
          willArchive ? "Archive" : "Restore"
        ).then(function (ok) {
          if (!ok) return;
          archBtn.disabled = true;
          db()
            .from("events")
            .update({ is_archived: willArchive })
            .eq("id", archId)
            .then(function (res) {
              if (res.error) throw res.error;
              showViewAlert(archEv.name + (willArchive ? " archived." : " restored."), "success");
              loadEvents();
            })
            .catch(function (err) { handleQueryError(err, "archive"); })
            .finally(function () { archBtn.disabled = false; });
        });
      }
    });

    $("newEventBtn").addEventListener("click", function () { openEventModal(null); });

    $("saveEventBtn").addEventListener("click", saveEvent);
    $("eventForm").addEventListener("submit", function (e) { e.preventDefault(); saveEvent(); });
    $("eventForm").addEventListener("keydown", function (e) {
      if (e.key === "Enter" && e.target.tagName !== "TEXTAREA") {
        e.preventDefault();
        saveEvent();
      }
    });
  }

  function openEventModal(ev) {
    var alertEl = $("eventModalAlert");
    alertEl.className = "alert alert--error hidden";

    $("eventModalTitle").textContent = ev ? "Edit event" : "New event";
    $("eventId").value = ev ? ev.id : "";
    $("evName").value = ev ? ev.name || "" : "";
    $("evCategory").value = ev ? ev.category || "hackathon" : "hackathon";
    $("evParticipation").value = ev ? ev.participation || "individual" : "individual";
    $("evDescription").value = ev ? ev.description || "" : "";
    $("evEligibility").value = ev ? ev.eligibility || "" : "";
    $("evVenue").value = ev && ev.venue ? ev.venue : "";
    $("evStartsAt").value = ev && ev.starts_at ? toLocalInput(ev.starts_at) : "";
    $("evSortOrder").value = ev && ev.sort_order != null ? ev.sort_order : 0;
    $("evPublished").checked = ev ? Boolean(ev.is_published) : false;
    $("evRegOpen").checked = ev ? ev.registration_open !== false : true;

    $("eventModal").classList.add("is-open");
    setTimeout(function () { $("evName").focus(); }, 60);
  }

  function toLocalInput(iso) {
    var d = new Date(iso);
    if (isNaN(d)) return "";
    var pad = function (n) { return String(n).padStart(2, "0"); };
    return (
      d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()) +
      "T" + pad(d.getHours()) + ":" + pad(d.getMinutes())
    );
  }

  function closeModal(id) {
    var el = $(id);
    if (el) el.classList.remove("is-open");
  }

  function saveEvent() {
    var name = $("evName").value.trim();
    var alertEl = $("eventModalAlert");
    if (!name) {
      alertEl.className = "alert alert--error";
      alertEl.innerHTML = "<span>Give the event a name before saving.</span>";
      $("evName").focus();
      return;
    }

    var id = $("eventId").value;
    var startsRaw = $("evStartsAt").value;
    var payload = {
      name: name,
      category: $("evCategory").value,
      participation: $("evParticipation").value,
      description: $("evDescription").value.trim() || null,
      eligibility: $("evEligibility").value.trim() || null,
      venue: $("evVenue").value.trim() || null,
      starts_at: startsRaw ? new Date(startsRaw).toISOString() : null,
      sort_order: parseInt($("evSortOrder").value, 10) || 0,
      is_published: $("evPublished").checked,
      registration_open: $("evRegOpen").checked
    };

    var btn = $("saveEventBtn");
    btn.disabled = true;
    btn.textContent = "Saving…";

    var request = id
      ? db().from("events").update(payload).eq("id", id)
      : db().from("events").insert(payload);

    request
      .then(function (res) {
        if (res.error) throw res.error;
        closeModal("eventModal");
        showViewAlert(id ? "Event updated." : "Event created as " + (payload.is_published ? "published" : "a draft") + ".", "success");
        loadEvents();
        loadOverview();
      })
      .catch(function (err) {
        console.error("[HackOWeek] event save failed:", err.code || "", err.message);
        alertEl.className = "alert alert--error";
        alertEl.innerHTML = "<span>" + escapeHtml(DB.friendlyError(err)) + "</span>";
      })
      .finally(function () {
        btn.disabled = false;
        btn.textContent = "Save event";
      });
  }

  /* --------------------------------------------------------- confirm modal */

  function askConfirm(title, text, okLabel) {
    return new Promise(function (resolve) {
      var modal = $("confirmModal");
      var okBtn = $("confirmOk");
      var cancelBtn = $("confirmCancel");
      $("confirmTitle").textContent = title;
      $("confirmText").textContent = text;
      okBtn.textContent = okLabel || "Confirm";
      modal.classList.add("is-open");
      okBtn.focus();

      var onOk, onCancel, onBackdrop;
      var done = function (value) {
        modal.classList.remove("is-open");
        okBtn.removeEventListener("click", onOk);
        cancelBtn.removeEventListener("click", onCancel);
        modal.removeEventListener("click", onBackdrop);
        resolve(value);
      };
      onOk = function () { done(true); };
      onCancel = function () { done(false); };
      onBackdrop = function (e) { if (e.target === modal) done(false); };

      okBtn.addEventListener("click", onOk);
      cancelBtn.addEventListener("click", onCancel);
      modal.addEventListener("click", onBackdrop);
    });
  }

  /* ------------------------------------------------------------------ boot */

  function boot() {
    bindRegistrations();
    bindDrawer();
    bindEvents();
    checkAuth();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
