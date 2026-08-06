import os
import re
import json
import random
import logging
import asyncio
import time
from datetime import datetime, timezone
from pathlib import Path

# Setup logging
logger = logging.getLogger(__name__)

# Base folder for question bank
QUESTION_BANK_DIR = Path("question_bank")

# Supported roles mapping from frontend string to folder name
ROLE_FOLDER_MAP = {
    "Frontend Developer": "frontend_developer",
    "Backend Developer": "backend_developer",
    "Full Stack Developer": "full_stack_developer",
    "Java Developer": "java_developer",
    "Python Developer": "python_developer",
    "AI/ML Engineer": "ai_ml_engineer",
    "Data Scientist": "data_scientist",
    "Data Analyst": "data_analyst",
    "DevOps Engineer": "devops_engineer",
    "Cybersecurity Analyst": "cybersecurity_analyst",
    "UI/UX Designer": "uiux_designer",
    "Software Engineer": "software_engineer",
    "Product Manager": "product_manager",
    "HR Specialist": "hr_specialist"
}

# In-memory cache for role questions and metadata
QUESTION_BANK_CACHE = {}
METADATA_CACHE = {}
_FILE_MOD_TIMES = {}

# Curriculum blueprint specifying the exact number of questions to generate for every topic/difficulty
ROLE_BLUEPRINT = {
    "frontend_developer": {
        "easy": {"HTML": 15, "CSS": 15, "JavaScript": 15, "Responsive Design": 15},
        "medium": {"React": 20, "State Management": 15, "REST APIs": 15, "Routing": 10, "Performance": 10},
        "hard": {"System Design": 10, "Security": 10, "Optimization": 10, "Architecture": 10}
    },
    "backend_developer": {
        "easy": {"Databases": 15, "REST APIs": 15, "Git": 15, "Linux Basics": 15},
        "medium": {"Node.js": 20, "SQL/NoSQL Databases": 15, "Caching": 15, "Authentication": 20},
        "hard": {"Microservices": 10, "Message Queues": 10, "System Design": 10, "Concurrency": 10}
    },
    "full_stack_developer": {
        "easy": {"Frontend Basics": 15, "Web Protocols": 15, "Basic Database CRUD": 15, "Version Control": 15},
        "medium": {"Frontend Framework Integration": 20, "API Integration": 15, "Middleware": 15, "User Authorization": 20},
        "hard": {"End-to-End Architecture": 10, "CI/CD": 10, "Serverless": 10, "Complex Databases": 10}
    },
    "java_developer": {
        "easy": {"OOP": 20, "Collections": 20, "Exception Handling": 20},
        "medium": {"Multithreading": 25, "JDBC": 20, "Spring Boot": 25},
        "hard": {"JVM": 15, "Performance": 15, "Distributed Systems": 10}
    },
    "python_developer": {
        "easy": {"Basic Syntax": 20, "Data Structures": 20, "Functions": 20},
        "medium": {"Advanced Python": 25, "Web Frameworks (Django/Flask)": 20, "Async IO": 25},
        "hard": {"Large Scale Systems": 15, "Performance Optimization": 15, "Metaprogramming": 10}
    },
    "ai_ml_engineer": {
        "easy": {"Python Programming": 20, "Linear Algebra": 20, "Basic Datasets": 20},
        "medium": {"Scikit-Learn": 25, "Deep Learning Frameworks (PyTorch/TensorFlow)": 25, "Computer Vision": 20},
        "hard": {"Fine-Tuning LLMs": 15, "Reinforcement Learning": 15, "Custom Optimizations": 10}
    },
    "data_scientist": {
        "easy": {"Python": 15, "NumPy": 15, "Pandas": 15, "Statistics": 15},
        "medium": {"Machine Learning": 20, "SQL": 15, "Data Cleaning": 15, "Feature Engineering": 20},
        "hard": {"Deep Learning": 10, "NLP": 10, "MLOps": 10, "Distributed Training": 10}
    },
    "data_analyst": {
        "easy": {"Excel": 20, "Data Visualization Basics": 20, "Basic SQL": 20},
        "medium": {"Python (Pandas)": 25, "Tableau/PowerBI": 20, "Advanced SQL": 25},
        "hard": {"A/B Testing": 15, "Predictive Analytics": 15, "ETL Pipelines": 10}
    },
    "devops_engineer": {
        "easy": {"Linux Command Line": 20, "Git": 20, "Networking": 20},
        "medium": {"Docker": 25, "CI/CD Pipelines": 20, "Terraform": 25},
        "hard": {"Kubernetes": 15, "Advanced Network Security": 15, "Multi-Cloud Orchestration": 10}
    },
    "cybersecurity_analyst": {
        "easy": {"Networking Protocols": 20, "OS Security": 20, "Common Threats": 20},
        "medium": {"Firewalls": 25, "Penetration Testing": 20, "Incident Response": 25},
        "hard": {"Threat Hunting": 15, "Reverse Engineering": 15, "Zero Trust": 10}
    },
    "uiux_designer": {
        "easy": {"Design Principles": 20, "Typography": 20, "Color Theory": 20},
        "medium": {"Figma/Sketch": 25, "User Research": 20, "Usability Testing": 25},
        "hard": {"Design Systems": 15, "User Journey Mapping": 15, "Accessibility Standards": 10}
    },
    "software_engineer": {
        "easy": {"Algorithms": 20, "Basic Data Structures": 20, "OOP": 20},
        "medium": {"Database Management": 25, "Testing": 20, "API Design": 25},
        "hard": {"Distributed Consensus": 15, "Performance Profiling": 15, "High-Availability": 10}
    },
    "product_manager": {
        "easy": {"Agile Fundamentals": 20, "User Stories": 20, "Market Research": 20},
        "medium": {"Roadmap Planning": 25, "Prioritization": 20, "Analytics": 25},
        "hard": {"Product Strategy": 15, "Stakeholder Management": 15, "Pricing Models": 10}
    },
    "hr_specialist": {
        "easy": {"Communication": 20, "Recruitment Cycle": 20, "Policy Basics": 20},
        "medium": {"Conflict Resolution": 25, "Candidate Sourcing": 20, "Interviewing Techniques": 25},
        "hard": {"HR Analytics": 15, "Labor Law Compliance": 15, "Organizational Design": 10}
    }
}

