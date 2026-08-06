# GMA School Website — Full Project Plan

---

## Project Overview

**Project Name:** GMA School Website System  
**Goal:** One unified, premium international school platform covering public marketing, student portal, CBT exam engine, and admin console  
**Brand Tone:** Elite, warm, parent-friendly — Apple-like UI  
**Color System:** Navy `#0A1F44` · Gold `#C9A84C` · White `#FFFFFF`  
**Typography:** Cormorant Garamond (display) + DM Sans (body)  
**Domain Structure:** Single domain, all divisions  

---

## Objectives

- Increase student admissions through conversion-focused pages
- Build trust with parents via premium branding and social proof
- Recruit qualified teachers and staff
- Support online and blended learning
- Accept and manage applications fully online
- Showcase student achievements and school culture
- Establish GMA as a recognized educational brand
- Enable secure student portal access (bills, results, school info)
- Run computer-based tests (CBT) online with integrity controls

---

## Site Architecture

```
gmaschool.edu.ng/
├── Public Website
│   ├── Home
│   ├── About
│   ├── Admissions
│   ├── Academics
│   │   ├── Nursery & Early Years
│   │   ├── Primary
│   │   ├── Secondary
│   │   └── College / Sixth Form
│   ├── Careers (Teacher & Staff Recruitment)
│   └── Contact
│
├── Student Portal         /portal
│   ├── Dashboard
│   ├── Report Card
│   ├── Bills & Payments
│   ├── School Notices
│   └── Learning Resources
│
├── CBT Exam Portal        /exam
│   ├── Student Login
│   ├── Active Exam View
│   ├── Results Viewer
│   └── Exam History
│
└── Admin Console          admin.<domain> (separate app: admin-frontend/)
    ├── Dashboard (stats overview)
    ├── Student Management
    ├── Application Review (admission + career)
    ├── Contact Messages
    ├── Staff Management — not built yet
    ├── Report Card Upload — not built yet
    ├── Fee & Billing Manager — not built yet
    ├── Exam Builder — not built yet
    └── Notices — backend API exists, no admin UI yet
```

> Architecture note: the admin console is now its own standalone Vite app (`admin-frontend/`), not a route inside the public site. This means it can be deployed to a real subdomain (e.g. `admin.gmaschool.edu.ng`) as a separate deployment/project once a domain is bought — a subdomain is free with any domain, no second purchase needed. It shares the same backend API as everything else.

---

## Pages — Public Website

### Home
- Full-screen hero with motion entrance animation
- Tagline + CTA: "Apply Now" and "Book a Tour"
- Why Choose GMA section (trust signals, stats, pillars)
- Division overview (Nursery → College)
- Student success wall (photos, achievements, testimonials)
- Parent testimonials with name and child's grade
- News & events strip
- Footer with contact, social links, quick nav

### About
- School mission and vision
- History and founding story
- Core values
- Leadership team (Principal, Vice Principals)
- Accreditations and affiliations
- Photo/video gallery of campus

### Admissions
- Step-by-step admissions process
- Requirements by division
- Fees overview (optional: gated behind inquiry)
- Online Application Form (full form → stores to database)
- Application status check (email + application ID)
- FAQ section
- CTA: "Start Your Application"

### Academics
- Curriculum overview (NERDC / Cambridge / IB — specify)
- Division-specific pages with subjects, schedule overview
- Co-curricular activities
- E-learning support mention
- Achievements and exam results highlight

### Careers
- Open positions listing
- Application form for teachers and staff
- Why work at GMA section
- HR contact details

### Contact
- Interactive map (Google Maps embed)
- Contact form
- Phone, email, address
- Office hours
- Social media links

---

## Student Portal — Feature Spec

**Access:** Login with Student ID + Password  
**Roles:** Student, Parent (view-only linked account)

| Feature | Description |
|---|---|
| Dashboard | Welcome card, quick stats, upcoming events |
| Report Card | PDF view per term, download option |
| Bills & Payments | Outstanding fees, payment history, due dates |
| Payment Gateway | Integrate Paystack or Flutterwave |
| School Notices | Admin-published announcements, sorted by date |
| Learning Resources | Upload links to materials, video lessons, past questions |
| Profile | Student photo, class, division, session info |

