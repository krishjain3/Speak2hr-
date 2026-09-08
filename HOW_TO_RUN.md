# Speak2HR Reproducibility Guide

This document provides step-by-step instructions to set up and run the **Speak2HR** application locally with its **Java Spring Boot** backend and **React** frontend.

## 📋 Prerequisites

Before starting, ensure you have the following installed:
- **Java 17+ / Java 21 JDK**: [Download Java](https://www.oracle.com/java/technologies/downloads/)
- **Node.js 16+ & npm**: [Download Node.js](https://nodejs.org/)
- **MongoDB** (Optional, embedded seeding available): [Download MongoDB Community](https://www.mongodb.com/try/download/community)
- **Google Gemini API Keys**: You can configure at least one (ideally up to 5) API key from [Google AI Studio](https://aistudio.google.com/).

---

## ⚡ Quick Start (Windows)

If you are on Windows, double-click **`run_locally.bat`** in the root directory:

1. The script will:
   - Check Java and Node.js prerequisites.
   - Install frontend dependencies (`npm install`).
   - Launch the Spring Boot backend (`mvnw.cmd spring-boot:run`) on port 8000.
   - Launch the React frontend (`npm start`) on port 3000.
2. The application will be available at:
   - **Frontend**: [http://localhost:3000](http://localhost:3000)
   - **Backend Health Check**: [http://localhost:8000/health](http://localhost:8000/health)

---

## 🛠️ Manual Setup

### 1. Java Spring Boot Backend Setup

1. Open a terminal in the project root directory:
2. Configure Environment Variables (optional, inside `src/main/resources/application.properties` or environment variables):
   ```bash
   # Set your Gemini API key (optional, fallback generated if unconfigured)
   export GEMINI_API_KEY_1=your_gemini_api_key
   ```
3. Build and run the Spring Boot backend:
   ```bash
   # On Windows
   .\mvnw.cmd spring-boot:run

   # On Linux/macOS
   ./mvnw spring-boot:run
   ```
4. Verify backend health by visiting [http://localhost:8000/health](http://localhost:8000/health).

### 2. Frontend Setup

1. Open a new terminal and navigate to the `frontend` directory:
   ```bash
   cd frontend
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Ensure `REACT_APP_API_URL` points to `http://localhost:8000`.
4. Start the React development server:
   ```bash
   npm start
   ```

---

## 🔍 Pre-seeded Credentials for Testing

- **Admin User**: `admin@company.com` / `admin123`
- **HR Manager**: `hr@speak2hr.com` / `password123`
- **Candidate User**: `candidate@speak2hr.com` / `password123`
