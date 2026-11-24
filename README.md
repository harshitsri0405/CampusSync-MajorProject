# CampusSync: Smart Campus Management System

College ERP with four role-based modules (Student, Faculty, Admin, Hostel).
Stack: React + Tailwind (frontend), FastAPI + SQLAlchemy (backend), PostgreSQL, JWT authentication.

## What is built so far

| Area | Status |
|---|---|
| Login gateway, 4-step registration wizard, JWT auth (all 4 roles) | Done |
| Student dashboard | Done |
| Student: Profile (fill, view, edit) | Done |
| Student: Attendance (summary, subject radar chart, monthly calendar, click a date for class-wise details) | Done |
| Student: Results (internal marks, semester results, SGPA / CGPA, printable grade card) | Done |
| Student: Timetable (weekly timetable, exam schedule, practical schedule) | Done |
| Student: Assignments, Fees, Library, Notices, Syllabus, Gallery, Mentor, Complaints, Placement, Documents, AI | Not started |
| Faculty, Admin, Hostel modules (after login only a placeholder dashboard) | Not started |

Attendance, Results and Timetable are written by Faculty / Admin in the real system. Those modules do not exist yet,
so each of these screens has a **Load sample data** button for testing (controlled by `ENABLE_DEMO_DATA` in `backend/.env`).
The Timetable is made for a class, so fill **Course** and **Semester** in Student Profile first.

## Requirements

- Python 3.11 (3.12 also works)
- Node.js 18 or newer
- PostgreSQL with an empty database named `CampusSync`

## Run: backend

```bash
cd backend
python -m venv venv
venv\Scripts\python.exe -m pip install -r requirements.txt       # Windows
# Linux / macOS: venv/bin/python -m pip install -r requirements.txt

copy .env.example .env        # Linux / macOS: cp .env.example .env
# open .env and put your real DATABASE_URL

venv\Scripts\python.exe -m uvicorn app.main:app --reload --port 8000
```

Check: http://localhost:8000/api/health should show `{"status":"ok"}`. Tables are created automatically on startup.
Always start the server with `venv\Scripts\python.exe -m uvicorn ...` so the correct Python is used.

## Run: frontend (second terminal)

```bash
cd frontend
npm install
npm run dev
```

Open http://localhost:5173 (Vite forwards `/api` to the backend on port 8000).
The backend only allows the origin `http://localhost:5173`, so make sure the frontend really starts on 5173.

## Try the Student module

1. Open the app, choose **Student**, create an account (name, college ID, password).
2. **Student Profile**: fill the form. Set Course (for example `B.Tech CSE`) and Semester (for example `5th`).
3. **Attendance**, **Results**, **Timetable**: press **Load sample data** once on each screen.

## Common problems

- **Backend crashes at start with `No module named ...`**: you started a different Python. Use `venv\Scripts\python.exe -m uvicorn ...`.
- **Registration shows "Something went wrong"**: look at the backend terminal for the traceback. Most often it is a wrong `DATABASE_URL` or a stale table from an older schema. In a development database you can drop the old tables and restart the backend, which recreates them.
- **"Invalid or expired token"**: log out and log in again (tokens last 24 hours; the app now logs you out automatically).
- **Port 5173 busy**: another `npm run dev` is still running. Stop it first.

## Project layout

```
backend/
  app/
    main.py            FastAPI app, CORS, router registration
    database.py        SQLAlchemy engine and session
    models.py          Tables (users, role profiles, attendance, results, timetable, exams)
    schemas.py         Request / response models
    security.py        Password hashing (bcrypt) and JWT
    routers/           auth, student, attendance, results, timetable
  requirements.txt
  .env.example
frontend/
  src/
    pages/             Login, Wizard, Dashboard, StudentDashboard, Student*Page
    components/        SidePanel, RoleCard, DynamicIcon, AttendanceRadar
    api.js             All backend calls
    roles.js           Role configuration (fields, colours, labels)
```