---

## CBT Exam Portal — Feature Spec

**Access:** Separate login or same credentials as portal  
**Admin sets exams; students take them**

| Feature | Description |
|---|---|
| Exam Lobby | Shows scheduled/available exams for the student |
| Timed Exam Engine | Countdown timer, auto-submit on expiry |
| Question Types | MCQ (auto-scored), Short Answer, Essay |
| Progress Saving | Auto-saves every 30s (survives refresh) |
| Anti-Cheat | Tab-switch detection, full-screen enforcement, copy-paste block |
| Results View | Score, grade, per-question breakdown (if admin enables) |
| Exam History | List of past exams and scores |

**Admin Side (Exam Builder):**
- Create exam: title, duration, division, class, date/time window
- Add questions manually or bulk upload (CSV)
- Set scoring rules per question
- Publish / unpublish exams
- View all student submissions and scores
- Export results to CSV

---

## Admin Console — Feature Spec

**Access:** Admin login (separate from student portal)  
**Roles:** Super Admin, Class Teacher, Bursar, HR

| Module | Features |
|---|---|
| Students | Add, edit, deactivate students; assign to class/division |
| Staff | Staff directory, roles, contact info |
| Report Cards | Upload PDF per student per term; bulk upload |
| Billing | Create fee schedules, mark payments, send reminders |
| Applications | Review online applications, approve/reject, send offer letter email |
| Exam Manager | Build exams, view results, export |
| Announcements | Post notices to student portal |
| Settings | School info, branding, academic session setup |

---

## Tech Stack

| Layer | Tool | Notes |
|---|---|---|
| Frontend | React 18 | Component-based UI with hooks |
| Backend | Node.js + Express.js | RESTful API server |
| Database | MongoDB + Mongoose | NoSQL document database with ODM |
| Authentication | JWT + bcrypt | Token-based auth with password hashing |
| Styling | Plain CSS + CSS Variables | Custom design tokens (navy/gold/white) |
| Animation | CSS Transitions + Intersection Observer | Smooth animations, scroll reveals |
| File Storage | GridFS or Cloudinary | Report card PDFs, student photos |
| Payments | Paystack API | Nigerian payment gateway |
| Email | Nodemailer | Application confirmations, fee alerts |
| Hosting Frontend | Netlify or Vercel | Static hosting for React build |
| Hosting Backend | Railway, Render, or DigitalOcean | Node.js API hosting |
| Database Hosting | MongoDB Atlas | Cloud MongoDB hosting |
| Domain | Any Nigerian registrar | `.edu.ng` or `.sch.ng` |

---

## Build Phases

### Phase 1 — Public Website & Brand Foundation
**Duration: Weeks 1–4**

- [x] Set up React project with Create React App or Vite
- [x] Set up Express.js API server with basic routing
- [x] Create CSS variables system (navy, gold, white, spacing, typography)
- [x] Build reusable React components (Header, Footer, PageHeader, AuthBranding, FileUploadField, SVGIcon, etc.)
- [x] Home page — hero, Why GMA, divisions, testimonials (testimonials now an auto-scrolling marquee)
- [x] About page (story, mission/vision, values, leadership + accreditations sections — placeholders pending real photos/names)
- [x] Admissions page + online application form (React form → Express API) — rebuilt to match backend schema exactly, file uploads for all required documents, verified producing real application numbers end-to-end
- [x] Academics page (all divisions)
- [x] Careers page (cover letter is now a real file upload, verified submitting to backend)
- [x] Contact page with embedded map — real Google Maps iframe embed using the actual school address, no API key needed
- [x] Responsive design with CSS Grid/Flexbox — verified across every page at mobile/tablet/desktop widths
- [x] CSS animations and scroll reveals (Intersection Observer)
- [x] SEO setup — per-page dynamic `<SEO>` (React Helmet) title/description on every main public page (Home, About, Admissions, Academics, Careers, Contact, Privacy, Terms, Sitemap, Login, NotFound); ForgotPassword/ResetPassword still lack it (low priority, noindex-worthy anyway). Canonical URL, og:image, and a real sitemap.xml are still missing (blocked on having a production domain)
- [ ] Deploy frontend to Netlify/Vercel, backend to Railway/Render, admin-frontend to its own subdomain — not started

