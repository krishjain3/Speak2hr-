import os
import warnings

# Suppress TensorFlow logging, oneDNN warnings, and python warnings
os.environ['TF_CPP_MIN_LOG_LEVEL'] = '3'
os.environ['TF_ENABLE_ONEDNN_OPTS'] = '0'
warnings.filterwarnings('ignore')

from fastapi import FastAPI, UploadFile, File, HTTPException, Form, WebSocket, WebSocketDisconnect 
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel
from typing import List, Optional, Dict, Any
import os
import json
import re
import numpy as np
from numpy.linalg import norm
import base64
import shutil
import uuid
import logging
import time
from pathlib import Path
from datetime import datetime, timedelta, timezone
import random
import asyncio
import sqlite3
from database import init_db, get_db_connection

# Document processing
from PyPDF2 import PdfReader
import docx

# Google GenAI
from google import genai

from dotenv import load_dotenv

# For vectorization
from gensim.models.doc2vec import Doc2Vec

# Video/Image processing for emotion analysis
import cv2
from deepface import DeepFace

from contextlib import asynccontextmanager

# PDF Generation
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak
from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER

# Email
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from email.mime.base import MIMEBase
from email import encoders

# ==================== LOGGING SETUP ====================
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# ==================== LOAD ENVIRONMENT ====================
load_dotenv(override=True)

# Multiple API keys for parallel independent processing
API_KEYS = {
    "primary": os.getenv("GOOGLE_API_KEY_1"),
    "secondary": os.getenv("GOOGLE_API_KEY_2"),
    "tertiary": os.getenv("GOOGLE_API_KEY_3"),
    "assessment": os.getenv("GOOGLE_API_KEY_4"),
    "emotion": os.getenv("GOOGLE_API_KEY_5")
}

EMAIL_USER = os.getenv("EMAIL_USER", "your_email@gmail.com")
EMAIL_PASSWORD = os.getenv("EMAIL_PASSWORD", "your_app_password")

# Initialize multiple Gemini clients
genai_clients = {}
for key_name, api_key in API_KEYS.items():
    if api_key:
        genai_clients[key_name] = genai.Client(api_key=api_key)
        logger.info(f"Gemini client '{key_name}' configured")
    else:
        logger.warning(f"API key '{key_name}' not found!")

# Assume all configured clients are active initially
working_clients = {k: v for k, v in genai_clients.items()}


# ==================== DIRECTORIES ====================
TEMP_DIR = "temp_files"
RECORDINGS_DIR = Path("recordings")
VIDEOS_DIR = Path("videos")
PROFILES_DIR = Path("profiles")
REPORTS_DIR = Path("reports")
ASSESSMENTS_DIR = Path("assessments")
EMOTION_ANALYSIS_DIR = Path("emotion_analysis")
DAILY_QUESTIONS_DIR = Path("daily_questions")

# ==================== CACHE ====================
DOC2VEC_MODEL = None
INTERVIEW_EVALUATIONS = {}
DAILY_QUESTIONS_HISTORY = {}

# ==================== QUESTION PROGRESSION ====================
QUESTION_PROGRESSION = [
    {"level": 1, "name": "Introduction", "category": "behavioral", "difficulty": "easy", "weight": 0.8},
    {"level": 2, "name": "Recent Project", "category": "technical", "difficulty": "medium", "weight": 1.0},
    {"level": 3, "name": "Technical Concepts", "category": "technical", "difficulty": "medium", "weight": 1.1},
    {"level": 4, "name": "Coding/Algorithms", "category": "technical", "difficulty": "hard", "weight": 1.3},
    {"level": 5, "name": "System Design", "category": "technical", "difficulty": "hard", "weight": 1.4},
    {"level": 6, "name": "Behavioral (STAR)", "category": "behavioral", "difficulty": "medium", "weight": 1.1},
    {"level": 7, "name": "Scenario Analysis", "category": "technical", "difficulty": "hard", "weight": 1.5},
    {"level": 8, "name": "Career Goals", "category": "behavioral", "difficulty": "easy", "weight": 0.8},
]

GEMINI_MODEL = "gemini-2.0-flash"




# ==================== LIFESPAN ====================
@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Starting Speak2HR application...")
    
    # Initialize Database
    init_db()
    
    # Create directories
    for directory in [TEMP_DIR, RECORDINGS_DIR, VIDEOS_DIR, PROFILES_DIR, 
                      REPORTS_DIR, ASSESSMENTS_DIR, EMOTION_ANALYSIS_DIR, DAILY_QUESTIONS_DIR]:
        os.makedirs(directory, exist_ok=True)
    
    active_keys = sum(1 for key in API_KEYS.values() if key)
    logger.info(f"Active API keys: {active_keys}/{len(API_KEYS)}")
    
    # Load cached question banks and metadata into memory
    try:
        from question_bank_manager import ROLE_FOLDER_MAP, load_role_question_bank, load_role_metadata
        logger.info("Loading cached question banks into memory...")
        for role_folder in ROLE_FOLDER_MAP.values():
            load_role_question_bank(role_folder)
            load_role_metadata(role_folder)
        logger.info("Cached question banks and metadata loaded successfully.")
    except Exception as e:
        logger.error(f"Failed to load cached question banks: {e}")
        
    logger.info("Application startup complete")
    yield
    
    logger.info("Shutting down application...")
    for temp_file in os.listdir(TEMP_DIR):
        try:
            os.remove(os.path.join(TEMP_DIR, temp_file))
        except Exception as e:
            logger.error(f"Failed to clean up: {str(e)}")
    logger.info("Application shutdown complete")

