/* ==========================================================================
   Hack-O-Week — public site behaviour (js/site.js)
   Powers index.html: navigation, config-driven content, events, schedule.
   ========================================================================== */
(function () {
  "use strict";

  var DB = window.HackDB;
  var CFG = (DB && DB.config) || window.HACK_CONFIG || {};

  /* ---------------------------------------------------------- navigation */

  function initNav() {
    var header = document.getElementById("siteHeader");
    var nav = document.getElementById("mainNav");
    var toggle = document.getElementById("navToggle");
    var links = document.getElementById("navLinks");
    if (!nav || !toggle || !links) return;

    toggle.addEventListener("click", function () {
      var open = nav.classList.toggle("is-open");
      toggle.setAttribute("aria-expanded", String(open));
    });

    links.addEventListener("click", function (e) {
      var a = e.target.closest("a");
      if (!a) return;
      nav.classList.remove("is-open");
      toggle.setAttribute("aria-expanded", "false");

      // Highlight the section currently being viewed.
      var href = a.getAttribute("href") || "";
      if (href.indexOf("#") === 0) {
        links.querySelectorAll("a").forEach(function (l) {
          l.classList.toggle("is-active", l === a);
        });
      }
    });

    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && nav.classList.contains("is-open")) {
        nav.classList.remove("is-open");
        toggle.setAttribute("aria-expanded", "false");
        toggle.focus();
      }
    });

    var onScroll = function () {
      header.classList.toggle("is-stuck", window.scrollY > 8);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
  }

  /* ------------------------------------------------------ scroll reveal */

  function initReveal() {
    var items = document.querySelectorAll(".reveal");
    if (!items.length) return;
    if (!("IntersectionObserver" in window) || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      items.forEach(function (el) { el.classList.add("is-visible"); });
      return;
    }
    var io = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
            io.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.14 }
    );
    items.forEach(function (el) { io.observe(el); });
  }

  /* ------------------------------------------------- config-driven text */

  function text(id, value, placeholder) {
    var el = document.getElementById(id);
    if (!el) return;
    if (value) {
      el.textContent = value;
      el.classList.remove("tba");
    } else if (placeholder) {
      el.textContent = placeholder;
    }
  }

  function applyConfig() {
    var ev = CFG.EVENT || {};
    var ct = CFG.CONTACT || {};
    var col = CFG.COLLEGE || {};

    text("heroDates", ev.dates, ev.datesNote || "To be announced");
    text("heroVenue", ev.venue, ev.venueNote || "To be announced");
    text("heroReg", ev.registrationOpen === false ? "Currently closed" : "Open — free to enter", "To be announced");

    var tagline = document.getElementById("heroTagline");
    if (tagline && ev.tagline) tagline.textContent = ev.tagline;

    var kicker = document.getElementById("heroKicker");
    if (kicker && ev.name) kicker.textContent = ev.name + " · technical & cultural";

    text("contactEmail", ct.email, "To be confirmed");
    text("contactOffice", ct.office, "To be confirmed");
    text("contactOrganiser", ct.organiserName, "To be confirmed");
    text("contactOrganiserRole", ct.organiserRole, "");
    text("contactResponse", ct.responseNote, "");
    text("collegeName", col.name, "College name to be confirmed");
    text("footerCollege", col.name, "College name to be confirmed");
    text("footerContact", ct.email, "Contact email to be confirmed");
    text("footerOffice", ct.office, "Office to be confirmed");

    var year = document.getElementById("year");
    if (year) year.textContent = String(new Date().getFullYear());

    // Social links — only entries with a real URL are shown.
    var socials = CFG.SOCIALS || {};
    var icons = {
      instagram: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9"><rect x="2" y="2" width="20" height="20" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none"/></svg>',
      linkedin: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"><path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-4 0v7h-4v-11h4v1.5A6 6 0 0 1 16 8Z"/><rect x="2" y="9" width="4" height="12"/><circle cx="4" cy="4" r="2"/></svg>',
      twitter: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4l16 16M20 4 4 20"/></svg>',
      youtube: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linejoin="round"><rect x="2" y="5" width="20" height="14" rx="4"/><path d="m10 9 5 3-5 3Z"/></svg>'
    };
    var rows = ["socialRow", "footerSocials"]
      .map(function (id) { return document.getElementById(id); })
      .filter(Boolean);
    rows.forEach(function (row) { row.innerHTML = ""; });
    Object.keys(socials).forEach(function (key) {
      var url = socials[key];
      if (!url) return;
      rows.forEach(function (row) {
        var a = document.createElement("a");
        a.className = "social-link";
        a.href = url;
        a.target = "_blank";
        a.rel = "noopener noreferrer";
        a.innerHTML = (icons[key] || "") + "<span>" + key.charAt(0).toUpperCase() + key.slice(1) + "</span>";
        row.appendChild(a);
      });
    });
  }

  /* ----------------------------------------------------------- events */

  var CATEGORY_META = {
    hackathon: { label: "Hackathon", badge: "badge--blue" },
    technical: { label: "Technical", badge: "badge--violet" },
    showcase: { label: "Showcase", badge: "badge--green" },
    gaming: { label: "Gaming", badge: "badge--coral" },
    cultural: { label: "Cultural", badge: "badge--violet" },
    arts: { label: "Arts & General", badge: "badge--coral" },
    workshop: { label: "Workshop", badge: "badge--blue" }
  };

  var allEvents = [];
  var activeFilter = "all";

  function categoryMeta(key) {
    return CATEGORY_META[key] || { label: key ? key.charAt(0).toUpperCase() + key.slice(1) : "Event", badge: "badge--neutral" };
  }

  function participationLabel(p) {
    if (p === "team") return "Team event";
    if (p === "both") return "Individual or team";
    return "Individual event";
  }

  function renderFilters() {
    var host = document.getElementById("eventFilters");
    if (!host) return;
    var cats = CFG.CATEGORIES || [{ key: "all", label: "All events" }];
    host.innerHTML = "";
    cats.forEach(function (cat) {
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "filter-chip" + (cat.key === activeFilter ? " is-active" : "");
      btn.textContent = cat.label;
      btn.setAttribute("aria-pressed", String(cat.key === activeFilter));
      btn.addEventListener("click", function () {
        activeFilter = cat.key;
        renderFilters();
        renderEvents();
      });
      host.appendChild(btn);
    });
  }

  function escapeHtml(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function eventCard(ev) {
    var meta = categoryMeta(ev.category);
    var scheduled = ev.starts_at ? new Date(ev.starts_at) : null;
    var when = scheduled && !isNaN(scheduled)
      ? scheduled.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })
      : "Date &amp; time TBC";
    var venue = ev.venue ? escapeHtml(ev.venue) : "Venue TBC";
    var statusBadge = ev.registration_open === false
      ? '<span class="badge badge--neutral">Registration closed</span>'
      : '<span class="badge badge--green">Registration open</span>';

    return (
      '<article class="event-card reveal is-visible" data-category="' + escapeHtml(ev.category || "") + '">' +
      '<div class="event-card__top">' +
      '<span class="badge ' + meta.badge + '">' + escapeHtml(meta.label) + "</span>" +
      statusBadge +
      "</div>" +
      "<h3>" + escapeHtml(ev.name) + "</h3>" +
      '<p class="event-card__desc">' + escapeHtml(ev.description || "Details will be published soon.") + "</p>" +
      '<div class="event-card__meta">' +
      '<span><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>' +
      escapeHtml(participationLabel(ev.participation)) + "</span>" +
      '<span><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>' +
      when + "</span>" +
      '<span><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>' +
      venue + "</span>" +
      "</div>" +
      (ev.eligibility ? '<p class="small muted" style="margin:10px 0 0">' + escapeHtml(ev.eligibility) + "</p>" : "") +
      "</article>"
    );
  }

  function renderEvents() {
    var grid = document.getElementById("eventsGrid");
    if (!grid) return;

    var list = allEvents.filter(function (ev) {
      return activeFilter === "all" || ev.category === activeFilter;
    });

    if (!list.length) {
      grid.innerHTML =
        '<div class="state" style="grid-column:1/-1">' +
        '<div class="state-icon"><svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="4" width="18" height="17" rx="3"/><path d="M8 2v4M16 2v4M3 10h18"/></svg></div>' +
        "<h3>No events in this category yet</h3>" +
        "<p>The organising committee has not published events here. Try another category — the full line-up lands soon.</p>" +
        "</div>";
      return;
    }
    grid.innerHTML = list.map(eventCard).join("");
  }

  function renderSchedule() {
    var host = document.getElementById("scheduleList");
    var notice = document.getElementById("scheduleNotice");
    if (!host) return;

    var dated = allEvents.filter(function (ev) {
      return ev.starts_at && !isNaN(new Date(ev.starts_at));
    });

    if (!dated.length) {
      if (notice) notice.classList.remove("hidden");
      host.innerHTML = "";
      return;
    }

    if (notice) notice.classList.add("hidden");
    host.innerHTML = dated
      .sort(function (a, b) { return new Date(a.starts_at) - new Date(b.starts_at); })
      .map(function (ev) {
        var d = new Date(ev.starts_at);
        return (
          '<div class="timeline-item">' +
          '<span class="when">' +
          d.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "long" }) +
          " · " + d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" }) +
          "</span>" +
          "<h3>" + escapeHtml(ev.name) + "</h3>" +
          "<p>" + escapeHtml(ev.venue || "Venue to be announced") + " · " + escapeHtml(categoryMeta(ev.category).label) + "</p>" +
          "</div>"
        );
      })
      .join("");
  }

  function showEventsError(message) {
    var grid = document.getElementById("eventsGrid");
    if (!grid) return;
    grid.innerHTML =
      '<div class="state state--error" style="grid-column:1/-1">' +
      '<div class="state-icon"><svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M12 8v5M12 17h.01"/><circle cx="12" cy="12" r="9"/></svg></div>' +
      "<h3>Could not load events</h3><p>" + escapeHtml(message) + "</p>" +
      '<button class="btn btn--soft btn--sm" type="button" id="retryEvents">Try again</button>' +
      "</div>";
    var retry = document.getElementById("retryEvents");
    if (retry) retry.addEventListener("click", loadEvents);
  }

  function loadEvents() {
    var grid = document.getElementById("eventsGrid");
    if (!DB.isConfigured()) {
      // Preview mode: clearly-labelled placeholders (js/preview-events.js)
      // so the design can be reviewed before Supabase is connected.
      allEvents = (window.HACK_PREVIEW_EVENTS || []).slice();
      renderEvents();
      renderSchedule();
      return;
    }
    if (grid) {
      var skel =
        '<div class="event-card"><div class="skeleton" style="height:14px;width:40%"></div>' +
        '<div class="skeleton" style="height:22px;width:75%;margin-top:16px"></div>' +
        '<div class="skeleton" style="height:60px;margin-top:14px"></div></div>';
      grid.innerHTML = skel + skel + skel;
    }
    DB.fetchPublishedEvents()
      .then(function (events) {
        allEvents = events;
        renderEvents();
        renderSchedule();
      })
      .catch(function (err) {
        console.error("[HackOWeek] events load failed:", err.message);
        showEventsError(DB.friendlyError(err));
      });
  }

  /* -------------------------------------------------------------- boot */

  function boot() {
    initNav();
    initReveal();
    applyConfig();
    renderFilters();
    DB.mountSetupNotice();
    loadEvents();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