**Deliverable:** Live, brandable public website accepting applications

---

### Phase 2 — Authentication & Student Portal
**Duration: Weeks 5–9**

- [x] MongoDB Atlas setup or local MongoDB installation
- [x] Mongoose ODM setup with schema definitions (User, Student, Application, CareerApplication, ContactMessage, ReportCard, etc.)
- [x] User authentication system (JWT tokens, bcrypt password hashing) — Login/Forgot Password/Reset Password verified working end-to-end. Public self-registration was removed entirely (see note below) in favor of automatic account provisioning
- [x] Login by email, phone number, **or student registration number** — not every parent has email, but everyone has a phone; students log in with their reg number (e.g. `GMA/PRI/2024/0001`) specifically, since they don't get their own email/phone on the account (avoids ever colliding with the parent's contact info, which is used as the parent account's login instead)
- [x] Express.js middleware for auth protection and role-based access (`authenticateToken`, `authorizeRoles`, `ProtectedRoute`)
- [x] MongoDB collections design (users, students, contactMessages, etc.) — `Student.userId` = the student's own account, `Student.parentUserId` = the linked parent account (one parent account can link multiple children, for siblings)
- [x] Transactional email (Resend) — contact/admission/career confirmations, school notification emails for every new submission, password reset links
- [x] Transactional SMS (Sendchamp, live key configured 2026-08-06) — portal credentials and password resets for parents without email; deliverability still depends on `SENDCHAMP_SENDER_NAME` being an approved sender in the Sendchamp dashboard
- [x] **Automatic account provisioning** — approving an admission application auto-creates both a student account (reg-number login) and the parent's portal account (reusing one across siblings), links them via the Student record, and sends both sets of credentials to the parent's phone/email. No more manual re-entry of the same data into a second form
- [x] Student portal — Dashboard (verified against the backend response shape) and Profile (account info + change-password form, replacing the old "Coming Soon" placeholder) are both built
- [x] Report card module — fully built end-to-end. Model supports both manual score entry (auto-computed grade/remark, draft/publish workflow) and PDF upload (Cloudinary). Admin UI (`admin-frontend/ReportCards.jsx`): student search, score entry, PDF upload, publish/unpublish, print-style preview. Student UI (`frontend/portal/ReportCards.jsx`): formatted on-screen report + PDF download.
- [x] Bills module — fully built. `FeeSchedule`/`Invoice` models (installments, optional fee items, discounts, auto status transitions). Admin UI (`admin-frontend/Billing.jsx`, tabs for Invoices + Fee Schedules): fee schedule builder, invoice generation, record payments, apply discounts. Student UI (`frontend/portal/Bills.jsx`): outstanding/paid summary, fee breakdown, optional-item toggles, payment history.
- [x] Paystack integration — fully built (`backend/routes/payment.js`, real `fetch` calls, no SDK dependency needed). `/payment/initialize` + `/payment/verify/:reference` + `/payment/webhook` (HMAC signature verified). Student Bills.jsx "Pay Now" redirects to Paystack hosted checkout and auto-verifies on return. Not yet confirmed against a live Paystack test account at runtime (see Go-Live Checklist).
- [x] School notices module (CRUD operations) — fully built both sides. Admin UI (`admin-frontend/Notices.jsx`): create/edit with role+division+class targeting, category/priority, attachments, pin/publish. Student UI (`frontend/portal/Notices.jsx`): filtering, read tracking, acknowledge-required notices.
- [x] Learning resources module — built 2026-07-28. `Resource` model (document/video/link types, division+class targeting, Cloudinary upload for documents incl. Word/PowerPoint). Admin UI (`admin-frontend/Resources.jsx`): create/publish/delete. Student UI (`frontend/portal/Resources.jsx`): filter by type/subject, open/download.
- [x] **Admin console app** — built as a separate standalone frontend (`admin-frontend/`), subdomain-ready. Includes: Dashboard (stats), Applications review (approve/reject/waitlist, auto-provisions on approval), Career Applications review, Contact Messages (view/reply/mark status), Students (search + manual create with the same phone/email-optional credential flow)
- [x] Staff management UI — `admin-frontend/Staff.jsx`: list/search staff, add/edit (role, email/phone, division/class scoping), activate/deactivate. No hard-delete (soft-deactivate only, intentional).
- [x] Billing management panel — covered by `admin-frontend/Billing.jsx` above; not separately role-gated to a distinct "Bursar" role, but the functionality itself is complete.