# ==================== FASTAPI APP ====================
app = FastAPI(
    title="Speak2HR - AI Interview System",
    lifespan=lifespan,
    description="ML-focused interview system with DeepFace emotion analysis",
    version="3.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ==================== WEBSOCKET MANAGER ====================
class ConnectionManager:
    def __init__(self):
        # {room_id: {user_id: websocket}}
        self.active_connections: Dict[str, Dict[str, WebSocket]] = {}

    async def connect(self, websocket: WebSocket, room_id: str, user_id: str):
        await websocket.accept()
        if room_id not in self.active_connections:
            self.active_connections[room_id] = {}
        
        # Notify others in the room
        await self.broadcast({"type": "peer-joined", "userId": user_id}, room_id, user_id)
        
        self.active_connections[room_id][user_id] = websocket
        logger.info(f"User {user_id} connected to room {room_id}")

    def disconnect(self, room_id: str, user_id: str):
        if room_id in self.active_connections:
            if user_id in self.active_connections[room_id]:
                del self.active_connections[room_id][user_id]
            if not self.active_connections[room_id]:
                del self.active_connections[room_id]
        logger.info(f"User {user_id} disconnected from room {room_id}")

    async def broadcast(self, message: dict, room_id: str, sender_id: str):
        if room_id in self.active_connections:
            for user_id, websocket in self.active_connections[room_id].items():
                if user_id != sender_id:
                    try:
                        await websocket.send_json(message)
                    except Exception as e:
                        logger.error(f"Error broadcasting to {user_id}: {e}")

manager = ConnectionManager()

# ==================== WEBSOCKET ENDPOINT ====================
@app.websocket("/ws/video/{room_id}/{user_id}")
async def video_signaling(websocket: WebSocket, room_id: str, user_id: str):
    await manager.connect(websocket, room_id, user_id)
    try:
        while True:
            data = await websocket.receive_json()
            # Signaling message format: {"type": "offer/answer/ice-candidate", "data": ...}
            await manager.broadcast(data, room_id, user_id)
    except WebSocketDisconnect:
        manager.disconnect(room_id, user_id)
    except Exception as e:
        logger.error(f"WebSocket error in room {room_id} for user {user_id}: {e}")
        manager.disconnect(room_id, user_id)

# ==================== PYDANTIC MODELS ====================

class ResumeAnalysisResponse(BaseModel):
    summary: dict
    skills: List[str]

class JobMatchRequest(BaseModel):
    resume_summary: str
    job_description: str

class JobMatchResponse(BaseModel):
    match_percentage: float
    recommendation: str

class InterviewQuestionRequest(BaseModel):
    job_description: str
    role: str
    user_id: str
    candidate_name: Optional[str] = None
    candidate_email: Optional[str] = None
    candidate_skills: List[str]  # Extracted skills from resume
    candidate_experience_years: int  # Years of experience
    candidate_work_history: Optional[List[Dict[str, str]]] = None  # [{"company": "X", "role": "Y", "duration": "Z"}]
    num_questions: Optional[int] = 8
    interview_level: Optional[str] = "Technical Basic"

class InterviewQuestion(BaseModel):
    question_id: str
    question: str
    category: str
    difficulty: str
    level: int
    level_name: str
    order: int
    weight: float
    expected_keywords: Optional[List[str]] = []

class InterviewQuestionsResponse(BaseModel):
    questions: List[InterviewQuestion]
    session_id: str
    total_questions: int

class EmotionFrame(BaseModel):
    timestamp: float
    emotion: str
    confidence: float

class EmotionAnalysis(BaseModel):
    dominant_emotion: str
    emotion_distribution: Dict[str, float]
    average_confidence: float
    total_frames_analyzed: int
    emotion_timeline: List[EmotionFrame]
    engagement_score: float
    stress_indicators: List[str]

class VideoInterviewEvaluationResult(BaseModel):
    question_id: str
    question: str
    level: int
    level_name: str
    category: str
    difficulty: str
    weight: float
    transcription: str
    audio_evaluation: dict
    emotion_analysis: EmotionAnalysis
    relevance_score: float
    clarity_score: float
    confidence_score: float
    technical_accuracy_score: float
    keyword_usage_score: float
    emotion_score: float
    weighted_score: float
    session_id: str
    timestamp: str
    video_duration: float
    audio_duration: float

class SessionSummary(BaseModel):
    session_id: str
    user_id: str
    total_questions: int
    questions_answered: int
    average_score: float
    weighted_average_score: float
    category_scores: Dict[str, float]
    difficulty_scores: Dict[str, float]
    overall_emotion: str
    stress_level: str
    recommendation: str

class DailyAssessmentRequest(BaseModel):
    user_id: str
    role: str
    difficulty: Optional[str] = "medium"
    experience_level: Optional[str] = "mid"
    skills: Optional[List[str]] = None
    category: str
    num_questions: Optional[int] = 10

class DailyQuestion(BaseModel):
    question_id: str
    question: str
    category: str
    difficulty: str
    options: Optional[List[str]] = None
    question_type: str
    expected_keywords: List[str]
    time_limit_seconds: int
    correct_answer: Any
    model_answer: Optional[str] = None
    explanation: Optional[str] = None

class DailyAssessmentResponse(BaseModel):
    assessment_id: str
    questions: List[DailyQuestion]
    total_questions: int
    date: str

class AssessmentSubmission(BaseModel):
    assessment_id: str
    user_id: str
    answers: Dict[str, str]

class AssessmentResult(BaseModel):
    assessment_id: str
    user_id: str
    total_questions: int
    correct_answers: int
    score_percentage: float
    category_breakdown: Dict[str, dict]
    detailed_feedback: List[dict]
    improvement_areas: List[str]
    date: str

class ReportRequest(BaseModel):
    session_id: str
    user_id: Optional[str] = None
    user_name: Optional[str] = None
    user_email: Optional[str] = None
    role: Optional[str] = None
    send_email: Optional[bool] = True

class SkillGapRequest(BaseModel):
    resume_summary: str
    job_description: str

class SkillGapResponse(BaseModel):
    missing_skills: List[str]
    recommendations: List[str]
    additional_training: List[str]

class SlotBookingRequest(BaseModel):
    slot_id: str
    candidate_id: str
    candidate_name: str
    candidate_email: str
    hr_name: str
    hr_email: str
    date: str
    time: str
    duration: int

class RegisterRequest(BaseModel):
    name: str
    email: str
    password: str
    role: str
    targetRole: Optional[str] = None
    skills: Optional[List[str]] = []
    experienceYears: Optional[int] = 0

class LoginRequest(BaseModel):
    email: str
    password: str

class ForgotPasswordRequest(BaseModel):
    email: str

class ResetPasswordRequest(BaseModel):
    email: str
    verificationCode: str
    newPassword: str

class AuthResponse(BaseModel):
    user: dict
    token: str

def make_json_serializable(data):
    """Recursively convert numpy types to native Python types for JSON serialization"""
    if isinstance(data, dict):
        return {k: make_json_serializable(v) for k, v in data.items()}
    elif isinstance(data, list):
        return [make_json_serializable(v) for v in data]
    elif hasattr(data, "item"):  # Matches numpy types
        return data.item()
    return data

def generate_content_with_retry(client_type: str, contents, config=None):
    """Wrapper that makes a generate_content call and retries with other clients on 429 Resource Exhausted errors"""
    tested_keys = set()
    current_type = client_type
    
    while len(tested_keys) < len(working_clients):
        try:
            client = get_client(current_type)
            # Find the actual key name
            actual_key_name = None
            for name, cl in working_clients.items():
                if cl == client:
                    actual_key_name = name
                    break
            
            if actual_key_name:
                tested_keys.add(actual_key_name)
                
            kwargs = {
                "model": GEMINI_MODEL,
                "contents": contents
            }
            if config:
                kwargs["config"] = config
                
            response = client.models.generate_content(**kwargs)
            return response
            
        except Exception as e:
            error_str = str(e)
            if "429" in error_str or "RESOURCE_EXHAUSTED" in error_str or "quota" in error_str.lower():
                logger.warning(f"Gemini client '{current_type}' hit rate limit (429). Retrying with another client...")
                remaining = [k for k in working_clients.keys() if k not in tested_keys]
                if remaining:
                    current_type = remaining[0]
                    continue
            raise e
            
    raise HTTPException(status_code=429, detail="All Gemini API keys hit rate limits. Please try again in a few seconds.")

def get_client(client_type: str = "primary"):
    """Get appropriate Gemini client based on use case, with fallback to working clients"""
    if client_type in working_clients:
        return working_clients[client_type]
    
    # Fallback options in priority order
    for fallback in ["primary", "tertiary", "assessment", "secondary", "emotion"]:
        if fallback in working_clients:
            logger.info(f"Falling back from Gemini client '{client_type}' to working client '{fallback}'")
            return working_clients[fallback]
            
    # Absolute fallback to first available working client
    if working_clients:
        fallback = list(working_clients.keys())[0]
        logger.info(f"Falling back from Gemini client '{client_type}' to working client '{fallback}'")
        return working_clients[fallback]
        
    # If working_clients is completely empty, use raw genai_clients as last resort
    if client_type in genai_clients:
        logger.warning(f"No verified clients available. Falling back to raw client '{client_type}'")
        return genai_clients[client_type]
        
    if genai_clients:
        first_key = list(genai_clients.keys())[0]
        logger.warning(f"No verified clients available. Falling back to raw client '{first_key}'")
        return genai_clients[first_key]
        
    raise HTTPException(status_code=500, detail="No working Gemini API keys configured.")


def log_activity(user_id: str, action: str):
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute(
            "INSERT INTO activity_logs (id, user_id, action, timestamp) VALUES (?, ?, ?, ?)",
            (str(uuid.uuid4()), user_id, action, datetime.now(timezone.utc).isoformat())
        )
        conn.commit()
    except Exception as e:
        logger.error(f"Error logging activity: {e}")
    finally:
        conn.close()

def create_notification(user_id: str, message: str):
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute(
            "INSERT INTO notifications (id, user_id, message, timestamp, is_read) VALUES (?, ?, ?, ?, ?)",
            (str(uuid.uuid4()), user_id, message, datetime.now(timezone.utc).isoformat(), 0)
        )
        conn.commit()
    except Exception as e:
        logger.error(f"Error creating notification: {e}")
    finally:
        conn.close()

def recalculate_user_metrics(user_id: str):
    """Recalculate and persist overall, technical, and communication scores for a user.
    Reads from SQLite assessments + evaluations tables for reliability.
    """
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        # 1. Fetch all assessments from SQLite (primary source — always written on submission)
        cursor.execute("SELECT score_percentage, category_breakdown FROM assessments WHERE user_id = ?", (user_id,))
        assessment_rows = cursor.fetchall()

        # 2. Fetch all completed evaluations (HR manual scores)
        cursor.execute(
            "SELECT score FROM evaluations WHERE candidate_id = ? AND status = 'completed' AND score > 0",
            (user_id,)
        )
        eval_rows = cursor.fetchall()

        # 3. Overall average
        assessment_scores = [
            float(row['score_percentage'])
            for row in assessment_rows
            if row['score_percentage'] is not None
        ]
        interview_scores = [
            float(row['score'])
            for row in eval_rows
            if row['score'] is not None
        ]
        all_scores = assessment_scores + interview_scores
        overall = sum(all_scores) / len(all_scores) if all_scores else 0.0

        # 4. Extract category-level scores from assessment category_breakdown JSON
        technical_scores = []
        communication_scores = []

        for row in assessment_rows:
            try:
                raw = row['category_breakdown']
                categories = json.loads(raw) if isinstance(raw, str) else raw
                if not isinstance(categories, dict):
                    continue
                for k, v in categories.items():
                    pct = float(v.get('percentage', 0)) if isinstance(v, dict) else float(v or 0)
                    k_lower = k.lower()
                    if any(kw in k_lower for kw in ['tech', 'coding', 'program']):
                        technical_scores.append(pct)
                    elif any(kw in k_lower for kw in ['hr', 'comm', 'soft', 'behav', 'person']):
                        communication_scores.append(pct)
                    else:
                        # Unclassified category — contribute to both
                        technical_scores.append(pct)
                        communication_scores.append(pct)
            except Exception:
                pass

        # HR interview scores contribute proportionally to both
        for score in interview_scores:
            technical_scores.append(score)
            communication_scores.append(score)

        tech = sum(technical_scores) / len(technical_scores) if technical_scores else overall
        comm = sum(communication_scores) / len(communication_scores) if communication_scores else overall

        # 5. Persist updated metrics
        cursor.execute(
            "UPDATE users SET overall_score=?, technical_score=?, communication_score=? WHERE id=?",
            (round(overall, 1), round(tech, 1), round(comm, 1), user_id)
        )
        conn.commit()
        logger.info(
            f"Recalculated metrics for user {user_id}: "
            f"overall={overall:.1f}, tech={tech:.1f}, comm={comm:.1f}"
        )
    except Exception as e:
        logger.error(f"Error recalculating user metrics for {user_id}: {e}")
    finally:
        conn.close()

def load_doc2vec_model():
    """Load and cache the Doc2Vec model"""
    global DOC2VEC_MODEL
    if DOC2VEC_MODEL is None:
        logger.info("Loading Doc2Vec model...")
        start_time = time.time()
        try:
            DOC2VEC_MODEL = Doc2Vec.load(os.path.join(os.getcwd(), "cv_job_maching.model"))
            logger.info(f"Model loaded in {time.time() - start_time:.2f} seconds")
        except Exception as e:
            logger.error(f"Error loading Doc2Vec model: {str(e)}")
            raise HTTPException(status_code=500, detail="Failed to load Doc2Vec model")
    return DOC2VEC_MODEL

def process_file(file_path):
    """Extract text from uploaded files"""
    file_extension = os.path.splitext(file_path)[1].lower()
    
    if file_extension == '.pdf':
        reader = PdfReader(file_path)
        return " ".join([page.extract_text() for page in reader.pages])
    
    elif file_extension in ['.docx', '.doc']:
        doc = docx.Document(file_path)
        return " ".join([para.text for para in doc.paragraphs])
    
    elif file_extension == '.txt':
        with open(file_path, 'r', encoding='utf-8') as f:
            return f.read()
    
    else:
        raise ValueError(f"Unsupported file format: {file_extension}")

def analyze_resume(resume_text):
    """Analyze resume using Gemini"""
    client = get_client("primary")
    
    prompt = f"""
    Analyze this resume and extract key information:
    
    {resume_text}
    
    Return ONLY a valid JSON object with the following structure:
    {{
        "name": "Full name",
        "email": "Email address",
        "phone": "Phone number",
        "summary": "Brief professional summary",
        "experience_years": 0,
        "key_skills": ["skill1", "skill2", "skill3"],
        "education": ["degree1", "degree2"],
        "work_experience": [
            {{"company": "Company Name", "role": "Job Title", "duration": "Years"}}
        ],
        "certifications": ["cert1", "cert2"]
    }}
    
    Ensure strictly valid JSON format with no additional text.
    """
    
    response = generate_content_with_retry(
        client_type="primary",
        contents=prompt
    )
    
    response_text = response.text
    
    try:
        json_match = re.search(r'({[\s\S]*})', response_text)
        if json_match:
            response_text = json_match.group(1)
        response_text = re.sub(r'```json|```', '', response_text).strip()
        return json.loads(response_text)
    except Exception as e:
        logger.error(f"Failed to parse resume: {str(e)}")
        raise ValueError(f"Failed to parse resume: {str(e)}")

def clean_text(text):
    """Clean text for vectorization"""
    text = re.sub(r'[^a-zA-Z0-9\s]', '', text)
    return text.lower()

def calculate_match(resume_summary, job_description):
    """Calculate match percentage between resume and job description"""
    try:
        start_time = time.time()
        model = load_doc2vec_model()
        
        resume_processed = clean_text(resume_summary)
        jd_processed = clean_text(job_description)
        
        v1 = model.infer_vector(resume_processed.split())
        v2 = model.infer_vector(jd_processed.split())
        
        dot_product = np.dot(v1, v2)
        norm_product = norm(v1) * norm(v2)
        similarity = 100 * (dot_product / norm_product)
        
        logger.info(f"Matching completed in {time.time() - start_time:.2f} seconds")
        return round(similarity, 2)
    except Exception as e:
        logger.error(f"Match calculation error: {str(e)}")
        raise ValueError(f"Match calculation failed: {str(e)}")

def get_match_recommendation(match_percentage):
    """Get recommendation based on match percentage"""
    if match_percentage < 50:
        return "Low match - Consider improving your CV"
    elif 50 <= match_percentage < 70:
        return "Good match - Room for improvement"
    else:
        return "Excellent match - Ready to apply"

def analyze_skill_gap(resume_summary, job_description):
    """Analyze skill gap between resume and job description"""
    client = get_client("primary")
    
    prompt = f"""
    Compare this resume summary:
    
    {resume_summary}
    
    With this job description:
    
    {job_description}
    
    Identify the skill gaps and provide recommendations for the candidate.
    
    Return ONLY a valid JSON object with the following structure:
    {{
        "missing_skills": ["List of skills mentioned in the job description but not found in the resume"],
        "recommendations": ["Specific recommendations for how the candidate can address the skill gaps"],
        "additional_training": ["Suggested courses, certifications, or experiences that would help bridge the gaps"]
    }}
    
    Ensure the response is strictly valid JSON format with no additional text.
    """
    
    response = generate_content_with_retry(
        client_type="primary",
        contents=prompt
    )
    
    response_text = response.text
    
    try:
        json_match = re.search(r'({[\s\S]*})', response_text)
        if json_match:
            response_text = json_match.group(1)
        
        response_text = re.sub(r'```json|```', '', response_text).strip()
        analysis = json.loads(response_text)
        logger.info("Successfully parsed skill gap analysis JSON")
        return analysis
        
    except Exception as e:
        logger.error(f"Failed to parse skill gap analysis: {str(e)}")
        raise ValueError(f"Failed to parse skill gap analysis: {str(e)}")



def extract_frames_from_video(video_path: str, fps: float = 2.0):
    """Extract frames from video for emotion analysis"""
    cap = cv2.VideoCapture(str(video_path))
    frames = []
    timestamps = []
    
    frame_rate = cap.get(cv2.CAP_PROP_FPS) or 24.0
    frame_interval = int(max(1, frame_rate // fps))
    
    frame_count = 0
    extracted_count = 0
    
    while True:
        ret, frame = cap.read()
        if not ret:
            break
        
        if frame_count % frame_interval == 0:
            frames.append(frame)
            timestamps.append(frame_count / frame_rate)
            extracted_count += 1
        
        frame_count += 1
    
    cap.release()
    logger.info(f"Extracted {extracted_count} frames from video")
    
    return frames, timestamps

def analyze_emotions_in_video(video_path: str):
    """Analyze emotions using DeepFace"""
    try:
        frames, timestamps = extract_frames_from_video(video_path, fps=0.5)
        
        if not frames:
            raise ValueError("No frames extracted from video")
        
        emotion_results = []
        valid_analysis_count = 0
        
        for idx, frame in enumerate(frames):
            try:
                analysis = DeepFace.analyze(
                    frame,
                    actions=['emotion'],
                    enforce_detection=False,
                    detector_backend='opencv'
                )
                
                if isinstance(analysis, list):
                    analysis = analysis[0]
                
                emotion_data = analysis.get('emotion', {})
                dominant_emotion = analysis.get('dominant_emotion', 'neutral')
                
                emotion_results.append({
                    'timestamp': timestamps[idx],
                    'emotion': dominant_emotion,
                    'scores': emotion_data,
                    'confidence': max(emotion_data.values()) if emotion_data else 0.0
                })
                
                valid_analysis_count += 1
                
            except Exception as e:
                logger.warning(f"Could not analyze frame {idx}: {str(e)}")
                emotion_results.append({
                    'timestamp': timestamps[idx],
                    'emotion': 'neutral',
                    'scores': {'neutral': 1.0},
                    'confidence': 0.5
                })
        
        if valid_analysis_count == 0:
            raise ValueError("Could not analyze any frames successfully")
        
        emotion_counts = {}
        total_confidence = 0
        emotion_timeline = []
        
        for result in emotion_results:
            emotion = result['emotion']
            emotion_counts[emotion] = emotion_counts.get(emotion, 0) + 1
            total_confidence += result['confidence']
            
            emotion_timeline.append({
                'timestamp': result['timestamp'],
                'emotion': emotion,
                'confidence': result['confidence']
            })
        
        dominant_emotion = max(emotion_counts, key=emotion_counts.get)
        
        total_frames = len(emotion_results)
        emotion_distribution = {
            emotion: count / total_frames 
            for emotion, count in emotion_counts.items()
        }
        
        positive_emotions = ['happy', 'surprise']
        negative_emotions = ['sad', 'angry', 'fear', 'disgust']
        
        positive_score = sum(emotion_distribution.get(e, 0) for e in positive_emotions)
        negative_score = sum(emotion_distribution.get(e, 0) for e in negative_emotions)
        neutral_score = emotion_distribution.get('neutral', 0)
        
        engagement_score = (positive_score * 1.0) + (neutral_score * 0.5) - (negative_score * 0.3)
        engagement_score = max(0.0, min(1.0, engagement_score))
        
        stress_indicators = []
        if emotion_distribution.get('fear', 0) > 0.2:
            stress_indicators.append("High fear/anxiety detected")
        if emotion_distribution.get('angry', 0) > 0.15:
            stress_indicators.append("Signs of frustration")
        if negative_score > 0.4:
            stress_indicators.append("High negative emotion ratio")
        
        return {
            'dominant_emotion': dominant_emotion,
            'emotion_distribution': emotion_distribution,
            'average_confidence': total_confidence / total_frames,
            'total_frames_analyzed': total_frames,
            'emotion_timeline': emotion_timeline,
            'engagement_score': engagement_score,
            'stress_indicators': stress_indicators
        }
        
    except Exception as e:
        logger.error(f"Error in emotion analysis: {str(e)}")
        return {
            'dominant_emotion': 'neutral',
            'emotion_distribution': {'neutral': 1.0},
            'average_confidence': 0.5,
            'total_frames_analyzed': 0,
            'emotion_timeline': [],
            'engagement_score': 0.5,
            'stress_indicators': ['Could not perform detailed analysis']
        }

def calculate_keyword_usage(transcription: str, expected_keywords: List[str]) -> float:
    """Calculate keyword usage score"""
    if not expected_keywords:
        return 0.7
    
    transcription_lower = transcription.lower()
    matches = sum(1 for keyword in expected_keywords if keyword.lower() in transcription_lower)
    
    return min(matches / len(expected_keywords), 1.0)

async def evaluate_audio_response(question: str, transcription: str, difficulty: str, category: str, expected_keywords: List[str]):
    """Evaluate audio response using Gemini"""
    client = get_client("tertiary")
    
    prompt = f"""
    Evaluate this interview response:
    
    Question ({difficulty.upper()} {category.upper()}): "{question}"
    
    Candidate's Response: "{transcription}"
    
    Expected Keywords: {', '.join(expected_keywords)}
    
    Provide evaluation with scores (0.0 to 1.0) for:
    1. Relevance - How well the answer addresses the question
    2. Clarity - How clear and well-structured the answer is
    3. Confidence - Perceived confidence in the response
    4. Technical Accuracy - Correctness of technical content
    
    Return ONLY valid JSON:
    {{
        "relevance": 0.8,
        "clarity": 0.7,
        "confidence": 0.9,
        "technical_accuracy": 0.85,
        "strengths": ["point1", "point2"],
        "improvements": ["point1", "point2"],
        "overall_feedback": "Brief feedback"
    }}
    """
    
    try:
        response = await asyncio.to_thread(
            generate_content_with_retry,
            client_type="tertiary",
            contents=prompt,
            config=genai.types.GenerateContentConfig(response_mime_type="application/json", temperature=0.2)
        )
        
        response_text = response.text
        json_match = re.search(r'({[\s\S]*})', response_text)
        
        if json_match:
            response_text = json_match.group(1)
        
        response_text = re.sub(r'```json|```', '', response_text).strip()
        evaluation = json.loads(response_text)
        
        return evaluation
        
    except Exception as e:
        logger.error(f"Audio evaluation error: {str(e)}")
        return {
            "relevance": 0.5,
            "clarity": 0.5,
            "confidence": 0.5,
            "technical_accuracy": 0.5,
            "strengths": [],
            "improvements": ["Could not evaluate properly"],
            "overall_feedback": "Evaluation failed"
        }

def map_emotion_to_score(emotion_analysis: dict) -> float:
    """Map emotion analysis to a score"""
    emotion_weights = {
        'happy': 1.0,
        'surprise': 0.8,
        'neutral': 0.6,
        'sad': 0.3,
        'fear': 0.2,
        'angry': 0.1,
        'disgust': 0.2
    }
    
    emotion_dist = emotion_analysis.get('emotion_distribution', {})
    emotion_score = sum(
        emotion_dist.get(emotion, 0) * weight 
        for emotion, weight in emotion_weights.items()
    )
    
    engagement = emotion_analysis.get('engagement_score', 0.5)
    
    final_score = (emotion_score * 0.6) + (engagement * 0.4)
    return min(1.0, max(0.0, final_score))




async def evaluate_daily_assessment(assessment_id: str, user_id: str, answers: Dict[str, str]):
    """Evaluate daily assessment submission"""
    client = get_client("assessment")
    
    assessment_file = ASSESSMENTS_DIR / f"{assessment_id}.json"
    
    if not assessment_file.exists():
        raise ValueError("Assessment not found")
    
    with open(assessment_file, 'r') as f:
        assessment_data = json.load(f)
    
    questions = assessment_data['questions']
    
    detailed_feedback = []
    correct_count = 0.0
    category_scores = {}
    
    # Separate MCQ/MSQ and non-MCQ/MSQ questions
    objective_questions = []
    non_mcq_questions = []
    
    for q in questions:
        q_id = q['question_id']
        user_answer = answers.get(q_id, "")
        if q.get('question_type') in ('mcq', 'msq'):
            objective_questions.append((q, user_answer))
        else:
            non_mcq_questions.append((q, user_answer))
            
    # 1. Evaluate MCQ and MSQ locally (instant)
    for q, user_answer in objective_questions:
        q_type = q.get('question_type', 'mcq')
        
        if q_type == 'mcq':
            is_correct = user_answer.strip().lower() == q['correct_answer'].strip().lower()
            score = 1.0 if is_correct else 0.0
            feedback_text = "Correct!" if is_correct else f"Incorrect. Correct answer: {q['correct_answer']}"
            explanation = q.get('explanation') or f"The correct answer is: {q['correct_answer']}."
            
            if is_correct:
                correct_count += 1.0
                
            cat = q['category']
            if cat not in category_scores:
                category_scores[cat] = {'total': 0, 'score': 0.0, 'count': 0}
            category_scores[cat]['total'] += 1
            category_scores[cat]['score'] += score
            category_scores[cat]['count'] += 1
            
            detailed_feedback.append({
                'question_id': q['question_id'],
                'question': q['question'],
                'question_type': 'mcq',
                'options': q.get('options'),
                'your_answer': user_answer,
                'score': score,
                'is_correct': is_correct,
                'correct_answer': q['correct_answer'],
                'explanation': explanation,
                'feedback': feedback_text,
                'category': q['category'],
                'difficulty': q['difficulty']
            })
            
        elif q_type == 'msq':
            correct = q.get('correct_answer', '')
            if isinstance(correct, str):
                try:
                    correct_list = json.loads(correct)
                except Exception:
                    correct_list = [c.strip() for c in correct.split(',') if c.strip()]
            elif isinstance(correct, list):
                correct_list = correct
            else:
                correct_list = []
                
            correct_set = {str(item).strip().lower() for item in correct_list}
            
            user_ans = user_answer
            if isinstance(user_ans, str):
                try:
                    user_list = json.loads(user_ans)
                except Exception:
                    user_list = [u.strip() for u in user_ans.split(',') if u.strip()]
            elif isinstance(user_ans, list):
                user_list = user_ans
            else:
                user_list = []
                
            user_set = {str(item).strip().lower() for item in user_list}
            
            is_correct = (correct_set == user_set) and len(correct_set) > 0
            score = 1.0 if is_correct else 0.0
            
            correct_display = ", ".join(correct_list)
            feedback_text = "Correct!" if is_correct else f"Incorrect. Correct answers: {correct_display}"
            explanation = q.get('explanation') or f"The correct answers are: {correct_display}."
            
            if is_correct:
                correct_count += 1.0
                
            cat = q['category']
            if cat not in category_scores:
                category_scores[cat] = {'total': 0, 'score': 0.0, 'count': 0}
            category_scores[cat]['total'] += 1
            category_scores[cat]['score'] += score
            category_scores[cat]['count'] += 1
            
            detailed_feedback.append({
                'question_id': q['question_id'],
                'question': q['question'],
                'question_type': 'msq',
                'options': q.get('options'),
                'your_answer': user_answer,
                'score': score,
                'is_correct': is_correct,
                'correct_answer': correct_list,
                'explanation': explanation,
                'feedback': feedback_text,
                'category': q['category'],
                'difficulty': q['difficulty']
            })
        
    # 2. Evaluate non-MCQs in batch (1 Gemini API call instead of parallel/sequential calls)
    if non_mcq_questions:
        eval_items_prompt = ""
        for idx, (q, ans) in enumerate(non_mcq_questions):
            eval_items_prompt += f"\n--- QUESTION {idx+1} ---\nQuestion ID: {q['question_id']}\nQuestion: {q['question']}\nExpected Keywords: {', '.join(q['expected_keywords'])}\nUser's Answer: {ans}\n"

        batch_prompt = f"""
Evaluate the following interview answers.
For each answer, determine the score (from 0.0 to 1.0), whether it is correct (is_correct: true/false), and:
1. Provide a brief explanation of why the candidate's answer received its score and a few suggestions for improvement.

{eval_items_prompt}

Return ONLY a valid JSON object mapping each Question ID to its evaluation:
{{
    "question_id_here": {{
        "score": 0.8,
        "is_correct": true,
        "explanation": "The candidate's answer scored 0.8 because..."
    }}
}}
Ensure the response is strictly valid JSON.
"""
        try:
            response = await asyncio.to_thread(
                generate_content_with_retry,
                client_type="assessment",
                contents=batch_prompt,
                config=genai.types.GenerateContentConfig(response_mime_type="application/json", temperature=0.2)
            )
            response_text = response.text
            json_match = re.search(r'({[\s\S]*})', response_text)
            batch_result = json.loads(json_match.group(1)) if json_match else {}
            
            for q, ans in non_mcq_questions:
                q_id = q['question_id']
                q_eval = batch_result.get(q_id, {})
                
                score = q_eval.get('score', 0.5)
                is_correct = q_eval.get('is_correct', False)
                model_answer = q_eval.get('model_answer') or q.get('model_answer') or q.get('correct_answer', '')
                explanation = q_eval.get('explanation') or q_eval.get('feedback', 'Could not evaluate')
                
                if is_correct:
                    correct_count += 1.0
                    
                cat = q['category']
                if cat not in category_scores:
                    category_scores[cat] = {'total': 0, 'score': 0.0, 'count': 0}
                category_scores[cat]['total'] += 1
                category_scores[cat]['score'] += score
                category_scores[cat]['count'] += 1
                
                detailed_feedback.append({
                    'question_id': q['question_id'],
                    'question': q['question'],
                    'question_type': q.get('question_type', 'short_answer'),
                    'your_answer': ans,
                    'score': score,
                    'is_correct': is_correct,
                    'correct_answer': q.get('correct_answer', ''),
                    'model_answer': model_answer,
                    'explanation': explanation,
                    'feedback': explanation,
                    'category': q['category'],
                    'difficulty': q['difficulty']
                })
        except Exception as e:
            logger.error(f"Error in batch evaluation: {e}, falling back to keyword evaluation")
            for q, ans in non_mcq_questions:
                expected = q.get('expected_keywords', [])
                matched = []
                missing = []
                ans_lower = ans.lower()
                for kw in expected:
                    if kw.lower() in ans_lower:
                        matched.append(kw)
                    else:
                        missing.append(kw)
                
                if expected:
                    score = len(matched) / len(expected)
                else:
                    score = 0.5
                    
                is_correct = score >= 0.6
                if is_correct:
                    correct_count += 1.0
                    
                model_answer = q.get('model_answer') or q.get('correct_answer', '')
                if expected:
                    matched_str = ", ".join(matched) if matched else "None"
                    missing_str = ", ".join(missing) if missing else "None"
                    explanation = f"Fallback keyword evaluation. Matched key concepts: {matched_str}. Missing concepts: {missing_str}."
                    if missing:
                        explanation += f" Suggestions: consider incorporating these terms to improve your response: {missing_str}."
                else:
                    explanation = "Fallback evaluation. Your answer has been saved and graded."
                    
                cat = q['category']
                if cat not in category_scores:
                    category_scores[cat] = {'total': 0, 'score': 0.0, 'count': 0}
                category_scores[cat]['total'] += 1
                category_scores[cat]['score'] += score
                category_scores[cat]['count'] += 1
                
                detailed_feedback.append({
                    'question_id': q['question_id'],
                    'question': q['question'],
                    'question_type': q.get('question_type', 'short_answer'),
                    'your_answer': ans,
                    'score': score,
                    'is_correct': is_correct,
                    'correct_answer': q.get('correct_answer', ''),
                    'model_answer': model_answer,
                    'explanation': explanation,
                    'feedback': explanation,
                    'category': q['category'],
                    'difficulty': q['difficulty']
                })
                
    total_questions = len(questions)
    score_percentage = (correct_count / total_questions) * 100 if total_questions > 0 else 0
    
    category_breakdown = {}
    for cat, data in category_scores.items():
        category_breakdown[cat] = {
            'total_questions': data['total'],
            'average_score': data['score'] / data['count'] if data['count'] > 0 else 0,
            'percentage': (data['score'] / data['count']) * 100 if data['count'] > 0 else 0
        }
    
    improvement_areas = []
    for cat, breakdown in category_breakdown.items():
        if breakdown['percentage'] < 70:
            improvement_areas.append(f"Focus on {cat} questions - current score: {breakdown['percentage']:.1f}%")
    
    if not improvement_areas:
        improvement_areas.append("Great job! Keep practicing")
        
    result = {
        'assessment_id': assessment_id,
        'user_id': user_id,
        'total_questions': total_questions,
        'correct_answers': correct_count,
        'score_percentage': score_percentage,
        'category_breakdown': category_breakdown,
        'detailed_feedback': detailed_feedback,
        'improvement_areas': improvement_areas,
        'date': datetime.now().isoformat()
    }
    
    # Store in DB
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute('''
            INSERT INTO assessments (assessment_id, user_id, total_questions, correct_answers, score_percentage, category_breakdown, date)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        ''', (
            assessment_id,
            user_id,
            total_questions,
            correct_count,
            score_percentage,
            json.dumps(category_breakdown),
            result['date']
        ))
        conn.commit()
        conn.close()
    except Exception as db_e:
        logger.error(f"Error saving assessment to SQLite: {db_e}")
        
    # Log activity
    log_activity(user_id, f"Completed Daily Assessment (Score: {int(score_percentage)}%)")
    
    # Recalculate user metrics
    recalculate_user_metrics(user_id)
    
    return result

# ==================== PDF & EMAIL - Same as before ====================
# ==================== PDF GENERATION FUNCTIONS ====================

def generate_comprehensive_report(session_id: str, user_name: str, user_email: str, role: str):
    """Generate comprehensive PDF report"""
    evaluations = INTERVIEW_EVALUATIONS.get(session_id, [])
    
    if not evaluations:
        raise ValueError("No evaluations found for this session")
    
    pdf_filename = f"report_{session_id}.pdf"
    pdf_path = REPORTS_DIR / pdf_filename
    
    doc = SimpleDocTemplate(str(pdf_path), pagesize=letter)
    story = []
    styles = getSampleStyleSheet()
    
    # Custom styles
    title_style = ParagraphStyle(
        'CustomTitle',
        parent=styles['Heading1'],
        fontSize=24,
        textColor=colors.HexColor('#1a237e'),
        spaceAfter=30,
        alignment=TA_CENTER
    )
    
    heading_style = ParagraphStyle(
        'CustomHeading',
        parent=styles['Heading2'],
        fontSize=16,
        textColor=colors.HexColor('#283593'),
        spaceAfter=12,
        spaceBefore=12
    )
    
    # Title
    story.append(Paragraph("Speak2HR - Interview Performance Report", title_style))
    story.append(Spacer(1, 0.3*inch))
    
    # Candidate Info
    story.append(Paragraph("Candidate Information", heading_style))
    candidate_data = [
        ['Name:', user_name],
        ['Role:', role],
        ['Date:', datetime.now().strftime('%Y-%m-%d %H:%M')],
        ['Session ID:', session_id],
        ['Total Questions:', str(len(evaluations))]
    ]
    
    candidate_table = Table(candidate_data, colWidths=[2*inch, 4*inch])
    candidate_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (0, -1), colors.HexColor('#e8eaf6')),
        ('TEXTCOLOR', (0, 0), (-1, -1), colors.black),
        ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
        ('FONTNAME', (0, 0), (0, -1), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, -1), 10),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 8),
        ('GRID', (0, 0), (-1, -1), 0.5, colors.grey)
    ]))
    story.append(candidate_table)
    story.append(Spacer(1, 0.3*inch))
    
    # Overall Performance
    story.append(Paragraph("Overall Performance Summary", heading_style))
    
    avg_relevance = sum(e['relevance_score'] for e in evaluations) / len(evaluations)
    avg_clarity = sum(e['clarity_score'] for e in evaluations) / len(evaluations)
    avg_confidence = sum(e['confidence_score'] for e in evaluations) / len(evaluations)
    avg_technical = sum(e['technical_accuracy_score'] for e in evaluations) / len(evaluations)
    avg_keyword = sum(e['keyword_usage_score'] for e in evaluations) / len(evaluations)
    avg_emotion = sum(e['emotion_score'] for e in evaluations) / len(evaluations)
    avg_weighted = sum(e['weighted_score'] for e in evaluations) / len(evaluations)
    
    # Collect all emotions
    all_emotions = [e['emotion_analysis']['dominant_emotion'] for e in evaluations]
    emotion_counts = {}
    for emotion in all_emotions:
        emotion_counts[emotion] = emotion_counts.get(emotion, 0) + 1
    overall_emotion = max(emotion_counts, key=emotion_counts.get)
    
    summary_data = [
        ['Metric', 'Score', 'Rating'],
        ['Relevance', f'{avg_relevance:.2f}', get_rating(avg_relevance)],
        ['Clarity', f'{avg_clarity:.2f}', get_rating(avg_clarity)],
        ['Confidence', f'{avg_confidence:.2f}', get_rating(avg_confidence)],
        ['Technical Accuracy', f'{avg_technical:.2f}', get_rating(avg_technical)],
        ['Keyword Usage', f'{avg_keyword:.2f}', get_rating(avg_keyword)],
        ['Emotion/Engagement', f'{avg_emotion:.2f}', get_rating(avg_emotion)],
        ['Weighted Score', f'{avg_weighted:.2f}', get_rating(avg_weighted)],
    ]
    
    summary_table = Table(summary_data, colWidths=[2.5*inch, 1.5*inch, 1.5*inch])
    summary_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#3f51b5')),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
        ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, 0), 12),
        ('BOTTOMPADDING', (0, 0), (-1, 0), 12),
        ('BACKGROUND', (0, 1), (-1, -1), colors.beige),
        ('GRID', (0, 0), (-1, -1), 1, colors.black),
        ('FONTSIZE', (0, 1), (-1, -1), 10),
    ]))
    story.append(summary_table)
    story.append(Spacer(1, 0.2*inch))
    
    # Overall Emotion
    story.append(Paragraph(f"<b>Overall Dominant Emotion:</b> {overall_emotion.upper()}", styles['BodyText']))
    story.append(Spacer(1, 0.3*inch))
    
    # Question-by-Question Analysis
    story.append(PageBreak())
    story.append(Paragraph("Detailed Question-by-Question Analysis", heading_style))
    
    for idx, evaluation in enumerate(evaluations, 1):
        question_heading = f"Question {idx} - Level {evaluation['level']}: {evaluation['level_name']} ({evaluation['difficulty'].upper()})"
        story.append(Paragraph(question_heading, 
                              ParagraphStyle('QuestionHeading', parent=styles['Heading3'], 
                                           textColor=colors.HexColor('#5c6bc0'))))
        
        story.append(Paragraph(f"<b>Q:</b> {evaluation['question']}", styles['BodyText']))
        story.append(Spacer(1, 0.1*inch))
        
        # Scores table
        question_scores = [
            ['Metric', 'Score'],
            ['Relevance', f"{evaluation['relevance_score']:.2f}"],
            ['Clarity', f"{evaluation['clarity_score']:.2f}"],
            ['Confidence', f"{evaluation['confidence_score']:.2f}"],
            ['Technical Accuracy', f"{evaluation['technical_accuracy_score']:.2f}"],
            ['Keyword Usage', f"{evaluation['keyword_usage_score']:.2f}"],
            ['Emotion Score', f"{evaluation['emotion_score']:.2f}"],
            ['Weighted Score', f"{evaluation['weighted_score']:.2f}"]
        ]
        
        question_table = Table(question_scores, colWidths=[2*inch, 1.5*inch])
        question_table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#7986cb')),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
            ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('GRID', (0, 0), (-1, -1), 0.5, colors.grey),
            ('FONTSIZE', (0, 0), (-1, -1), 9),
        ]))
        story.append(question_table)
        story.append(Spacer(1, 0.15*inch))
        
        # Emotion Analysis
        emotion_analysis = evaluation['emotion_analysis']
        story.append(Paragraph(f"<b>Dominant Emotion:</b> {emotion_analysis['dominant_emotion'].upper()}", styles['BodyText']))
        story.append(Paragraph(f"<b>Engagement Score:</b> {emotion_analysis['engagement_score']:.2f}", styles['BodyText']))
        
        if emotion_analysis['stress_indicators']:
            story.append(Paragraph("<b>Stress Indicators:</b>", styles['BodyText']))
            for indicator in emotion_analysis['stress_indicators']:
                story.append(Paragraph(f"• {indicator}", styles['BodyText']))
        
        story.append(Spacer(1, 0.15*inch))
        
        # Transcription
        story.append(Paragraph("<b>Your Response:</b>", styles['BodyText']))
        transcription_text = evaluation['transcription'][:500] + "..." if len(evaluation['transcription']) > 500 else evaluation['transcription']
        story.append(Paragraph(transcription_text, styles['BodyText']))
        story.append(Spacer(1, 0.15*inch))
        
        # Feedback
        audio_eval = evaluation['audio_evaluation']
        
        if audio_eval.get('strengths'):
            story.append(Paragraph("<b>Strengths:</b>", styles['BodyText']))
            for strength in audio_eval['strengths']:
                story.append(Paragraph(f"• {strength}", styles['BodyText']))
            story.append(Spacer(1, 0.1*inch))
        
        if audio_eval.get('improvements'):
            story.append(Paragraph("<b>Areas for Improvement:</b>", styles['BodyText']))
            for improvement in audio_eval['improvements']:
                story.append(Paragraph(f"• {improvement}", styles['BodyText']))
            story.append(Spacer(1, 0.1*inch))
        
        story.append(Spacer(1, 0.2*inch))
    
    # Final Recommendations
    story.append(PageBreak())
    story.append(Paragraph("Final Recommendations & Next Steps", heading_style))
    
    recommendations = generate_recommendations(avg_weighted, evaluations, overall_emotion)
    for rec in recommendations:
        story.append(Paragraph(f"• {rec}", styles['BodyText']))
        story.append(Spacer(1, 0.1*inch))
    
    # Build PDF
    doc.build(story)
    logger.info(f"PDF report generated: {pdf_path}")
    
    return pdf_filename

