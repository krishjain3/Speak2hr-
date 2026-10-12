"""
End-to-End API Route Tests for RAG Resume Feature
=================================================
Verifies FastAPI endpoints:
1. /api/resume/upload-rag
2. /api/resume/candidate/{candidate_id}
3. /api/interview/rag/generate-questions
4. /api/interview/rag/session/{session_id}
5. /api/interview/rag/evaluate-text-response
6. /api/interview/rag/session/{session_id}/report
7. Candidate authorization isolation
"""

import io
import uuid
import unittest
from fastapi.testclient import TestClient
from main import app
from database import init_db

SAMPLE_RESUME = """
SARAH CONNOR
sarah.connor@example.com | 555-123-4567 | Austin, TX

SUMMARY
Full-Stack Engineer with 5 years experience building cloud applications.

TECHNICAL SKILLS
Languages: Python, JavaScript, TypeScript
Frameworks: React, FastAPI, Node.js
Databases: PostgreSQL, Redis
DevOps: Docker, AWS

PROJECTS
Project: Real-Time Fleet Tracking Dashboard
Technologies: React, FastAPI, PostgreSQL, Redis, WebSocket
- Engineered real-time telemetry ingestion pipeline handling 5,000 GPS events per second.
- Integrated Redis Pub/Sub with WebSocket channels for live map vehicle location updates.
- Designed PostgreSQL schema with PostGIS spatial indexes to compute geofence entry and exit alerts.

Project: AI Customer Service Copilot
Technologies: Python, LangChain, OpenAI, FastAPI
- Built retrieval-augmented generation chatbot answering tier-1 support inquiries from internal documentation.
- Created vector search pipeline with chunking and semantic re-ranking, cutting ticket resolution time by 35%.

WORK EXPERIENCE
Software Engineer | SkyNet Systems
2020 - Present | Austin, TX
- Developed microservices in Python and FastAPI for automated inventory replenishment.
"""

class TestRagApiEndpoints(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        init_db()
        cls.client = TestClient(app)

    def test_e2e_rag_workflow(self):
        cand1 = f"cand_{uuid.uuid4().hex[:6]}"
        cand2 = f"cand_{uuid.uuid4().hex[:6]}"

        # 1. Upload valid resume
        file_content = io.BytesIO(SAMPLE_RESUME.encode("utf-8"))
        response = self.client.post(
            "/api/resume/upload-rag",
            data={"candidate_id": cand1},
            files={"file": ("sarah_resume.txt", file_content, "text/plain")}
        )
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertIn("resume_id", data)
        self.assertEqual(data["candidate_id"], cand1)
        self.assertGreater(data["chunks_count"], 0)
        resume_id = data["resume_id"]

        # 2. Get candidate resumes
        res_list = self.client.get(f"/api/resume/candidate/{cand1}")
        self.assertEqual(res_list.status_code, 200)
        res_data = res_list.json()
        self.assertEqual(len(res_data["resumes"]), 1)
        self.assertEqual(res_data["resumes"][0]["resume_id"], resume_id)

        # 3. Generate RAG interview questions
        gen_resp = self.client.post(
            "/api/interview/rag/generate-questions",
            json={
                "candidate_id": cand1,
                "resume_id": resume_id,
                "role": "Full-Stack Engineer",
                "num_questions": 8,
                "difficulty": "medium"
            }
        )
        self.assertEqual(gen_resp.status_code, 200)
        gen_data = gen_resp.json()
        self.assertIn("session_id", gen_data)
        session_id = gen_data["session_id"]
        questions = gen_data["questions"]
        self.assertGreaterEqual(len(questions), 4)

        # 4. Fetch session details
        sess_resp = self.client.get(f"/api/interview/rag/session/{session_id}?candidate_id={cand1}")
        self.assertEqual(sess_resp.status_code, 200)
        sess_data = sess_resp.json()
        self.assertEqual(sess_data["session_id"], session_id)
        self.assertEqual(len(sess_data["questions"]), len(questions))

        # 5. Unauthorized access check: Candidate 2 cannot access Candidate 1's session
        unauth_resp = self.client.get(f"/api/interview/rag/session/{session_id}?candidate_id={cand2}")
        self.assertEqual(unauth_resp.status_code, 403)

        # 6. Unauthorized generation check: Candidate 2 cannot use Candidate 1's resume
        unauth_gen = self.client.post(
            "/api/interview/rag/generate-questions",
            json={
                "candidate_id": cand2,
                "resume_id": resume_id,
                "role": "Full-Stack Engineer"
            }
        )
        self.assertEqual(unauth_gen.status_code, 403)

        # 7. Evaluate text answer
        q1 = questions[0]
        eval_resp = self.client.post(
            "/api/interview/rag/evaluate-text-response",
            json={
                "session_id": session_id,
                "candidate_id": cand1,
                "question_id": q1["question_id"],
                "question": q1["question"],
                "answer_text": "We configured Redis Pub/Sub channels to broadcast location updates to WebSocket clients connected to FastAPI nodes, maintaining low latency even with thousands of concurrent vehicles.",
                "category": q1["category"],
                "difficulty": q1["difficulty"],
                "expected_keywords": q1.get("expected_keywords", [])
            }
        )
        self.assertEqual(eval_resp.status_code, 200)
        eval_data = eval_resp.json()
        self.assertIn("scores", eval_data)
        self.assertGreaterEqual(eval_data["scores"]["overall"], 0.6)

        # 8. Fetch session report
        report_resp = self.client.get(f"/api/interview/rag/session/{session_id}/report?candidate_id={cand1}")
        self.assertEqual(report_resp.status_code, 200)
        report_data = report_resp.json()
        self.assertEqual(report_data["completed_questions"], 1)
        self.assertGreater(report_data["average_score"], 0)


if __name__ == "__main__":
    unittest.main()
