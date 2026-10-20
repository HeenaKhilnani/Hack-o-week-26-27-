/* ==========================================================================
   Hack-O-Week — preview events (js/preview-events.js)
   --------------------------------------------------------------------------
   USED ONLY WHEN SUPABASE IS NOT CONNECTED YET, so you can review the design
   of the Events section and registration form before the database exists.
   These are illustrative placeholders, NOT published events. Once Supabase is
   configured, live events loaded from the database replace them completely.
   ========================================================================== */
window.HACK_PREVIEW_EVENTS = [
  { id: "preview-hackathon-1", name: "Idea Sprint Hackathon", category: "hackathon", participation: "team", registration_open: true, eligibility: "Open to all students", description: "A timed build sprint where teams turn a problem statement into a working prototype." },
  { id: "preview-hackathon-2", name: "Code Relay", category: "hackathon", participation: "team", registration_open: true, eligibility: "Open to all students", description: "Pass-the-baton coding relay: each teammate solves a stage before the next begins." },
  { id: "preview-technical-1", name: "Tech Quiz", category: "technical", participation: "both", registration_open: true, eligibility: "Open to all students", description: "Rounds covering computing fundamentals, general technology and current innovations." },
  { id: "preview-technical-2", name: "Debug Dash", category: "technical", participation: "both", registration_open: true, eligibility: "Open to all students", description: "Find and fix planted bugs under time pressure — solo or in pairs." },
  { id: "preview-showcase-1", name: "Project Showcase", category: "showcase", participation: "both", registration_open: true, eligibility: "Open to all students", description: "Present a project you have built — hardware, software, research or design." },
  { id: "preview-gaming-1", name: "Esports Arena", category: "gaming", participation: "team", registration_open: true, eligibility: "Open to all students", description: "Friendly console and PC tournaments run with fair-play rules and referees." },
  { id: "preview-cultural-1", name: "Dance Night", category: "cultural", participation: "both", registration_open: true, eligibility: "Open to all students", description: "Solo, duet and group performances across classical and contemporary styles." },
  { id: "preview-cultural-2", name: "Live Music", category: "cultural", participation: "both", registration_open: true, eligibility: "Open to all students", description: "Band and solo slots on the festival stage, acoustic to full ensemble." },
  { id: "preview-cultural-3", name: "Street Play & Drama", category: "cultural", participation: "team", registration_open: true, eligibility: "Open to all students", description: "Short-form theatre and street plays by student groups." },
  { id: "preview-arts-1", name: "Poster & Canvas Art", category: "arts", participation: "both", registration_open: true, eligibility: "Open to all students", description: "On-the-spot art contest with themes announced at the venue." }
];