def get_rating(score):
    """Convert score to rating"""
    if score >= 0.85:
        return "Excellent"
    elif score >= 0.75:
        return "Good"
    elif score >= 0.60:
        return "Average"
    else:
        return "Needs Improvement"

def generate_recommendations(overall_score, evaluations, overall_emotion):
    """Generate personalized recommendations"""
    recommendations = []
    
    # Analyze weak areas
    avg_relevance = sum(e['relevance_score'] for e in evaluations) / len(evaluations)
    avg_clarity = sum(e['clarity_score'] for e in evaluations) / len(evaluations)
    avg_confidence = sum(e['confidence_score'] for e in evaluations) / len(evaluations)
    avg_technical = sum(e['technical_accuracy_score'] for e in evaluations) / len(evaluations)
    avg_keyword = sum(e['keyword_usage_score'] for e in evaluations) / len(evaluations)
    avg_emotion = sum(e['emotion_score'] for e in evaluations) / len(evaluations)
    
    # Score-based recommendations
    if avg_relevance < 0.7:
        recommendations.append("Focus on directly answering the question. Practice the STAR method for behavioral questions.")
    
    if avg_clarity < 0.7:
        recommendations.append("Structure your answers more clearly. Use frameworks like 'First, Second, Finally'.")
    
    if avg_confidence < 0.7:
        recommendations.append("Build confidence through mock interviews. Practice speaking clearly and assertively.")
    
    if avg_technical < 0.7:
        recommendations.append("Strengthen technical knowledge. Review fundamental concepts and practice coding problems.")
    
    if avg_keyword < 0.6:
        recommendations.append("Use more relevant technical terminology. Study industry-specific vocabulary.")
    
    # Emotion-based recommendations
    if avg_emotion < 0.6:
        recommendations.append("Work on managing interview stress. Practice relaxation techniques before answering.")
    
    if overall_emotion in ['fear', 'sad', 'angry']:
        recommendations.append("Consider practicing positive visualization and confidence-building exercises.")
    
    # Check for stress indicators
    high_stress_count = sum(1 for e in evaluations if len(e['emotion_analysis']['stress_indicators']) > 0)
    if high_stress_count > len(evaluations) * 0.5:
        recommendations.append("High stress detected in multiple responses. Practice breathing exercises and meditation.")
    
    # Level progression analysis
    level_scores = {}
    for e in evaluations:
        level = e['level']
        if level not in level_scores:
            level_scores[level] = []
        level_scores[level].append(e['weighted_score'])
    
    # Check if candidate struggled with higher levels
    if len(level_scores) >= 5:
        high_level_scores = [score for level, scores in level_scores.items() if level >= 5 for score in scores]
        if high_level_scores and sum(high_level_scores) / len(high_level_scores) < 0.65:
            recommendations.append("Focus on advanced topics and complex problem-solving. Take online courses in specialized areas.")
    
    # Overall performance
    if overall_score >= 0.85:
        recommendations.append("Excellent performance! You're well-prepared. Keep practicing to maintain consistency.")
    elif overall_score >= 0.75:
        recommendations.append("Good performance overall. Address the specific areas mentioned above to reach excellence.")
    else:
        recommendations.append("Consider more preparation and practice. Work with a mentor or take interview prep courses.")
    
    return recommendations if recommendations else ["Keep up the good work and continue practicing!"]

