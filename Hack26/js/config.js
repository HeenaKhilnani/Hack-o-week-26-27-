/* ==========================================================================
   Hack-O-Week — Site configuration (js/config.js)
   --------------------------------------------------------------------------
   THIS IS THE ONLY FILE YOU NEED TO EDIT for day-to-day site content.
   Everything marked "TO BE CONFIRMED" is a placeholder — replace it with the
   real information once the organisers confirm it. Do not publish guesses.

   The Supabase keys below are PUBLIC by design (called the "publishable /
   anon key"). They are safe to ship in browser code ONLY because every table
   is protected by Row Level Security (see supabase/schema.sql).
   NEVER put a service_role key, database password or secret key in this file.
   ========================================================================== */

window.HACK_CONFIG = {
  /* 1. SUPABASE — from your NEW Supabase project:
        Dashboard → Project Settings → API
        - Project URL     → "Project URL"
        - Publishable key → "Publishable key" (starts with "sb_publishable_")
        Until both are filled in, the site shows a clear setup notice. */
  SUPABASE_URL: "YOUR_SUPABASE_PROJECT_URL",
  SUPABASE_ANON_KEY: "YOUR_SUPABASE_PUBLISHABLE_KEY",

  /* 2. EVENT DETAILS — placeholders only. Replace when confirmed. */
  EVENT: {
    name: "Hack-O-Week",
    tagline: "A college festival of technology, ideas and the performing arts.",
    dates: null, // e.g. "14 – 16 November 2026" — keep null until confirmed
    datesNote: "Official dates to be announced",
    venue: null, // e.g. "Main Auditorium, Science Block"
    venueNote: "Venue to be announced",
    registrationNote: "Registration is free. Fees and deadlines will be announced here.",
    registrationOpen: true
  },

  /* 3. CONTACT — placeholders. Replace with real organiser details. */
  CONTACT: {
    organiserName: "TO BE CONFIRMED — Festival Organising Committee",
    organiserRole: "Student organising committee",
    email: "to-be-confirmed@example.edu", // replace with the real college email
    phone: null, // e.g. "+91 98765 43210" once confirmed
    office: "TO BE CONFIRMED — Student Activities Office",
    responseNote: "We usually reply within 2–3 working days during the festival season."
  },

  /* 4. COLLEGE */
  COLLEGE: {
    name: "TO BE CONFIRMED — College Name",
    department: "Department of Computer Science & Student Activities",
    address: "TO BE CONFIRMED — College address"
  },

  /* 5. SOCIAL LINKS — add a URL to show the link, leave null to hide it. */
  SOCIALS: {
    instagram: null,
    linkedin: null,
    twitter: null,
    youtube: null
  },

  /* 6. CATEGORY LABELS shown as filters on the Events section.
        The `key` must match the `category` values used in the admin
        dashboard and in supabase/schema.sql. */
  CATEGORIES: [
    { key: "all", label: "All events" },
    { key: "hackathon", label: "Hackathons & Coding" },
    { key: "technical", label: "Quizzes & Challenges" },
    { key: "showcase", label: "Project Showcase" },
    { key: "gaming", label: "Gaming & Interactive" },
    { key: "cultural", label: "Dance, Music & Drama" },
    { key: "arts", label: "Art & General" }
  ]
};
