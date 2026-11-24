import os
import re
from collections import defaultdict
import uuid
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import Response
from app.pdf_utils import syllabus_pdf


from sqlalchemy import func
from sqlalchemy.orm import Session

from app.database import get_db
from app import models, schemas
from app.routers.auth import get_current_user
from app.routers.student import _require_student
from app.routers.timetable import _norm

router = APIRouter(prefix="/api/student/syllabus", tags=["student-syllabus"])

# (semester, code, name, type, credits, internal, external, overview,
#  [(unit title, "topic; topic; topic", hours), ...], [reference books])
SEED_SYLLABUS = [
    (3, "CS301", "Data Structures", "theory", 4, 40, 60,
     "Covers how data is organised in memory and the algorithms that work on it. Students learn to pick the right "
     "structure for a problem and to analyse its time and space cost.",
     [("Introduction and arrays", "Abstract data types; Algorithm analysis and Big-O notation; Arrays and strings; Sparse matrices", 8),
      ("Linked lists, stacks and queues", "Singly, doubly and circular linked lists; Stack operations and applications; Infix to postfix conversion; Queue, circular queue and deque", 10),
      ("Trees", "Binary trees and traversals; Binary search trees; AVL trees; Heaps and priority queues", 10),
      ("Graphs, searching and sorting", "Graph representation; BFS and DFS; Shortest path and spanning tree algorithms; Hashing; Sorting algorithms and their complexity", 12)],
     ["Ellis Horowitz and Sartaj Sahni, Fundamentals of Data Structures",
      "Thomas H. Cormen et al., Introduction to Algorithms",
      "Seymour Lipschutz, Data Structures (Schaum's Outline)"]),
    (3, "MA302", "Discrete Mathematics", "theory", 4, 40, 60,
     "The mathematics behind computer science: logic, sets, counting, graphs and algebraic structures.",
     [("Logic and proofs", "Propositional logic; Predicates and quantifiers; Methods of proof; Mathematical induction", 9),
      ("Sets, relations and functions", "Set operations; Relations and their properties; Equivalence relations and partial orders; Functions", 9),
      ("Counting", "Permutations and combinations; Pigeonhole principle; Recurrence relations; Inclusion and exclusion", 9),
      ("Graph theory and algebraic structures", "Graphs, paths and trees; Planar graphs and colouring; Groups and subgroups; Boolean algebra", 11)],
     ["Kenneth H. Rosen, Discrete Mathematics and Its Applications",
      "C. L. Liu, Elements of Discrete Mathematics"]),
    (3, "CS303", "Object Oriented Programming", "theory", 3, 40, 60,
     "Object oriented design and programming using Java: classes, inheritance, exceptions and collections.",
     [("Classes and objects", "Objects and classes; Encapsulation and abstraction; Constructors; Static members", 8),
      ("Inheritance and polymorphism", "Inheritance types; Method overriding and overloading; Abstract classes and interfaces; Packages", 9),
      ("Exceptions and files", "Exception handling; Custom exceptions; File input and output; Serialization", 8),
      ("Generics and collections", "Generic classes and methods; List, Set and Map; Iterators; Introduction to lambda expressions", 9)],
     ["Herbert Schildt, Java: The Complete Reference",
      "Cay S. Horstmann, Core Java Volume I"]),
    (3, "CS304", "Data Structures Lab", "practical", 2, 25, 25,
     "Hands-on practice of the structures and algorithms taught in Data Structures.",
     [("List of experiments", "Array operations and searching; Linked list implementation; Stack and queue using arrays and lists; Infix to postfix conversion; Binary search tree operations; Graph traversals (BFS and DFS); Sorting algorithms and comparison", 28)],
     ["Department lab manual"]),

    (4, "CS401", "Database Management Systems", "theory", 4, 40, 60,
     "Design, query and manage relational databases, and understand how transactions keep data consistent.",
     [("Introduction and ER model", "Database approach versus file system; Three-schema architecture; ER and enhanced ER model; Mapping ER to relational model", 8),
      ("Relational model and SQL", "Relational algebra; SQL DDL and DML; Joins and subqueries; Views and indexes", 12),
      ("Normalisation", "Functional dependencies; 1NF, 2NF, 3NF and BCNF; Decomposition and lossless join", 8),
      ("Transactions and concurrency", "ACID properties; Schedules and serializability; Locking protocols; Recovery techniques", 10)],
     ["Silberschatz, Korth and Sudarshan, Database System Concepts",
      "Elmasri and Navathe, Fundamentals of Database Systems"]),
    (4, "CS402", "Operating Systems", "theory", 4, 40, 60,
     "How an operating system manages processes, memory, files and devices.",
     [("Introduction", "Functions and types of operating systems; System calls; Process concept; Threads", 8),
      ("CPU scheduling and synchronisation", "Scheduling algorithms; Critical section problem; Semaphores and monitors; Classical synchronisation problems; Deadlocks", 12),
      ("Memory management", "Swapping and contiguous allocation; Paging and segmentation; Virtual memory; Page replacement algorithms", 10),
      ("Storage and protection", "File systems and directories; Disk scheduling; Protection and security", 8)],
     ["Silberschatz, Galvin and Gagne, Operating System Concepts",
      "Andrew S. Tanenbaum, Modern Operating Systems"]),
    (4, "CS403", "Computer Organization and Architecture", "theory", 3, 40, 60,
     "The structure of a computer: processor, memory hierarchy and input/output.",
     [("Basic structure", "Functional units; Instruction formats and addressing modes; Number representation", 8),
      ("Processor and control", "ALU design; Control unit; Pipelining and hazards", 10),
      ("Memory", "Memory hierarchy; Cache mapping techniques; Virtual memory", 9),
      ("Input/output and parallelism", "Interrupts and DMA; I/O interfaces; Introduction to multiprocessors", 8)],
     ["Hamacher, Vranesic and Zaky, Computer Organization and Embedded Systems",
      "M. Morris Mano, Computer System Architecture"]),
    (4, "CS404", "Database Management Systems Lab", "practical", 2, 25, 25,
     "Practical work in SQL and database design.",
     [("List of experiments", "DDL and DML commands; Constraints and keys; Joins and subqueries; Views and indexes; PL/SQL procedures and triggers; Mini project on a real-life database", 28)],
     ["Department lab manual"]),

    (5, "CS501", "Computer Networks", "theory", 4, 40, 60,
     "How data travels across networks, layer by layer, from cables to web applications.",
     [("Introduction and physical layer", "OSI and TCP/IP models; Transmission media; Switching techniques", 8),
      ("Data link layer", "Framing and error detection; Flow control protocols; MAC protocols and Ethernet", 10),
      ("Network layer", "IP addressing and subnetting; Routing algorithms; ICMP and IPv6", 10),
      ("Transport and application layer", "TCP and UDP; Congestion control; DNS, HTTP and SMTP; Network security basics", 10)],
     ["Behrouz A. Forouzan, Data Communications and Networking",
      "Andrew S. Tanenbaum, Computer Networks"]),
    (5, "CS502", "Theory of Computation", "theory", 4, 40, 60,
     "The mathematical models of computation and the limits of what computers can solve.",
     [("Finite automata", "DFA and NFA; Regular expressions; Pumping lemma for regular languages", 10),
      ("Context free languages", "Context free grammars and parse trees; Pushdown automata; Ambiguity and normal forms", 10),
      ("Turing machines", "Turing machine and its variants; Church-Turing thesis; Recursive and recursively enumerable languages", 10),
      ("Decidability and complexity", "Undecidable problems; Halting problem; Classes P and NP; NP-completeness", 8)],
     ["Hopcroft, Motwani and Ullman, Introduction to Automata Theory, Languages and Computation",
      "Michael Sipser, Introduction to the Theory of Computation"]),
    (5, "CS503", "Software Engineering", "theory", 3, 40, 60,
     "How large software is planned, designed, tested and delivered by a team.",
     [("Process models", "SDLC and Waterfall model; Agile and Scrum; Requirement engineering; Software requirement specification", 8),
      ("Design", "Architectural design; UML diagrams; Design patterns", 9),
      ("Testing", "Black box and white box testing; Unit, integration and system testing; Writing test cases", 9),
      ("Project management", "Cost estimation (COCOMO); Risk management; Version control and continuous integration", 8)],
     ["Roger S. Pressman, Software Engineering: A Practitioner's Approach",
      "Ian Sommerville, Software Engineering"]),
    (5, "CS504", "Computer Networks Lab", "practical", 2, 25, 25,
     "Practical work on network tools and socket programming.",
     [("List of experiments", "Network commands: ping, traceroute and netstat; Socket programming with TCP and UDP; Implementing error detection (CRC); Subnetting practice; Packet analysis with Wireshark; Setting up a small LAN", 28)],
     ["Department lab manual"]),
]


