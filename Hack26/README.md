# Hack-O-Week — College Fest Website

A complete website for a college hackathon/fest, built **without any build tools or frameworks** — just plain HTML, CSS and JavaScript plus [Supabase](https://supabase.com) for the database, authentication and security rules.

**What you get:**

- 🎨 A public site (home, events, about, contact)
- 📝 A registration form that saves real entries to a database
- 🔐 A private admin area (login → dashboard) only authorized admins can open
- 🧾 CSV export of all registrations
- 🔒 Database security (Row Level Security) so nobody can hack the form or peek at data
- 🚀 One-click deploy to Netlify, and a Git repo ready for GitHub

**No fake screens anywhere:** success and error messages only appear after the database actually confirms the operation.

---

## 1. Folder structure

```
Hack26/
├── index.html            Public home page
├── register.html         Public registration form
├── privacy.html          Privacy policy page
├── admin-login.html      Admin sign-in page
├── admin.html            Admin dashboard (protected)
├── css/
│   ├── styles.css        All public-site styles
│   └── admin.css         Admin area styles
├── js/
│   ├── config.js         ⭐ YOUR settings (keys, events, contacts)
│   ├── supabase-client.js Shared database helper (window.HackDB)
│   ├── site.js            Shared header/footer/scroll/nav logic
│   ├── preview-events.js  Placeholder events shown when not yet configured
│   ├── register.js        Registration form logic
│   ├── admin-login.js     Login flow (fail-safe, never hangs)
│   └── admin-dashboard.js Dashboard, table, filters, CSV export
├── supabase/
│   └── schema.sql        ⭐ Complete database schema + security rules
├── netlify.toml          Netlify deploy configuration
├── .gitignore            Keeps secrets and junk out of Git
└── README.md             This file
```

⭐ = the only two files you must edit during setup.

---

## 2. What is Supabase, in simple terms?

Supabase is a free hosted service that gives you:

1. **A database** — where registrations are stored (like a super-powered Excel table).
2. **Authentication** — username/password login for admins, handled securely for you.
3. **Row Level Security (RLS)** — rules written *inside the database* that decide who can read or write each table. Even if someone inspects your website code, these rules cannot be bypassed, because they run on the database server.

### API in simple terms

Your website talks to Supabase through a URL like `https://xxxx.supabase.co`. When the form is submitted, the site sends a small JSON request to that URL, and Supabase saves the row. You never write server code — Supabase *is* your server.

### Keys in simple terms

- **Anon (public) key** — like a front-door key. It is *meant* to be visible in the browser. It only allows what the RLS rules allow (read public events, submit a registration, sign in on the login page).
- **Service-role (secret) key** — like a master key that bypasses all security. **Never put it in any website file.** This project never needs it; all security is done with RLS rules instead.

### Environment variables in simple terms

"Environment variables" are just secret values kept on a server instead of in your code. Because the anon key is public by design (the RLS rules protect the data), this project keeps it in `js/config.js` — the simplest approach for beginners. If your team later wants server-side secrets, see §10.

---

## 3. Prerequisites

- A computer with [Git](https://git-scm.com) installed (`git --version` to check)
- A free [GitHub](https://github.com) account
- A free [Netlify](https://netlify.com) account
- A free [Supabase](https://supabase.com) account
- Any code editor (VS Code recommended)
- Optional for local testing: Node.js (used only to run a tiny test server)

---

## 4. Run the site locally (before touching any database)

```bash
cd Hack26
python3 -m http.server 8080
# or: npx serve .
```

Open <http://localhost:8080>. You will see the site with clearly labelled **placeholder events** ("Sample Tech Trivia — TO BE CONFIRMED"), because Supabase isn't configured yet. Everything else (navigation, form validation, pages) works. The form will show a friendly "not connected yet" notice instead of pretending to save.

---

## 5. Set up Supabase (5 steps)

### 5.1 Create the project

1. Sign in at <https://supabase.com> → **New project**.
2. Choose a name (e.g. `hack-o-week`), a database password (save it somewhere safe), and a region close to your users.
3. Wait ~2 minutes for provisioning.

### 5.2 Run the schema

1. In the Supabase dashboard, open **SQL Editor** (left sidebar).
2. Click **New query**, paste the entire contents of `supabase/schema.sql`.
3. Click **Run** (bottom right). You should see `Success. No rows returned`.

What this creates:

| Thing | Purpose |
|---|---|
| `profiles` | Stores `role = 'admin'` for authorized admins |
| `events` | Fest events shown on the site |
| `registrations` + `registration_events` | One registration row per email, linked to many events |
| `is_admin()` | Helper the security rules call to check "is this user an admin?" |
| `submit_registration()` | The **only** public write path — validates everything and saves atomically |
| 12 RLS policies | Who can read/write each table (see §11) |

### 5.3 Turn on email confirmation for admins

1. **Authentication → Providers → Email** (or **Settings → Auth** depending on the dashboard version).
2. Keep the Email provider enabled.
3. Decide whether **Confirm email** is on or off:
   - **Off** — fastest for a demo: created users can sign in immediately.
   - **On** (recommended for real use) — the admin must click a link in their email first.

### 5.4 Copy your keys

1. **Project Settings → API**.
2. Copy the **Project URL** → it goes into `js/config.js` as `SUPABASE_URL`.
3. Copy the **anon/public key** (called "Publishable key" in newer dashboards) → `SUPABASE_ANON_KEY`.
4. Open `js/config.js` and replace both placeholders:

```js
SUPABASE_URL: "https://YOUR-PROJECT-REF.supabase.co",
SUPABASE_ANON_KEY: "eyJhbGciOi...your-anon-key...",
```

**Never** copy the `service_role` key into any file in this folder.

### 5.5 Create your first admin

1. In Supabase: **Authentication → Users → Add user** → enter an email + password → **Create user**.
   - If you enabled email confirmation, open the user and click **Confirm** (or have them click the email link).
2. Still in **Authentication → Users**, click the new user to open their details and **copy their User ID** (a UUID like `123e4567-e89b-...`).
3. Open the **SQL Editor** again and run this (replace `PASTE_USER_UUID_HERE` and the email):

```sql
insert into public.profiles (id, email, role)
values ('PASTE_USER_UUID_HERE', 'you@example.com', 'admin')
on conflict (id) do update set role = 'admin';
```

Only users with a `role = 'admin'` row in `profiles` can open the dashboard — being logged in is *not* enough. That's the "explicit authorization" requirement.

---

## 6. Test the public registration form

1. Run the local server (§4) and open <http://localhost:8080/register.html>.
2. You should now see **real events** loaded from Supabase (add a few in the admin dashboard first, or insert rows into `events` — see §12).
3. Fill the form and submit.
   - ✅ You should see: *"Registration received."* — only after Supabase confirms the insert.
   - ❌ Duplicate email → clear error: *"This email address is already registered."*
   - ❌ Missing name/email/event → the built-in error summary explains exactly what's missing.
4. Verify in Supabase: **Table Editor → registrations** shows your row, and **registration_events** links it to each selected event.

---

## 7. Test the admin login (it never hangs)

1. Open <http://localhost:8080/admin-login.html>.
2. Sign in with the admin user from §5.5.
3. Expected flow: *"Signing in…"* → redirected to `admin.html` → dashboard loads with your registrations.

If something fails you will get a **specific message and a "Try again" button**, never an endless spinner:

| Situation | What you'll see |
|---|---|
| Wrong password | "Incorrect email or password." |
| Logged in but not an admin | Sent to `admin.html?reason=unauthorized` → "Your account doesn't have admin access." with a sign-out button |
| Session expired | `admin.html?reason=expired` → "Your session expired. Please sign in again." |
| Supabase not configured | "Database not connected yet." |
| Network/timeout (15 s) | "couldn't reach the sign-in service" with retry |

**Try these negative tests:** sign in with a normal (non-admin) user → must be refused even with correct password; sign in with a wrong password → must fail fast; stop your network and sign in → must time out with an error, not spin forever.

---

## 8. The admin dashboard

Once signed in (`admin.html`):

- **Stats cards** — total registrations, unique events, teams, spots remaining.
- **Search box** — filters by name, email, college or team in real time.
- **Event filter** — dropdown of your real events.
- **Detail drawer** — click any row (or focus it and press Enter) to open full details, incl. team members. `Esc` closes it.
- **CSV export** — two buttons:
  - *Export all (CSV)* → every registration, one row per event selected.
  - *Export filtered (CSV)* → exactly what's currently visible after search/filter.
  The CSV downloads immediately (generated in the browser from the data already loaded). Numbers that could be interpreted as dates (like `1234567890`) are prefixed with a tab so Excel won't mangle them.
- **Events tab** — create, edit, publish/unpublish and delete events; plus a "How to add events in Supabase" helper dialog.
- **Sign out** — clears the session; `admin.html` itself forces a sign-in screen if you're not authenticated or not an admin.

---

## 9. Security: how this project keeps data safe (RLS explained simply)

Row Level Security rules live **inside the database**, so they apply even to someone who reads all your JavaScript.

| # | Rule (in `schema.sql`) | In plain English |
|---|---|---|
| 1 | `profiles`: select own | You can read your own profile |
| 2 | `profiles`: admin read | Admins can read all profiles |
| 3 | `profiles`: admin update | Admins can change roles |
| 4 | `events`: public read published | Anyone can see published events |
| 5 | `events`: admin full access | Admins can create/edit/delete events |
| 6 | `registrations`: admin read | Only admins can read registrations |
| 7 | `registrations`: admin update/delete | Only admins can edit/remove them |
| 8 | *no public insert policy* | **Nobody can insert registrations directly** |
| 9 | `registration_events`: admin read | Only admins see the event links |
| 10 | `submit_registration()` | The single, validated, atomic write path |
| 11 | `registration_events`: admin delete | Only admins can edit links |
| 12 | `handle_new_user()` trigger | New auth users automatically get a `profiles` row |

Key ideas:

- **The public form cannot be spammed directly** — there is no public insert policy at all. The only way to write a registration is the `submit_registration` SQL function, which validates name/email/events, normalizes the email, enforces one-registration-per-email, and inserts the registration **and** its event links in one transaction (all-or-nothing).
- **"Logged in" ≠ "admin"** — every admin rule checks `is_admin()`, which requires a `role='admin'` row in `profiles`.
- **The anon key is safe to publish** — it can't do anything the rules don't allow.

### Verify RLS yourself

1. In Supabase SQL Editor, temporarily get the anon role:
   ```sql
   set local role anon;
   select count(*) from public.registrations;
   ```
   → should return **0** or a permission error — anon cannot read registrations.
2. Try inserting without the function:
   ```sql
   insert into public.registrations (full_name, email)
   ('Hacker', 'x@y.z');
   ```
   → should be **denied** by RLS.
3. `set local role anon;` then call the function — it *is* allowed (that's the point) but with invalid data:
   ```sql
   select public.submit_registration('{"full_name":"","email":"bad"}');
   ```
   → should return a validation error, proving server-side checks run even for direct calls.
4. Reset your session by closing the SQL editor tab (each query runs in its own transaction with `set local`).

---

## 10. Put the code on GitHub

*Nothing is pushed automatically — follow these steps when you're ready.*

```bash
cd Hack26
git init
git add .
git commit -m "Hack-O-Week site: public pages, registration, admin dashboard"
git branch -M main
```

Then create an empty repo at <https://github.com/new> (**do not** add a README), and run:

```bash
git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO.git
git push -u origin main
```

The `.gitignore` already excludes `.env*`, `node_modules/` and `.DS_Store`. Your Supabase **anon key will be public** in the repo — that's expected and safe (see §2). The **service-role key must never appear anywhere**.

---

## 11. Deploy to Netlify

1. Log in to <https://netlify.com> → **Add new site → Import an existing project → GitHub** → pick your repo.
2. Netlify reads `netlify.toml` automatically:
   - **Build command:** *(none)*
   - **Publish directory:** `.`
   - Security headers are added for you.
3. Click **Deploy**. ~30 seconds later your site is live at `https://your-site.netlify.app`.
4. **No environment variables are needed** — configuration lives in `js/config.js` (see §2 for why that's OK for the public anon key).

**After deploying:** open `https://your-site.netlify.app/register.html`, submit a test registration, then check it in the Supabase Table Editor. Also test admin login on the live URL — auth redirects are pre-allowed in `netlify.toml`.

### If you want real environment variables later

Move `js/config.js` content to Netlify's **Site settings → Environment variables** and inject it at deploy time — but that requires a build step (e.g. a small script that writes `config.js` from `$SUPABASE_URL`). Not needed for this project; the anon key is public by design.

---

## 12. Updating content (events, contacts, links)

All editable content is at the **bottom of `js/config.js`**:

```js
EVENTS: [   // only used when Supabase is NOT connected yet (preview mode)
  { id: "sample-hackathon", title: "Sample Hackathon", ... }
],
CONTACT: { EMAIL: "team@yourcollege.edu", ... },
COLLEGE: { NAME: "Your College Name", ... },
CATEGORIES: { hackathon: "Hackathon", technical: "Technical", ... }
```

- **Once Supabase is connected**, real events come from the database — add them via the admin dashboard (**Events → Add event**) or directly in the Supabase **Table Editor → events**. Keep `category` to one of: `hackathon, technical, showcase, gaming, cultural, arts, workshop` (the database rejects anything else).
- Update `CONTACT` and `COLLEGE` placeholders before going live.
- Event status matters: only `status = 'published'` events appear on the public site.

---

## 13. Troubleshooting

| Problem | Likely cause | Fix |
|---|---|---|
| Site shows "Sample … TO BE CONFIRMED" events | Supabase not configured | Fill `SUPABASE_URL` + `SUPABASE_ANON_KEY` in `js/config.js` (§5.4) |
| Form says "not connected" | Same as above, or a typo in the URL | Recheck the URL — it must end with `.supabase.co` |
| "This email address is already registered" | By design — one registration per email | Use the admin dashboard to check/edit the existing row |
| Admin login: "not authenticated" | Wrong password, or email confirmation still pending | Reset the password in Supabase, or confirm the user (§5.5) |
| Admin login: "doesn't have admin access" | User exists but has no `profiles` row with `role='admin'` | Run the SQL in §5.5 step 3 |
| Dashboard shows 0 registrations | RLS blocks reads for non-admins | Make sure you ran §5.5 step 3 with the correct User ID |
| `relation "public.registrations" does not exist` | Schema wasn't run | Re-run `supabase/schema.sql` in the SQL Editor (§5.2) |
| CORS or "Invalid API key" | URL/key mismatch, or key copied from another project | Copy both values fresh from **Project Settings → API** |
| Events won't save in admin | Category value not allowed | Use one of the 7 categories from §12 |
| Push to GitHub rejected | Repo already has commits | `git pull --rebase origin main` then push again |
| Netlify site is blank | Wrong publish directory | Ensure publish dir is `.` (netlify.toml handles this) |

**Golden rule for debugging:** open the browser console (F12 → Console) and the Supabase dashboard's **Logs** — every error is written there with a plain message.

---

## 14. Checklist before going live

- [ ] `js/config.js`: real Supabase URL + anon key
- [ ] `js/config.js`: `CONTACT` and `COLLEGE` filled in (no placeholder text)
- [ ] `supabase/schema.sql` ran without errors
- [ ] First admin created + `profiles.role = 'admin'` inserted
- [ ] Test registration appears in the Table Editor
- [ ] Admin login tested with a wrong password (fails fast) and a non-admin user (refused)
- [ ] RLS spot-check passed (§9 "Verify RLS yourself")
- [ ] At least one published event in the database
- [ ] Site pushed to GitHub and deployed on Netlify
- [ ] Live URL tested end-to-end (register + admin login)

---

## 15. Local automated checks (optional)

The project ships with a tiny test suite — no dependencies to install:

```bash
# 1. JavaScript syntax of every file
for f in js/*.js; do node --check "$f" && echo "OK $f"; done

# 2. HTML sanity (tags balanced, no duplicate IDs, no broken internal links)
python3 - <<'EOF'
from html.parser import HTMLParser
import glob, sys
VOID = {"meta","link","img","br","hr","input","source","wbr"}
class P(HTMLParser):
    def __init__(s): super().__init__(convert_charrefs=True); s.stack=[]; s.ids=[]; s.err=[]; s.links=[]
    def handle_startendtag(s,t,a):
        d=dict(a)
        if "id" in d: s.ids.append(d["id"])
    def handle_starttag(s,t,a):
        d=dict(a)
        if "id" in d: s.ids.append(d["id"])
        if t=="a" and d.get("href","").endswith(".html"): s.links.append(d["href"])
        if t not in VOID: s.stack.append(t)
    def handle_endtag(s,t):
        if t in VOID: return
        if not s.stack or s.stack[-1]!=t: s.err.append(f"mismatch </{t}> line {s.getpos()[0]}")
        else: s.stack.pop()
bad=0
for f in sorted(glob.glob("*.html")):
    p=P(); p.feed(open(f,encoding="utf-8").read())
    dup={i for i in p.ids if p.ids.count(i)>1}
    miss=[l for l in p.links if not glob.glob(l.split("#")[0])]
    if p.err or p.stack or dup or miss: bad=1; print("FAIL", f, "errors:", p.err, "unclosed:", p.stack, "dup ids:", dup, "missing links:", miss)
    else: print("OK", f)
sys.exit(bad)
EOF
```

Both commands exiting without errors means: no broken JavaScript and no broken pages/links.

