import sqlite3
import os
from datetime import datetime, timezone
import json

DB_FILE = "speak2hr.db"

def get_db_connection():
    conn = sqlite3.connect(DB_FILE)
    conn.row_factory = sqlite3.Row
    return conn

def add_columns_if_missing(conn, table_name, columns_dict):
    cursor = conn.cursor()
    cursor.execute(f"PRAGMA table_info({table_name})")
    existing_cols = [row['name'] for row in cursor.fetchall()]
    for col_name, col_type in columns_dict.items():
        if col_name not in existing_cols:
            try:
                cursor.execute(f"ALTER TABLE {table_name} ADD COLUMN {col_name} {col_type}")
                print(f"Added column {col_name} to {table_name}.")
            except Exception as e:
                print(f"Error adding column {col_name} to {table_name}: {e}")

def init_db():
    conn = get_db_connection()
    cursor = conn.cursor()
    
    # Users table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS users (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            email TEXT UNIQUE NOT NULL,
            password TEXT NOT NULL,
            role TEXT NOT NULL,
            target_role TEXT,
            skills TEXT,
            experience_years INTEGER,
            status TEXT DEFAULT 'active',
            registered_date TEXT,
            last_login TEXT
        )
    ''')
    
    # OTP Table for Password Reset
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS otps (
            email TEXT PRIMARY KEY,
            otp TEXT NOT NULL,
            expires_at TEXT NOT NULL,
            created_at TEXT NOT NULL
        )
    ''')
    
    # Video Sessions (Slots) Table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS video_sessions (
            id TEXT PRIMARY KEY,
            hr_id TEXT,
            hr_name TEXT,
            hr_email TEXT,
            candidate_id TEXT,
            candidate_name TEXT,
            candidate_email TEXT,
            date TEXT NOT NULL,
            time TEXT NOT NULL,
            duration INTEGER,
            status TEXT DEFAULT 'available',
            video_link TEXT,
            created_at TEXT
        )
    ''')
    
    # Activity Logs
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS activity_logs (
            id TEXT PRIMARY KEY,
            user_id TEXT,
            action TEXT,
            timestamp TEXT
        )
    ''')
    
    # Interview Scores
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS evaluations (
            id TEXT PRIMARY KEY,
            candidate_id TEXT,
            hr_id TEXT,
            score REAL,
            feedback TEXT,
            status TEXT DEFAULT 'pending',
            created_at TEXT
        )
    ''')
    
    # Assessments
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS assessments (
            assessment_id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            total_questions INTEGER,
            correct_answers INTEGER,
            score_percentage REAL,
            category_breakdown TEXT,
            date TEXT NOT NULL
        )
    ''')
    
    # Notifications Table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS notifications (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            message TEXT NOT NULL,
            timestamp TEXT NOT NULL,
            is_read INTEGER DEFAULT 0
        )
    ''')
    
    # Candidate Resumes Table (for RAG pipeline)
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS candidate_resumes (
            id TEXT PRIMARY KEY,
            candidate_id TEXT NOT NULL,
            filename TEXT NOT NULL,
            file_hash TEXT NOT NULL,
            raw_text TEXT NOT NULL,
            parsed_summary TEXT,
            created_at TEXT NOT NULL
        )
    ''')

    # Resume Chunks and Vector Embeddings Table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS resume_chunks (
            id TEXT PRIMARY KEY,
            resume_id TEXT NOT NULL,
            candidate_id TEXT NOT NULL,
            chunk_index INTEGER NOT NULL,
            chunk_text TEXT NOT NULL,
            category TEXT,
            heading TEXT,
            technologies TEXT,
            embedding TEXT NOT NULL,
            created_at TEXT NOT NULL
        )
    ''')

    # Resume Interview Sessions Table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS resume_interview_sessions (
            id TEXT PRIMARY KEY,
            candidate_id TEXT NOT NULL,
            resume_id TEXT NOT NULL,
            role TEXT NOT NULL,
            difficulty TEXT NOT NULL,
            total_questions INTEGER NOT NULL,
            questions_json TEXT NOT NULL,
            current_question_index INTEGER DEFAULT 0,
            status TEXT DEFAULT 'in_progress',
            created_at TEXT NOT NULL,
            updated_at TEXT
        )
    ''')

    # Resume Interview Evaluations Table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS resume_interview_evaluations (
            id TEXT PRIMARY KEY,
            session_id TEXT NOT NULL,
            candidate_id TEXT NOT NULL,
            question_id TEXT NOT NULL,
            question TEXT NOT NULL,
            answer_text TEXT,
            relevance_score REAL DEFAULT 0,
            technical_accuracy_score REAL DEFAULT 0,
            clarity_score REAL DEFAULT 0,
            confidence_score REAL DEFAULT 0,
            overall_score REAL DEFAULT 0,
            feedback TEXT,
            strengths TEXT,
            improvements TEXT,
            evaluation_json TEXT,
            created_at TEXT NOT NULL
        )
    ''')
    
    # Dynamic schema migrations for new features
    users_new_cols = {
        "phone": "TEXT",
        "designation": "TEXT",
        "department": "TEXT",
        "specialization": "TEXT",
        "languages": "TEXT",
        "bio": "TEXT",
        "working_hours": "TEXT",
        "location": "TEXT",
        "rating": "REAL DEFAULT 5.0",
        "avatar": "TEXT",
        "overall_score": "REAL DEFAULT 0.0",
        "technical_score": "REAL DEFAULT 0.0",
        "communication_score": "REAL DEFAULT 0.0"
    }
    
    sessions_new_cols = {
        "end_time": "TEXT",
        "interview_type": "TEXT",
        "meeting_mode": "TEXT",
        "max_candidates": "INTEGER DEFAULT 1",
        "notes": "TEXT",
        "recurring": "TEXT",
        "is_enabled": "INTEGER DEFAULT 1"
    }
    
    add_columns_if_missing(conn, "users", users_new_cols)
    add_columns_if_missing(conn, "video_sessions", sessions_new_cols)
    
    # Indexes for performance optimization
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_assessments_user_id ON assessments(user_id)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_video_sessions_candidate ON video_sessions(candidate_id)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_video_sessions_hr ON video_sessions(hr_id)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_evaluations_candidate ON evaluations(candidate_id)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_activity_logs_user ON activity_logs(user_id)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_resumes_candidate ON candidate_resumes(candidate_id)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_chunks_resume ON resume_chunks(resume_id)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_chunks_candidate ON resume_chunks(candidate_id)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_resume_sessions_candidate ON resume_interview_sessions(candidate_id)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_resume_eval_session ON resume_interview_evaluations(session_id)")
    
    # Check if we need to seed an admin user
    cursor.execute("SELECT COUNT(*) as count FROM users WHERE email = 'admin@company.com'")
    if cursor.fetchone()['count'] == 0:
        cursor.execute('''
            INSERT INTO users (id, name, email, password, role, status, registered_date, last_login)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ''', (
            'admin-1', 'Admin User', 'admin@company.com', 'admin123', 'admin', 'active',
            datetime.now(timezone.utc).isoformat(), datetime.now(timezone.utc).isoformat()
        ))
        
    conn.commit()
    conn.close()

# Helper function to seed test users if they don't exist
def seed_test_users():
    conn = get_db_connection()
    cursor = conn.cursor()
    
    # Clear existing candidates and HR users to ensure exact seed counts
    cursor.execute("DELETE FROM users WHERE role IN ('hr', 'candidate')")
    
    # Seed 2 HR Users
    # 1. Sarah Johnson
    cursor.execute('''
        INSERT INTO users (id, name, email, password, role, designation, department, specialization, languages, bio, working_hours, location, rating, avatar, status, registered_date)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ''', (
        "hr_1", "Sarah Johnson", "hr@speak2hr.com", "password123", "hr",
        "Senior Technical Recruiter", "Engineering Hiring",
        json.dumps(["Backend Engineering", "Java", "Spring Boot", "Microservices"]),
        json.dumps(["English", "Hindi"]),
        "Passionate recruiter with 7+ years of experience helping candidates find their dream jobs.",
        "9:00 AM - 6:00 PM", "San Francisco, CA (Remote)", 4.8,
        "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150",
        "approved", datetime.now(timezone.utc).isoformat()
    ))
    
    # 2. David Miller
    cursor.execute('''
        INSERT INTO users (id, name, email, password, role, designation, department, specialization, languages, bio, working_hours, location, rating, avatar, status, registered_date)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ''', (
        "hr_2", "David Miller", "david.miller@speak2hr.com", "password123", "hr",
        "Technical Talent Partner", "Frontend & Design",
        json.dumps(["Frontend Development", "React", "Vue", "UX/UI Design", "TypeScript"]),
        json.dumps(["English", "Spanish"]),
        "Recruiter focused on pixel-perfect frontend engineering and product design.",
        "10:00 AM - 7:00 PM", "New York, NY", 4.9,
        "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150",
        "approved", datetime.now(timezone.utc).isoformat()
    ))
    
    # Seed 3 Candidates
    # 1. John Doe (Candidate 1)
    cursor.execute('''
        INSERT INTO users (id, name, email, password, role, target_role, skills, experience_years, status, registered_date)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ''', (
        "cand_1", "John Doe", "candidate@speak2hr.com", "password123", "candidate",
        "Software Engineer", json.dumps(["Python", "React", "SQL"]), 3, "active",
        datetime.now(timezone.utc).isoformat()
    ))
    
    # 2. Jane Smith (Candidate 2)
    cursor.execute('''
        INSERT INTO users (id, name, email, password, role, target_role, skills, experience_years, status, registered_date)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ''', (
        "cand_2", "Jane Smith", "jane.smith@speak2hr.com", "password123", "candidate",
        "Senior Backend Engineer", json.dumps(["Java", "Spring Boot", "MySQL", "Microservices"]), 5, "active",
        datetime.now(timezone.utc).isoformat()
    ))
    
    # 3. Alex Jones (Candidate 3)
    cursor.execute('''
        INSERT INTO users (id, name, email, password, role, target_role, skills, experience_years, status, registered_date)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ''', (
        "cand_3", "Alex Jones", "alex.jones@speak2hr.com", "password123", "candidate",
        "Frontend Developer", json.dumps(["JavaScript", "HTML", "CSS", "Figma"]), 2, "active",
        datetime.now(timezone.utc).isoformat()
    ))

    conn.commit()
    conn.close()

if __name__ == "__main__":
    init_db()
    seed_test_users()
    print("Database initialized successfully.")