def _lines(text) -> list[str]:
    return [line.strip() for line in (text or "").splitlines() if line.strip()]


def _semester_number(value) -> int | None:
    """'5th' -> 5, 'Semester 3' -> 3. Returns None when no number is found."""
    m = re.search(r"\d+", value or "")
    return int(m.group()) if m else None


@router.get("/overview", response_model=schemas.SyllabusOverview)
def overview(
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    profile = _require_student(current_user)
    course = _norm(profile.course)
    if not course:
        return schemas.SyllabusOverview(
            course=profile.course, course_known=False, current_semester=None, semesters=[]
        )

    subjects = (
        db.query(models.SyllabusSubject)
        .filter(func.lower(func.trim(models.SyllabusSubject.course)) == course)
        .order_by(models.SyllabusSubject.semester, models.SyllabusSubject.code)
        .all()
    )

    units_by_subject = defaultdict(list)
    if subjects:
        units = (
            db.query(models.SyllabusUnit)
            .filter(models.SyllabusUnit.subject_id.in_([s.id for s in subjects]))
            .order_by(models.SyllabusUnit.unit_no)
            .all()
        )
        for u in units:
            units_by_subject[u.subject_id].append(
                schemas.SyllabusUnitOut(unit_no=u.unit_no, title=u.title, topics=_lines(u.topics), hours=u.hours)
            )

    by_semester = defaultdict(list)
    for s in subjects:
        by_semester[s.semester].append(
            schemas.SyllabusSubjectOut(
                id=str(s.id), code=s.code, name=s.name, subject_type=s.subject_type, credits=s.credits,
                internal_marks=s.internal_marks, external_marks=s.external_marks, overview=s.overview,
                books=_lines(s.books), units=units_by_subject.get(s.id, []),
            )
        )

    semesters = [
        schemas.SyllabusSemesterOut(
            semester=number, total_credits=sum(x.credits for x in subs), subjects=subs
        )
        for number, subs in sorted(by_semester.items())
    ]
    return schemas.SyllabusOverview(
        course=profile.course,
        course_known=True,
        current_semester=_semester_number(profile.semester),
        semesters=semesters,
    )


@router.post("/demo-seed")
def demo_seed(
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """DEV ONLY. Creates a sample syllabus (semesters 3 to 5) for the student's course so the screen
    can be tried before the Admin module exists. Set ENABLE_DEMO_DATA=false in .env to switch it off."""
    if os.getenv("ENABLE_DEMO_DATA", "true").lower() != "true":
        raise HTTPException(status_code=404, detail="Not available.")
    profile = _require_student(current_user)
    course = (profile.course or "").strip()
    if not course:
        raise HTTPException(
            status_code=400,
            detail="Fill Course in your Student Profile first. The syllabus is made for your course.",
        )
    exists = (
        db.query(models.SyllabusSubject.id)
        .filter(func.lower(func.trim(models.SyllabusSubject.course)) == course.lower())
        .first()
    )
    if exists:
        raise HTTPException(status_code=400, detail="A syllabus already exists for your course.")

    for semester, code, name, kind, credits, internal, external, overview_text, units, books in SEED_SYLLABUS:
        subject = models.SyllabusSubject(
            course=course, semester=semester, code=code, name=name, subject_type=kind, credits=credits,
            internal_marks=internal, external_marks=external, overview=overview_text, books="\n".join(books),
        )
        db.add(subject)
        db.flush()
        for number, (title, topics, hours) in enumerate(units, start=1):
            db.add(models.SyllabusUnit(
                subject_id=subject.id, unit_no=number, title=title,
                topics="\n".join(t.strip() for t in topics.split(";") if t.strip()), hours=hours,
            ))

    db.commit()
    return {"subjects": len(SEED_SYLLABUS)}

@router.get("/pdf")
def download_pdf(
    semester: int | None = Query(None),
    subject_id: uuid.UUID | None = Query(None),
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """A real PDF file. With semester: the scheme table and the complete syllabus of every subject of that
    semester. With subject_id: the complete syllabus of that one subject."""
    profile = _require_student(current_user)
    course = _norm(profile.course)
    if not course:
        raise HTTPException(status_code=400, detail="Fill your Course in Student Profile first.")

    query = db.query(models.SyllabusSubject).filter(func.lower(func.trim(models.SyllabusSubject.course)) == course)
    if subject_id is not None:
        query = query.filter(models.SyllabusSubject.id == subject_id)
    elif semester is not None:
        query = query.filter(models.SyllabusSubject.semester == semester)
    else:
        raise HTTPException(status_code=400, detail="Choose a semester or a subject.")
    subjects = query.order_by(models.SyllabusSubject.semester, models.SyllabusSubject.code).all()
    if not subjects:
        raise HTTPException(status_code=404, detail="No syllabus found.")

    units = defaultdict(list)
    for u in (
        db.query(models.SyllabusUnit)
        .filter(models.SyllabusUnit.subject_id.in_([s.id for s in subjects]))
        .order_by(models.SyllabusUnit.unit_no)
        .all()
    ):
        units[u.subject_id].append({"title": u.title, "topics": _lines(u.topics), "hours": u.hours})

    items = [
        dict(code=s.code, name=s.name, type=s.subject_type, credits=s.credits, internal=s.internal_marks,
             external=s.external_marks, overview=s.overview, books=_lines(s.books), units=units.get(s.id, []))
        for s in subjects
    ]
    whole_semester = subject_id is None
    pdf = syllabus_pdf(profile.course.strip(), f"Semester {subjects[0].semester}", items, with_scheme=whole_semester)

    base = f"Syllabus_{profile.course.strip()}_Semester_{subjects[0].semester}"
    if not whole_semester:
        base += f"_{subjects[0].code}"
    filename = re.sub(r"[^A-Za-z0-9]+", "_", base).strip("_") + ".pdf"
    return Response(
        content=pdf, media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )