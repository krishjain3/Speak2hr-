# 🚀 Speak2HR – AI-Powered Interview Assessment Platform

> **An AI-Powered Mock Interview & Assessment Platform built to help candidates prepare for technical and HR interviews through personalized assessments, AI-based evaluation, resume analysis, and interview analytics.**

---

## 📖 About the Project

Speak2HR is a full-stack AI-powered interview preparation and candidate assessment platform designed to simulate real-world hiring processes. It enables candidates to practice interviews, take role-specific technical assessments, receive AI-generated evaluation feedback, analyze resumes against job descriptions, and monitor their performance through detailed candidate reports.

The platform combines modern web technologies with Artificial Intelligence to provide an interactive, realistic interview experience for both candidates and HR managers.

The backend is built using **Java** and **Spring Boot 3.x**, communicating with **MongoDB** for data persistence and **Google Gemini** for AI evaluation and content generation. The frontend is built using **React.js** and **JavaScript**.

---

# ✨ Features

## 👨‍💻 Candidate Features

- Secure Authentication & JWT Authorization
- AI-Powered Mock Technical Interviews
- Role-Based Assessments & Practice MCQs
- Resume Upload & AI Job Description Matching
- AI Answer & Skill-Gap Evaluation
- Detailed Interview Performance Reports & PDF Download
- Activity Logs & Assessment History
- Candidate Profile Management

---

## 👩‍💼 HR Features

- HR Dashboard & Analytics
- Candidate Management & Status Tracking
- Interview Slot Creation & Booking Management
- Candidate Evaluation & Feedback Submission
- Candidate Report Review & Hiring Decisions

---

## 🤖 AI & RAG Features

- **Google Gemini 2.0 Flash Integration** with multi-key failover and offline fallback
- **Resume-Grounded RAG Pipeline**:
  - Section-aware PDF, DOCX, and text resume extraction
  - Local vector semantic indexing and similarity retrieval
  - Anti-hallucination guardrails: every question strictly anchored in candidate's verified projects & experience
  - Dual answer evaluation modes: spoken audio/video transcript analysis and written technical text / code submission
  - Multi-dimensional scoring: Technical Accuracy, Reasoning Depth, Relevance, Clarity, Strengths, and Targeted Improvements
- **Dynamic Role-Specific Question Generation** with adjustable difficulty, question counts, and focus topics
- **Question Bank Architecture** for offline resilience
- **Resume & Job Description Skill Gap Analysis** with automated learning roadmaps

---

# 🏗️ System Architecture

```text
React Frontend (Port 3000)
       │
       ▼
Spring Boot REST API (Port 8000)
       │
 ┌─────┼────────────────────────┬─────────────────────┐
 │     │                        │                     │
 ▼     ▼                        ▼                     ▼
Spring Data MongoDB     Gemini 2.0 Flash    RAG Vector Engine    PDF & Document Engine
```

---

# 🛠️ Tech Stack

## Frontend

- **React.js**
- **JavaScript**
- **HTML5**
- **CSS3** / **TailwindCSS**
- **Axios**
- **Chart.js**

---

## Backend

- **Java 17+**
- **Spring Boot 3.x**
- **Spring Web / REST APIs**
- **Spring Data MongoDB**
- **Spring Security & JWT**
- **Bean Validation**
- **Apache PDFBox**

---

## Database

- **MongoDB**

---

## Artificial Intelligence

- **Google Gemini 2.0 Flash**

---

## Tools & Utilities

- **Maven (mvnw)**
- **Git & GitHub**

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
├── src/
│   ├── main/
│   │   ├── java/com/speak2hr/
│   │   │   ├── config/          # Security, Database Seeder, CORS
│   │   │   ├── controller/      # REST API Controllers (Admin, Auth, Candidate, RAG, Interview)
│   │   │   ├── dto/             # Data Transfer Objects
│   │   │   ├── model/           # Mongo Document Entities
│   │   │   ├── repository/     # Spring Data Repositories
│   │   │   └── service/        # Business Logic, RAG Services, Gemini AI
│   │   └── resources/
│   │       └── application.properties
│   └── test/
│
├── ML/                          # Python RAG Pipeline, Vector Engine & Test Suite
│   ├── rag_pipeline.py         # Advanced Document Extraction, Chunking & RAG
│   ├── test_rag_pipeline.py    # Unit tests for RAG engine
│   └── test_api_endpoints.py   # Integration tests
│
├── pom.xml
├── mvnw / mvnw.cmd
├── README.md
├── HOW_TO_RUN.md
└── run_locally.bat
```

---

# 🚀 Installation & Running

## Prerequisites

- **Java 17+ / Java 21 JDK**
- **Node.js 16+ & npm**
- **MongoDB** (Optional, database seeder initializes sample data on boot)
- **Google Gemini API Key**

---

## 1. Start Spring Boot Backend

```bash
# On Windows
.\mvnw.cmd spring-boot:run

# On Linux/macOS
./mvnw spring-boot:run
```

Backend will run on: `http://localhost:8000`  
Health check endpoint: `http://localhost:8000/health`

---

## 2. Start React Frontend

```bash
cd frontend
npm install
npm start
```

Frontend will run on: `http://localhost:3000`

---

# 🔑 Pre-seeded Test Credentials

| Role | Email | Password |
|------|-------|----------|
| Admin | `admin@company.com` | `admin123` |
| HR Manager | `hr@speak2hr.com` | `password123` |
| Candidate | `candidate@speak2hr.com` | `password123` |

---

# 📌 Main REST API Endpoints

| Method | Endpoint | Description |
|---------|----------|-------------|
| POST | `/api/auth/login` | User login |
| POST | `/api/auth/register` | User registration |
| POST | `/api/resume/upload` | Resume upload and analysis |
| POST | `/api/job/match` | Job description match |
| POST | `/api/skill-gap/analyze` | Skill gap analysis |
| POST | `/api/interview/generate-questions` | Generate interview questions |
| POST | `/api/interview/evaluate-response` | Evaluate interview answer |
| POST | `/api/interview/generate-report` | Generate candidate evaluation PDF report |
| GET | `/api/interview/download-report/{filename}` | Download evaluation PDF report |
| GET | `/api/slots` | Fetch interview slots |
| POST | `/api/slots/book` | Book interview slot |
| GET | `/health` | Backend health check |

---

## 👨‍💻 Developer

**Krish Jain**  
Computer Science Engineering (AI & ML)  
VIT Bhopal University