def send_email_with_report(user_email: str, user_name: str, pdf_path: Path):
    """Send email with PDF report attached"""
    try:
        msg = MIMEMultipart()
        msg['From'] = EMAIL_USER
        msg['To'] = user_email
        msg['Subject'] = f"Your Speak2HR Interview Report - {datetime.now().strftime('%Y-%m-%d')}"
        
        body = f"""
        Dear {user_name},
        
        Thank you for completing your Speak2HR AI interview!
        
        Please find attached your comprehensive performance report. This report includes:
        - Overall performance summary with scores
        - Question-by-question detailed analysis
        - Emotion and engagement analysis from video
        - Personalized recommendations for improvement
        
        We hope this feedback helps you improve your interview skills and land your dream job!
        
        Best regards,
        Speak2HR Team
        """
        
        msg.attach(MIMEText(body, 'plain'))
        
        # Attach PDF
        with open(pdf_path, 'rb') as f:
            part = MIMEBase('application', 'octet-stream')
            part.set_payload(f.read())
            encoders.encode_base64(part)
            part.add_header('Content-Disposition', f'attachment; filename={pdf_path.name}')
            msg.attach(part)
        
        # Send email
        server = smtplib.SMTP('smtp.gmail.com', 587)
        server.starttls()
        server.login(EMAIL_USER, EMAIL_PASSWORD)
        text = msg.as_string()
        server.sendmail(EMAIL_USER, user_email, text)
        server.quit()
        
        logger.info(f"Email sent successfully to {user_email}")
        return True
        
    except Exception as e:
        logger.error(f"Failed to send email: {str(e)}")
        return False

def send_slot_booking_email(candidate_email: str, candidate_name: str, hr_email: str, hr_name: str,
                            date: str, time: str, duration: int, video_call_link: str):
    """Send slot booking confirmation emails to both candidate and HR"""
    try:
        # Email to Candidate
        msg_candidate = MIMEMultipart("alternative")
        msg_candidate['From'] = EMAIL_USER
        msg_candidate['To'] = candidate_email
        msg_candidate['Subject'] = f"Interview Slot Confirmed - {date} at {time}"

        html_candidate = f"""
        <html>
        <body>
            <p>Dear {candidate_name},</p>
            <p>Your HR interview slot has been successfully booked!</p>
            <h3>Interview Details:</h3>
            <ul>
                <li><strong>Date:</strong> {date}</li>
                <li><strong>Time:</strong> {time}</li>
                <li><strong>Duration:</strong> {duration} minutes</li>
                <li><strong>Interviewer:</strong> {hr_name}</li>
            </ul>
            <p><strong>Video Call Link:</strong><br>
            <a href="{video_call_link}" style="display:inline-block; padding:10px 20px; background-color:#1a73e8; color:white; text-decoration:none; border-radius:5px;">Join Interview</a></p>
            <p>Direct Link: <a href="{video_call_link}">{video_call_link}</a></p>
            <hr>
            <p>Please join the meeting at the scheduled time using the link above. Make sure to:</p>
            <ul>
                <li>Test your camera and microphone before the interview</li>
                <li>Join 5 minutes early</li>
                <li>Have a stable internet connection</li>
                <li>Be in a quiet environment</li>
            </ul>
            <p>Best of luck with your interview!</p>
            <p>Best regards,<br>Speak2HR Team</p>
        </body>
        </html>
        """

        msg_candidate.attach(MIMEText(html_candidate, 'html'))

        # Email to HR
        msg_hr = MIMEMultipart("alternative")
        msg_hr['From'] = EMAIL_USER
        msg_hr['To'] = hr_email
        msg_hr['Subject'] = f"New Interview Scheduled - {candidate_name} on {date}"

        html_hr = f"""
        <html>
        <body>
            <p>Dear {hr_name},</p>
            <p>A new interview has been scheduled with you.</p>
            <h3>Interview Details:</h3>
            <ul>
                <li><strong>Candidate:</strong> {candidate_name}</li>
                <li><strong>Email:</strong> {candidate_email}</li>
                <li><strong>Date:</strong> {date}</li>
                <li><strong>Time:</strong> {time}</li>
                <li><strong>Duration:</strong> {duration} minutes</li>
            </ul>
            <p><strong>Video Call Link:</strong><br>
            <a href="{video_call_link}" style="display:inline-block; padding:10px 20px; background-color:#1a73e8; color:white; text-decoration:none; border-radius:5px;">Join Interview</a></p>
            <p>Direct Link: <a href="{video_call_link}">{video_call_link}</a></p>
            <br>
            <p>Best regards,<br>Speak2HR Team</p>
        </body>
        </html>
        """

        msg_hr.attach(MIMEText(html_hr, 'html'))

        # Send emails
        server = smtplib.SMTP('smtp.gmail.com', 587)
        server.starttls()
        server.login(EMAIL_USER, EMAIL_PASSWORD)

        # Send to candidate
        server.send_message(msg_candidate)
        logger.info(f"Booking confirmation email sent to candidate: {candidate_email}")

        # Send to HR
        server.send_message(msg_hr)
        logger.info(f"Booking notification email sent to HR: {hr_email}")

        server.quit()
        return True

    except Exception as e:
        logger.error(f"Failed to send booking emails: {str(e)}")
        return False

def send_slot_cancellation_email(candidate_email: str, candidate_name: str, hr_email: str, hr_name: str,
                                 date: str, time: str):
    """Send slot cancellation email to both candidate and HR"""
    try:
        # Email to Candidate
        msg_candidate = MIMEMultipart("alternative")
        msg_candidate['From'] = EMAIL_USER
        msg_candidate['To'] = candidate_email
        msg_candidate['Subject'] = f"Interview Cancelled - {date} at {time}"
        
        html_candidate = f"""
        <html>
        <body>
            <p>Dear {candidate_name},</p>
            <p>Your HR interview slot on {date} at {time} with {hr_name} has been cancelled.</p>
            <p>You can go back to the platform to book another available slot.</p>
            <p>Best regards,<br>Speak2HR Team</p>
        </body>
        </html>
        """
        msg_candidate.attach(MIMEText(html_candidate, 'html'))
        
        # Email to HR
        msg_hr = MIMEMultipart("alternative")
        msg_hr['From'] = EMAIL_USER
        msg_hr['To'] = hr_email
        msg_hr['Subject'] = f"Interview Cancelled - {candidate_name} on {date}"
        
        html_hr = f"""
        <html>
        <body>
            <p>Dear {hr_name},</p>
            <p>The interview scheduled with {candidate_name} on {date} at {time} has been cancelled.</p>
            <p>The slot is now available again for other candidates to book.</p>
            <p>Best regards,<br>Speak2HR Team</p>
        </body>
        </html>
        """
        msg_hr.attach(MIMEText(html_hr, 'html'))
        
        server = smtplib.SMTP('smtp.gmail.com', 587)
        server.starttls()
        server.login(EMAIL_USER, EMAIL_PASSWORD)
        server.send_message(msg_candidate)
        server.send_message(msg_hr)
        server.quit()
        logger.info(f"Cancellation emails sent to candidate {candidate_email} and HR {hr_email}")
        return True
    except Exception as e:
        logger.error(f"Failed to send cancellation emails: {str(e)}")
        return False

# ==================== API ENDPOINTS - AUTH ====================

@app.post("/api/auth/register")
async def register_user(request: RegisterRequest):
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("SELECT id FROM users WHERE email=?", (request.email,))
        if cursor.fetchone():
            raise HTTPException(status_code=400, detail="Email already registered")
        
        user_id = str(uuid.uuid4())
        status = 'active'
        registered_date = datetime.now(timezone.utc).isoformat()
        last_login = registered_date
        
        cursor.execute('''
            INSERT INTO users (id, name, email, password, role, target_role, skills, experience_years, status, registered_date, last_login)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ''', (user_id, request.name, request.email, request.password, request.role, request.targetRole, 
              json.dumps(request.skills) if request.skills else '[]', request.experienceYears, status, registered_date, last_login))
        
        conn.commit()
            
        return {
            "user": {
                "id": user_id,
                "email": request.email,
                "name": request.name,
                "role": request.role,
                "targetRole": request.targetRole,
                "skills": request.skills,
                "experienceYears": request.experienceYears
            },
            "token": f"mock-jwt-token-{user_id}"
        }
    except sqlite3.Error as e:
        logger.error(f"DB Error: {e}")
        raise HTTPException(status_code=500, detail="Internal Server Error")
    finally:
        conn.close()

@app.post("/api/auth/login")
async def login_user(request: LoginRequest):
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("SELECT * FROM users WHERE email=? AND password=?", (request.email, request.password))
        user = cursor.fetchone()
        
        if not user:
            raise HTTPException(status_code=401, detail="Invalid email or password")
            

        # Update last login
        cursor.execute("UPDATE users SET last_login=? WHERE id=?", (datetime.now(timezone.utc).isoformat(), user['id']))
        conn.commit()
        
        return {
            "user": {
                "id": user['id'],
                "email": user['email'],
                "name": user['name'],
                "role": user['role'],
                "targetRole": user['target_role'],
                "skills": json.loads(user['skills']) if user['skills'] else [],
                "experienceYears": user['experience_years']
            },
            "token": f"mock-jwt-token-{user['id']}"
        }
    finally:
        conn.close()

@app.post("/api/auth/forgot-password")
async def forgot_password(request: ForgotPasswordRequest):
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("SELECT name FROM users WHERE email=?", (request.email,))
        user = cursor.fetchone()
        if not user:
            raise HTTPException(status_code=404, detail="Email not found")
        
        verification_code = str(random.randint(100000, 999999))
        expires_at = (datetime.now(timezone.utc) + timedelta(minutes=5)).isoformat()
        created_at = datetime.now(timezone.utc).isoformat()
        
        cursor.execute('''
            INSERT INTO otps (email, otp, expires_at, created_at) 
            VALUES (?, ?, ?, ?)
            ON CONFLICT(email) DO UPDATE SET 
            otp=excluded.otp, expires_at=excluded.expires_at, created_at=excluded.created_at
        ''', (request.email, verification_code, expires_at, created_at))
        conn.commit()
        
        # Send OTP via email
        email_sent = False
        try:
            msg = MIMEMultipart()
            msg['From'] = EMAIL_USER
            msg['To'] = request.email
            msg['Subject'] = "Speak2HR - Password Reset Verification Code"
            
            body = f"Hello {user['name']},\n\nYour verification code to reset your password is: {verification_code}\n\nThis code will expire in 5 minutes.\n\nSpeak2HR Team"
            msg.attach(MIMEText(body, 'plain'))
            
            server = smtplib.SMTP('smtp.gmail.com', 587)
            server.starttls()
            server.login(EMAIL_USER, EMAIL_PASSWORD)
            server.sendmail(EMAIL_USER, request.email, msg.as_string())
            server.quit()
            email_sent = True
            logger.info(f"OTP verification email successfully sent to {request.email}")
        except Exception as e:
            logger.error(f"Failed to send OTP via email: {e}")
            logger.info(f"FALLBACK VERIFICATION OTP FOR {request.email} IS: {verification_code}")
            
        # Log to file in reports directory
        try:
            os.makedirs(REPORTS_DIR, exist_ok=True)
            with open(REPORTS_DIR / "email_logs.txt", "a") as log_file:
                log_file.write(f"[{datetime.now().isoformat()}] OTP to {request.email}: {verification_code} (Sent: {email_sent})\n")
        except Exception as file_err:
            logger.error(f"Failed to write OTP to log file: {file_err}")
            
        return {
            "success": True, 
            "message": "Verification code sent to your email" if email_sent else f"Verification code generated (Fallback: {verification_code})"
        }
    finally:
        conn.close()

