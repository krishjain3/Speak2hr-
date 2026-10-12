# Speak2HR Reproducibility & Setup Guide

This document provides step-by-step instructions to set up, configure, and run the **Speak2HR** application with its **Java Spring Boot** backend, **Google Gemini RAG Pipeline**, and **React** frontend.

---

## 📋 Architecture Overview

- **Backend**: **Java 17+ / Spring Boot 3.2.3** (`com.speak2hr`)
  - REST Controllers: Authentication, Candidate Management, Slot Booking, Assessments, Interviews, Resume Parsing, and RAG Pipeline.
  - Security: Spring Security with JWT token generation and role-based access (Candidate, HR, Admin).
  - AI Engine: Google Gemini API integration with multi-key failover and offline fallback.
  - Port: `8000`
- **RAG Pipeline & AI Modules**:
  - Resume-grounded RAG Engine with section chunking, vector similarity search, anti-hallucination verification, and answer evaluation.
  - Unit & Integration Test Suite (`ML/test_rag_pipeline.py`, `ML/test_api_endpoints.py`).
- **Frontend**: **React 18** (`frontend/`)
  - Candidate Interview Selection with Resume-Based RAG modal, role targeting, live parsing badges, and dual spoken/text answer modes.
  - Port: `3000` (proxied to backend at `http://localhost:8000`)

---

## 📋 Prerequisites

Before starting, ensure you have the following installed:
- **Java 17+ / Java 21 JDK**: [Download Java](https://www.oracle.com/java/technologies/downloads/)
- **Node.js 16+ & npm**: [Download Node.js](https://nodejs.org/)
- **Python 3.10+ / 3.11+** *(optional, for running ML standalone test suite)*: [Download Python](https://www.python.org/downloads/)
- **Google Gemini API Key**: From [Google AI Studio](https://aistudio.google.com/)

---

## 🔑 Gemini API Key Configuration

You can set your Gemini API key in either of the following places:

1. **Root `.env` file** or system environment variable:
   ```env
   GEMINI_API_KEY=AIzaSy...your_gemini_api_key_here
   ```
2. **Spring Boot `src/main/resources/application.properties`**:
   ```properties
   gemini.api.key.1=AIzaSy...your_gemini_api_key_here
   ```
3. **ML Directory `.env`** (for Python RAG scripts/tests):
   ```env
   GEMINI_API_KEY=AIzaSy...your_gemini_api_key_here
   ```

---

## ⚡ Quick Start (Windows)

Double-click **`run_locally.bat`** in the root directory.

The script will:
1. Verify Java 17+ and Node.js prerequisites.
2. Install frontend dependencies (`npm install`).
3. Launch the Spring Boot backend (`mvnw.cmd spring-boot:run`) on port `8000`.
4. Launch the React frontend (`npm start`) on port `3000`.

---

## 🛠️ Manual Setup

### 1. Java Spring Boot Backend Setup

1. Open a terminal in the project root:
   ```powershell
   # On Windows
   .\mvnw.cmd spring-boot:run

   # On Linux/macOS
   ./mvnw spring-boot:run
   ```
2. Backend will start at `http://localhost:8000`.
3. Verify backend health by visiting [http://localhost:8000/health](http://localhost:8000/health).

### 2. Frontend Setup (React)

1. Open a second terminal and navigate to `frontend`:
   ```bash
   cd frontend
   npm install
   npm start
   ```
2. Frontend will open at [http://localhost:3000](http://localhost:3000).

---

## 🧪 Running Automated Tests

### 1. Python RAG Engine & API Test Suite:
```powershell
cd ML
py -3.11 -m unittest test_rag_pipeline.py test_api_endpoints.py
```
Tests document parsing, vector indexing, multi-query targeted retrieval, evidence grounding, cross-project attribution defense, duplicate detection, and candidate authorization.

### 2. Java Spring Boot Compilation & Tests:
```powershell
.\mvnw.cmd test-compile
```

---

## 🎯 How to Use the Resume-Based RAG Interview

1. Log in or register as a Candidate (pre-seeded credentials: `candidate@speak2hr.com` / `password123`).
2. Navigate to **Interviews** > **Select Interview Type**.
3. Select **Resume-Based Technical Interview (RAG AI)**:
   - Upload your resume (PDF, DOCX, or TXT).
   - The system extracts sections, structures project descriptions, and indexes vector embeddings.
   - Verified project names, skills, and chunk counts appear in the preview badge.
   - Choose your target role, difficulty, question count, and response mode (*Spoken Video* or *Written Text*).
   - Click **Start RAG Interview**.
4. Conduct the interview:
   - Each question is dynamically anchored to your verified projects and technical experience.
   - Submit spoken audio/video or type your technical response.
   - Receive instant evaluation with technical correctness, reasoning depth, relevance, clarity, strengths, and improvement suggestions.
5. Review the full interview report upon completion.

---

## 🔍 Pre-seeded Credentials for Testing

- **Admin User**: `admin@company.com` / `admin123`
- **HR Manager**: `hr@speak2hr.com` / `password123`
- **Candidate User**: `candidate@speak2hr.com` / `password123`
