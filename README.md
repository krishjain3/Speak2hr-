# 🚀 Speak2HR

> **An AI-Powered Mock Interview & Assessment Platform built to help candidates prepare for technical and HR interviews through personalized assessments, AI-based evaluation, resume analysis, and emotion detection.**

---

## 📖 About the Project

Speak2HR is a full-stack AI-powered interview preparation platform designed to simulate real-world hiring processes. It enables candidates to practice interviews, take role-specific assessments, receive AI-generated feedback, analyze resumes against job descriptions, and monitor their interview performance through detailed reports.

The platform combines modern web technologies with Artificial Intelligence to provide a realistic interview experience. It supports both candidates and HR professionals through dedicated dashboards and role-based features.

The project is built using **React.js**, **FastAPI**, **Google Gemini**, **DeepFace**, and **Doc2Vec**, making it a complete end-to-end AI application.

---

# ✨ Features

## 👨‍💻 Candidate Features

- Secure Login & Registration
- AI-Powered Mock Interviews
- Role-Based Technical & HR Assessments
- Resume Upload & Resume-to-Job Matching
- AI Answer Evaluation
- Facial Emotion Detection during Interviews
- Performance Reports with Detailed Feedback
- Interview History Tracking
- Profile Management

---

## 👩‍💼 HR Features

- HR Dashboard
- Candidate Management
- Interview Scheduling
- Candidate Evaluation
- Performance Review
- Report Generation

---

## 🤖 AI Features

- AI-generated interview questions
- Offline Question Bank architecture for faster assessments
- AI-based answer evaluation
- Resume similarity matching using Doc2Vec
- Emotion detection using DeepFace
- Intelligent feedback generation

---

# 🏗️ System Architecture

```
Candidate / HR
        │
        ▼
React Frontend
        │
        ▼
FastAPI Backend
        │
 ┌──────┼──────────────┐
 │      │              │
 ▼      ▼              ▼
Google Gemini     DeepFace     Doc2Vec
 │
 ▼
Question Bank
 │
 ▼
Assessment & Reports
```

---

# 🛠️ Tech Stack

## Frontend

- React.js
- Material UI (MUI)
- React Router
- Zustand
- Axios
- Chart.js
- React Webcam

---

## Backend

- FastAPI
- Python
- SQLite

---

## Artificial Intelligence

- Google Gemini 2.0 Flash
- DeepFace
- Gensim Doc2Vec

---

## Other Tools

- ReportLab
- SMTP Email Service
- WebSockets

---

# 📂 Project Structure

```text
Speak2HR
│
├── frontend/
│   ├── src/
│   ├── public/
│   └── package.json
│
├── ML/
│   ├── main.py
│   ├── question_bank/
│   ├── assessments/
│   ├── reports/
│   ├── recordings/
│   ├── emotion_analysis/
│   ├── profiles/
│   ├── database.py
│   ├── question_bank_manager.py
│   ├── generate_question_bank.py
│   └── requirements.txt
│
├── README.md
└── HOW_TO_RUN.md
```

---

# 🧠 AI Workflow

### 1. Resume Analysis

- Candidate uploads a resume.
- The system extracts important information.
- Resume similarity is calculated using **Doc2Vec**.

---

### 2. Question Generation

Questions are generated using **Google Gemini** and stored in a local **Question Bank**.

During assessments, questions are loaded directly from the Question Bank, making the assessment process faster and reducing unnecessary API calls.

---

### 3. Interview Evaluation

During interviews, the system evaluates:

- Technical knowledge
- Communication quality
- Keyword relevance
- Confidence
- Overall response quality

using **Google Gemini**.

---

### 4. Emotion Analysis

The webcam captures facial expressions throughout the interview.

DeepFace analyzes emotions such as:

- Happy
- Neutral
- Surprise
- Sad
- Angry
- Fear
- Disgust

These insights contribute to the overall interview evaluation.

---

### 5. Report Generation

After completion of an interview or assessment, the platform generates a detailed report containing:

- Overall Score
- AI Feedback
- Strengths
- Areas for Improvement
- Performance Summary

---

# 🚀 Installation

## Prerequisites

- Python 3.10+
- Node.js
- npm
- Google Gemini API Keys

---

## Backend Setup

```bash
cd ML

python -m venv venv

# Windows
venv\Scripts\activate

# Linux/macOS
source venv/bin/activate

pip install -r requirements.txt

python main.py
```

Backend runs at:

```
http://localhost:8000
```

API Documentation:

```
http://localhost:8000/docs
```

---

## Frontend Setup

```bash
cd frontend

npm install

npm start
```

Frontend runs at:

```
http://localhost:3000
```

---

# 🔑 Environment Variables

Create an `.env` file inside the **ML** folder.

```env
GOOGLE_API_KEY_1=YOUR_API_KEY
GOOGLE_API_KEY_2=YOUR_API_KEY
GOOGLE_API_KEY_3=YOUR_API_KEY
GOOGLE_API_KEY_4=YOUR_API_KEY
GOOGLE_API_KEY_5=YOUR_API_KEY

EMAIL_USER=YOUR_EMAIL
EMAIL_PASSWORD=YOUR_APP_PASSWORD

GEMINI_MODEL=gemini-2.0-flash
```

---

# 📌 Main API Endpoints

| Method | Endpoint | Description |
|---------|----------|-------------|
| POST | `/api/resume/upload` | Upload and analyze resume |
| POST | `/api/interview/generate-questions` | Generate interview questions |
| POST | `/api/interview/evaluate-response` | Evaluate interview response |
| POST | `/api/interview/generate-report` | Generate interview report |
| POST | `/api/assessment/generate` | Generate assessment |
| GET | `/api/interview/session/{id}` | Get interview session |

---

# 📈 Future Improvements

- Adaptive difficulty based on candidate performance
- Cloud deployment
- Multi-language interview support
- Advanced analytics dashboard
- Company-specific interview templates
- More AI models for evaluation

---

# 🤝 Contributing

Contributions, suggestions, and improvements are always welcome.

If you'd like to enhance the project, feel free to fork the repository and submit a pull request.

---

# 📄 License

This project is developed for educational and learning purposes.

---

## 👨‍💻 Developer

**Krish Jain**

Computer Science Engineering (AI & ML)

VIT Bhopal University.

---

⭐ If you found this project useful, consider giving it a star.