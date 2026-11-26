# CampusSync: Smart Campus Management System

CampusSync is a role-based college ERP built as a major project. A single login gateway opens one of four modules (Student, Faculty, Admin, Hostel) depending on the signed-in role. Private data such as marks, attendance, fees and complaints is visible only to its owner or to the responsible staff role. Public content such as notices, events, gallery and syllabus is visible to everyone.

---

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | React 18, Vite, Tailwind CSS 3, lucide-react (no router library; views are switched with state) |
| Backend | Python 3.11, FastAPI, SQLAlchemy 2.0, Pydantic v2 |
| Database | PostgreSQL (database name `CampusSync`) |
| Auth | JWT (python-jose), passlib + bcrypt (**bcrypt must stay pinned to 4.0.1**) |
| Reports | ReportLab (PDF), openpyxl (Excel) |
| Browser features | `@vladmandic/face-api` (face attendance), `qrcode` and `html5-qrcode` (QR attendance) |

Fonts: Fraunces (display) and Inter (body). Admin uses a Champagne and Dusty Lavender theme, Student uses Burgundy and Rose Gold, Faculty uses a green accent.

---

## Getting started (Windows)

### 1. Backend
```
cd backend
python -m venv venv
venv\Scripts\pip install -r requirements.txt
venv\Scripts\pip install reportlab openpyxl
venv\Scripts\python.exe -m uvicorn app.main:app --reload --port 8000
```
Always start the server with `python -m uvicorn` from the virtual environment. Health check: http://localhost:8000/api/health

### 2. Frontend
```
cd frontend
npm install
npm run dev
```
The frontend must run on **http://localhost:5173** because the backend CORS configuration allows only that origin. `vite.config.js` proxies `/api` to `http://localhost:8000`.

### 3. Environment variables (`backend/.env`)
```
DATABASE_URL=postgresql://postgres:PASSWORD@localhost:5432/CampusSync
JWT_SECRET_KEY=<a long random string>
JWT_ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=1440
ENABLE_DEMO_DATA=true
PAYMENT_MODE=<as configured>
```
Special characters in the database password must be URL-encoded (for example `@` becomes `%40`). Never commit `.env`.

---

## Project structure

```
backend/
  app/
    main.py          CORS, create_all, router registration
    database.py      engine and session
    models.py        all SQLAlchemy tables
    schemas.py       all Pydantic models
    security.py      hashing and JWT helpers
    notify.py        in-app notifications for students
    routers/         one file per feature (auth, student_*, faculty_*, admin_*)
  uploads/<feature>/ uploaded files (materials, exam_copies, task_files, photos, ...)
frontend/
  src/
    App.jsx          session handling (localStorage key "erp_session")
    api.js           every backend call (authedRequest adds the Bearer token)
    roles.js         role configuration
    components/      shared components and tabs
    pages/           Student*, Faculty*, Admin* pages and dashboards
```

Tables are created at start-up by `Base.metadata.create_all`. There is **no Alembic**: a new table appears by itself, but `create_all` never changes columns of an existing table. Changing an existing table needs a manual `ALTER TABLE`.

---

## Roles and modules

`users.role` is one of `student`, `faculty`, `admin`, `hostel`. Each role has its own profile table linked to `users` through `user_id`.

### Student
Dashboard, attendance, results, assignments, fees and payments, library, notices, syllabus, gallery, mentor, complaints, study materials, internal exam results and question papers, exam copies, QR attendance scan, placement, analytics, notifications, and hostel services.

### Faculty
| Area | Features |
|---|---|
| Home and profile | Overview cards, profile, assigned classes |
| Attendance | Mark, history, report, leaderboard, **face attendance**, **QR attendance** |
| Marks | Marks entry, exam copy upload |
| Assignments | Create, grade, attach files |
| Communication | Notices, mentor, complaints |
| Study Materials | Upload and manage files per class |
| Course Planner | Syllabus-linked topic and unit planning |
| Timetable | Weekly timetable and exam schedule |
| Student Analytics | Class and student performance, risk levels |
| Examinations | Create internal exams, marks entry, question papers, publish results, exam reports |
| Performance | Live dashboard across the faculty member's classes |
| Reports | Attendance, exam, assignment and class summary reports as PDF or Excel |
| Leave | Apply, balance, history, cancel (approval by admin) |

### Admin
College setup, timetable, exams, library, notices, gallery, syllabus, settings (for example minimum attendance and pass marks), and faculty leave approval.

### Hostel
A hostel login role exists with its own profile table. Students can use hostel visitor, mess, complaint and leave tabs.

---

## Conventions

- **API:** routers live in `backend/app/routers/<feature>.py` with the prefix `/api/<role>/<feature>`. Faculty endpoints use the `require_faculty` dependency, and class ownership is checked with `my_assignment`.
- **Frontend:** every call goes through `src/api.js`. For JSON bodies use `body: JSON.stringify(...)`; for uploads pass a `FormData`.
- **Uploads:** stored under `backend/uploads/<feature>/` with extension and magic-byte validation.
- **New data:** always goes into new tables. Existing tables are not altered without a warning.
- **UI text:** English and professional.
- **Sample data:** anything created for testing is labelled "Sample" or "DEMO".
- Browser camera and geolocation features (face and QR attendance) need HTTPS or `localhost`.

---

## Troubleshooting

| Symptom | Likely cause and fix |
|---|---|
| `401 Unauthorized` on every request | Session expired. Log out, or clear `erp_session` in Local Storage, and sign in again |
| `NameError: name 'func' is not defined` in `models.py` | Add `func` to the `sqlalchemy` import |
| Vite: failed to resolve an import | The page file was not created, or a package is missing (`npm install`) |
| `AttributeError: module 'app.models' has no attribute ...` | A model was not added to `models.py` |
| A new route returns 404 | The router is not imported and included in `main.py` |
| Login fails after reinstalling packages | Check `bcrypt==4.0.1` |

---

## Security notes

- Passwords are hashed with bcrypt. Tokens are JWT with a configurable expiry.
- Every private endpoint checks the role and ownership on the server. The frontend is never trusted.
- Uploaded files are type-checked and size-limited. Spreadsheet and CSV exports neutralise formula injection.
- Do not commit `.env`, the `uploads/` folder or database dumps.
