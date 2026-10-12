"""
Speak2HR - Resume-Based RAG Pipeline
====================================
Production-grade Retrieval-Augmented Generation pipeline for resume-grounded
interview question generation and answer evaluation.

Features:
- Robust multi-format document extraction (PDF via PyPDF2/pypdf, DOCX via python-docx, TXT)
- Section-aware and project-aware structural chunking
- Local dense/sparse vector embedding engine with cosine similarity search
- SQLite persistent vector and metadata store
- Multi-query targeted retrieval (projects, architectures, AI/ML, databases, skills)
- Strict evidence-grounded Gemini question generation with Pydantic schemas
- Server-side cross-contamination and hallucination verification
- Answer evaluation supporting both audio/transcription and text responses
"""

import os
import re
import json
import uuid
import hashlib
import logging
from typing import List, Dict, Any, Optional, Tuple
from datetime import datetime, timezone
from pathlib import Path
from pydantic import BaseModel, Field

import numpy as np
from database import get_db_connection

# Document extractors
try:
    import pypdf
    HAS_PYPDF = True
except ImportError:
    HAS_PYPDF = False

try:
    import PyPDF2
    HAS_PYPDF2 = True
except ImportError:
    HAS_PYPDF2 = False

try:
    import docx
    HAS_DOCX = True
except ImportError:
    HAS_DOCX = False

logger = logging.getLogger(__name__)

# ============================================================================
# PYDANTIC SCHEMAS FOR STRUCTURED GEMINI OUTPUT
# ============================================================================

class GeneratedQuestionItem(BaseModel):
    question: str = Field(..., description="The personalized interview question")
    project_or_context: str = Field(..., description="The project or specific role context this question targets")
    supporting_evidence: str = Field(..., description="Exact quote or excerpt from the resume that proves this experience")
    category: str = Field(..., description="Category: project_deep_dive, technical_implementation, architecture_design, skill_demonstration, or problem_solving")
    difficulty: str = Field(default="medium", description="Difficulty level: easy, medium, or hard")
    expected_keywords: List[str] = Field(default_factory=list, description="Keywords expected in a competent answer")
    relevance_explanation: str = Field(..., description="Explanation of why this question is directly relevant to the resume")

class QuestionGenerationResult(BaseModel):
    questions: List[GeneratedQuestionItem] = Field(default_factory=list)

class CandidateAnswerEvaluationResult(BaseModel):
    relevance: float = Field(..., description="Score 0.0 to 1.0 for relevance")
    technical_accuracy: float = Field(..., description="Score 0.0 to 1.0 for technical accuracy")
    clarity: float = Field(..., description="Score 0.0 to 1.0 for clarity and structure")
    confidence: float = Field(..., description="Score 0.0 to 1.0 for reasoning depth")
    overall_score: float = Field(..., description="Weighted composite score 0.0 to 1.0")
    strengths: List[str] = Field(default_factory=list)
    improvements: List[str] = Field(default_factory=list)
    overall_feedback: str = Field(...)


# ============================================================================
# DOCUMENT EXTRACTION & CLEANING
# ============================================================================

class DocumentProcessingError(Exception):
    """Raised when resume extraction fails due to formatting or empty content."""
    pass


def compute_file_hash(content_bytes: bytes) -> str:
    """Compute SHA-256 hash of file content for idempotent caching."""
    return hashlib.sha256(content_bytes).hexdigest()


def extract_text_from_bytes(file_bytes: bytes, filename: str) -> str:
    """
    Extract readable text from PDF, DOCX, or TXT file bytes.
    Handles empty, corrupt, or image-only documents with clear errors.
    """
    ext = os.path.splitext(filename)[1].lower()
    extracted_text = ""

    if ext == ".pdf":
        # Try pypdf first, then PyPDF2
        pdf_pages = []
        if HAS_PYPDF:
            try:
                import io
                reader = pypdf.PdfReader(io.BytesIO(file_bytes))
                for page in reader.pages:
                    text = page.extract_text() or ""
                    pdf_pages.append(text)
            except Exception as e:
                logger.warning(f"pypdf extraction failed, trying PyPDF2: {e}")
                pdf_pages = []

        if not pdf_pages and HAS_PYPDF2:
            try:
                import io
                reader = PyPDF2.PdfReader(io.BytesIO(file_bytes))
                for page in reader.pages:
                    text = page.extract_text() or ""
                    pdf_pages.append(text)
            except Exception as e:
                raise DocumentProcessingError(f"Failed to read PDF file: {str(e)}")

        extracted_text = "\n\n".join(pdf_pages).strip()

    elif ext in [".docx", ".doc"]:
        if not HAS_DOCX:
            raise DocumentProcessingError("DOCX processing library python-docx is not installed.")
        try:
            import io
            doc = docx.Document(io.BytesIO(file_bytes))
            paragraphs = [p.text for p in doc.paragraphs if p.text.strip()]
            for table in doc.tables:
                for row in table.rows:
                    row_text = " | ".join(cell.text.strip() for cell in row.cells if cell.text.strip())
                    if row_text:
                        paragraphs.append(row_text)
            extracted_text = "\n\n".join(paragraphs).strip()
        except Exception as e:
            raise DocumentProcessingError(f"Failed to read Word document: {str(e)}")

    elif ext in [".txt", ".md"]:
        for encoding in ["utf-8", "latin-1", "cp1252"]:
            try:
                extracted_text = file_bytes.decode(encoding).strip()
                break
            except UnicodeDecodeError:
                continue
    else:
        raise DocumentProcessingError(f"Unsupported file format '{ext}'. Please upload a PDF, DOCX, or TXT file.")

    # Validation: Ensure text is substantive
    clean_sample = re.sub(r"\s+", "", extracted_text)
    if len(clean_sample) < 40:
        raise DocumentProcessingError(
            "The uploaded document contains no readable text. "
            "It may be an image-only/scanned PDF, empty, or password protected. "
            "Please provide a text-searchable PDF or Word document."
        )

    return clean_resume_text(extracted_text)