**Deliverable:** Fully functional student portal + core admin console — **achieved**, all items built.

> **2026-07-28 correction:** this Phase 2 section previously described most of these items as unbuilt "Coming Soon" placeholders. A code audit found that was stale — Report Cards, Bills, Paystack, Notices, and Staff management are all fully implemented with no TODO/stub code anywhere in the actual `.js`/`.jsx` files. Keep this doc's checkboxes in sync with reality going forward; don't let it drift again.

> Note on the removed self-registration flow: earlier the plan assumed parents/students would sign themselves up via a public `/register` page. That page, its route, and its backend endpoint have been deleted — replaced by automatic provisioning on admission approval (see above), since manual self-registration was redundant and login-by-phone made "type your email to match our records" awkward for phone-only parents. The header/footer "Apply Now" CTA and the Login page's footer link both now point straight to the Admissions form.

> Bug fixed in passing: the parent dashboard (`GET /student/dashboard`) looked up the child only by matching `parentInfo.email`, which silently broke for any parent who logged in by phone (no email on the account) or who was linked through the newer `parentUserId` field. Now checks `parentUserId` first, falling back to email/phone contact matching.

---

### Phase 3 — CBT Exam System
**Duration: Weeks 10–14**

- [x] Exam builder React components in admin console — `admin-frontend/Exams.jsx`: metadata form, inline question builder (mcq/short/essay), live marks total
- [x] Question bank API endpoints (manual entry + CSV upload processing) — `POST /admin/exams` (manual), `POST /admin/exams/:id/questions/csv` (bulk, via a small dependency-free CSV parser in `backend/utils/csv.js`)
- [x] Exam scheduling API (date/time window per class) — `Exam.division` + `Exam.classes`, `startTime`/`endTime` window
- [x] Student exam lobby React component — `frontend/portal/Exams.jsx` (Upcoming/Active + History tabs)
- [x] Timed exam engine (JavaScript countdown, auto-submit) — `frontend/portal/ExamTake.jsx`; deadline is derived server-side from `submission.startedAt` (survives refresh, per the plan's own risk mitigation above)
- [x] Answer auto-saving — saves on every change plus a 30s safety-net flush (`PATCH /student/:id/exams/:examId/answer`)
- [x] Anti-cheat: tab-switch detection (`visibilitychange`), fullscreen enforcement (`fullscreenchange`, re-prompts on exit), copy/paste/right-click blocked, violations logged server-side (`tabSwitchCount`/`fullscreenExitCount` on the submission)
- [x] MCQ auto-scoring logic in Express.js — `Submission.autoScore()`; short/essay wait for manual grading (`PATCH /admin/submissions/:id/grade`)
- [x] Results page React components for students — `frontend/portal/ExamResult.jsx`, respects the exam's `showResultsImmediately` flag
- [x] Results export API (CSV generation) for admin — `GET /admin/exams/:id/submissions/export`
- [x] Exam history view — folded into `frontend/portal/Exams.jsx`'s History tab

**Deliverable:** Fully operational online CBT system — built 2026-07-28, both frontends build clean. **Not yet tested against a running app + real MongoDB/browser** — no dev server or live exam attempt has been run. Treat as code-complete, not verified, until someone actually sits a test exam end to end.

---

## Database Schema (Core Collections)

```javascript
// schools collection
{
  _id: ObjectId,
  name: String,
  divisions: [String], // ['nursery', 'primary', 'secondary', 'college']
  logoUrl: String,
  createdAt: Date
}

// users collection
{
  _id: ObjectId,
  email: String,
  passwordHash: String,
  role: String, // 'student', 'parent', 'staff', 'admin'
  division: String,
  isActive: Boolean,
  createdAt: Date
}

// students collection
{
  _id: ObjectId,
  userId: ObjectId, // ref to users
  fullName: String,
  regNumber: String,
  class: String,
  division: String,
  photoUrl: String,
  session: String, // '2024/2025'
  parentInfo: {
    name: String,
    email: String,
    phone: String
  },
  createdAt: Date
}

// reportCards collection
{
  _id: ObjectId,
  studentId: ObjectId,
  term: String, // 'first', 'second', 'third'
  session: String,
  fileUrl: String,
  uploadedAt: Date,
  uploadedBy: ObjectId
}

// feeSchedules collection
{
  _id: ObjectId,
  division: String,
  term: String,
  session: String,
  amount: Number,
  description: String,
  dueDate: Date
}

// invoices collection
{
  _id: ObjectId,
  studentId: ObjectId,
  feeScheduleId: ObjectId,
  amountDue: Number,
  amountPaid: Number,
  dueDate: Date,
  status: String, // 'pending', 'paid', 'overdue'
  paystackReference: String
}

// applications collection
{
  _id: ObjectId,
  applicantName: String,
  divisionApplied: String,
  parentName: String,
  email: String,
  phone: String,
  status: String, // 'pending', 'approved', 'rejected'
  documents: [String], // file URLs
  createdAt: Date
}

// exams collection
{
  _id: ObjectId,
  title: String,
  division: String,
  class: String,
  durationMinutes: Number,
  startTime: Date,
  endTime: Date,
  published: Boolean,
  questions: [{
    questionText: String,
    type: String, // 'mcq', 'short', 'essay'
    options: [String], // for MCQ
    correctAnswer: String,
    marks: Number
  }]
}

// submissions collection
{
  _id: ObjectId,
  examId: ObjectId,
  studentId: ObjectId,
  startedAt: Date,
  submittedAt: Date,
  answers: [{
    questionIndex: Number,
    answer: String
  }],
  score: Number,
  status: String // 'in_progress', 'submitted', 'graded'
}

// notices collection
{
  _id: ObjectId,
  title: String,
  body: String,
  division: String, // or 'all'
  createdBy: ObjectId,
  createdAt: Date,
  isActive: Boolean
}
```

---

## Key Build Risks & Mitigations

| Risk | Mitigation |
|---|---|
| CBT timer lost on page refresh | Store `started_at` in DB; derive remaining time on load |
| Students sharing login credentials | Enforce one active session per user; log IP and device |
| PDF report cards at scale | Use Supabase Storage with signed URLs; never expose direct file paths |
| Multi-division data leakage | Add `division_id` to all queries; enforce via RLS (Supabase Row Level Security) |
| Low mobile performance | Lazy-load images, use Next.js Image, test on low-end Android |
| Payment disputes | Log every Paystack webhook event; don't mark paid until webhook confirms |
| Admin mistakes (delete student) | Soft-delete only (add `deleted_at` column); never hard delete |

---

## Design System Summary

| Token | Value |
|---|---|
| Primary Navy | `#0A1F44` |
| Gold Accent | `#C9A84C` |
| White | `#FFFFFF` |
| Light Surface | `#F7F6F2` |
| Body Text | `#1A1A1A` |
| Muted Text | `#6B6B6B` |
| Display Font | Cormorant Garamond (Bold, Italic) |
| Body Font | DM Sans (Regular, Medium) |
| Border Radius | 8px (cards), 4px (inputs), 999px (pills) |
| Transition | `0.3s ease` on all interactive elements |

---

## Content Needed From School

Before development starts, gather the following:

- [x] School name, tagline, mission statement — Goodness and Mercy Academy (GMA), "Excellence in Education, Character in Life," founded 2014
- [x] Logo — redrawn as a clean SVG crest (`SchoolCrest.jsx`) based on the real physical school crest, approved and live in the Header, Footer, and auth pages. **Remaining:** `frontend/public/favicon.svg` (the actual browser-tab icon) is still the old placeholder graduation-cap mark — it's a static file, not a React component, so the new crest needs to be exported/redrawn as a standalone SVG file to replace it
- [x] Division structure and class list — Nursery, Primary, Secondary, College/Sixth Form, each with age ranges
- [ ] Staff photos and bios (Principal, key teachers) — About page's Leadership Team section has clearly-marked placeholders waiting on this
- [ ] Student success stories / testimonials (with parent permission) — existing testimonials on the homepage are unconfirmed placeholder content, not verified as real
- [ ] Campus photos and video — Contact page's map is still a placeholder too
- [ ] Fee schedule per division (for billing module)
- [ ] Curriculum type (NERDC / Cambridge / IB / Hybrid)
- [ ] Social media handles — footer icons currently link to "#"
- [x] Contact details (address, phone, email) — used consistently across Header/Footer/Contact
- [ ] Accreditation certificates or affiliations to display

---

## Go-Live Checklist

- [x] All pages reviewed on mobile and desktop — verified at mobile/tablet/desktop breakpoints across every page
- [x] Application form tested end-to-end (submission → admin sees it) — verified fully: submission produces a real application number, appears in the admin console's Applications page, and approving it auto-creates the parent's portal account
- [ ] Student portal login tested with real student account — auth flow is verified working against the live backend, but not yet with a real enrolled student's seeded data
- [ ] Paystack test mode payments confirmed working — not started (test keys are in `.env`, no integration code yet)
- [ ] CBT exam completed full run (create → take → auto-score → results) — not started, no CBT code exists yet
- [ ] Report card upload and student download tested — not started
- [ ] All admin roles tested (bursar, teacher, super admin) — admin/staff login and the core review workflows (applications, career applications, messages, students) are verified working; bursar-specific billing features don't exist yet
- [ ] SSL certificate active (HTTPS) — not applicable yet, site isn't deployed
- [ ] Google Analytics or Plausible installed — not started
- [x] 404 and error pages styled — dedicated `NotFound.jsx` page matching the site's design (crest, quick links, Back to Home / Contact Us)
- [ ] Backup and restore process documented — not started

---

## What's Next

**Quick wins (small, high-value, do anytime):**
- [ ] Replace `frontend/public/favicon.svg` with the real crest — currently the only place the old placeholder mark still shows up
- [x] ~~Get a real SMS API key~~ — done, switched to Sendchamp (`SENDCHAMP_API_KEY` live key configured 2026-08-06). Still worth confirming `SENDCHAMP_SENDER_NAME` is an approved sender in the dashboard, or sends will silently fail.
- [ ] Verify a custom domain in Resend — currently email can only deliver to one sandbox address
- [x] ~~Notices admin UI~~ — done, `admin-frontend/Notices.jsx`
- [x] ~~Staff management UI~~ — done, `admin-frontend/Staff.jsx`
- [ ] Change-password UI in the **admin console** specifically (the student/parent portal now has this; the seeded admin password should still be rotated via the API directly for now)
- [ ] A way for a parent with more than one child to switch between them — right now the dashboard and profile both only show/link the first child found

**2026-07-28 — Phase 2 and Phase 3 are now both code-complete.** Learning Resources module and the full CBT exam system (builder, timed engine, anti-cheat, auto-scoring, results, CSV export) were built in this session. Neither has been run against a live dev server/database yet — see the note at the end of the Phase 3 section above. Next real step is smoke-testing both end to end (create a resource and view it as a student; publish an exam, sit it as a test student account, confirm the timer/autosave/anti-cheat/scoring all actually work against a running app), not more building.

**Next milestone — deployment:**
Public site, backend API, and admin console are all functionally ready for a first deploy (frontend/backend to Netlify+Railway or similar, admin-frontend to its own subdomain) once a domain is bought. `DEPLOYMENT.md` (in this same directory) has the full step-by-step: database → backend → public site → admin console, with every required env var listed. `netlify.toml` (frontend/, admin-frontend/) and `render.yaml` (backend/) are already in place. Nothing is actually deployed yet — no hosting accounts or domain exist as of this note. Real users touching the live system tends to surface issues faster than more local building.

---

*Plan version 1.3 — GMA School Website System*
