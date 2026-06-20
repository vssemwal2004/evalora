# Evalora

Evalora is an online examination and live proctoring platform.

## Phase 1 Scope

- React/Vite frontend foundation
- Node/Express backend foundation
- MongoDB connection setup
- Role-aware authentication skeleton
- Super Admin, Admin, Student, and Proctor route shells
- Evalora strict professional UI theme
- Login page using `public/logo.webp` and `public/login-img.webp`
- Socket.IO bootstrap for future realtime proctoring

## Phase 2 Scope

- Protected frontend routes
- Persistent auth provider
- Logout/session handling
- Universal login that detects the panel from the authenticated account role
- Dashboard summary API
- Audit log foundation
- Super Admin admin-management API
- Admin creation with permission matrix
- Super admin seed script

## Phase 3 Scope

- Assessment MongoDB model
- Scoped assessment APIs for Super Admin and Admin
- Assessment overview table with status tabs and filters
- Create assessment wizard base
- Course setup base
- Schedule, duration, common password, and security setting base
- Dashboard counts connected to assessment records

## Phase 4 Scope

- Question library model and APIs
- Assessment question snapshot model and APIs
- MCQ question creation
- One-word question creation
- Course-wise question mapping
- Auto-save assessment-created questions into library
- Assessment question builder UI
- Library page with filters

## Phase 5 Scope

- Student profile model
- Assessment-specific student assignment model
- Generated Exam ID format
- Random student password generation
- Manual student add
- Course matching by course name or course ID
- Eligibility status handling
- Assessment student table and filters

## Phase 6 Scope

- Proctor profile model
- Assessment-specific proctor credentials
- Generated proctor ID format
- Manual proctor add
- Proctor assignment table
- Per-proctor capacity planning
- Automatic eligible-student distribution
- One student assigned to exactly one primary proctor

## Local Setup

1. Install dependencies:

```bash
npm install
```

2. Create `server/.env` from `server/.env.example` and fill local secrets.

3. Create the first super admin:

```bash
npm run seed:super-admin --workspace server
```

4. Start both apps:

```bash
npm run dev
```

Frontend runs at `http://localhost:5173`.

Backend runs at `http://localhost:5000`.

## Safety

Do not commit real MongoDB, SMTP, JWT, Cloudinary, or other credentials. Keep them in `server/.env`.