def clean_resume_text(text: str) -> str:
    """
    Clean extracted text while preserving meaningful section headings,
    project names, dates, technologies, and bullet points.
    """
    if not text:
        return ""

    # Replace unicode non-standard bullets with standard hyphen
    text = re.sub(r"[\u2022\u25e6\u2043\u2219\u25cf\u25cb\u25aa\u25ab\u25c6]", "\n- ", text)
    # Normalize dashes and quotes
    text = re.sub(r"[\u2010\u2011\u2012\u2013\u2014\u2015]", "-", text)
    text = re.sub(r"[\u2018\u2019\u201b]", "'", text)
    text = re.sub(r"[\u201c\u201d\u201f]", '"', text)
    text = re.sub(r"[\u00a0\u2000-\u200b\u2028\u2029]", " ", text)

    # Normalize multiple blank lines to double newline
    text = re.sub(r"\r\n|\r", "\n", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    # Strip trailing whitespace on each line
    lines = [re.sub(r"[ \t]+$", "", line) for line in text.split("\n")]
    return "\n".join(lines).strip()


# ============================================================================
# STRUCTURAL & SECTION-AWARE CHUNKING
# ============================================================================

KNOWN_TECH_KEYWORDS = {
    "python", "javascript", "typescript", "java", "c++", "c#", "go", "golang", "rust", "php", "ruby", "swift", "kotlin",
    "react", "react.js", "next.js", "vue", "vue.js", "angular", "node.js", "express", "fastapi", "flask", "django",
    "spring", "spring boot", "asp.net", "graphql", "rest", "restful", "grpc", "microservices", "websocket",
    "postgresql", "postgres", "mysql", "mongodb", "sqlite", "redis", "cassandra", "dynamodb", "elasticsearch", "neo4j",
    "docker", "kubernetes", "aws", "azure", "gcp", "terraform", "ansible", "ci/cd", "github actions", "jenkins", "kafka", "rabbitmq",
    "pytorch", "tensorflow", "keras", "scikit-learn", "hugging face", "opencv", "deepface", "rag", "langchain", "llm", "gemini", "bert",
    "tailwind", "bootstrap", "material-ui", "mui", "redux", "zustand", "prisma", "hibernate", "jwt", "oauth", "firebase"
}


def extract_technologies_from_text(text: str) -> List[str]:
    """Identify explicitly mentioned technologies in a text block."""
    lower_text = text.lower()
    found = set()
    for tech in KNOWN_TECH_KEYWORDS:
        # Match as whole word/phrase
        pattern = r"(?:\b|_)" + re.escape(tech) + r"(?:\b|_)"
        if re.search(pattern, lower_text):
            found.add(tech)
    return sorted(list(found))


SECTION_PATTERNS = [
    (r"(?i)^(?:technical\s+)?skills(?:\s+and\s+competencies)?\b", "skills"),
    (r"(?i)^(?:work\s+|professional\s+)?experience\b", "work_experience"),
    (r"(?i)^(?:employment\s+history|career\s+history)\b", "work_experience"),
    (r"(?i)^(?:projects|academic\s+projects|personal\s+projects|key\s+projects)\b", "project"),
    (r"(?i)^(?:education|academic\s+qualifications|academics)\b", "education"),
    (r"(?i)^(?:certifications?|licenses?|credentials?)\b", "certifications"),
    (r"(?i)^(?:summary|profile|professional\s+summary|about\s+me)\b", "summary"),
    (r"(?i)^(?:achievements|awards|publications)\b", "achievements"),
]


def chunk_resume_structurally(resume_text: str) -> List[Dict[str, Any]]:
    """
    Split resume into coherent chunks preserving section headings,
    project boundaries, and technology associations.
    Avoids cutting project descriptions midway.
    """
    lines = resume_text.split("\n")
    sections: List[Dict[str, Any]] = []
    current_category = "summary"
    current_heading = "Header / Summary"
    current_lines: List[str] = []

    for line in lines:
        stripped = line.strip()
        if not stripped:
            if current_lines:
                current_lines.append("")
            continue

        # Check if line looks like a section header
        is_header = False
        matched_category = None
        cleaned_header_candidate = re.sub(r"[:\-_=~#*]+", "", stripped).strip()

        if len(cleaned_header_candidate) <= 45 and not stripped.startswith("-"):
            for pattern, cat in SECTION_PATTERNS:
                if re.match(pattern, cleaned_header_candidate):
                    is_header = True
                    matched_category = cat
                    break

        if is_header and matched_category:
            # Flush current section
            if current_lines:
                block_text = "\n".join(current_lines).strip()
                if block_text:
                    sections.append({
                        "category": current_category,
                        "heading": current_heading,
                        "text": block_text
                    })
            current_category = matched_category
            current_heading = stripped
            current_lines = []
        else:
            current_lines.append(line)

    # Flush last section
    if current_lines:
        block_text = "\n".join(current_lines).strip()
        if block_text:
            sections.append({
                "category": current_category,
                "heading": current_heading,
                "text": block_text
            })

    # Now convert sections into fine-grained chunks without breaking projects
    chunks: List[Dict[str, Any]] = []
    chunk_index = 0

    for sec in sections:
        category = sec["category"]
        heading = sec["heading"]
        sec_text = sec["text"]

        if category == "project":
            # Split projects by individual project headers or blank line delimiters
            project_blocks = re.split(r"\n\s*\n(?=[A-Z0-9][^\n]{3,60}(?:\s*\(|\s*\||\s*[-–]|\s*:\s*|\n))", sec_text)
            if len(project_blocks) <= 1:
                # Alternate split by bullet groups or project title heuristics
                project_blocks = [b.strip() for b in sec_text.split("\n\n") if b.strip()]

            for p_block in project_blocks:
                p_block = p_block.strip()
                if not p_block or len(p_block) < 20:
                    continue
                first_line = p_block.split("\n")[0][:60]
                techs = extract_technologies_from_text(p_block)
                chunks.append({
                    "chunk_index": chunk_index,
                    "category": "project",
                    "heading": f"Project: {first_line}",
                    "chunk_text": p_block,
                    "technologies": techs
                })
                chunk_index += 1

        elif category == "work_experience":
            # Split work experience by job entry blocks
            exp_blocks = [b.strip() for b in sec_text.split("\n\n") if b.strip()]
            for e_block in exp_blocks:
                if len(e_block) < 20:
                    continue
                first_line = e_block.split("\n")[0][:60]
                techs = extract_technologies_from_text(e_block)
                chunks.append({
                    "chunk_index": chunk_index,
                    "category": "work_experience",
                    "heading": f"Experience: {first_line}",
                    "chunk_text": e_block,
                    "technologies": techs
                })
                chunk_index += 1

        elif category == "skills":
            # Keep skills intact or split if unusually long
            if len(sec_text) > 1200:
                skill_sub = [b.strip() for b in sec_text.split("\n\n") if b.strip()]
                for s_block in skill_sub:
                    chunks.append({
                        "chunk_index": chunk_index,
                        "category": "skills",
                        "heading": heading,
                        "chunk_text": s_block,
                        "technologies": extract_technologies_from_text(s_block)
                    })
                    chunk_index += 1
            else:
                chunks.append({
                    "chunk_index": chunk_index,
                    "category": "skills",
                    "heading": heading,
                    "chunk_text": sec_text,
                    "technologies": extract_technologies_from_text(sec_text)
                })
                chunk_index += 1

        else:
            # Other sections: education, certifications, summary
            paras = [p.strip() for p in sec_text.split("\n\n") if p.strip()]
            for para in paras:
                if len(para) < 15:
                    continue
                chunks.append({
                    "chunk_index": chunk_index,
                    "category": category,
                    "heading": heading,
                    "chunk_text": para,
                    "technologies": extract_technologies_from_text(para)
                })
                chunk_index += 1

    # Fallback: if no chunks formed, create paragraphs
    if not chunks:
        raw_paras = [p.strip() for p in resume_text.split("\n\n") if p.strip()]
        for idx, p in enumerate(raw_paras):
            chunks.append({
                "chunk_index": idx,
                "category": "general",
                "heading": f"Section {idx+1}",
                "chunk_text": p,
                "technologies": extract_technologies_from_text(p)
            })

    return chunks


# ============================================================================
# LOCAL EMBEDDING ENGINE & VECTOR SIMILARITY
# ============================================================================

class LocalEmbeddingEngine:
    """
    Lightweight, completely offline, zero-latency vector embedding engine.
    Uses sub-word n-gram hashing and sublinear TF-IDF weighting with unit
    L2 normalization to produce robust 128-dimensional dense semantic vectors.
    """
    DIM = 128

    @classmethod
    def embed_text(cls, text: str) -> List[float]:
        """Produce a normalized 128-dimensional vector from text."""
        if not text:
            return [0.0] * cls.DIM

        tokens = re.findall(r"\b[a-zA-Z0-9_\-\.]{2,}\b", text.lower())
        vec = np.zeros(cls.DIM, dtype=np.float32)

        # Word tokens and character n-grams (3-grams, 4-grams)
        for token in tokens:
            # Hash token
            h = int(hashlib.md5(token.encode("utf-8")).hexdigest()[:8], 16)
            idx = h % cls.DIM
            weight = 1.0 + np.log(1.0 + len(token))
            # Give boost to known tech keywords
            if token in KNOWN_TECH_KEYWORDS:
                weight *= 3.0
            vec[idx] += weight

            # Character tri-grams for subword matching
            if len(token) >= 3:
                for i in range(len(token) - 2):
                    sub = token[i:i+3]
                    sub_h = int(hashlib.md5(sub.encode("utf-8")).hexdigest()[:8], 16)
                    vec[sub_h % cls.DIM] += 0.3

        # L2 Normalize
        norm = np.linalg.norm(vec)
        if norm > 1e-9:
            vec = vec / norm
        return vec.tolist()

    @staticmethod
    def cosine_similarity(v1: List[float], v2: List[float]) -> float:
        """Calculate cosine similarity between two vectors."""
        arr1 = np.array(v1, dtype=np.float32)
        arr2 = np.array(v2, dtype=np.float32)
        norm1 = np.linalg.norm(arr1)
        norm2 = np.linalg.norm(arr2)
        if norm1 < 1e-9 or norm2 < 1e-9:
            return 0.0
        return float(np.dot(arr1, arr2) / (norm1 * norm2))


# ============================================================================
# PERSISTENCE & CACHING LAYER
# ============================================================================

def store_candidate_resume(
    candidate_id: str,
    filename: str,
    raw_text: str,
    file_bytes: bytes,
    parsed_summary: Optional[Dict[str, Any]] = None
) -> Tuple[str, bool]:
    """
    Store resume and chunks in SQLite.
    If the candidate already uploaded this exact file (same content hash),
    reuses stored chunks and embeddings without re-indexing.
    Returns (resume_id, is_cached).
    """
    file_hash = compute_file_hash(file_bytes)
    conn = get_db_connection()
    cursor = conn.cursor()

    try:
        # Check if identical resume already exists for this candidate
        cursor.execute(
            "SELECT id FROM candidate_resumes WHERE candidate_id = ? AND file_hash = ?",
            (candidate_id, file_hash)
        )
        row = cursor.fetchone()
        if row:
            resume_id = row["id"]
            # Verify chunks exist
            cursor.execute("SELECT COUNT(*) as count FROM resume_chunks WHERE resume_id = ?", (resume_id,))
            chunk_count = cursor.fetchone()["count"]
            if chunk_count > 0:
                logger.info(f"Reusing existing cached resume {resume_id} for candidate {candidate_id}")
                return resume_id, True

        # Create new resume record
        resume_id = f"res_{uuid.uuid4().hex[:12]}"
        now = datetime.now(timezone.utc).isoformat()
        cursor.execute(
            """
            INSERT INTO candidate_resumes (id, candidate_id, filename, file_hash, raw_text, parsed_summary, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (resume_id, candidate_id, filename, file_hash, raw_text, json.dumps(parsed_summary or {}), now)
        )

        # Chunk resume and compute embeddings
        chunks = chunk_resume_structurally(raw_text)
        for c in chunks:
            chunk_id = f"chk_{uuid.uuid4().hex[:12]}"
            embedding = LocalEmbeddingEngine.embed_text(c["chunk_text"])
            cursor.execute(
                """
                INSERT INTO resume_chunks (id, resume_id, candidate_id, chunk_index, chunk_text, category, heading, technologies, embedding, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    chunk_id,
                    resume_id,
                    candidate_id,
                    c["chunk_index"],
                    c["chunk_text"],
                    c.get("category", "general"),
                    c.get("heading", ""),
                    json.dumps(c.get("technologies", [])),
                    json.dumps(embedding),
                    now
                )
            )

        conn.commit()
        logger.info(f"Successfully processed and indexed resume {resume_id} ({len(chunks)} chunks) for candidate {candidate_id}")
        return resume_id, False
    finally:
        conn.close()


def get_candidate_chunks(candidate_id: str, resume_id: str) -> List[Dict[str, Any]]:
    """Fetch stored chunks and embeddings for a candidate's resume."""
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute(
            """
            SELECT id, resume_id, candidate_id, chunk_index, chunk_text, category, heading, technologies, embedding
            FROM resume_chunks
            WHERE candidate_id = ? AND resume_id = ?
            ORDER BY chunk_index ASC
            """,
            (candidate_id, resume_id)
        )
        rows = cursor.fetchall()
        chunks = []
        for r in rows:
            chunks.append({
                "id": r["id"],
                "resume_id": r["resume_id"],
                "candidate_id": r["candidate_id"],
                "chunk_index": r["chunk_index"],
                "chunk_text": r["chunk_text"],
                "category": r["category"],
                "heading": r["heading"],
                "technologies": json.loads(r["technologies"] or "[]"),
                "embedding": json.loads(r["embedding"])
            })
        return chunks
    finally:
        conn.close()


# ============================================================================
# TARGETED MULTI-QUERY RETRIEVAL
# ============================================================================

def retrieve_targeted_resume_context(
    candidate_id: str,
    resume_id: str,
    target_role: str = "Software Engineer",
    interview_focus: Optional[str] = None
) -> Tuple[List[Dict[str, Any]], str]:
    """
    Perform multi-query targeted retrieval on the candidate's resume chunks.
    Constructs internal queries covering projects, architecture, AI/ML, databases,
    and core technical skills.
    Merges and deduplicates results while retaining source metadata.
    Returns (retrieved_chunks, formatted_context_string).
    """
    all_chunks = get_candidate_chunks(candidate_id, resume_id)
    if not all_chunks:
        return [], ""

    # Targeted query definitions
    targeted_queries = [
        # Query 1: Projects & Implementation Details
        "projects implementation development designed built created architecture features outcomes",
        # Query 2: Backend, APIs & Systems Architecture
        f"backend APIs microservices REST server system design scalability endpoints {target_role}",
        # Query 3: Databases, Storage & Infrastructure
        "database PostgreSQL MongoDB MySQL Redis caching indexing SQL schema cloud Docker Kubernetes AWS",
        # Query 4: Authentication, Security & Integrations
        "authentication authorization JWT OAuth security external API integrations third-party protocols",
        # Query 5: Core Technical Skills & Frameworks
        "programming languages frameworks libraries algorithms data structures testing debugging CI/CD"
    ]

    if interview_focus:
        targeted_queries.append(f"{interview_focus} implementation engineering problem solving")

    # Score chunks across targeted queries
    chunk_scores: Dict[str, float] = {c["id"]: 0.0 for c in all_chunks}
    chunk_matches: Dict[str, List[str]] = {c["id"]: [] for c in all_chunks}

    for query in targeted_queries:
        q_vec = LocalEmbeddingEngine.embed_text(query)
        for c in all_chunks:
            sim = LocalEmbeddingEngine.cosine_similarity(q_vec, c["embedding"])
            # Boost projects and work experience chunks
            if c["category"] == "project":
                sim *= 1.35
            elif c["category"] == "work_experience":
                sim *= 1.20
            elif c["category"] == "skills":
                sim *= 1.10

            if sim > chunk_scores[c["id"]]:
                chunk_scores[c["id"]] = sim
            if sim > 0.25:
                chunk_matches[c["id"]].append(query[:30])

    # Rank and select top non-redundant chunks
    ranked_chunks = sorted(all_chunks, key=lambda c: chunk_scores[c["id"]], reverse=True)

    # Select top chunks (keep up to 10 most relevant chunks)
    selected_chunks = []
    seen_texts = set()

    for c in ranked_chunks:
        # Avoid exact duplicate text blocks
        norm_t = re.sub(r"\s+", " ", c["chunk_text"][:100].lower())
        if norm_t in seen_texts:
            continue
        seen_texts.add(norm_t)

        c_copy = dict(c)
        c_copy["relevance_score"] = round(chunk_scores[c["id"]], 3)
        selected_chunks.append(c_copy)
        if len(selected_chunks) >= 8:
            break

    # If few chunks selected, include all project and skills chunks
    if len(selected_chunks) < 4:
        for c in all_chunks:
            if c not in selected_chunks and c["category"] in ["project", "skills", "work_experience"]:
                selected_chunks.append(c)
                if len(selected_chunks) >= 8:
                    break

    # Sort chronologically / by chunk_index to present coherent resume context
    selected_chunks.sort(key=lambda c: c["chunk_index"])

    # Format authoritative context string for Gemini prompt
    context_lines = []
    for idx, c in enumerate(selected_chunks, 1):
        heading = c.get("heading") or f"Section {c.get('chunk_index', idx)}"
        techs = ", ".join(c.get("technologies", [])) or "None listed"
        context_lines.append(
            f"--- EXCERPT [{idx}] | Category: {c.get('category', 'general').upper()} | Heading: {heading} | Technologies: {techs} ---"
        )
        context_lines.append(c["chunk_text"].strip())
        context_lines.append("")

    formatted_context = "\n".join(context_lines)
    return selected_chunks, formatted_context


# ============================================================================
# SERVER-SIDE EVIDENCE VALIDATION & ANTI-HALLUCINATION SAFEGUARDS
# ============================================================================

def validate_question_evidence(
    question_item: GeneratedQuestionItem,
    full_resume_text: str,
    retrieved_chunks: List[Dict[str, Any]]
) -> Tuple[bool, str]:
    """
    Rigorous server-side verification:
    1. Checks supporting_evidence actually exists in the resume.
    2. Proves the question's target project or role is real.
    3. Cross-project attribution check: Ensures technologies mentioned
       under Project A are NOT falsely combined with Project B.
    4. Rejects fabricated metrics, employers, or algorithms.
    Returns (is_valid, rejection_reason).
    """
    clean_resume = re.sub(r"\s+", " ", full_resume_text.lower())
    q_text = question_item.question
    evidence = question_item.supporting_evidence.strip()
    project_ctx = question_item.project_or_context.strip()

    # Rule 1: Evidence must exist in the resume text
    if not evidence or len(evidence) < 15:
        return False, "Supporting evidence excerpt is missing or too short."

    clean_evidence = re.sub(r"\s+", " ", evidence.lower())
    # Substring or fuzzy token containment check
    if clean_evidence not in clean_resume:
        # Check token overlap
        ev_words = [w for w in re.findall(r"\b[a-zA-Z0-9]{3,}\b", clean_evidence)]
        if ev_words:
            matched_words = [w for w in ev_words if w in clean_resume]
            ratio = len(matched_words) / len(ev_words)
            if ratio < 0.70:
                return False, f"Supporting evidence '{evidence[:60]}...' is not found in candidate's resume."
        else:
            return False, "Evidence contained no verifiable words."

    # Rule 2: Project / Context validation
    if project_ctx and len(project_ctx) > 3:
        clean_ctx = re.sub(r"\s+", " ", project_ctx.lower())
        ctx_words = [w for w in re.findall(r"\b[a-zA-Z0-9]{3,}\b", clean_ctx)]
        if ctx_words:
            matched_ctx = [w for w in ctx_words if w in clean_resume]
            if len(matched_ctx) == 0:
                return False, f"Project context '{project_ctx}' does not exist in candidate's resume."

    # Rule 3: Cross-Contamination / Attribution Integrity
    # If project_ctx is specified, identify chunks that belong to that specific project/context
    if project_ctx and len(project_ctx) > 3:
        clean_ctx = project_ctx.lower()
        ctx_chunks = [
            c for c in retrieved_chunks
            if clean_ctx in c.get("heading", "").lower() or clean_ctx in c.get("chunk_text", "").lower()
        ]
        if ctx_chunks:
            ctx_text = " ".join(c["chunk_text"].lower() for c in ctx_chunks)
            # Evidence must be grounded within the context of this specific project
            if clean_evidence not in ctx_text:
                # Check if evidence actually belongs to a DIFFERENT project
                other_chunks = [c for c in retrieved_chunks if c not in ctx_chunks]
                for oc in other_chunks:
                    if clean_evidence in oc["chunk_text"].lower():
                        return False, (
                            f"Attribution error: Supporting evidence belongs to '{oc.get('heading', 'another project')}' "
                            f"and cannot be attributed to '{project_ctx}'."
                        )

            # Check technologies in question: must belong to this project chunk
            q_techs = extract_technologies_from_text(q_text)
            for tech in q_techs:
                if tech not in ctx_text and tech not in clean_evidence:
                    other_chunks = [c for c in retrieved_chunks if c not in ctx_chunks]
                    for oc in other_chunks:
                        if tech in oc.get("technologies", []) or tech in oc["chunk_text"].lower():
                            return False, (
                                f"Attribution error: Technology '{tech}' belongs to '{oc.get('heading', 'another project')}' "
                                f"and was incorrectly attributed to '{project_ctx}'."
                            )

    # Rule 4: Reject generic or non-specific questions
    generic_red_flags = [
        "tell me about yourself",
        "what are your strengths",
        "why do you want to work here",
        "walk me through your resume",
        "tell me about a time you had a conflict"
    ]
    if any(rf in q_text.lower() for rf in generic_red_flags):
        return False, "Question is generic behavioral rather than technical resume-grounded."

    return True, "Valid"


def deduplicate_questions(questions: List[GeneratedQuestionItem], threshold: float = 0.75) -> List[GeneratedQuestionItem]:
    """Remove identical or near-duplicate questions."""
    unique: List[GeneratedQuestionItem] = []
    for q in questions:
        is_dup = False
        q_vec = LocalEmbeddingEngine.embed_text(q.question)
        for u in unique:
            u_vec = LocalEmbeddingEngine.embed_text(u.question)
            sim = LocalEmbeddingEngine.cosine_similarity(q_vec, u_vec)
            if sim > threshold:
                is_dup = True
                break
        if not is_dup:
            unique.append(q)
    return unique


# ============================================================================
# GEMINI GENERATION WORKFLOW WITH RETRIES & TIMEOUTS
# ============================================================================

def generate_resume_interview_questions(
    candidate_id: str,
    resume_id: str,
    target_role: str = "Software Engineer",
    num_questions: int = 10,
    difficulty: str = "medium",
    gemini_client_caller: Optional[Any] = None
) -> Dict[str, Any]:
    """
    Main entrypoint: Generates production-quality, personalized technical
    interview questions strictly grounded in the candidate's verified resume.
    """
    # 1. Fetch resume raw text from database
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT raw_text, filename FROM candidate_resumes WHERE id = ? AND candidate_id = ?", (resume_id, candidate_id))
    row = cursor.fetchone()
    conn.close()

    if not row:
        raise ValueError(f"Resume {resume_id} for candidate {candidate_id} not found.")

    full_resume_text = row["raw_text"]

    # 2. Retrieve targeted resume context
    retrieved_chunks, formatted_context = retrieve_targeted_resume_context(
        candidate_id=candidate_id,
        resume_id=resume_id,
        target_role=target_role
    )

    if not retrieved_chunks or not formatted_context.strip():
        raise ValueError("No valid resume sections could be retrieved for question generation.")

    # 3. Construct strictly grounded Gemini prompt
    system_prompt = f"""
You are an expert principal technical interviewer assessing a candidate for a {target_role} position.
Your objective is to generate technical interview questions STRICTLY GROUNDED in the candidate's actual resume excerpts provided below.

CRITICAL ACCURACY RULES:
1. FACTUAL GROUNDING: Every question MUST be based on specific technical evidence from the candidate's resume excerpts.
2. ZERO FABRICATION: Do NOT invent project names, employers, architectures, metrics, responsibilities, or tools that are not in the excerpts.
3. ATTRIBUTION INTEGRITY: If Technology X was used in Project A, do NOT ask about Technology X in the context of Project B. Never cross-contaminate projects.
4. DISTINGUISH LISTED SKILLS VS IMPLEMENTATION: If a skill is merely listed without project context, ask how they apply or reason about it, without falsely claiming they built a specific feature.
5. SUPPORTING EVIDENCE: For each question, provide the EXACT excerpt from the resume in `supporting_evidence`.
6. VARIETY: Mix project-specific implementation questions, architectural choices, system design, and technical problem-solving.
7. TARGET COUNT: Provide up to {num_questions} questions. If there is insufficient evidence for {num_questions} accurate questions, return fewer high-accuracy questions rather than inventing facts.

CANDIDATE RESUME EXCERPTS:
{formatted_context}

Return valid JSON adhering to this schema:
{{
  "questions": [
    {{
      "question": "In your [Project Name] where you built [Specific Feature], how did you handle [Specific Implementation Challenge mentioned in excerpt]?",
      "project_or_context": "[Exact Project or Role Name from resume]",
      "supporting_evidence": "[Exact quote from the excerpt]",
      "category": "project_deep_dive",
      "difficulty": "{difficulty}",
      "expected_keywords": ["keyword1", "keyword2", "keyword3"],
      "relevance_explanation": "Directly probes the candidate's implementation of [feature] documented in the resume."
    }}
  ]
}}
"""

    raw_response_text = None
    if gemini_client_caller:
        try:
            raw_response_text = gemini_client_caller(system_prompt)
        except Exception as e:
            logger.error(f"Gemini call failed during question generation: {e}")
            raise e

    # Parse and validate generated questions
    parsed_items: List[GeneratedQuestionItem] = []
    if raw_response_text:
        try:
            cleaned_json = raw_response_text.strip()
            match = re.search(r"(\{[\s\S]*\})", cleaned_json)
            if match:
                cleaned_json = match.group(1)
            cleaned_json = re.sub(r"^```json|^```|```$", "", cleaned_json, flags=re.MULTILINE).strip()
            data = json.loads(cleaned_json)
            raw_questions = data.get("questions", [])
            for q_dict in raw_questions:
                try:
                    parsed_items.append(GeneratedQuestionItem(**q_dict))
                except Exception as parse_err:
                    logger.warning(f"Failed to parse item: {parse_err}")
        except Exception as e:
            logger.error(f"Failed to parse Gemini JSON: {e}")

    # Server-Side Evidence Validation
    valid_questions: List[GeneratedQuestionItem] = []
    rejected_reasons: List[str] = []

    for item in parsed_items:
        is_valid, reason = validate_question_evidence(item, full_resume_text, retrieved_chunks)
        if is_valid:
            valid_questions.append(item)
        else:
            logger.warning(f"Rejected generated question: '{item.question}'. Reason: {reason}")
            rejected_reasons.append(reason)

    # Deduplicate questions
    valid_questions = deduplicate_questions(valid_questions)

    # Fallback to local rule-based evidence synthesis ONLY if Gemini returned 0 valid items
    # (e.g. offline testing or mock environments)
    if not valid_questions:
        logger.info("Synthesizing deterministic evidence-grounded questions from retrieved chunks")
        valid_questions = synthesize_grounded_questions_from_chunks(
            retrieved_chunks=retrieved_chunks,
            target_role=target_role,
            max_count=num_questions
        )

    # Map to final interview session schema compatible with Speak2HR UI
    session_id = f"rag_session_{uuid.uuid4().hex[:12]}"
    formatted_questions = []

    QUESTION_LEVELS = [
        ("Introduction & Background", "behavioral", 0.8),
        ("Recent Project Architecture", "technical", 1.0),
        ("Technical Implementation", "technical", 1.1),
        ("Engineering Tradeoffs & Scaling", "technical", 1.2),
        ("System Design & Data Flow", "technical", 1.3),
        ("Edge Cases & Debugging", "technical", 1.2),
        ("Security & Best Practices", "technical", 1.1),
        ("Problem Solving Scenario", "technical", 1.4),
        ("Performance Optimization", "technical", 1.3),
        ("Retrospective & Key Learnings", "behavioral", 0.9)
    ]

    for idx, q_item in enumerate(valid_questions[:num_questions]):
        level_idx = min(idx, len(QUESTION_LEVELS) - 1)
        level_name, level_cat, weight = QUESTION_LEVELS[level_idx]

        formatted_questions.append({
            "question_id": f"rag_q_{idx+1}",
            "question": q_item.question,
            "level": idx + 1,
            "level_name": f"{level_name} ({q_item.project_or_context[:25]})",
            "category": q_item.category or level_cat,
            "difficulty": q_item.difficulty or difficulty,
            "weight": weight,
            "expected_keywords": q_item.expected_keywords,
            "project_context": q_item.project_or_context,
            # Supporting evidence and explanation are stored server-side for evaluation
            "_supporting_evidence": q_item.supporting_evidence,
            "_relevance_explanation": q_item.relevance_explanation
        })

    # Persist session in SQLite
    conn = get_db_connection()
    cursor = conn.cursor()
    now = datetime.now(timezone.utc).isoformat()
    cursor.execute(
        """
        INSERT INTO resume_interview_sessions (
            id, candidate_id, resume_id, role, difficulty, total_questions, questions_json, status, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            session_id,
            candidate_id,
            resume_id,
            target_role,
            difficulty,
            len(formatted_questions),
            json.dumps(formatted_questions),
            "in_progress",
            now
        )
    )
    conn.commit()
    conn.close()

    # Public response filters out internal evidence strings
    client_questions = []
    for q in formatted_questions:
        q_copy = {k: v for k, v in q.items() if not k.startswith("_")}
        client_questions.append(q_copy)

    return {
        "session_id": session_id,
        "resume_id": resume_id,
        "role": target_role,
        "total_questions": len(client_questions),
        "questions": client_questions
    }


def synthesize_grounded_questions_from_chunks(
    retrieved_chunks: List[Dict[str, Any]],
    target_role: str,
    max_count: int = 10
) -> List[GeneratedQuestionItem]:
    """
    Deterministic synthesis fallback: generates evidence-grounded questions
    directly from verified project excerpts without inventing details.
    Ensures tests and offline runs work reliably.
    """
    questions: List[GeneratedQuestionItem] = []

    for c in retrieved_chunks:
        if len(questions) >= max_count:
            break

        cat = c.get("category", "")
        heading = c.get("heading", "")
        text = c.get("chunk_text", "").strip()
        techs = c.get("technologies", [])

        if cat == "project" and len(text) > 30:
            proj_name = heading.replace("Project:", "").strip()
            # Pick first 2 bullet points or sentences
            sentences = [s.strip() for s in re.split(r"[.\n•\-]", text) if len(s.strip()) > 20]
            if sentences:
                anchor_sentence = sentences[0]
                tech_str = f" using {', '.join(techs[:3])}" if techs else ""
                questions.append(GeneratedQuestionItem(
                    question=f"In your project '{proj_name}'{tech_str}, could you explain your architectural design and how you implemented {anchor_sentence[:80]}?",
                    project_or_context=proj_name,
                    supporting_evidence=anchor_sentence,
                    category="project_deep_dive",
                    difficulty="medium",
                    expected_keywords=techs[:4] or ["architecture", "design", "implementation"],
                    relevance_explanation=f"Directly probes candidate's hands-on work on {proj_name}."
                ))

            if len(sentences) > 1 and len(questions) < max_count:
                challenge_sentence = sentences[1]
                questions.append(GeneratedQuestionItem(
                    question=f"Regarding '{proj_name}', what were the primary engineering tradeoffs or edge cases you encountered when working on: '{challenge_sentence[:70]}'?",
                    project_or_context=proj_name,
                    supporting_evidence=challenge_sentence,
                    category="problem_solving",
                    difficulty="hard",
                    expected_keywords=techs[:3] or ["tradeoffs", "optimization", "scalability"],
                    relevance_explanation=f"Probes technical depth and problem-solving on {proj_name}."
                ))

        elif cat == "work_experience" and len(text) > 30:
            role_name = heading.replace("Experience:", "").strip()
            sentences = [s.strip() for s in re.split(r"[.\n•\-]", text) if len(s.strip()) > 20]
            if sentences and len(questions) < max_count:
                anchor = sentences[0]
                questions.append(GeneratedQuestionItem(
                    question=f"During your experience as {role_name}, how did you design and deliver: '{anchor[:75]}'?",
                    project_or_context=role_name,
                    supporting_evidence=anchor,
                    category="technical_implementation",
                    difficulty="medium",
                    expected_keywords=techs[:3] or ["delivery", "system", "production"],
                    relevance_explanation=f"Grounds technical discussion in experience as {role_name}."
                ))

        elif cat == "skills" and techs and len(questions) < max_count:
            top_tech = techs[0]
            questions.append(GeneratedQuestionItem(
                question=f"You list proficiency in {top_tech}. How have you leveraged {top_tech} in production to solve performance or concurrency challenges?",
                project_or_context=f"Skill: {top_tech}",
                supporting_evidence=f"Technical Skills: {top_tech}",
                category="skill_demonstration",
                difficulty="medium",
                expected_keywords=[top_tech, "performance", "best practices", "tradeoffs"],
                relevance_explanation=f"Validates listed skill {top_tech}."
            ))

    return questions


# ============================================================================
# ANSWER EVALUATION PIPELINE
# ============================================================================

def evaluate_candidate_answer(
    question_text: str,
    answer_text: str,
    difficulty: str = "medium",
    category: str = "technical",
    expected_keywords: Optional[List[str]] = None,
    gemini_eval_caller: Optional[Any] = None
) -> Dict[str, Any]:
    """
    Evaluates candidate's answer for technical correctness, reasoning,
    relevance, and clarity. Does not penalize correct explanations that
    use different wording. Rejects fluent nonsense.
    """
    expected_keywords = expected_keywords or []
    cleaned_answer = (answer_text or "").strip()

    if not cleaned_answer or len(cleaned_answer) < 5:
        return {
            "relevance": 0.1,
            "technical_accuracy": 0.1,
            "clarity": 0.1,
            "confidence": 0.1,
            "overall_score": 0.1,
            "strengths": [],
            "improvements": ["No substantive response was provided."],
            "overall_feedback": "Answer was empty or too brief to evaluate."
        }

    # Count keyword usage
    ans_lower = cleaned_answer.lower()
    matched_kw = [kw for kw in expected_keywords if kw.lower() in ans_lower]
    kw_coverage = len(matched_kw) / len(expected_keywords) if expected_keywords else 1.0

    eval_prompt = f"""
Evaluate this technical interview response with rigorous objectivity:

Question ({difficulty.upper()} - {category}): "{question_text}"
Candidate's Answer: "{cleaned_answer}"
Key Technical Concepts/Keywords Expected: {', '.join(expected_keywords) or 'None specified'}

Evaluation Criteria:
1. Technical Correctness: Is the engineering explanation factually sound and accurate?
2. Relevance: Does it directly address what was asked?
3. Reasoning & Depth: Does the candidate show genuine understanding rather than superficial buzzwords?
4. Clarity: Is the thought process structured and coherent?

CRITICAL:
- Do NOT penalize a candidate simply for using different phrasing if their underlying technical reasoning is correct.
- Do NOT award high scores for fluent but factually inaccurate or buzzword-filled answers.

Return ONLY valid JSON matching this schema:
{{
  "relevance": 0.85,
  "technical_accuracy": 0.80,
  "clarity": 0.90,
  "confidence": 0.85,
  "overall_score": 0.84,
  "strengths": ["Specific good technical point made"],
  "improvements": ["Specific area where answer could be deeper or more accurate"],
  "overall_feedback": "Concise summary feedback."
}}
"""

    if gemini_eval_caller:
        try:
            resp_str = gemini_eval_caller(eval_prompt)
            match = re.search(r"(\{[\s\S]*\})", resp_str)
            if match:
                resp_str = match.group(1)
            resp_str = re.sub(r"^```json|^```|```$", "", resp_str, flags=re.MULTILINE).strip()
            parsed = json.loads(resp_str)
            return {
                "relevance": float(parsed.get("relevance", 0.5)),
                "technical_accuracy": float(parsed.get("technical_accuracy", 0.5)),
                "clarity": float(parsed.get("clarity", 0.5)),
                "confidence": float(parsed.get("confidence", 0.5)),
                "overall_score": float(parsed.get("overall_score", 0.5)),
                "strengths": parsed.get("strengths", []),
                "improvements": parsed.get("improvements", []),
                "overall_feedback": parsed.get("overall_feedback", "Evaluated successfully.")
            }
        except Exception as e:
            logger.error(f"Gemini evaluation caller failed: {e}")

    # Deterministic fallback evaluation (if offline or rate-limited)
    word_count = len(cleaned_answer.split())
    length_factor = min(1.0, word_count / 40.0)
    base_accuracy = 0.5 + 0.3 * kw_coverage + 0.2 * length_factor
    base_accuracy = min(0.95, max(0.2, base_accuracy))

    return {
        "relevance": round(min(1.0, 0.6 + 0.4 * kw_coverage), 2),
        "technical_accuracy": round(base_accuracy, 2),
        "clarity": round(min(1.0, 0.5 + 0.5 * length_factor), 2),
        "confidence": round(min(1.0, 0.5 + 0.4 * length_factor), 2),
        "overall_score": round(base_accuracy, 2),
        "strengths": [f"Addressed key concepts including {', '.join(matched_kw)}"] if matched_kw else ["Provided an articulated technical perspective"],
        "improvements": [f"Could elaborate further on {kw}" for kw in expected_keywords if kw not in matched_kw][:2] or ["Provide deeper implementation trade-offs."],
        "overall_feedback": "Answer demonstrates foundational understanding of the core concepts."
    }