@app.post("/api/auth/reset-password")
async def reset_password(request: ResetPasswordRequest):
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("SELECT otp, expires_at FROM otps WHERE email=?", (request.email,))
        otp_record = cursor.fetchone()
        
        if not otp_record:
            raise HTTPException(status_code=400, detail="No verification code found. Please request a new code.")
            
        expires_at = datetime.fromisoformat(otp_record['expires_at'].replace('Z', '+00:00'))
        if datetime.now(timezone.utc) > expires_at:
            cursor.execute("DELETE FROM otps WHERE email=?", (request.email,))
            conn.commit()
            raise HTTPException(status_code=400, detail="Verification code has expired.")
            
        if otp_record['otp'] != request.verificationCode:
            raise HTTPException(status_code=400, detail="Invalid verification code")
            
        # Update user password
        cursor.execute("UPDATE users SET password=? WHERE email=?", (request.newPassword, request.email))
        cursor.execute("DELETE FROM otps WHERE email=?", (request.email,))
        
        # Log the reset attempt
        cursor.execute("SELECT id FROM users WHERE email=?", (request.email,))
        user_id = cursor.fetchone()['id']
        cursor.execute("INSERT INTO activity_logs (id, user_id, action, timestamp) VALUES (?, ?, ?, ?)",
                       (str(uuid.uuid4()), user_id, "Password Reset Successful", datetime.now(timezone.utc).isoformat()))
                       
        conn.commit()
        return {"success": True, "message": "Password reset successfully"}
    finally:
        conn.close()

# ==================== API ENDPOINTS - CORRECTED ====================

