#!/usr/bin/env python3
"""CampusSync: convert Hinglish UI text and error messages to professional English.

Run from the project root (the folder that contains `backend` and `frontend`):

    python ui_english.py scan       # list Hinglish text that is still left (changes nothing)
    python ui_english.py apply      # replace known strings (originals are backed up first)

Backups go to `_hinglish_backup/` with the same folder structure.
"""
import re
import shutil
import sys
from pathlib import Path

ROOT = Path(sys.argv[2]) if len(sys.argv) > 2 else Path(".")
FOLDERS = [ROOT / "frontend" / "src", ROOT / "backend" / "app"]
EXTS = {".jsx", ".js", ".py"}
SKIP_PARTS = {"node_modules", "venv", "__pycache__", "_hinglish_backup"}
BACKUP = ROOT / "_hinglish_backup"

MAP = {
    # ---- buttons, labels, headings ----
    "Naya QR attendance session": "New QR attendance session",
    "Class aur subject": "Class and subject",
    "Session kitni der chalega": "Session duration",
    "Location lekar session shuru karo": "Start session with my location",
    "Location le rahe hain...": "Getting your location...",
    "Class ke andar GPS 20-50 m galat ho sakta hai, isliye radius 100 m ya zyada rakhna behtar hai.":
        "GPS can be off by 20-50 m indoors, so a radius of 100 m or more is recommended.",
    "Shuru karte waqt aap jahan ho (class me), wahi class ki location ban jaati hai. Browser location ki permission maangega.":
        "When you start, your current position is saved as the classroom location. Your browser will ask for location permission.",
    "Ye QR har 20 second me badalta hai. Students ko isi screen se scan karne do.":
        "This QR code refreshes every 20 seconds. Let students scan it directly from this screen.",
    "session khatam hone me": "until the session ends",
    "Session abhi band karo": "End session now",
    "Session khatam hone ke baad neeche list se attendance register me save karo.":
        "After the session ends, save the attendance to the register from the list below.",
    "Ye session khatam ho gaya hai. Neeche list dekho aur register me save karo.":
        "This session has ended. Review the list below and save it to the register.",
    "Attendance register me save karo": "Save to attendance register",
    "Attendance save karo": "Save attendance",
    "Attendance register me save ho gayi: ${r.present} present, ${r.absent} absent.":
        "Attendance saved to the register: ${r.present} present, ${r.absent} absent.",
    "Attendance save ho gayi: ${r.present} present, ${r.absent} absent.":
        "Attendance saved: ${r.present} present, ${r.absent} absent.",
    "Save ho gayi: ${r.present} present, ${r.absent} absent.": "Saved: ${r.present} present, ${r.absent} absent.",
    "Save ho gayi": "Saved",
    "Register me": "In register",
    "Faculty ke save karne tak": "Pending faculty confirmation",
    "QR ban raha hai...": "Generating QR code...",
    "Scan shuru karo": "Start scan",
    "Scan shuru karne par browser <b>location</b> aur <b>camera</b> ki permission maangega.":
        "When you start scanning, your browser will ask for <b>location</b> and <b>camera</b> permission.",
    "QR ko camera ke saamne rakho.": "Hold the QR code in front of the camera.",
    "Location check ho rahi hai...": "Verifying your location...",
    "Class me faculty ke QR ko scan karo. Tumhari location class ke paas honi chahiye.":
        "Scan the faculty's QR code in class. You must be near the classroom.",
    "Faculty register me save karegi tab Attendance page me dikhegi.":
        "It will appear on the Attendance page once faculty saves it to the register.",
    "Mere pichhle scans": "My previous scans",
    "Scan ho raha hai...": "Scanning...",
    "Scan nahi kiya": "Not scanned",
    "Dobara scan karo": "Scan again",
    "Class se doori:": "Distance from class:",
    "Photo se attendance": "Attendance from photo",
    "Class ki photo (ek ya zyada)": "Class photo(s) (one or more)",
    "Photo chuno / click karo": "Choose / capture photo",
    "Face enrol nahi, khud mark karo": "Not enrolled. Mark manually",
    "Photo me nahi mila": "Not found in photo",
    "Enrol nahi": "Not enrolled",
    "Apne aap match hua": "Matched automatically",
    "Khud juda hua": "Linked manually",
    "Chehre mile: ": "Faces detected: ",
    "Pehchane nahi gaye: ": "Unrecognized: ",
    "Tips: saamne se, roshni me, chehre saaf dikhein. Ek photo me 15-20 students se zyada na rakho. Bade class ke liye 2-3 photo lo.":
        "Tips: face the camera in good lighting so faces are clearly visible. Keep no more than 15-20 students in one photo; for larger classes take 2-3 photos.",
    "Maine student ki <b>sahmati (consent)</b> le li hai. Photo server par save nahi hoti, sirf chehre ke numbers (face data) save hote hain,":
        "I confirm that I have obtained the student's <b>consent</b>. The photo is not stored on the server; only numeric face data is saved,",
    "jo student ke kehne par kabhi bhi hataye ja sakte hain.": "and it can be deleted at any time at the student's request.",
    "Save se pehle list dekh lo. \"Check karo\" wale students ko khud confirm karo, wo abhi Absent hain.":
        "Review the list before saving. Please confirm the students marked \"Review\" yourself; they are currently marked Absent.",
    "Check karo": "Review",
    "Ye chehre kisi enrolled student se match nahi hue (dusri class ke, ya enrol nahi):":
        "These faces did not match any enrolled student (from another class, or not enrolled):",
    "Is filter me abhi kisi student ki attendance nahi lagi, isliye leaderboard nahi ban sakta.":
        "No attendance has been recorded for this filter yet, so the leaderboard cannot be generated.",
    "{sheet.edit_days} din se purani attendance sirf dekh sakte ho, badal nahi sakte.":
        "Attendance older than {sheet.edit_days} days is read-only and cannot be changed.",
    "${sheet.edit_days} din se purani attendance badal nahi sakte.": "Attendance older than ${sheet.edit_days} days cannot be changed.",
    "Is din ki attendance pehle lag chuki hai. Badlaav karke dobara Save kar sakte ho.":
        "Attendance for this day has already been taken. You can edit it and save again.",
    "Is din ki attendance pehle lag chuki hai. Is QR session ke result se badal dein?":
        "Attendance for this day has already been taken. Replace it with the result of this QR session?",
    "Is din ki attendance pehle lag chuki hai. Naye result se badal dein?":
        "Attendance for this day has already been taken. Replace it with the new result?",
    "${left} students ki attendance baaki hai.": "Attendance is pending for ${left} student(s).",
    "Abhi tak is class ki attendance nahi lagi.": "Attendance has not been taken for this class yet.",
    "Is mahine me abhi koi attendance nahi lagi.": "No attendance has been taken this month yet.",
    "Sirf mera subject (": "My subject only (",
    "Sirf mere subjects": "My subjects only",
    "Mera subject": "My subject",
    "Shuru se ab tak": "All time",
    "Pichhle 30 din": "Last 30 days",
    "Is mahine": "This month",
    "Apni date range": "Custom date range",
    "Total: {data.total} din": "Total: {data.total} days",
    "{s.threshold}% se kam:": "Below {s.threshold}%:",
    "Sabse zyada:": "Highest:",
    "Sabse kam:": "Lowest:",
    "Data nahi": "No data",
    "Baaki": "Pending",
    "Attendance darj ho gayi": "Attendance recorded",
    "Attendance nahi lagi": "Attendance not taken",
    "Shuru": "Start",
    "Plan: shuru": "Plan: start",
    "Plan: khatam": "Plan: end",
    "Plan ke hisaab se aaj tak {s.expected_pct}% hona chahiye": "Planned completion by today: {s.expected_pct}%",
    "Tick karne par topic ki date:": "When ticked, the topic date is:",
    "Hafte me {sm.hours} ghante": "{sm.hours} hours per week",
    "Clash wale slot:": "Slots with clashes:",
    "Clash: isi time par dusra slot bhi hai": "Clash: another slot is scheduled at the same time",
    "{x.days_left} din baad": "in {x.days_left} days",
    "Ho chuki": "Completed",
    "Chal raha hai": "In progress",
    "Chal rahi hai": "Ongoing",
    "Purani exams bhi dikhao": "Include past exams",
    "Meri classes ki saari exams": "All exams of my classes",
    "Koi exam schedule nahi mila.": "No exam schedule found.",
    "Aaj aapki koi class nahi hai.": "You have no classes today.",
    "Aapka timetable abhi nahi bana": "Your timetable has not been created yet",
    "Admin jab timetable me aapke naam se slot daalega tab yahan dikhega.":
        "Classes will appear here once the administrator adds slots under your name in the timetable.",
    "Aapko abhi koi class assign nahi hai.": "No classes are assigned to you yet.",
    "Abhi koi class assign nahi hai.": "No classes are assigned yet.",
    "Abhi koi class assign nahi hai": "No classes are assigned yet",
    "Koi class nahi": "No classes",
    "Koi student nahi mila.": "No students found.",
    "Is class me koi student nahi hai.": "This class has no students.",
    "Pehle Dashboard ya My Classes se sample classes banao.": "First create sample classes from the Dashboard or My Classes.",
    # ---- materials / files ----
    "Naya study material": "New study material",
    "Naya material upload karo": "Upload new material",
    "Title (jaise: Unit 1 Notes)": "Title (e.g. Unit 1 Notes)",
    "Saari categories": "All categories",
    "Title se search karo": "Search by title",
    "Student ya ID search karo": "Search by student or ID",
    "File chuno": "Choose file",
    "Upload karo": "Upload",
    "Upload ho raha hai...": "Uploading...",
    "Download ho raha hai...": "Downloading...",
    "Upload nahi hui": "Not uploaded",
    "Dikhao": "Show",
    "Chhupao": "Hide",
    "Dekho": "View",
    "Hatao": "Remove",
    "Link hatao": "Remove link",
    "Student se chhupi hui": "Hidden from student",
    "Students se chhupa hua": "Hidden from students",
    "Kaun si exams": "Exams",
    "Kaun si exam": "Exam",
    "File attach karo": "Attach file",
    "Copy dekho": "View copy",
    "Faculty ki file:": "Faculty file:",
    "Tumhare course aur semester ke notes, PPT aur previous year papers.":
        "Notes, presentations and previous year papers for your course and semester.",
    "Abhi koi study material available nahi hai.": "No study materials are available yet.",
    "Is class me abhi koi material upload nahi hua.": "No materials have been uploaded for this class yet.",
    "{cls ? `${cls.course} · Sem ${cls.semester} · ${cls.subject}` : ''} ke students ko dikhega.":
        "Visible to students of {cls ? `${cls.course} · Sem ${cls.semester} · ${cls.subject}` : ''}.",
    "Har student ki copy PDF ya photo (JPG/PNG, max {meta.max_mb} MB) me upload karo. Student ko ye apne Results page me dikhegi.":
        "Upload each student's copy as a PDF or photo (JPG/PNG, max {meta.max_mb} MB). Students will see it on their Results page.",
    "Dobara upload karne par purani copy badal jaati hai.": "Uploading again replaces the previous copy.",
    "Apni banayi hui assignment me question paper ya reference file attach karo (PDF, DOC, PPT, XLS, TXT, image; max {data ? data.max_mb : 10} MB,":
        "Attach a question paper or reference file to your assignment (PDF, DOC, PPT, XLS, TXT, image; max {data ? data.max_mb : 10} MB,",
    "ek assignment me {data ? data.max_files : 3} files tak). Students ko ye Assignments page me dikhegi.":
        "up to {data ? data.max_files : 3} files per assignment). Students will see them on the Assignments page.",
    "Is class me abhi aapne koi assignment nahi banayi. Pehle \"Assignments\" tab me banao.":
        "You have not created any assignments for this class yet. Create one in the Assignments tab first.",
    "Faculty ne jo checked copies upload ki hain, yahan dikhengi.": "Evaluated copies uploaded by your faculty appear here.",
    "Is semester ki koi exam copy abhi upload nahi hui.": "No exam copies have been uploaded for this semester yet.",
    "Badlaav save ho gaye.": "Changes saved.",
    # ---- planner ----
    "Syllabus jodo": "Link syllabus",
    "Plan save karo": "Save plan",
    "Is class ka syllabus abhi juda nahi hai": "The syllabus is not linked to this class yet",
    "{data.class.course} · Sem {data.class.semester} ka syllabus Admin ne abhi daala nahi hai. Admin → Syllabus me daalne ke baad yahan aayega.":
        "The syllabus for {data.class.course} · Sem {data.class.semester} has not been added by the administrator yet. It will appear here once added under Admin → Syllabus.",
    "\"{data.class.subject}\" naam ka koi syllabus subject nahi mila. Neeche se is class ka sahi subject chuno.":
        "No syllabus subject named \"{data.class.subject}\" was found. Select the correct subject for this class below.",
    "Is subject me abhi koi unit nahi hai.": "This subject has no units yet.",
    "Is unit me topics nahi likhe hain.": "No topics have been added to this unit.",
    # ---- dynamic messages (frontend) ----
    "\"${m.title}\" hamesha ke liye hata dein?": "Permanently delete \"${m.title}\"?",
    "\"${f.file_name}\" hata dein?": "Remove \"${f.file_name}\"?",
    "${descs.length} chehre mile, pehchaan ho rahi hai...": "${descs.length} face(s) detected. Identifying students...",
    "${student.name} ka face data hata diya.": "Face data removed for ${student.name}.",
    "${student.name} ka saara face data hata dein?": "Remove all face data for ${student.name}?",
    "${student.name} ki copy hata dein?": "Remove the copy for ${student.name}?",
    "${student.name} ki copy upload ho gayi.": "The copy for ${student.name} was uploaded.",
    "${student.name} ki photo enrol ho gayi.": "Photo enrolled for ${student.name}.",
    "Photo ${i + 1} / ${files.length} scan ho rahi hai...": "Scanning photo ${i + 1} of ${files.length}...",
    "Face models load ho rahe hain...": "Loading face recognition models...",
    "Face models load nahi hue. Internet check karo aur dobara try karo.":
        "Could not load the face recognition models. Check your internet connection and try again.",
    "File ${data.max_mb} MB se badi hai.": "The file is larger than ${data.max_mb} MB.",
    "File ${meta.max_mb} MB se badi hai.": "The file is larger than ${meta.max_mb} MB.",
    "Pehle \"Face Enroll\" tab me students ki photo enrol karo.": "First enroll student photos in the Face Enroll tab.",
    "Pehle students ki face photos enrol karo.": "Enroll the students' face photos first.",
    "Pehle class ki photo chuno.": "Please select the class photo first.",
    "Pehle file chuno.": "Please select a file first.",
    "Pehle upar \"student ki sahmati li hai\" tick karo.": "Please tick the consent checkbox above first.",
    "Ek baar me 100 se zyada chehre nahi. Kam photos chuno.": "More than 100 faces at once is not supported. Please select fewer photos.",
    "Kisi photo me chehra nahi mila. Roshni aur distance theek karke dobara photo lo.":
        "No face was detected in the photo(s). Improve the lighting and distance, then retake.",
    "Photo me chehra nahi mila. Seedhi, saaf roshni wali photo do.":
        "No face was detected. Please provide a clear, front-facing, well-lit photo.",
    "Photo khul nahi payi. JPG ya PNG file do.": "The photo could not be opened. Please use a JPG or PNG file.",
    "Photo me ek se zyada chehre hain. Sirf is student ki akeli photo do.":
        "The photo contains more than one face. Please upload a photo of this student alone.",
    "Ye chehra class ke kisi aur student se milta hai. Sahi student ki photo chuno.":
        "This face matches another student in the class. Please choose the correct student's photo.",
    "Camera nahi khul paya. Browser me camera ki permission do.": "Unable to open the camera. Please allow camera access in your browser.",
    "Is browser me location support nahi hai.": "Location is not supported in this browser.",
    "Location ki permission do (browser me \"Allow\" dabao).": "Please allow location access (choose Allow in your browser).",
    "Location milne me der ho rahi hai. Khuli jagah par jaakar dobara try karo.":
        "Getting your location is taking too long. Move to an open area and try again.",
    "Location nahi mil paayi. GPS/Location on karo.": "Unable to get your location. Please turn on GPS/Location.",
    "QR purana ho gaya. Screen par naya QR dekhkar dobara scan karo.": "This QR code has expired. Scan the new QR code shown on the screen.",
    "QR sahi nahi hai.": "Invalid QR code.",
    "Scan fail ho gaya.": "Scan failed.",
    "Plan save ho gaya.": "Plan saved.",
    "Syllabus jud gaya.": "Syllabus linked.",
    "Link hata diya.": "Link removed.",
    "Material hata diya.": "Material removed.",
    "File attach ho gayi. Students ko notification bhej diya.": "File attached. Students have been notified.",
    "Upload ho gaya. Students ko notification bhej diya.": "Uploaded. Students have been notified.",
    "Aage ki date nahi chun sakte.": "Future dates cannot be selected.",
    # ---- backend error messages (HTTPException detail) ----
    "Ye sirf student ke liye hai.": "This is available to students only.",
    "Ye student aapki class me nahi hai.": "This student is not in your class.",
    "Ye subject is class ke course/semester ka nahi hai.": "This subject does not belong to this class's course/semester.",
    "Is class ko pehle syllabus subject se jodo.": "Link this class to a syllabus subject first.",
    "Topic syllabus se match nahi karta (syllabus badal gaya hoga). Page refresh karo.":
        "The topic does not match the syllabus (it may have changed). Please refresh the page.",
    "Student ki sahmati (consent) tick karna zaroori hai.": "The student's consent must be confirmed.",
    "Face data sahi nahi hai.": "Invalid face data.",
    "Is student ke {MAX_PHOTOS} photo pehle se hain. Naya dene ke liye pehle hata do.":
        "This student already has {MAX_PHOTOS} photos. Remove one before adding a new photo.",
    "Aapki location ki accuracy kam hai (±{int(body.accuracy)} m). Khuli jagah par jaakar ya WiFi/GPS on karke dobara try karo.":
        "Your location accuracy is low (±{int(body.accuracy)} m). Move to an open area or turn on Wi-Fi/GPS and try again.",
    "Aapki location ki accuracy kam hai (±{int(body.accuracy)} m). Khuli jagah/WiFi on karke dobara try karo.":
        "Your location accuracy is low (±{int(body.accuracy)} m). Move to an open area or turn on Wi-Fi/GPS and try again.",
    "Aap class ki location se {int(d)} m door ho (limit {s.radius_m} m). Class ke andar aakar scan karo.":
        "You are {int(d)} m away from the class location (limit {s.radius_m} m). Please scan from inside the classroom.",
    "Aapki attendance is session me pehle hi darj ho chuki hai.": "Your attendance has already been recorded for this session.",
    "Ye QR aapki class ka nahi hai.": "This QR code is not for your class.",
    "Ye CampusSync attendance ka QR nahi hai.": "This is not a CampusSync attendance QR code.",
    "Ye attendance session band ho chuka hai.": "This attendance session has ended.",
    "Ye session band ho chuka hai.": "This session has ended.",
    "Attendance session nahi mili.": "Attendance session not found.",
    "Session nahi mili.": "Session not found.",
    "Start date end date se pehle honi chahiye.": "The start date must be on or before the end date.",
    "Exam ka naam 1 se 60 akshar ka hona chahiye.": "The exam name must be 1 to 60 characters.",
    "Title 1 se 200 akshar ka hona chahiye.": "The title must be 1 to 200 characters.",
    "Description bahut lambi hai.": "The description is too long.",
    "Category sahi nahi hai.": "Invalid category.",
    "File {MAX_MB} MB se badi hai.": "The file is larger than {MAX_MB} MB.",
    "File {max_mb} MB se badi hai.": "The file is larger than {max_mb} MB.",
    "File ka content uske type se match nahi karta.": "The file content does not match its type.",
    "File khali hai.": "The file is empty.",
    "File server par nahi mili.": "File not found on the server.",
    "File nahi mili.": "File not found.",
    "Ye file type allowed nahi hai. PDF, PPT, DOC, XLS, TXT ya image do.":
        "This file type is not allowed. Please use PDF, PPT, DOC, XLS, TXT or an image.",
    "Ye file type allowed nahi hai. Allowed: ": "This file type is not allowed. Allowed: ",
    "Ek assignment me max {MAX_FILES} files laga sakte ho. Pehle koi hata do.":
        "An assignment can have at most {MAX_FILES} files. Remove one first.",
    "Assignment nahi mila ya wo aapka nahi hai.": "Assignment not found, or it does not belong to you.",
    "Assignment nahi mila.": "Assignment not found.",
    "Material nahi mila.": "Material not found.",
    "Copy nahi mili.": "Copy not found.",
    "Subject nahi mila.": "Subject not found.",
    "Unit nahi mili.": "Unit not found.",
    "Nahi mila.": "Not found.",
    "Theek hai": "OK",
    "({data['start'] or 'start'} se {data['end'] or 'aaj'})": "({data['start'] or 'start'} to {data['end'] or 'today'})",
    "{exam_name} ki copy upload ho gayi hai.": "Your evaluated copy for {exam_name} has been uploaded.",
    "{a.subject}: nayi file attach hui hai.": "{a.subject}: a new file has been attached.",
}

# Hinglish words used by the scan to flag text that still needs translating.
HINGLISH = set(
    "karo karna hai hain nahi nahin aap apna apni apne hoga hogi gayi gaya gaye abhi wala wali ka ki ke se me mein ko par tak "
    "liye isliye jaha aur jab tab sirf koi kuch ye wo yeh woh raha rahi baad pehle dikhao milega mili mila hua hui hue karein "
    "kare chahiye banao daalo dalo dena badi naya nayi purana hatao jodo juda dekho bhejo der kitni kitna kitne kaun kyun kaise "
    "hamesha chehre jaise tumhare tumhari tumhara shuru lekar jaati maangega wahi jahan waqt mera meri mere saari sabhi dobara "
    "lagao laga lagi chuno chun rakho rakhna dikhega dikhegi badlo badal sakte sakta sakti zaroori zyada theek sahi galat "
    "purani saaf aaj baaki khatam ghante din mahine".split()
)


def files():
    for folder in FOLDERS:
        if not folder.exists():
            continue
        for p in folder.rglob("*"):
            if p.is_file() and p.suffix in EXTS and not (SKIP_PARTS & set(p.parts)):
                yield p


def compiled():
    items = sorted(MAP.items(), key=lambda kv: -len(kv[0]))
    return [(re.compile(r"(?<![A-Za-z])" + re.escape(k) + r"(?![A-Za-z])"), v) for k, v in items]


def apply():
    rules, changed = compiled(), 0
    for p in files():
        text = p.read_text(encoding="utf-8")
        new, n = text, 0
        for rx, val in rules:
            new, c = rx.subn(lambda _m, v=val: v, new)
            n += c
        if new != text:
            dest = BACKUP / p.relative_to(ROOT)
            dest.parent.mkdir(parents=True, exist_ok=True)
            if not dest.exists():
                shutil.copy2(p, dest)
            p.write_text(new, encoding="utf-8")
            changed += 1
            print(f"updated  {p.relative_to(ROOT)}  ({n} replacements)")
    print(f"\nDone. {changed} file(s) changed. Backups: {BACKUP}")
    print("Now run:  python ui_english.py scan   (to see anything still left)")


def scan():
    found = 0
    for p in files():
        for i, line in enumerate(p.read_text(encoding="utf-8").splitlines(), 1):
            s = line.strip()
            if s.startswith(("#", "//", "import ", "from ", '"""', "'''")):
                continue
            if p.suffix == ".py":
                s = re.sub(r"\s+#.*$", "", s)
            words = re.findall(r"[a-z]+", s.lower())
            hits = [w for w in words if w in HINGLISH]
            weak = {"me", "ho", "do", "lo", "se", "ka", "ki", "ke", "ko", "par", "ya", "wo", "ye", "din", "der", "aaj", "sahi", "tak", "ab", "hai"}
            if not any(w not in weak for w in hits):
                continue
            has_text = ('"' in s or "'" in s or "`" in s or ">" in s)
            if len(hits) >= 2 and has_text:
                print(f"{p.relative_to(ROOT)}:{i}: {s[:180]}")
                found += 1
    print(f"\n{found} line(s) may still contain Hinglish." if found else "\nNo Hinglish text found.")


if __name__ == "__main__":
    mode = sys.argv[1] if len(sys.argv) > 1 else "scan"
    {"apply": apply, "scan": scan}.get(mode, scan)()