# --- FILE CONNECTIVITY & MEMORY CACHING ---

def get_questions_filepath(role_folder):
    """Locate questions.json path for a given role"""
    return QUESTION_BANK_DIR / role_folder / "questions.json"

def get_metadata_filepath(role_folder):
    """Locate metadata.json path for a given role"""
    return QUESTION_BANK_DIR / role_folder / "metadata.json"

def load_role_question_bank(role_folder):
    """Load role questions into memory, caching them, only reloading if the file changed on disk"""
    global QUESTION_BANK_CACHE, _FILE_MOD_TIMES
    filepath = get_questions_filepath(role_folder)
    
    if not filepath.exists():
        return {"role": role_folder, "easy": {}, "medium": {}, "hard": {}}
        
    try:
        mod_time = os.path.getmtime(filepath)
        if role_folder not in QUESTION_BANK_CACHE or _FILE_MOD_TIMES.get(role_folder) != mod_time:
            with open(filepath, "r", encoding="utf-8") as f:
                QUESTION_BANK_CACHE[role_folder] = json.load(f)
            _FILE_MOD_TIMES[role_folder] = mod_time
            logger.info(f"Loaded and cached questions for role: {role_folder}")
        return QUESTION_BANK_CACHE[role_folder]
    except Exception as e:
        logger.error(f"Failed to load question bank for {role_folder}: {e}")
        # Return empty shell if corrupted
        return {"role": role_folder, "easy": {}, "medium": {}, "hard": {}}

def load_role_metadata(role_folder):
    """Load role metadata into memory"""
    global METADATA_CACHE
    filepath = get_metadata_filepath(role_folder)
    
    if not filepath.exists():
        return None
        
    try:
        with open(filepath, "r", encoding="utf-8") as f:
            METADATA_CACHE[role_folder] = json.load(f)
        return METADATA_CACHE[role_folder]
    except Exception as e:
        logger.error(f"Failed to load metadata for {role_folder}: {e}")
        return None