@app.post("/api/resume/upload", response_model=ResumeAnalysisResponse)
async def upload_resume(file: UploadFile = File(...)):
    """Upload and analyze resume - Returns structured data"""
    temp_file_path = os.path.join(TEMP_DIR, f"temp_{uuid.uuid4()}{os.path.splitext(file.filename)[1]}")
    
    try:
        with open(temp_file_path, "wb") as temp_file:
            shutil.copyfileobj(file.file, temp_file)
        
        resume_text = process_file(temp_file_path)
        analysis_json = analyze_resume(resume_text)
        
        return {
            "summary": analysis_json,  # This contains: name, skills, experience_years, work_experience, etc.
            "skills": analysis_json.get("key_skills", [])
        }
    
    except Exception as e:
        logger.error(f"Resume upload error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if os.path.exists(temp_file_path):
            os.remove(temp_file_path)

@app.post("/api/job/match", response_model=JobMatchResponse)
async def match_job(request: JobMatchRequest):
    """Match resume with job description using Doc2Vec"""
    try:
        match_percentage = calculate_match(request.resume_summary, request.job_description)
        
        return {
            "match_percentage": match_percentage,
            "recommendation": get_match_recommendation(match_percentage),
        }
    
    except Exception as e:
        logger.error(f"Job matching error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/skill-gap/analyze", response_model=SkillGapResponse)
async def analyze_skill_gaps(request: SkillGapRequest):
    """Analyze skill gaps"""
    try:
        analysis = analyze_skill_gap(request.resume_summary, request.job_description)
        
        return SkillGapResponse(
            missing_skills=analysis.get("missing_skills", []),
            recommendations=analysis.get("recommendations", []),
            additional_training=analysis.get("additional_training", [])
        )
    
    except Exception as e:
        logger.error(f"Skill gap analysis error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/interview/generate-questions", response_model=InterviewQuestionsResponse)
async def generate_interview_questions_endpoint(request: InterviewQuestionRequest):
    """
    Generate questions using cached file-based question bank.
    No runtime Gemini calls for question generation.
    """
    logger.info(f"[/api/interview/generate-questions] Generating questions for user_id={request.user_id}, candidate_name={request.candidate_name}, role={request.role}")
    try:
        from question_bank_manager import ROLE_FOLDER_MAP, is_role_generated
        role_folder = ROLE_FOLDER_MAP.get(request.role)
        if not role_folder:
            role_folder = request.role.lower().replace(" ", "_").replace("/", "")
            if role_folder not in ROLE_FOLDER_MAP.values():
                role_folder = "software_engineer"
                
        if not is_role_generated(role_folder):
            from fastapi.responses import JSONResponse
            friendly_role = [k for k, v in ROLE_FOLDER_MAP.items() if v == role_folder]
            friendly_role_name = friendly_role[0] if friendly_role else request.role
            return JSONResponse(
                status_code=404,
                content={
                    "status": "QUESTION_BANK_NOT_FOUND",
                    "message": f"Question bank for '{friendly_role_name}' has not been generated yet.",
                    "role": role_folder,
                    "suggested_command": f"python generate_question_bank.py {role_folder}",
                    "documentation": "Run the suggested command once to generate the question bank. After generation, restart the assessment."
                }
            )

        from question_bank_manager import get_interview_questions, record_candidate_questions
        questions, session_id = get_interview_questions(
            user_id=request.user_id,
            role_string=request.role,
            candidate_name=request.candidate_name or "Candidate"
        )
        
        # Record questions to candidate history
        record_candidate_questions(request.user_id, questions, role=request.role)
        
        # Save questions to file
        questions_file = RECORDINGS_DIR / f"{session_id}_questions.json"
        with open(questions_file, 'w') as f:
            json.dump(questions, f, indent=2)
        logger.info(f"[/api/interview/generate-questions] Questions saved to {questions_file}")
        
        # Store metadata
        metadata = {
            "session_id": session_id,
            "user_id": request.user_id,
            "user_name": request.candidate_name or "Candidate",
            "user_email": request.candidate_email or "",
            "role": request.role,
            "skills": request.candidate_skills,
            "experience_years": request.candidate_experience_years,
            "timestamp": datetime.now().isoformat()
        }
        metadata_file = RECORDINGS_DIR / f"{session_id}_metadata.json"
        with open(metadata_file, 'w') as f:
            json.dump(metadata, f, indent=2)
        logger.info(f"[/api/interview/generate-questions] Metadata saved to {metadata_file}")
        
        return {
            "questions": questions,
            "session_id": session_id,
            "total_questions": len(questions)
        }
    
    except Exception as e:
        logger.error(f"[/api/interview/generate-questions] Question generation error: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))
@app.post("/api/interview/evaluate-response", response_model=VideoInterviewEvaluationResult)
async def evaluate_interview_response(
    session_id: str = Form(...),
    question_id: str = Form(...),
    question: str = Form(...),
    level: int = Form(...),
    level_name: str = Form(...),
    category: str = Form(...),
    difficulty: str = Form(...),
    weight: float = Form(...),
    expected_keywords: str = Form(...),
    video_file: UploadFile = File(...),
    audio_file: UploadFile = File(...)
):
    """Evaluate video + audio interview response with DeepFace emotion analysis"""
    logger.info(f"[/api/interview/evaluate-response] Starting evaluation for session_id={session_id}, question_id={question_id}")
    
    # Save video as mp4
    video_path = VIDEOS_DIR / f"{session_id}_{question_id}_video.mp4"
    
    # Determine actual audio MIME type and extension
    audio_mime = audio_file.content_type or "audio/webm"
    audio_ext = "webm" if "webm" in audio_mime else "wav"
    if "ogg" in audio_mime:
        audio_ext = "ogg"
        
    audio_path = RECORDINGS_DIR / f"{session_id}_{question_id}_audio.{audio_ext}"
    
    logger.info(f"[/api/interview/evaluate-response] Audio file MIME: {audio_mime}, extension: .{audio_ext}")
    
    try:
        # Parse expected keywords
        expected_keywords_list = json.loads(expected_keywords)
        
        # Save video
        video_contents = await video_file.read()
        with open(video_path, "wb") as f:
            f.write(video_contents)
        logger.info(f"[/api/interview/evaluate-response] Video saved successfully to {video_path}")
        
        # Save audio
        audio_contents = await audio_file.read()
        with open(audio_path, "wb") as f:
            f.write(audio_contents)
        logger.info(f"[/api/interview/evaluate-response] Audio saved successfully to {audio_path}")
        
        # Get video duration
        cap = cv2.VideoCapture(str(video_path))
        fps = cap.get(cv2.CAP_PROP_FPS)
        frame_count = cap.get(cv2.CAP_PROP_FRAME_COUNT)
        video_duration = frame_count / fps if fps > 0 else 0
        cap.release()
        logger.info(f"[/api/interview/evaluate-response] Video duration calculated: {video_duration:.2f}s")
        
        # Parallel processing of emotion analysis
        logger.info(f"[/api/interview/evaluate-response] Spawning emotion analysis thread...")
        emotion_task = asyncio.create_task(asyncio.to_thread(analyze_emotions_in_video, str(video_path)))
        
        # Transcribe audio using Gemini
        logger.info(f"[/api/interview/evaluate-response] Transcribing audio with Gemini using mime_type={audio_mime}...")
        with open(audio_path, 'rb') as f:
            audio_data = base64.b64encode(f.read()).decode('utf-8')
        
        transcription_response = generate_content_with_retry(
            client_type="emotion",
            contents=[
                {"text": "Transcribe this audio to text. Return ONLY the transcription, no additional text. If the audio is silent or contains no speech, return an empty string."},
                {"inline_data": {"mime_type": audio_mime, "data": audio_data}}
            ]
        )
        transcription = transcription_response.text.strip() if transcription_response.text else ""
        logger.info(f"[/api/interview/evaluate-response] Audio transcription complete. Length: {len(transcription)} chars.")
        
        # Wait for emotion analysis
        emotion_analysis = await emotion_task
        logger.info(f"[/api/interview/evaluate-response] Emotion analysis complete. Dominant emotion: {emotion_analysis.get('dominant_emotion')}")
        
        # Evaluate audio response
        logger.info(f"[/api/interview/evaluate-response] Requesting AI evaluation for answer...")
        audio_evaluation = await evaluate_audio_response(
            question, 
            transcription, 
            difficulty, 
            category, 
            expected_keywords_list
        )
        logger.info(f"[/api/interview/evaluate-response] AI evaluation complete: relevance={audio_evaluation.get('relevance')}, technical_accuracy={audio_evaluation.get('technical_accuracy')}")
        
        # Calculate scores
        relevance_score = audio_evaluation.get('relevance', 0.5)
        clarity_score = audio_evaluation.get('clarity', 0.5)
        confidence_score = audio_evaluation.get('confidence', 0.5)
        technical_score = audio_evaluation.get('technical_accuracy', 0.5)
        keyword_score = calculate_keyword_usage(transcription, expected_keywords_list)
        emotion_score = map_emotion_to_score(emotion_analysis)
        
        # Weighted average
        base_score = (
            relevance_score * 0.25 +
            clarity_score * 0.20 +
            confidence_score * 0.15 +
            technical_score * 0.20 +
            keyword_score * 0.10 +
            emotion_score * 0.10
        )
        
        weighted_score = base_score * weight
        
        # Create result
        result = {
            'question_id': question_id,
            'question': question,
            'level': level,
            'level_name': level_name,
            'category': category,
            'difficulty': difficulty,
            'weight': weight,
            'transcription': transcription,
            'audio_evaluation': audio_evaluation,
            'emotion_analysis': emotion_analysis,
            'relevance_score': relevance_score,
            'clarity_score': clarity_score,
            'confidence_score': confidence_score,
            'technical_accuracy_score': technical_score,
            'keyword_usage_score': keyword_score,
            'emotion_score': emotion_score,
            'weighted_score': weighted_score,
            'session_id': session_id,
            'timestamp': datetime.now().isoformat(),
            'video_duration': video_duration,
            'audio_duration': video_duration
        }
        
        # Convert all numpy types to native Python types for JSON serialization
        result = make_json_serializable(result)
        
        # Store evaluation
        if session_id not in INTERVIEW_EVALUATIONS:
            INTERVIEW_EVALUATIONS[session_id] = []
        
        INTERVIEW_EVALUATIONS[session_id].append(result)
        
        # Save to file
        eval_file = RECORDINGS_DIR / f"{session_id}_evaluations.json"
        with open(eval_file, 'w') as f:
            json.dump(INTERVIEW_EVALUATIONS[session_id], f, indent=2)
        logger.info(f"[/api/interview/evaluate-response] Evaluation saved to {eval_file}")
        
        return VideoInterviewEvaluationResult(**result)
    
    except Exception as e:
        logger.error(f"[/api/interview/evaluate-response] Evaluation error: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Backend evaluation failed: {str(e)}")


@app.get("/api/interview/session/{session_id}")
async def get_session_summary(session_id: str):
    """Get session summary and statistics, save to database, recalculate metrics, and pre-generate report"""
    logger.info(f"[/api/interview/session/{session_id}] Fetching summary for session_id={session_id}")
    
    evaluations = INTERVIEW_EVALUATIONS.get(session_id, [])
    
    if not evaluations:
        eval_file = RECORDINGS_DIR / f"{session_id}_evaluations.json"
        if eval_file.exists():
            with open(eval_file, 'r') as f:
                evaluations = json.load(f)
                INTERVIEW_EVALUATIONS[session_id] = evaluations
        else:
            logger.error(f"[/api/interview/session/{session_id}] Session not found. No evaluations.")
            raise HTTPException(status_code=404, detail="Session not found")
    
    # Load metadata
    user_id = "unknown"
    user_name = "Candidate"
    user_email = ""
    role = "Software Engineer"
    
    metadata_file = RECORDINGS_DIR / f"{session_id}_metadata.json"
    if metadata_file.exists():
        try:
            with open(metadata_file, 'r') as f:
                meta = json.load(f)
                user_id = meta.get("user_id", "unknown")
                user_name = meta.get("user_name", "Candidate")
                user_email = meta.get("user_email", "")
                role = meta.get("role", "Software Engineer")
            logger.info(f"[/api/interview/session/{session_id}] Loaded metadata: user_id={user_id}, name={user_name}, role={role}")
        except Exception as e:
            logger.warning(f"[/api/interview/session/{session_id}] Failed to load metadata file: {str(e)}")
    
    # Calculate statistics
    total_questions = len(evaluations)
    avg_score = sum(e['weighted_score'] / e['weight'] for e in evaluations) / total_questions
    weighted_avg = sum(e['weighted_score'] for e in evaluations) / total_questions
    
    # Category scores
    category_scores = {}
    for e in evaluations:
        cat = e['category']
        if cat not in category_scores:
            category_scores[cat] = []
        category_scores[cat].append(e['weighted_score'] / e['weight'])
    
    category_avg = {
        cat: sum(scores) / len(scores) 
        for cat, scores in category_scores.items()
    }
    
    # Difficulty scores
    difficulty_scores = {}
    for e in evaluations:
        diff = e['difficulty']
        if diff not in difficulty_scores:
            difficulty_scores[diff] = []
        difficulty_scores[diff].append(e['weighted_score'] / e['weight'])
    
    difficulty_avg = {
        diff: sum(scores) / len(scores) 
        for diff, scores in difficulty_scores.items()
    }
    
    # Overall emotion
    emotions = [e['emotion_analysis']['dominant_emotion'] for e in evaluations]
    emotion_counts = {}
    for emotion in emotions:
        emotion_counts[emotion] = emotion_counts.get(emotion, 0) + 1
    overall_emotion = max(emotion_counts, key=emotion_counts.get)
    
    # Stress level
    high_stress = sum(1 for e in evaluations if len(e['emotion_analysis']['stress_indicators']) > 0)
    stress_ratio = high_stress / total_questions
    
    if stress_ratio > 0.6:
        stress_level = "High"
    elif stress_ratio > 0.3:
        stress_level = "Medium"
    else:
        stress_level = "Low"
    
    # Recommendation
    if weighted_avg >= 0.85:
        recommendation = "Excellent performance! You're ready for real interviews."
    elif weighted_avg >= 0.75:
        recommendation = "Good performance. Work on the areas mentioned in detailed feedback."
    elif weighted_avg >= 0.60:
        recommendation = "Average performance. More practice needed in several areas."
    else:
        recommendation = "Needs significant improvement. Consider focused practice and coaching."
        
    # Save overall evaluation/score to SQLite database
    if user_id != "unknown":
        try:
            conn = get_db_connection()
            cursor = conn.cursor()
            eval_id = f"ai-eval-{session_id}"
            
            # Check if this evaluation already exists
            cursor.execute("SELECT id FROM evaluations WHERE id = ?", (eval_id,))
            exists = cursor.fetchone()
            
            feedback_payload = {
                "overall_feedback": recommendation,
                "overall_emotion": overall_emotion,
                "stress_level": stress_level,
                "weighted_average": weighted_avg,
                "average_score": avg_score
            }
            
            if not exists:
                cursor.execute('''
                    INSERT INTO evaluations (id, candidate_id, hr_id, score, feedback, status, created_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?)
                ''', (
                    eval_id,
                    user_id,
                    "ai-interviewer",
                    weighted_avg,
                    json.dumps(feedback_payload),
                    "completed",
                    datetime.now(timezone.utc).isoformat()
                ))
                conn.commit()
                logger.info(f"[/api/interview/session/{session_id}] AI Interview evaluation {eval_id} saved to SQLite database.")
            conn.close()
            
            # Recalculate metrics
            recalculate_user_metrics(user_id)
        except Exception as db_err:
            logger.error(f"[/api/interview/session/{session_id}] Error storing evaluation in SQLite: {str(db_err)}")
            
    # Pre-generate comprehensive PDF report
    try:
        pdf_filename = generate_comprehensive_report(
            session_id,
            user_name,
            user_email,
            role
        )
        logger.info(f"[/api/interview/session/{session_id}] PDF report pre-generated successfully: {pdf_filename}")
    except Exception as pdf_err:
        logger.error(f"[/api/interview/session/{session_id}] Failed to pre-generate PDF report: {str(pdf_err)}")
        
    return {
        "session_id": session_id,
        "user_id": user_id,
        "total_questions": total_questions,
        "questions_answered": total_questions,
        "average_score": avg_score,
        "weighted_average_score": weighted_avg,
        "category_scores": category_avg,
        "difficulty_scores": difficulty_avg,
        "overall_emotion": overall_emotion,
        "stress_level": stress_level,
        "recommendation": recommendation,
        "evaluations": evaluations
    }

@app.post("/api/interview/generate-report")
async def generate_report_endpoint(request: ReportRequest):
    """Generate and optionally email comprehensive PDF report"""
    logger.info(f"[/api/interview/generate-report] Generating report for session_id={request.session_id}")
    try:
        # Load metadata if fields are missing
        user_id = request.user_id
        user_name = request.user_name
        user_email = request.user_email
        role = request.role
        
        metadata_file = RECORDINGS_DIR / f"{request.session_id}_metadata.json"
        if metadata_file.exists() and (not user_id or not user_name or not user_email or not role):
            try:
                with open(metadata_file, 'r') as f:
                    meta = json.load(f)
                    if not user_id: user_id = meta.get("user_id")
                    if not user_name: user_name = meta.get("user_name")
                    if not user_email: user_email = meta.get("user_email")
                    if not role: role = meta.get("role")
                logger.info(f"[/api/interview/generate-report] Loaded details from metadata: user_name={user_name}, user_email={user_email}, role={role}")
            except Exception as meta_err:
                logger.warning(f"[/api/interview/generate-report] Failed to read metadata file: {str(meta_err)}")
                
        # Fill defaults
        if not user_name: user_name = "Candidate"
        if not user_email: user_email = ""
        if not role: role = "Software Engineer"
        
        pdf_filename = generate_comprehensive_report(
            request.session_id,
            user_name,
            user_email,
            role
        )
        
        pdf_path = REPORTS_DIR / pdf_filename
        
        # Send email if requested and email is provided
        email_sent = False
        if request.send_email and user_email:
            email_sent = send_email_with_report(
                user_email,
                user_name,
                pdf_path
            )
            logger.info(f"[/api/interview/generate-report] Email sent to {user_email}: {email_sent}")
        
        return {
            "success": True,
            "report_filename": pdf_filename,
            "download_url": f"/api/interview/download-report/{pdf_filename}",
            "email_sent": email_sent
        }
    
    except Exception as e:
        logger.error(f"[/api/interview/generate-report] Report generation error: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/interview/download-report/{filename}")
async def download_report(filename: str):
    """Download PDF report"""
    pdf_path = REPORTS_DIR / filename
    
    if not pdf_path.exists():
        raise HTTPException(status_code=404, detail="Report not found")
    
    return FileResponse(
        path=str(pdf_path),
        filename=filename,
        media_type='application/pdf'
    )

@app.post("/api/assessment/generate", response_model=DailyAssessmentResponse)
async def generate_daily_assessment(request: DailyAssessmentRequest):
    """Generate daily assessment using the cached file-based question bank"""
    try:
        from question_bank_manager import ROLE_FOLDER_MAP, is_role_generated
        role_folder = ROLE_FOLDER_MAP.get(request.role)
        if not role_folder:
            role_folder = request.role.lower().replace(" ", "_").replace("/", "")
            if role_folder not in ROLE_FOLDER_MAP.values():
                role_folder = "software_engineer"
                
        if not is_role_generated(role_folder):
            from fastapi.responses import JSONResponse
            friendly_role = [k for k, v in ROLE_FOLDER_MAP.items() if v == role_folder]
            friendly_role_name = friendly_role[0] if friendly_role else request.role
            return JSONResponse(
                status_code=404,
                content={
                    "status": "QUESTION_BANK_NOT_FOUND",
                    "message": f"Question bank for '{friendly_role_name}' has not been generated yet.",
                    "role": role_folder,
                    "suggested_command": f"python generate_question_bank.py {role_folder}",
                    "documentation": "Run the suggested command once to generate the question bank. After generation, restart the assessment."
                }
            )

        from question_bank_manager import get_assessment_questions, record_candidate_questions
        questions, assessment_id = get_assessment_questions(
            user_id=request.user_id,
            role_string=request.role
        )
        
        # Record questions to candidate history to ensure they aren't repeated
        record_candidate_questions(request.user_id, questions, role=request.role)
        
        # Store assessment
        assessment_data = {
            'assessment_id': assessment_id,
            'user_id': request.user_id,
            'role': request.role,
            'difficulty': request.difficulty or "medium",
            'experience_level': request.experience_level or "mid",
            'skills': request.skills,
            'category': request.category,
            'questions': questions,
            'date': datetime.now().isoformat()
        }
        
        assessment_file = ASSESSMENTS_DIR / f"{assessment_id}.json"
        with open(assessment_file, 'w') as f:
            json.dump(assessment_data, f, indent=2)
        
        return {
            'assessment_id': assessment_id,
            'questions': questions,
            'total_questions': len(questions),
            'date': datetime.now().strftime("%Y-%m-%d")
        }
    
    except Exception as e:
        logger.error(f"Assessment generation error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/assessment/submit", response_model=AssessmentResult)
async def submit_assessment(submission: AssessmentSubmission):
    """Submit and evaluate daily assessment"""
    try:
        result = await evaluate_daily_assessment(
            submission.assessment_id,
            submission.user_id,
            submission.answers
        )
        
        # Store result
        result_file = ASSESSMENTS_DIR / f"{submission.assessment_id}_result.json"
        with open(result_file, 'w') as f:
            json.dump(result, f, indent=2)
        
        return AssessmentResult(**result)
    
    except Exception as e:
        logger.error(f"Assessment submission error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/assessment/history/{user_id}")
async def get_assessment_history(user_id: str, limit: int = 10):
    """Get user's assessment history"""
    try:
        history = []
        
        for result_file in ASSESSMENTS_DIR.glob(f"*_result.json"):
            with open(result_file, 'r') as f:
                result_data = json.load(f)
            
            if result_data.get('user_id') == user_id:
                history.append({
                    'assessment_id': result_data['assessment_id'],
                    'date': result_data['date'],
                    'score_percentage': result_data['score_percentage'],
                    'total_questions': result_data['total_questions'],
                    'correct_answers': result_data['correct_answers']
                })
        
        # Sort by date
        history.sort(key=lambda x: x['date'], reverse=True)
        
        return {
            'user_id': user_id,
            'total_assessments': len(history),
            'assessments': history[:limit]
        }
    
    except Exception as e:
        logger.error(f"History retrieval error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/assessment/result/{assessment_id}")
async def get_assessment_result(assessment_id: str):
    """Get detailed assessment result"""
    try:
        result_file = ASSESSMENTS_DIR / f"{assessment_id}_result.json"
        if not result_file.exists():
            raise HTTPException(status_code=404, detail="Assessment result not found")
        
        with open(result_file, 'r') as f:
            result_data = json.load(f)
            
        return result_data
    except Exception as e:
        logger.error(f"Error retrieving assessment result: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/candidates/activities/{user_id}")
async def get_candidate_activities(user_id: str):
    """Get real-time activity logs from the database"""
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        
        # Fetch activity logs from database
        cursor.execute("SELECT * FROM activity_logs WHERE user_id = ? ORDER BY timestamp DESC LIMIT 10", (user_id,))
        logs = cursor.fetchall()
        conn.close()
        
        activities = []
        for log in logs:
            title = log["action"]
            activity_type = "assessment"
            status = "completed"
            score = 0
            
            # Extract score if logged (e.g. "Completed Daily Assessment (Score: 85%)")
            score_match = re.search(r"Score:\s*(\d+)", title)
            if score_match:
                score = int(score_match.group(1))
                activity_type = "assessment"
            elif "Interview" in title:
                activity_type = "interview"
                if "Cancelled" in title:
                    status = "cancelled"
                elif "Completed" in title or "Evaluated" in title:
                    status = "completed"
                else:
                    status = "upcoming"
            elif "Password" in title:
                activity_type = "auth"
                status = "completed"
                
            activities.append({
                "id": log["id"],
                "type": activity_type,
                "title": title,
                "score": score,
                "date": log["timestamp"],
                "status": status
            })
            
        return activities
    except Exception as e:
        logger.error(f"Activities retrieval error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/candidates/dashboard/{user_id}")
async def get_candidate_dashboard(user_id: str):
    """Get aggregated stats and progress for candidate dashboard"""
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        
        # Load user assessments from SQLite
        cursor.execute("SELECT * FROM assessments WHERE user_id = ?", (user_id,))
        assessments = cursor.fetchall()
        
        # Load all interviews from video_sessions
        cursor.execute("SELECT * FROM video_sessions WHERE candidate_id = ?", (user_id,))
        video_sessions = cursor.fetchall()
        
        # Load evaluations to get interview scores
        cursor.execute("SELECT score, created_at, feedback FROM evaluations WHERE candidate_id = ?", (user_id,))
        evaluations = cursor.fetchall()
        
        # Load user score metrics
        cursor.execute("SELECT overall_score, technical_score, communication_score FROM users WHERE id = ?", (user_id,))
        user_row = cursor.fetchone()
        conn.close()

        # Stats calculation
        completed_interviews = len([e for e in evaluations if e['score'] > 0])
        total_sessions = len(video_sessions)
        pending_assessments = 1 if len(assessments) == 0 else 0
        
        overall_progress = user_row["overall_score"] if user_row and user_row["overall_score"] else 0.0
        tech_progress = user_row["technical_score"] if user_row and user_row["technical_score"] else 0.0
        comm_progress = user_row["communication_score"] if user_row and user_row["communication_score"] else 0.0
        
        # Build performance trend dynamically from history points
        history_points = []
        for a in assessments:
            history_points.append({
                'date': a['date'],
                'score': a['score_percentage']
            })
        for e in evaluations:
            if e['score'] > 0:
                history_points.append({
                    'date': e['created_at'] or datetime.now(timezone.utc).isoformat(),
                    'score': e['score']
                })
                
        history_points.sort(key=lambda x: x['date'])
        recent_points = history_points[-4:]
        
        # Pad to exactly 4 items to keep UI happy
        while len(recent_points) < 4:
            default_score = 60 + len(recent_points) * 5
            recent_points.insert(0, {'date': '', 'score': default_score})
            
        perf_data = [int(p['score']) for p in recent_points]
        
        skills_score = [
            int(tech_progress) if tech_progress else 70,
            int(comm_progress) if comm_progress else 75,
            int((tech_progress + comm_progress) / 2) if (tech_progress and comm_progress) else 80,
            85
        ]
        
        return {
            "stats": {
                "completedInterviews": completed_interviews,
                "pendingAssessments": pending_assessments,
                "averageScore": int(overall_progress),
                "totalSessions": total_sessions
            },
            "progress": {
                "overall": int(overall_progress),
                "technical": int(tech_progress),
                "communication": int(comm_progress)
            },
            "performanceData": {
                "labels": ['Week 1', 'Week 2', 'Week 3', 'Week 4'],
                "datasets": [{
                    "label": 'Performance Score',
                    "data": perf_data,
                    "borderColor": '#1976d2',
                    "backgroundColor": 'rgba(25, 118, 210, 0.1)',
                    "fill": True,
                    "tension": 0.4
                }]
            },
            "skillsData": {
                "labels": ['Technical', 'Communication', 'Problem Solving', 'Behavioral'],
                "datasets": [{
                    "data": skills_score,
                    "backgroundColor": ['#1976d2', '#42a5f5', '#90caf9', '#bbdefb']
                }]
            }
        }
    except Exception as e:
        logger.error(f"Dashboard data retrieval error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

# ==================== SLOTS ENDPOINTS ====================
# REDUNDANT ENDPOINTS REMOVED - CONSOLIDATED BELOW

@app.post("/api/slots")
async def create_slot(request: dict):
    """Create a new slot with full SaaS validation rules"""
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        
        hr_email = request.get("hrEmail", "hr@speak2hr.com")
        date_str = request.get("date") # YYYY-MM-DD
        time_str = request.get("time") # HH:MM (e.g. 10:00 AM or 14:00)
        duration = int(request.get("duration", 30))
        end_time_str = request.get("end_time") # HH:MM (calculated if empty)
        
        # 1. Fetch HR working hours
        cursor.execute("SELECT id, working_hours FROM users WHERE email=? AND role='hr'", (hr_email,))
        hr_row = cursor.fetchone()
        hr_id = hr_row["id"] if hr_row else "hr_1"
        working_hours = hr_row["working_hours"] if hr_row else "09:00 AM - 06:00 PM"
        
        # Helper to convert "HH:MM AM/PM" or "HH:MM" 24h to minutes from midnight
        def parse_to_minutes(t_str):
            t_str = t_str.strip().upper()
            if "AM" in t_str or "PM" in t_str:
                match = re.match(r"(\d+):(\d+)\s*(AM|PM)", t_str)
                if match:
                    h, m, p = int(match.group(1)), int(match.group(2)), match.group(3)
                    if p == "PM" and h != 12:
                        h += 12
                    elif p == "AM" and h == 12:
                        h = 0
                    return h * 60 + m
            match = re.match(r"(\d+):(\d+)", t_str)
            if match:
                return int(match.group(1)) * 60 + int(match.group(2))
            return 0
            
        slot_start = parse_to_minutes(time_str)
        slot_end = parse_to_minutes(end_time_str) if end_time_str else slot_start + duration
        
        # Validate past date
        try:
            slot_datetime = datetime.strptime(f"{date_str} {time_str}", "%Y-%m-%d %I:%M %p")
        except ValueError:
            try:
                slot_datetime = datetime.strptime(f"{date_str} {time_str}", "%Y-%m-%d %H:%M")
            except ValueError:
                slot_datetime = datetime.now()
                
        if slot_datetime.timestamp() < datetime.now().timestamp():
            conn.close()
            raise HTTPException(status_code=400, detail="Cannot create slots in the past")
            
        # Validate working hours compliance
        if working_hours and " - " in working_hours:
            wh_start_str, wh_end_str = working_hours.split(" - ")
            wh_start = parse_to_minutes(wh_start_str)
            wh_end = parse_to_minutes(wh_end_str)
            if slot_start < wh_start or slot_end > wh_end:
                conn.close()
                raise HTTPException(status_code=400, detail=f"Slot must be within working hours ({working_hours})")
                
        # Validate overlaps
        cursor.execute("SELECT * FROM video_sessions WHERE hr_email=? AND date=? AND is_enabled=1", (hr_email, date_str))
        existing_slots = cursor.fetchall()
        for s in existing_slots:
            s_start = parse_to_minutes(s["time"])
            s_end = parse_to_minutes(s["end_time"]) if s["end_time"] else s_start + s["duration"]
            if max(slot_start, s_start) < min(slot_end, s_end):
                conn.close()
                raise HTTPException(status_code=400, detail="This slot overlaps with an existing slot")
                
        slot_id = request.get("id", f"slot-{uuid.uuid4()}")
        
        # Calculate clean end_time_str if empty
        if not end_time_str:
            eh = int(slot_end / 60)
            em = slot_end % 60
            p = "AM"
            if eh >= 12:
                p = "PM"
                if eh > 12:
                    eh -= 12
            elif eh == 0:
                eh = 12
            end_time_str = f"{eh:02d}:{em:02d} {p}"
            
        cursor.execute('''
            INSERT INTO video_sessions (
                id, hr_id, hr_name, hr_email, date, time, duration, status, 
                created_at, end_time, interview_type, meeting_mode, max_candidates, 
                notes, recurring, is_enabled
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ''', (
            slot_id,
            hr_id,
            request.get("hrName", "HR Manager"),
            hr_email,
            date_str,
            time_str,
            duration,
            request.get("status", "available"),
            datetime.now(timezone.utc).isoformat(),
            end_time_str,
            request.get("interview_type", "Technical"),
            request.get("meeting_mode", "Google Meet"),
            int(request.get("max_candidates", 1)),
            request.get("notes", ""),
            request.get("recurring", "none"),
            1
        ))
        conn.commit()
        conn.close()
        return {"id": slot_id, "success": True}
    except Exception as e:
        logger.error(f"Error creating slot: {str(e)}")
        if isinstance(e, HTTPException):
            raise e
        raise HTTPException(status_code=500, detail=str(e))

@app.put("/api/slots/{slot_id}")
async def update_slot(slot_id: str, request: dict):
    """Update a slot using safe delta updates"""
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        
        # Fetch existing slot details
        cursor.execute("SELECT * FROM video_sessions WHERE id=?", (slot_id,))
        existing = cursor.fetchone()
        
        if not existing:
            conn.close()
            raise HTTPException(status_code=404, detail="Slot not found")
            
        date = request.get("date") if request.get("date") is not None else existing["date"]
        time = request.get("time") if request.get("time") is not None else existing["time"]
        duration = request.get("duration") if request.get("duration") is not None else existing["duration"]
        status = request.get("status") if request.get("status") is not None else existing["status"]
        hr_name = request.get("hrName") if request.get("hrName") is not None else existing["hr_name"]
        hr_email = request.get("hrEmail") if request.get("hrEmail") is not None else existing["hr_email"]
        
        cursor.execute('''
            UPDATE video_sessions 
            SET date=?, time=?, duration=?, status=?, hr_name=?, hr_email=?
            WHERE id=?
        ''', (
            date,
            time,
            duration,
            status,
            hr_name,
            hr_email,
            slot_id
        ))
        conn.commit()
        conn.close()
        return {"success": True, "id": slot_id}
    except Exception as e:
        logger.error(f"Error updating slot: {str(e)}")
        if isinstance(e, HTTPException):
            raise e
        raise HTTPException(status_code=500, detail=str(e))

@app.delete("/api/slots/{slot_id}")
async def delete_slot(slot_id: str):
    """Delete a slot"""
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("DELETE FROM video_sessions WHERE id=?", (slot_id,))
        conn.commit()
        conn.close()
        return {"success": True}
    except Exception as e:
        logger.error(f"Error deleting slot: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

# DUPLICATE BOOKING ENDPOINT REMOVED - CONSOLIDATED BELOW

@app.post("/api/slots/cancel/{slot_id}")
async def cancel_slot(slot_id: str, request: dict):
    """Cancel a booked slot"""
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        
        # Fetch slot details before clearing them
        cursor.execute("SELECT * FROM video_sessions WHERE id=?", (slot_id,))
        slot = cursor.fetchone()
        
        if not slot:
            conn.close()
            raise HTTPException(status_code=404, detail="Slot not found")
            
        candidate_email = slot["candidate_email"] or request.get("candidateEmail") or "candidate@speak2hr.com"
        candidate_name = slot["candidate_name"] or request.get("candidateName") or "Candidate"
        hr_email = slot["hr_email"] or "hr@speak2hr.com"
        hr_name = slot["hr_name"] or "HR Manager"
        date = slot["date"]
        time = slot["time"]
        candidate_id = slot["candidate_id"]
        
        cursor.execute('''
            UPDATE video_sessions 
            SET status='available', candidate_id=NULL, candidate_name=NULL, candidate_email=NULL, video_link=NULL
            WHERE id=?
        ''', (slot_id,))
        conn.commit()
        conn.close()
        
        # Log activity
        if candidate_id:
            log_activity(candidate_id, f"Cancelled scheduled HR Interview on {date} at {time}")
            
        # Send cancellation emails
        send_slot_cancellation_email(
            candidate_email=candidate_email,
            candidate_name=candidate_name,
            hr_email=hr_email,
            hr_name=hr_name,
            date=date,
            time=time
        )
        
        return {"success": True}
    except Exception as e:
        logger.error(f"Error canceling slot: {str(e)}")
        if isinstance(e, HTTPException):
            raise e
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/evaluations")
async def get_all_evaluations():
    """Get all evaluations"""
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM evaluations")
        evaluations = cursor.fetchall()
        conn.close()
        return [dict(e) for e in evaluations]
    except Exception as e:
        logger.error(f"Error fetching evaluations: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/evaluations")
async def create_evaluation(request: dict):
    """Create a new evaluation"""
    try:
        eval_id = request.get("id", f"eval-{int(time.time()*1000)}")
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute('''
            INSERT INTO evaluations (id, candidate_id, hr_id, score, feedback, status, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        ''', (
            eval_id,
            request.get("candidateId"),
            request.get("hrId"),
            request.get("score", 0),
            json.dumps(request.get("feedback", {})),
            request.get("status", "pending"),
            datetime.now(timezone.utc).isoformat()
        ))
        conn.commit()
        conn.close()
        return {"id": eval_id}
    except Exception as e:
        logger.error(f"Error creating evaluation: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.put("/api/evaluations/{eval_id}/submit")
async def submit_evaluation(eval_id: str, request: dict):
    """Submit evaluation and update candidate status"""
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        
        # Determine score from request (if complex scoring, just grab average)
        score = request.get("score")
        if score is None:
             # Calculate from skills if present
             scores = request.get("scores", {})
             if scores:
                 score = sum([int(v) for v in scores.values()]) / len(scores)
             else:
                 score = 0
                 
        decision = request.get("decision", "pending")
        
        cursor.execute('''
            UPDATE evaluations 
            SET score=?, feedback=?, status='completed'
            WHERE id=?
        ''', (
            score,
            json.dumps(request),
            eval_id
        ))
        
        # Get candidate id for this evaluation
        cursor.execute("SELECT candidate_id FROM evaluations WHERE id=?", (eval_id,))
        eval_row = cursor.fetchone()
        
        if eval_row and eval_row["candidate_id"]:
            candidate_id = eval_row["candidate_id"]
            # Update user status
            cursor.execute("UPDATE users SET status=? WHERE id=?", (decision, candidate_id))
            conn.commit()
            
            # Recalculate metrics
            recalculate_user_metrics(candidate_id)
            
            # Log activity
            log_activity(candidate_id, f"HR Interview Evaluation Submitted (Score: {score}%, Status: {decision})")
            
        else:
            conn.commit()
            
        conn.close()
        return {"success": True, "id": eval_id}
    except Exception as e:
        logger.error(f"Error submitting evaluation: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

# ==================== ADMIN ENDPOINTS ====================

@app.get("/api/hr/stats")
async def get_hr_stats():
    """Get aggregated stats for HR dashboard"""
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        
        # Total Candidates
        cursor.execute("SELECT COUNT(*) as count FROM users WHERE role = 'candidate'")
        total_candidates = cursor.fetchone()['count']
        
        # Interviews Today
        today = datetime.now(timezone.utc).strftime('%Y-%m-%d')
        cursor.execute("SELECT COUNT(*) as count FROM video_sessions WHERE date = ? AND status = 'booked'", (today,))
        interviews_today = cursor.fetchone()['count']
        
        # Pending Evaluations
        cursor.execute("SELECT COUNT(*) as count FROM evaluations WHERE status = 'pending'")
        pending_evaluations = cursor.fetchone()['count']
        
        # Average Score
        cursor.execute("SELECT AVG(score) as avg_score FROM evaluations WHERE score > 0")
        avg_score_row = cursor.fetchone()
        average_score = avg_score_row['avg_score'] if avg_score_row and avg_score_row['avg_score'] else 0.0
        
        # Active Assessments
        cursor.execute("SELECT COUNT(*) as count FROM assessments")
        active_assessments = cursor.fetchone()['count']
        
        # Planned Interviews (Total Booked)
        cursor.execute("SELECT COUNT(*) as count FROM video_sessions WHERE status = 'booked'")
        planned_interviews = cursor.fetchone()['count']
        
        # New Applications (Registered in last 30 days)
        thirty_days_ago = (datetime.now(timezone.utc) - timedelta(days=30)).isoformat()
        cursor.execute("SELECT COUNT(*) as count FROM users WHERE role = 'candidate' AND registered_date >= ?", (thirty_days_ago,))
        new_applications = cursor.fetchone()['count']
        
        # Interview Pass Rate (Percentage of evaluations with score >= 70)
        cursor.execute("SELECT COUNT(*) as count FROM evaluations WHERE score >= 70")
        passed = cursor.fetchone()['count']
        cursor.execute("SELECT COUNT(*) as count FROM evaluations WHERE score > 0")
        total_evals = cursor.fetchone()['count']
        pass_rate = round((passed / total_evals) * 100, 1) if total_evals > 0 else 100.0
        
        conn.close()

        return {
            "totalCandidates": total_candidates,
            "interviewsToday": interviews_today,
            "pendingEvaluations": pending_evaluations,
            "averageScore": round(average_score, 1),
            "activeAssessments": active_assessments,
            "plannedInterviews": planned_interviews,
            "newApplications": new_applications,
            "interviewPassRate": pass_rate
        }
    except Exception as e:
        logger.error(f"Error fetching HR stats: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/admin/users")
async def get_all_users():
    """Get all system users (admin only)"""
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT id, name, email, role, target_role, skills, experience_years, status, registered_date, last_login FROM users")
        users = cursor.fetchall()
        conn.close()
        return [dict(u) for u in users]
    except Exception as e:
        logger.error(f"Error fetching users: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.put("/api/admin/users/{user_id}")
async def update_user(user_id: str, user_data: dict):
    """Update user information (admin only)"""
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        
        update_fields = []
        params = []
        mapping = {
            "name": "name", "email": "email", "role": "role", 
            "status": "status", "targetRole": "target_role"
        }
        
        for k, v in user_data.items():
            if k in mapping:
                update_fields.append(f"{mapping[k]}=?")
                params.append(v)
                
        if not update_fields:
             return {"success": True}
             
        params.append(user_id)
        query = f"UPDATE users SET {', '.join(update_fields)} WHERE id=?"
        
        cursor.execute(query, tuple(params))
        conn.commit()
        conn.close()
        
        return {"success": True, "id": user_id}
    except Exception as e:
        logger.error(f"Error updating user: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.delete("/api/admin/users/{user_id}")
async def delete_user(user_id: str):
    """Delete a user (admin only)"""
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("DELETE FROM users WHERE id = ?", (user_id,))
        conn.commit()
        conn.close()
        return {"success": True}
    except Exception as e:
        logger.error(f"Error deleting user: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))



@app.get("/api/admin/stats")
async def get_system_stats():
    """Get system statistics (admin only)"""
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        
        cursor.execute("SELECT COUNT(*) as c FROM users")
        total_users = cursor.fetchone()["c"]
        
        cursor.execute("SELECT COUNT(*) as c FROM users WHERE status IN ('active', 'approved')")
        active_users = cursor.fetchone()["c"]
        
        cursor.execute("SELECT COUNT(*) as c FROM users WHERE role = 'candidate'")
        total_candidates = cursor.fetchone()["c"]
        
        cursor.execute("SELECT COUNT(*) as c FROM users WHERE role = 'hr'")
        total_hr = cursor.fetchone()["c"]
        
        pending_hr = 0
        
        cursor.execute("SELECT COUNT(*) as c FROM evaluations")
        total_interviews = cursor.fetchone()["c"]
        
        cursor.execute("SELECT COUNT(*) as c FROM evaluations WHERE status = 'pending'")
        pending_evaluations = cursor.fetchone()["c"]
        
        conn.close()

        # Count files in various directories for extra basic stats
        total_reports = len(list(REPORTS_DIR.glob("*.pdf")))
        total_assessments = len(list(ASSESSMENTS_DIR.glob("*_result.json")))
        total_videos = len(list(VIDEOS_DIR.glob("*.webm"))) + len(list(VIDEOS_DIR.glob("*.mp4")))

        return {
            "totalUsers": total_users,
            "activeUsers": active_users,
            "totalCandidates": total_candidates,
            "totalHRUsers": total_hr,
            "totalInterviews": total_interviews,
            "pendingHRApprovals": pending_hr,
            "pendingEvaluations": pending_evaluations,
            "totalAssessments": total_assessments,
            "totalVideos": total_videos
        }
    except Exception as e:
        logger.error(f"Error fetching system stats: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/hrs")
async def get_all_hrs():
    """Fetch all HR recruiters from database"""
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("""
            SELECT id, name, email, designation, department, specialization, 
                   languages, bio, working_hours, location, rating, avatar, status 
            FROM users WHERE role='hr'
        """)
        hrs = cursor.fetchall()
        conn.close()
        
        result = []
        for hr in hrs:
            result.append({
                "id": hr["id"],
                "name": hr["name"],
                "email": hr["email"],
                "designation": hr["designation"],
                "department": hr["department"],
                "specialization": json.loads(hr["specialization"]) if hr["specialization"] else [],
                "languages": json.loads(hr["languages"]) if hr["languages"] else [],
                "bio": hr["bio"],
                "working_hours": hr["working_hours"],
                "location": hr["location"],
                "rating": hr["rating"],
                "avatar": hr["avatar"]
            })
        return result
    except Exception as e:
        logger.error(f"Error fetching HRs: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.put("/api/hr/profile/{hr_id}")
async def update_hr_profile(hr_id: str, request: dict):
    """Update HR profile details in database"""
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        
        cursor.execute("SELECT * FROM users WHERE id=? AND role='hr'", (hr_id,))
        existing = cursor.fetchone()
        if not existing:
            conn.close()
            raise HTTPException(status_code=404, detail="HR Profile not found")
            
        name = request.get("name", existing["name"])
        email = request.get("email", existing["email"])
        phone = request.get("phone") if request.get("phone") is not None else existing["phone"]
        designation = request.get("designation") if request.get("designation") is not None else existing["designation"]
        department = request.get("department") if request.get("department") is not None else existing["department"]
        
        specialization = request.get("specialization")
        specialization_str = json.dumps(specialization) if isinstance(specialization, list) else (specialization if specialization is not None else existing["specialization"])
        
        languages = request.get("languages")
        languages_str = json.dumps(languages) if isinstance(languages, list) else (languages if languages is not None else existing["languages"])
        
        bio = request.get("bio") if request.get("bio") is not None else existing["bio"]
        working_hours = request.get("working_hours") if request.get("working_hours") is not None else existing["working_hours"]
        location = request.get("location") if request.get("location") is not None else existing["location"]
        avatar = request.get("avatar") if request.get("avatar") is not None else existing["avatar"]
        
        cursor.execute('''
            UPDATE users
            SET name=?, email=?, phone=?, designation=?, department=?, specialization=?, 
                languages=?, bio=?, working_hours=?, location=?, avatar=?
            WHERE id=?
        ''', (
            name, email, phone, designation, department, specialization_str,
            languages_str, bio, working_hours, location, avatar, hr_id
        ))
        conn.commit()
        conn.close()
        return {"success": True, "message": "Profile updated successfully"}
    except Exception as e:
        logger.error(f"Error updating HR profile: {str(e)}")
        if isinstance(e, HTTPException):
            raise e
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/candidates/{candidate_id}/reports")
async def get_candidate_reports(candidate_id: str):
    """Fetch completed interview reports for a candidate from database"""
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        
        cursor.execute("""
            SELECT id, score, feedback, created_at 
            FROM evaluations 
            WHERE candidate_id=? AND hr_id='ai-interviewer' AND status='completed'
            ORDER BY created_at DESC
        """, (candidate_id,))
        rows = cursor.fetchall()
        
        reports = []
        for r in rows:
            eval_id = r["id"]
            score_val = r["score"]
            created_at = r["created_at"]
            
            feedback_raw = r["feedback"]
            feedback_data = {}
            if feedback_raw:
                try:
                    feedback_data = json.loads(feedback_raw)
                except Exception:
                    feedback_data = {}
                    
            # Load detailed evaluations file in recordings/ if available
            eval_file = RECORDINGS_DIR / f"{eval_id}_evaluations.json"
            detailed_evaluations = []
            if eval_file.exists():
                try:
                    with open(eval_file, 'r') as f:
                        detailed_evaluations = json.load(f)
                except Exception:
                    detailed_evaluations = []
                    
            # Calculate specific sub-scores from detailed evaluations
            tech_scores = [float(e.get("technical_rating", 0.7)) for e in detailed_evaluations]
            comm_scores = [float(e.get("clarity_rating", 0.7)) for e in detailed_evaluations]
            behav_scores = [float(e.get("relevance_rating", 0.7)) for e in detailed_evaluations]
            emo_scores = [float(e.get("confidence_rating", 0.7)) for e in detailed_evaluations]
            
            avg_tech = sum(tech_scores) / len(tech_scores) if tech_scores else score_val
            avg_comm = sum(comm_scores) / len(comm_scores) if comm_scores else score_val
            avg_behav = sum(behav_scores) / len(behav_scores) if behav_scores else score_val
            avg_emo = sum(emo_scores) / len(emo_scores) if emo_scores else score_val
            
            reports.append({
                "id": eval_id,
                "sessionId": eval_id,
                "date": created_at.split('T')[0] if created_at else datetime.now().strftime("%Y-%m-%d"),
                "type": "AI Interview",
                "overallScore": round(score_val * 100),
                "technicalScore": round(avg_tech * 100),
                "communicationScore": round(avg_comm * 100),
                "behavioralScore": round(avg_behav * 100),
                "emotionScore": round(avg_emo * 100),
                "questionsAnswered": len(detailed_evaluations) if detailed_evaluations else 8,
                "status": "completed",
                "evaluations": detailed_evaluations,
                "feedback": feedback_data.get("overall_feedback", "Successfully completed.")
            })
            
        conn.close()
        return reports
    except Exception as e:
        logger.error(f"Error fetching candidate reports: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/candidates/{candidate_id}")
async def get_candidate_by_id(candidate_id: str):
    """Get specific candidate information for HR view"""
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        
        cursor.execute("""
            SELECT id, name, email, target_role, skills, experience_years, status 
            FROM users WHERE id=? AND role='candidate'
        """, (candidate_id,))
        user = cursor.fetchone()
        
        if not user:
            conn.close()
            raise HTTPException(status_code=404, detail="Candidate not found")
            
        # Fetch assessments
        cursor.execute("SELECT score_percentage, date FROM assessments WHERE user_id = ?", (candidate_id,))
        assessments = cursor.fetchall()
        avg_score = sum(a['score_percentage'] for a in assessments) / len(assessments) if assessments else 0
        
        # Fetch evaluations
        cursor.execute("SELECT score, feedback, status FROM evaluations WHERE candidate_id = ?", (candidate_id,))
        evaluations = cursor.fetchall()
        
        conn.close()
        
        return {
            "id": user['id'],
            "name": user['name'],
            "email": user['email'],
            "role": user['target_role'] or "Candidate",
            "skills": json.loads(user['skills']) if user['skills'] else [],
            "experience_years": user['experience_years'],
            "score": round(avg_score, 1),
            "status": user['status'],
            "assessments": [dict(a) for a in assessments],
            "evaluations": [dict(e) for e in evaluations]
        }
    except Exception as e:
        logger.error(f"Error fetching candidate details: {str(e)}")
        if isinstance(e, HTTPException):
            raise e
        raise HTTPException(status_code=500, detail=str(e))

@app.put("/api/candidates/{candidate_id}")
async def update_candidate_profile(candidate_id: str, request: dict):
    """Update candidate profile details in database"""
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        
        name = request.get("name")
        target_role = request.get("targetRole")
        skills = request.get("skills", [])
        experience_years = request.get("experienceYears", 0)
        phone = request.get("phone", "")
        location = request.get("location", "")
        
        # Serialize skills to JSON string
        skills_str = json.dumps(skills) if isinstance(skills, list) else json.dumps([])
        
        cursor.execute("""
            UPDATE users 
            SET name=?, target_role=?, skills=?, experience_years=?, phone=?, location=?
            WHERE id=? AND role='candidate'
        """, (name, target_role, skills_str, experience_years, phone, location, candidate_id))
        
        conn.commit()
        conn.close()
        
        log_activity(candidate_id, "Profile information updated.")
        
        return {"success": True, "message": "Profile updated successfully"}
    except Exception as e:
        logger.error(f"Error updating candidate profile: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.put("/api/candidates/{candidate_id}/status")
async def update_candidate_status(candidate_id: str, request: dict):
    """Update candidate decision status"""
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        
        decision = request.get("status")
        
        cursor.execute("UPDATE users SET status=? WHERE id=? AND role='candidate'", (decision, candidate_id))
        conn.commit()
        conn.close()
        
        # Log to activities
        log_activity(candidate_id, f"Application status updated to: {decision.upper()}")
        
        # Create a notification
        create_notification(candidate_id, f"Your application status has been updated to: {decision.upper()}")
        
        return {"success": True, "status": decision}
    except Exception as e:
        logger.error(f"Error updating candidate status: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/notifications/{user_id}")
async def get_notifications(user_id: str):
    """Fetch notifications for a user"""
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM notifications WHERE user_id=? ORDER BY timestamp DESC LIMIT 20", (user_id,))
        rows = cursor.fetchall()
        conn.close()
        return [dict(r) for r in rows]
    except Exception as e:
        logger.error(f"Error fetching notifications: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/notifications/read/{notification_id}")
async def mark_notification_read(notification_id: str):
    """Mark notification as read"""
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("UPDATE notifications SET is_read=1 WHERE id=?", (notification_id,))
        conn.commit()
        conn.close()
        return {"success": True}
    except Exception as e:
        logger.error(f"Error marking notification as read: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/candidates")
async def get_all_candidates():
    """Get all candidates for HR dashboard"""
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        
        cursor.execute("SELECT id, name, email, target_role, status FROM users WHERE role='candidate'")
        users = cursor.fetchall()
        
        candidates = []
        for user in users:
            # Get average score from assessments
            cursor.execute("SELECT score_percentage FROM assessments WHERE user_id = ?", (user['id'],))
            scores = cursor.fetchall()
            avg_score = sum(s['score_percentage'] for s in scores) / len(scores) if scores else 0
            
            candidates.append({
                "id": user['id'],
                "name": user['name'],
                "email": user['email'],
                "role": user['target_role'] or "Candidate",
                "score": round(avg_score, 1),
                "status": "Passed" if avg_score >= 70 else ("Failed" if scores else "New")
            })
            
        conn.close()
        return candidates
    except Exception as e:
        logger.error(f"Error fetching candidates: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/admin/settings")
async def get_system_settings():
    """Get system settings (admin only)"""
    try:
        # In a real implementation, fetch from database or config
        return {
            "siteName": "Speak2HR",
            "allowRegistration": True,
            "emailNotifications": True,
            "maintenanceMode": False,
            "maxInterviewDuration": 60,
            "assessmentPassScore": 70
        }
    except Exception as e:
        logger.error(f"Error fetching settings: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.put("/api/admin/settings")
async def update_system_settings(settings: dict):
    """Update system settings (admin only)"""
    try:
        # In a real implementation, save to database or config file
        return {
            "success": True,
            "message": "Settings would be updated",
            "settings": settings
        }
    except Exception as e:
        logger.error(f"Error updating settings: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/slots/book")
async def book_slot(request: SlotBookingRequest):
    """Book an interview slot (sets to pending, HR must confirm)"""
    try:
        # Try to save to DB first to ensure consistent state
        try:
            conn = get_db_connection()
            cursor = conn.cursor()
            
            # Check if slot exists
            cursor.execute("SELECT * FROM video_sessions WHERE id = ?", (request.slot_id,))
            existing_slot = cursor.fetchone()
            
            if existing_slot:
                cursor.execute('''
                    UPDATE video_sessions 
                    SET candidate_id=?, candidate_name=?, candidate_email=?, 
                        hr_name=?, hr_email=?, status='pending', video_link=NULL
                    WHERE id=?
                ''', (
                    request.candidate_id, request.candidate_name, request.candidate_email,
                    request.hr_name, request.hr_email, request.slot_id
                ))
            else:
                cursor.execute('''
                    INSERT INTO video_sessions (
                        id, hr_name, hr_email, candidate_id, candidate_name, candidate_email,
                        date, time, duration, status, video_link, created_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ''', (
                    request.slot_id, request.hr_name, request.hr_email,
                    request.candidate_id, request.candidate_name, request.candidate_email,
                    request.date, request.time, request.duration, "pending",
                    None, datetime.now(timezone.utc).isoformat()
                ))
            conn.commit()
            conn.close()
        except Exception as db_e:
            logger.error(f"Error saving video session to DB: {db_e}")
            raise HTTPException(status_code=500, detail="Database error during booking")

        return {
            "success": True,
            "message": "Slot booking request submitted, waiting for confirmation",
            "video_call_link": None,
            "email_sent": False,
            "slot_id": request.slot_id
        }

    except Exception as e:
        logger.error(f"Slot booking error: {str(e)}")
        if isinstance(e, HTTPException):
            raise e
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/slots/confirm/{slot_id}")
async def confirm_slot(slot_id: str):
    """Confirm a pending interview slot booking"""
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        
        cursor.execute("SELECT * FROM video_sessions WHERE id = ?", (slot_id,))
        slot = cursor.fetchone()
        
        if not slot:
            conn.close()
            raise HTTPException(status_code=404, detail="Slot not found")
            
        if slot["status"] != 'pending':
            conn.close()
            raise HTTPException(status_code=400, detail="Slot is not in pending status")
            
        room_name = f"room_{slot_id}"
        video_call_link = f"/video-call/{room_name}"
        
        cursor.execute('''
            UPDATE video_sessions 
            SET status='booked', video_link=?
            WHERE id=?
        ''', (video_call_link, slot_id))
        conn.commit()
        conn.close()
        
        # Log activity
        candidate_id = slot["candidate_id"]
        candidate_email = slot["candidate_email"]
        candidate_name = slot["candidate_name"]
        hr_name = slot["hr_name"]
        hr_email = slot["hr_email"]
        date = slot["date"]
        time = slot["time"]
        duration = slot["duration"]
        
        if candidate_id:
            log_activity(candidate_id, f"Confirmed scheduled HR Interview on {date} at {time}")
            create_notification(candidate_id, f"Your interview on {date} at {time} with {hr_name} is confirmed!")
            
        # Send email
        email_sent = send_slot_booking_email(
            candidate_email=candidate_email,
            candidate_name=candidate_name,
            hr_email=hr_email,
            hr_name=hr_name,
            date=date,
            time=time,
            duration=duration,
            video_call_link=video_call_link
        )
        
        return {"success": True, "message": "Interview confirmed and notification sent", "email_sent": email_sent}
    except Exception as e:
        logger.error(f"Error confirming slot: {str(e)}")
        if isinstance(e, HTTPException):
            raise e
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/slots/decline/{slot_id}")
async def decline_slot(slot_id: str):
    """Decline a pending interview slot booking"""
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        
        cursor.execute("SELECT * FROM video_sessions WHERE id = ?", (slot_id,))
        slot = cursor.fetchone()
        
        if not slot:
            conn.close()
            raise HTTPException(status_code=404, detail="Slot not found")
            
        candidate_id = slot["candidate_id"]
        candidate_email = slot["candidate_email"]
        candidate_name = slot["candidate_name"]
        hr_name = slot["hr_name"]
        hr_email = slot["hr_email"]
        date = slot["date"]
        time = slot["time"]
        
        cursor.execute('''
            UPDATE video_sessions 
            SET status='available', candidate_id=NULL, candidate_name=NULL, candidate_email=NULL, video_link=NULL
            WHERE id=?
        ''', (slot_id,))
        conn.commit()
        conn.close()
        
        # Log activity & create notification
        if candidate_id:
            log_activity(candidate_id, f"Declined scheduled HR Interview request on {date} at {time}")
            create_notification(candidate_id, f"Your interview request on {date} at {time} with {hr_name} has been declined.")
            
        # Send a decline/cancellation email
        email_sent = False
        try:
            msg = MIMEMultipart("alternative")
            msg['From'] = EMAIL_USER
            msg['To'] = candidate_email
            msg['Subject'] = f"Interview Booking Request Declined - {date} at {time}"
            
            html = f"""
            <html>
            <body>
                <p>Dear {candidate_name},</p>
                <p>We regret to inform you that your request to book an interview slot on {date} at {time} with {hr_name} was declined.</p>
                <p>Please log back into the portal and select another available slot.</p>
                <p>Best regards,<br>Speak2HR Team</p>
            </body>
            </html>
            """
            msg.attach(MIMEText(html, 'html'))
            
            server = smtplib.SMTP('smtp.gmail.com', 587)
            server.starttls()
            server.login(EMAIL_USER, EMAIL_PASSWORD)
            server.send_message(msg)
            server.quit()
            email_sent = True
        except Exception as email_err:
            logger.error(f"Failed to send decline email: {email_err}")
            
        return {"success": True, "message": "Interview declined and notification sent", "email_sent": email_sent}
    except Exception as e:
        logger.error(f"Error declining slot: {str(e)}")
        if isinstance(e, HTTPException):
            raise e
        raise HTTPException(status_code=500, detail=str(e))

class SlotCreateRequest(BaseModel):
    id: str
    date: str
    time: str
    duration: int
    hrName: str
    hrEmail: Optional[str] = None
    status: str = "available"

@app.get("/api/slots")
async def get_all_slots():
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM video_sessions")
        slots = cursor.fetchall()
        conn.close()
        
        result = []
        for s in slots:
            result.append({
                "id": s["id"],
                "date": s["date"],
                "time": s["time"],
                "duration": s["duration"],
                "status": s["status"],
                "candidateId": s["candidate_id"],
                "candidate": s["candidate_name"],
                "candidateEmail": s["candidate_email"],
                "hrName": s["hr_name"],
                "hrEmail": s["hr_email"],
                "videoCallLink": s["video_link"] # Ensure frontend receives this key
            })
        return result
    except Exception as e:
        logger.error(f"Error fetching slots: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/health")
async def health_check():
    return {
        "status": "healthy",
        "message": "Speak2HR AI Interview System",
        "version": "3.1.0",
        "features": [
            "Resume analysis with structured extraction",
            "Personalized questions (Skills + Experience + JD based)",
            "8-level progressive difficulty",
            "Video + Audio recording per question",
            "DeepFace emotion analysis",
            "Multi-API parallel processing (5 keys)",
            "Daily unique assessments",
            "Comprehensive PDF reports",
            "Email delivery",
            "Admin panel with user management"
        ],
        "active_api_keys": sum(1 for key in API_KEYS.values() if key),
        "model": GEMINI_MODEL
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
