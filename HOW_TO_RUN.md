# Speak2HR Reproducibility & Setup Guide

This document provides step-by-step instructions to set up, configure, and run the **Speak2HR** application with its Python/FastAPI backend, SQLite persistent database, Google Gemini RAG pipeline, and React frontend.

---

## 📋 Prerequisites

Before starting, ensure you have the following installed:
- **Python 3.10+ / 3.11+**: [Download Python](https://www.python.org/downloads/)
- **Node.js 16+ & npm**: [Download Node.js](https://nodejs.org/)
- **Google Gemini API Key**: From [Google AI Studio](https://aistudio.google.com/)

---

## 🔑 Gemini API Key Configuration

1. In the `ML` directory, copy `.env.example` to `.env`:
   ```bash
   cd ML
   copy .env.example .env     # Windows
   cp .env.example .env       # macOS / Linux
   ```
2. Open `ML/.env` and insert your Gemini API Key:
   ```env
   GEMINI_API_KEY=AIzaSy...your_gemini_api_key_here
   ```
   *(Optionally, you can also set `GEMINI_MODEL=gemini-2.0-flash` or keep the default).*

---

## ⚡ Quick Start (Windows)

If you are on Windows:
1. Double-click **`run_locally.bat`** in the root directory.
2. The script will:
   - Create or activate the virtual environment.
   - Install backend dependencies (`pip install -r requirements.txt`).
   - Install frontend dependencies (`npm install`).
   - Launch the FastAPI backend on port `8000`.
   - Launch the React frontend on port `3000`.
3. Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## 🛠️ Manual Setup

### 1. Backend Setup (FastAPI & RAG Engine)

1. Open a terminal and navigate to `ML`:
   ```bash
   cd ML
   ```
2. Activate your virtual environment:
   ```powershell
   # Windows
   venv\Scripts\activate
   # Or using py launcher directly
   py -3.11 main.py
   ```
3. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```
4. Run the server:
   ```bash
   python main.py
   # Or: uvicorn main:app --host 0.0.0.0 --port 8000 --reload
   ```
   Backend will start at `http://localhost:8000`.
   API Documentation available at: `http://localhost:8000/docs`.

### 2. Frontend Setup (React)

1. Open a second terminal and navigate to `frontend`:
   ```bash
   cd frontend
   ```
2. Install dependencies (if not already installed):
   ```bash
   npm install
   ```
3. Start the React development server:
   ```bash
   npm start
   ```
   Frontend will open at `http://localhost:3000`.

---

## 🧪 Running Automated Tests

To run the comprehensive automated RAG test suite (including document parsing, vector indexing, multi-query targeted retrieval, evidence grounding, cross-project attribution defense, duplicate detection, and candidate authorization):

```bash
cd ML
py -3.11 -m unittest test_rag_pipeline.py test_api_endpoints.py
```

All tests run locally using standard Python `unittest` with mock callers and fast deterministic verification.

---

## 🎯 How to Use the Resume-Based RAG Interview

1. Log in or register as a Candidate (or use pre-seeded `candidate@speak2hr.com` / `password123`).
2. Navigate to **Interviews** > **Select Interview Type**.
3. Select **Resume-Based Interview (RAG AI)**:
   - Upload your resume (PDF or DOCX).
   - The system extracts sections, structures project descriptions, and indexes vector embeddings into SQLite.
   - Verified project names, skills, and chunk counts appear in the preview badge.
   - Choose your target role, difficulty, question count (default: 10), and response mode (*Spoken Video* or *Written Text*).
   - Click **Start RAG Interview**.
4. Conduct the interview:
   - Each question is dynamically anchored to your verified projects and technical experience.
   - Submit spoken audio/video or type your technical response.
   - Receive instant evaluation with technical correctness, reasoning depth, relevance, clarity, strengths, and improvement suggestions.
5. Review the full interview report upon completion.