def write_role_question_bank(role_folder, data, metadata):
    """Persist both the questions.json and metadata.json to disk"""
    folder_path = QUESTION_BANK_DIR / role_folder
    os.makedirs(folder_path, exist_ok=True)
    
    q_file = get_questions_filepath(role_folder)
    m_file = get_metadata_filepath(role_folder)
    
    with open(q_file, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
        
    with open(m_file, "w", encoding="utf-8") as f:
        json.dump(metadata, f, indent=2, ensure_ascii=False)
        
    # Update cache and mod time immediately
    QUESTION_BANK_CACHE[role_folder] = data
    METADATA_CACHE[role_folder] = metadata
    _FILE_MOD_TIMES[role_folder] = os.path.getmtime(q_file)
    logger.info(f"Persisted questions and metadata for role {role_folder}")

# --- VALIDATION ENGINE ---

def get_flat_question_list(bank_data):
    """Extract a flat list of all question texts currently stored for the role"""
    flat = []
    for diff in ["easy", "medium", "hard"]:
        diff_dict = bank_data.get(diff, {})
        for topic, q_list in diff_dict.items():
            for q in q_list:
                q_text = q.get("question", "").strip()
                if q_text:
                    flat.append(q_text)
    return flat

def has_duplicate_meaning(new_q, existing_qs):
    new_words = set(re.findall(r"\w+", new_q.lower()))
    for eq in existing_qs:
        eq_words = set(re.findall(r"\w+", eq.lower()))
        if not new_words or not eq_words:
            continue
        intersection = len(new_words.intersection(eq_words))
        union = len(new_words.union(eq_words))
        if intersection / union > 0.70:
            return True
    return False

def is_wrong_domain(role_folder, question_text):
    """Enforce technology boundary logic to prevent domain mixing"""
    non_web_roles = [r for r in ROLE_FOLDER_MAP.values() if r not in ("frontend_developer", "full_stack_developer", "uiux_designer")]
    if role_folder in non_web_roles:
        web_keywords = {"html", "css", "react", "tailwind", "bootstrap", "flexbox", "redux", "webpack", "npm start"}
        words = set(re.findall(r"\w+", question_text.lower()))
        if any(k in words for k in web_keywords):
            return True
            
    # Check technology blacklists
    if role_folder == "python_developer":
        bad_keywords = {"spring boot", "jdk", "jvm", "hibernate", "c#", "dotnet"}
        words = set(re.findall(r"\w+", question_text.lower()))
        if any(k in words for k in bad_keywords):
            return True
    elif role_folder == "java_developer":
        bad_keywords = {"django", "flask", "numpy", "pandas", "pip", "asyncio"}
        words = set(re.findall(r"\w+", question_text.lower()))
        if any(k in words for k in bad_keywords):
            return True
            
    return False

def is_aptitude_or_logical_riddle(question_text):
    """Strictly forbid aptitude, logical reasoning puzzles, and generic icebreaker questions"""
    blacklist_patterns = [
        r"\bpattern\b.*\bsequence\b",
        r"\bstanding in a line\b",
        r"\broses are flowers\b",
        r"\bwho is standing in the middle\b",
        r"\bhow many triangles\b",
        r"\bnext number in the sequence\b",
        r"\bmath puzzle\b",
        r"\btell me about yourself\b",
        r"\bwhy do you want to work\b",
        r"\bwhat are your strengths\b"
    ]
    text_lower = question_text.lower()
    for pattern in blacklist_patterns:
        if re.search(pattern, text_lower):
            return True
    return False

def validate_schema(item):
    required_keys = [
        "question", "question_type", "options", "correct_answer", 
        "explanation", "model_answer", "expected_keywords", 
        "skills", "tags", "topic", "difficulty", "estimated_time"
    ]
    return all(k in item for k in required_keys)

def clean_and_validate_question(role_folder, item, existing_qs, difficulty, topic):
    """Run validation pipeline checks on a question candidate"""
    q_text = item.get("question", "").strip()
    if not q_text:
        return None
        
    # Check correct role, topic, difficulty
    if item.get("difficulty", "").lower() != difficulty.lower():
        return None
    if item.get("topic", "").lower() != topic.lower():
        return None
        
    # Correct type structures
    if not validate_schema(item):
        return None
        
    # Deduplicate against the entire existing bank
    if q_text.lower() in {eq.lower() for eq in existing_qs}:
        return None
        
    if has_duplicate_meaning(q_text, existing_qs):
        return None
        
    if is_wrong_domain(role_folder, q_text):
        return None
        
    if is_aptitude_or_logical_riddle(q_text):
        return None
        
    return {
        "question": q_text,
        "question_type": item.get("question_type", "short_answer"),
        "options": item.get("options", None),
        "correct_answer": item.get("correct_answer", ""),
        "explanation": item.get("explanation", ""),
        "model_answer": item.get("model_answer", ""),
        "expected_keywords": item.get("expected_keywords", []),
        "skills": item.get("skills", []),
        "tags": item.get("tags", []),
        "topic": topic,
        "difficulty": difficulty,
        "estimated_time": int(item.get("estimated_time", 120))
    }

# --- GEMINI CLIENT GENERATORS ---

def get_generation_prompt(role_folder, topic, difficulty, count, seed):
    # Find nice user-friendly role name
    role_name = [k for k, v in ROLE_FOLDER_MAP.items() if v == role_folder][0]
    
    prompt = f"""
You are a senior tech recruiter. Generate exactly {count} unique, high-quality interview questions.
Role: {role_name}
Topic: {topic}
Difficulty: {difficulty}

**CRITICAL TOPIC COMPLIANCE RULE:**
You are generating interview questions ONLY for the '{topic}' topic of the '{role_name}' role.
Under no circumstances should you generate questions from CSS, JavaScript, React, Backend, Database, HR, Aptitude, Logical Reasoning, Management, Communication, or any unrelated domain. Every question must test concepts strictly specific to {topic}.

**QUESTION TYPE & SCHEMA REQUIREMENTS:**
Generate a diverse mix of 'mcq', 'msq', 'short_answer', 'scenario', and 'technical' formats.

Each question object in the JSON list must have exactly the following keys:
- "question": string (Question text)
- "question_type": "mcq" | "msq" | "short_answer" | "scenario" | "technical"
- "options": list of 4-5 options (for mcq/msq) or null (for short_answer/scenario/technical)
- "correct_answer": Exact correct option string (for mcq), or JSON list of correct options (for msq), or key ideal summary (for descriptive)
- "explanation": Explanation why correct option is correct (for mcq/msq) or null (for descriptive)
- "model_answer": Concise professional ideal response of 3-4 sentences (for descriptive) or null (for mcq/msq)
- "expected_keywords": List of 3-5 technical terms expected in the response
- "skills": List of 2-3 specific skills being tested
- "tags": List of 2-3 keyword tags
- "topic": "{topic}"
- "difficulty": "{difficulty}"
- "estimated_time": 60 (for mcq/msq) | 120 (for short_answer/technical) | 180 (for scenario)

Return ONLY a valid JSON array of objects with the exact schema above. Do not include markdown formatting or backticks, return ONLY the raw JSON text.
Uniqueness Seed: {seed}
"""
    return prompt

def get_review_prompt(role_folder, topic, difficulty, questions_list):
    role_name = [k for k, v in ROLE_FOLDER_MAP.items() if v == role_folder][0]
    
    questions_data = []
    for idx, q in enumerate(questions_list):
        questions_data.append({
            "index": idx,
            "question": q.get("question"),
            "topic": q.get("topic"),
            "difficulty": q.get("difficulty")
        })
        
    prompt = f"""
You are a senior tech interviewer reviewing a batch of questions generated for:
Role: {role_name}
Topic: {topic}
Difficulty: {difficulty}

Evaluate each question in the list below for the following criteria:
1. Is this question actually relevant to the selected role ({role_name})?
2. Does it belong to the requested topic ({topic})?
3. Does it match the requested difficulty ({difficulty})?
4. Would a real interviewer ask this question?
5. Is the wording professional and free of errors?
6. Is the question technically correct?

**QUESTIONS TO REVIEW:**
{json.dumps(questions_data, indent=2)}

**INSTRUCTIONS:**
Return a valid JSON array of objects. Each object must map the question index to a passed status:
[
  {{
    "index": 0,
    "passed": true,
    "reason": "Clear concept tested"
  }},
  {{
    "index": 1,
    "passed": false,
    "reason": "Not related to requested topic"
  }}
]
Do not add markdown formatting or backticks, return ONLY the raw JSON text.
"""
    return prompt

def parse_json_response(text):
    """Clean and parse JSON response from Gemini, removing markdown code blocks if present"""
    if not text:
        return []
    # Try to find JSON block in markdown
    match = re.search(r"```(?:json)?\s*([\s\S]*?)\s*```", text)
    clean_text = match.group(1) if match else text
    clean_text = clean_text.strip()
    try:
        return json.loads(clean_text)
    except json.JSONDecodeError as e:
        logger.error(f"Failed to parse JSON response: {e}. Raw response: {text}")
        return []

def classify_gemini_error(e):
    if isinstance(e, json.JSONDecodeError):
        return "JSON PARSING FAILURE"
        
    error_str = str(e)
    status_code = getattr(e, "code", None) or getattr(e, "status_code", None)
    
    if not status_code:
        status_match = re.search(r"\b(400|401|403|404|408|429|500|502|503|504)\b", error_str)
        if status_match:
            status_code = int(status_match.group(1))
            
    message_lower = error_str.lower()
    
    if status_code == 401 or "unauthorized" in message_lower or "auth" in message_lower:
        return "AUTHENTICATION FAILURE"
    elif status_code == 403 or "api_key_invalid" in message_lower or "invalid api key" in message_lower or "api key is invalid" in message_lower or "invalid key" in message_lower:
        return "INVALID API KEY"
    elif "resource_exhausted" in message_lower or "quota exceeded" in message_lower or "limit: 0" in message_lower:
        return "QUOTA EXCEEDED"
    elif "rate limit" in message_lower or status_code == 429:
        return "RATE LIMIT"
    elif status_code == 404 or "not found" in message_lower or "invalid model" in message_lower:
        return "INVALID MODEL"
    elif "timeout" in message_lower or "timed out" in message_lower:
        return "TIMEOUT"
    elif "connection" in message_lower or "network" in message_lower or "dns" in message_lower or "http" in message_lower or "socket" in message_lower:
        return "NETWORK ERROR"
    elif status_code in (500, 502, 503, 504) or "internal" in message_lower:
        return "GEMINI INTERNAL ERROR"
    elif status_code == 400:
        return "INVALID REQUEST"
    else:
        return f"UNKNOWN ERROR ({status_code or 'UNKNOWN'})"

async def run_batch_ai_review(role_folder, topic, difficulty, batch_questions, generate_content_fn):
    """
    Submits a batch of 10-20 questions to Gemini for a second-stage AI Quality Review.
    """
    if not batch_questions:
        return []
        
    prompt = get_review_prompt(role_folder, topic, difficulty, batch_questions)
    try:
        response = await asyncio.to_thread(
            generate_content_fn,
            client_type="assessment",
            contents=prompt,
            config=None
        )
        
        results = parse_json_response(response.text)
        passed_questions = []
        
        # Map review results back to our batch
        results_map = {item["index"]: item for item in results if "index" in item}
        
        for idx, q in enumerate(batch_questions):
            review = results_map.get(idx)
            if review and review.get("passed") is True:
                passed_questions.append(q)
            else:
                logger.warning(f"Question index {idx} failed AI Review: {review.get('reason', 'Unknown reason')}")
                
        return passed_questions
    except Exception as e:
        logger.error(f"AI Quality Review batch request failed: {e}. Defaulting to discarding batch to preserve quality.")
        return []

async def generate_questions_for_topic(role_folder, topic, difficulty, target_count, generate_content_fn, existing_qs):
    """Generates the required target count of questions for a specific topic incrementally"""
    questions = []
    seen_texts = set(existing_qs)
    max_attempts = 6
    
    needed = target_count
    batch_size = 15
    
    for attempt in range(max_attempts):
        if needed <= 0:
            break
            
        current_batch = min(needed, batch_size)
        seed = f"{role_folder}_{topic}_{difficulty}_{attempt}_{random.random()}"
        prompt = get_generation_prompt(role_folder, topic, difficulty, current_batch, seed)
        
        try:
            logger.info(f"Generating {current_batch} {difficulty} questions for topic '{topic}' (Attempt {attempt + 1})...")
            response = await asyncio.to_thread(
                generate_content_fn,
                client_type="assessment",
                contents=prompt,
                config=None
            )
            
            raw_list = parse_json_response(response.text)
            if not isinstance(raw_list, list):
                continue
                
            # First pass: schema validation and local validation checks
            validated_batch = []
            for item in raw_list:
                cleaned = clean_and_validate_question(role_folder, item, seen_texts, difficulty, topic)
                if cleaned:
                    validated_batch.append(cleaned)
                    seen_texts.add(cleaned["question"])
            
            # Second pass: Batch AI Quality Review
            if validated_batch:
                logger.info(f"Running Batch AI Quality Review on {len(validated_batch)} questions...")
                passed_batch = await run_batch_ai_review(role_folder, topic, difficulty, validated_batch, generate_content_fn)
                logger.info(f"{len(passed_batch)}/{len(validated_batch)} questions passed the AI review.")
                
                questions.extend(passed_batch)
                needed -= len(passed_batch)
                
            await asyncio.sleep(1.5)
        except Exception as e:
            err_type = classify_gemini_error(e)
            logger.error(f"Error generating questions for topic {topic} ({err_type}): {e}")
            if err_type in ("QUOTA EXCEEDED", "RATE LIMIT"):
                raise e
            await asyncio.sleep(2.0)
            
    return questions[:target_count]

# --- STARTUP INITIALIZATION AND INCREMENTAL SEEDING ---

def validate_and_heal_role_bank(role_folder):
    """
    Validates existing question bank JSON file and metadata for:
    - Valid JSON format
    - Complete question schemas
    - Correct target counts for every topic in the blueprint
    - Complete metadata file structure
    Returns a dictionary of missing topics and their remaining question counts to generate.
    """
    blueprint = ROLE_BLUEPRINT.get(role_folder)
    if not blueprint:
        return None, {}
        
    q_file = get_questions_filepath(role_folder)
    m_file = get_metadata_filepath(role_folder)
    
    if not q_file.exists() or not m_file.exists():
        # Complete rebuild required
        needed = {}
        for diff in ["easy", "medium", "hard"]:
            diff_blue = blueprint.get(diff, {})
            for topic, target in diff_blue.items():
                needed[(diff, topic)] = target
        return {"role": role_folder, "easy": {}, "medium": {}, "hard": {}}, needed
        
    try:
        # Load and parse
        with open(q_file, "r", encoding="utf-8") as f:
            bank = json.load(f)
        with open(m_file, "r", encoding="utf-8") as f:
            meta = json.load(f)
    except Exception as e:
        logger.error(f"Corrupted files detected for role {role_folder}: {e}. Initializing clean file.")
        needed = {}
        for diff in ["easy", "medium", "hard"]:
            diff_blue = blueprint.get(diff, {})
            for topic, target in diff_blue.items():
                needed[(diff, topic)] = target
        return {"role": role_folder, "easy": {}, "medium": {}, "hard": {}}, needed

    # Clean existing bank to filter out any schema violations
    clean_bank = {"role": role_folder, "easy": {}, "medium": {}, "hard": {}}
    existing_qs = set()
    
    for diff in ["easy", "medium", "hard"]:
        diff_dict = bank.get(diff, {})
        diff_blue = blueprint.get(diff, {})
        for topic in diff_blue.keys():
            q_list = diff_dict.get(topic, [])
            clean_list = []
            for q in q_list:
                # Schema check
                if validate_schema(q) and q.get("question", "").strip():
                    q_text = q["question"].strip()
                    if q_text.lower() not in existing_qs:
                        existing_qs.add(q_text.lower())
                        clean_list.append(q)
            clean_bank[diff][topic] = clean_list

    # Assess gaps against blueprints
    needed = {}
    for diff in ["easy", "medium", "hard"]:
        diff_blue = blueprint.get(diff, {})
        for topic, target in diff_blue.items():
            current_count = len(clean_bank[diff].get(topic, []))
            if current_count < target:
                needed[(diff, topic)] = target - current_count
                
    return clean_bank, needed

async def seed_question_bank_task(generate_content_fn):
    """
    On startup, scans all roles. If files already exist and pass validation,
    does absolutely nothing. Otherwise, generates only missing topics/questions incrementally.
    """
    logger.info("Initializing Speak2HR question bank verification...")
    os.makedirs(QUESTION_BANK_DIR, exist_ok=True)
    
    for role_folder in ROLE_FOLDER_MAP.values():
        logger.info(f"Checking question bank files for role: {role_folder}...")
        
        clean_bank, gaps = validate_and_heal_role_bank(role_folder)
        if not gaps:
            logger.info(f"Question bank for role {role_folder} is complete. Skipping generation.")
            # Ensure metadata matches exactly
            meta = load_role_metadata(role_folder)
            if not meta:
                # If metadata was deleted or corrupted, write it out
                meta = build_metadata_document(role_folder, clean_bank)
                write_role_question_bank(role_folder, clean_bank, meta)
            continue
            
        logger.info(f"Question bank for {role_folder} has gaps: {len(gaps)} topics need questions. Starting incremental generation...")
        
        flat_existing = get_flat_question_list(clean_bank)
        
        for (diff, topic), missing_count in gaps.items():
            logger.info(f"Topic '{topic}' ({diff}) is missing {missing_count} questions. Generating...")
            new_qs = await generate_questions_for_topic(role_folder, topic, diff, missing_count, generate_content_fn, flat_existing)
            
            # Merge into bank
            if diff not in clean_bank:
                clean_bank[diff] = {}
            if topic not in clean_bank[diff]:
                clean_bank[diff][topic] = []
            clean_bank[diff][topic].extend(new_qs)
            
            # Update flat list
            flat_existing.extend([q["question"] for q in new_qs])
            
        # Write merged files
        metadata = build_metadata_document(role_folder, clean_bank)
        write_role_question_bank(role_folder, clean_bank, metadata)
        logger.info(f"Successfully healed and completed role question bank: {role_folder}")

def build_metadata_document(role_folder, bank_data):
    """Build the metadata document outlining topic counts and completion status"""
    blueprint = ROLE_BLUEPRINT.get(role_folder, {})
    
    # Load existing metadata if available to preserve attempts and status
    existing_meta = load_role_metadata(role_folder)
    prev_attempt = None
    prev_status = "not_started"
    if existing_meta:
        prev_attempt = existing_meta.get("last_generation_attempt")
        prev_status = existing_meta.get("generation_status", "not_started")
        
    easy_count = sum(len(bank_data.get("easy", {}).get(t, [])) for t in blueprint.get("easy", {}).keys())
    med_count = sum(len(bank_data.get("medium", {}).get(t, [])) for t in blueprint.get("medium", {}).keys())
    hard_count = sum(len(bank_data.get("hard", {}).get(t, [])) for t in blueprint.get("hard", {}).keys())
    
    topic_distribution = {}
    topics_completion = {}
    
    completed_topics = []
    remaining_topics = []
    
    total_target = 0
    total_current = easy_count + med_count + hard_count
    
    for diff in ["easy", "medium", "hard"]:
        diff_blue = blueprint.get(diff, {})
        for topic, target in diff_blue.items():
            current = len(bank_data.get(diff, {}).get(topic, []))
            topic_distribution[topic] = current
            completed = current >= target
            topics_completion[topic] = {
                "target": target,
                "current": current,
                "completed": completed
            }
            total_target += target
            if completed:
                completed_topics.append(topic)
            else:
                remaining_topics.append(topic)
                
    progress_percentage = (total_current / total_target) * 100 if total_target > 0 else 0.0
    
    # Decide status if completed
    status = prev_status
    if total_current >= total_target:
        status = "completed"
    elif status == "completed": # If it was previously completed but now we force/have gaps
        status = "not_started"
            
    return {
        "role": role_folder,
        "version": "1.1.0",
        "generated_at": existing_meta.get("generated_at") if existing_meta else datetime.now(timezone.utc).isoformat(),
        "last_updated": datetime.now(timezone.utc).isoformat(),
        "total_questions": total_current,
        "easy_count": easy_count,
        "medium_count": med_count,
        "hard_count": hard_count,
        "topic_distribution": topic_distribution,
        "topics_completion": topics_completion,
        "generation_model": "gemini-2.0-flash",
        "schema_version": "1.0",
        "generation_status": status,
        "last_generation_attempt": prev_attempt,
        "generation_progress": f"{total_current}/{total_target} questions ({progress_percentage:.1f}%)",
        "completed_topics": completed_topics,
        "remaining_topics": remaining_topics
    }

def is_role_generated(role_folder):
    """Check if the question bank for this role is fully generated and has questions"""
    filepath = get_questions_filepath(role_folder)
    meta_filepath = get_metadata_filepath(role_folder)
    if not filepath.exists() or not meta_filepath.exists():
        return False
    try:
        meta = load_role_metadata(role_folder)
        if not meta or meta.get("total_questions", 0) == 0:
            return False
        if meta.get("generation_status") == "completed":
            return True
        # If no generation_status exists (legacy files), check if there are no gaps
        _, gaps = validate_and_heal_role_bank(role_folder)
        return len(gaps) == 0
    except Exception:
        return False

# --- CANDIDATE HISTORY ---

def get_candidate_history_filepath(user_id):
    history_dir = Path("daily_questions")
    os.makedirs(history_dir, exist_ok=True)
    return history_dir / f"{user_id}_history.json"

def get_candidate_history(user_id):
    """
    Load candidate's attempted questions, maintaining clean structure
    while gracefully handling any legacy flat-list string JSON formats.
    """
    filepath = get_candidate_history_filepath(user_id)
    if not filepath.exists():
        return []
        
    try:
        with open(filepath, "r", encoding="utf-8") as f:
            data = json.load(f)
            
        if not data:
            return []
            
        if isinstance(data, list):
            # Parse list of history items
            if isinstance(data[0], str):
                # Legacy flat list of question strings
                return data
            elif isinstance(data[0], dict):
                # Clean structured format
                return [item.get("question", "") for item in data if item.get("question")]
        return []
    except Exception as e:
        logger.error(f"Failed to read candidate history: {e}")
        return []

def record_candidate_questions(user_id, questions, role=""):
    """Append newly attempted questions to candidate history with timestamps"""
    filepath = get_candidate_history_filepath(user_id)
    
    # Load existing attempts in their structured format
    existing_records = []
    if filepath.exists():
        try:
            with open(filepath, "r", encoding="utf-8") as f:
                raw = json.load(f)
            if isinstance(raw, list):
                if raw and isinstance(raw[0], str):
                    # Convert legacy flat list to new structured list
                    existing_records = [{"question": q, "role": role, "timestamp": datetime.now(timezone.utc).isoformat()} for q in raw]
                else:
                    existing_records = raw
        except Exception:
            existing_records = []
            
    # Append new attempts
    existing_texts = {r["question"].lower().strip() for r in existing_records if "question" in r}
    
    for q in questions:
        q_text = q.get("question", "").strip()
        if q_text and q_text.lower().strip() not in existing_texts:
            existing_records.append({
                "question": q_text,
                "role": role,
                "timestamp": datetime.now(timezone.utc).isoformat()
            })
            
    try:
        with open(filepath, "w", encoding="utf-8") as f:
            json.dump(existing_records[-100:], f, indent=2, ensure_ascii=False)
    except Exception as e:
        logger.error(f"Failed to save candidate history: {e}")

# --- QUERY & RUNTIME SELECTION FLOW ---

def get_assessment_questions(user_id, role_string, difficulty_dist=None):
    """
    Selects 4 Easy, 4 Medium, 2 Hard questions from the cached JSON, shuffling
    and excluding attempted history (falling back to reuse attempted if pool is exhausted).
    """
    if difficulty_dist is None:
        difficulty_dist = {"easy": 4, "medium": 4, "hard": 2}
        
    role_folder = ROLE_FOLDER_MAP.get(role_string)
    if not role_folder:
        # Fallback cleaning if string slightly differs
        role_folder = role_string.lower().replace(" ", "_").replace("/", "")
        if role_folder not in ROLE_FOLDER_MAP.values():
            role_folder = "software_engineer"
            
    bank = load_role_question_bank(role_folder)
    attempted = get_candidate_history(user_id)
    attempted_set = {q.lower().strip() for q in attempted}
    
    selected = []
    
    for diff, count in difficulty_dist.items():
        if count <= 0:
            continue
            
        diff_dict = bank.get(diff.lower(), {})
        # Flatten all questions across topics for this difficulty
        pool = []
        for topic, q_list in diff_dict.items():
            pool.extend(q_list)
            
        if not pool:
            raise ValueError(f"Curriculum file empty for role '{role_folder}' at difficulty '{diff}'!")
            
        unseen = [q for q in pool if q.get("question", "").lower().strip() not in attempted_set]
        
        sampled = []
        if len(unseen) >= count:
            sampled = random.sample(unseen, count)
        else:
            sampled = unseen
            needed = count - len(unseen)
            # Reuse already attempted questions if unseen list is exhausted
            seen = [q for q in pool if q.get("question", "").lower().strip() in attempted_set]
            if seen:
                sampled.extend(random.sample(seen, min(needed, len(seen))))
            else:
                while len(sampled) < count:
                    sampled.append(random.choice(pool))
                    
        selected.extend(sampled)
        
    random.shuffle(selected)
    
    assessment_id = f"assess_{int(time.time())}_{random.randint(1000, 9999)}"
    final_questions = []
    for idx, q in enumerate(selected):
        final_questions.append({
            "question_id": f"{assessment_id}_{idx}",
            "question": q.get("question"),
            "category": q.get("category", "technical"),
            "difficulty": q.get("difficulty", "medium"),
            "options": q.get("options", None),
            "question_type": q.get("question_type", "short_answer"),
            "expected_keywords": q.get("expected_keywords", []),
            "time_limit_seconds": q.get("estimated_time", 120),  # Map schema's estimated_time back to frontend
            "correct_answer": q.get("correct_answer", ""),
            "model_answer": q.get("model_answer", None),
            "explanation": q.get("explanation", None)
        })
        
    return final_questions, assessment_id

def get_interview_questions(user_id, role_string, candidate_name="Candidate"):
    """
    Selects 8 progressive questions and dynamically maps them to the 8 progression steps.
    """
    role_folder = ROLE_FOLDER_MAP.get(role_string)
    if not role_folder:
        role_folder = role_string.lower().replace(" ", "_").replace("/", "")
        if role_folder not in ROLE_FOLDER_MAP.values():
            role_folder = "software_engineer"
            
    bank = load_role_question_bank(role_folder)
    attempted = get_candidate_history(user_id)
    attempted_set = {q.lower().strip() for q in attempted}
    
    progression = [
        {"level": 1, "level_name": "Introduction", "difficulty": "easy", "category": "behavioral", "weight": 0.8},
        {"level": 2, "level_name": "Recent Project", "difficulty": "medium", "category": "technical", "weight": 1.0},
        {"level": 3, "level_name": "Technical Concepts", "difficulty": "medium", "category": "technical", "weight": 1.1},
        {"level": 4, "level_name": "Coding/Algorithms", "difficulty": "hard", "category": "technical", "weight": 1.3},
        {"level": 5, "level_name": "System Design", "difficulty": "hard", "category": "technical", "weight": 1.4},
        {"level": 6, "level_name": "Behavioral (STAR)", "difficulty": "medium", "category": "behavioral", "weight": 1.1},
        {"level": 7, "level_name": "Scenario Analysis", "difficulty": "hard", "category": "technical", "weight": 1.5},
        {"level": 8, "level_name": "Career Goals", "difficulty": "easy", "category": "behavioral", "weight": 0.8}
    ]
    
    session_id = f"sess_{int(time.time())}_{random.randint(1000, 9999)}"
    final_questions = []
    
    for step in progression:
        diff = step["difficulty"]
        cat = step["category"]
        
        diff_dict = bank.get(diff, {})
        pool = []
        for topic, q_list in diff_dict.items():
            # Match by category
            pool.extend([q for q in q_list if q.get("category", "technical").lower() == cat.lower()])
            
        if not pool:
            # Fallback to general category matching for the difficulty level
            for topic, q_list in diff_dict.items():
                pool.extend(q_list)
                
        if not pool:
            raise ValueError(f"Question pool empty for role {role_folder} difficulty {diff}!")
            
        unseen = [q for q in pool if q.get("question", "").lower().strip() not in attempted_set]
        
        selected = None
        if unseen:
            selected = random.choice(unseen)
        else:
            selected = random.choice(pool)
            
        q_text = selected.get("question", "")
        if candidate_name and "candidate" in q_text.lower():
            q_text = re.sub(r"\bcandidate\b", candidate_name, q_text, flags=re.IGNORECASE)
            
        final_questions.append({
            "question_id": f"{session_id}_{step['level']}_0",
            "question": q_text,
            "category": selected.get("category", cat),
            "difficulty": selected.get("difficulty", diff),
            "level": step["level"],
            "level_name": step["level_name"],
            "order": step["level"],
            "weight": step["weight"],
            "expected_keywords": selected.get("expected_keywords", [])
        })
        
    return final_questions, session_id
