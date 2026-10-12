"""
Comprehensive Test Suite for Resume-Based RAG Interview Feature
================================================================
Uses standard library unittest to run seamlessly without plugin interference.
Covers all acceptance criteria:
1. Valid resume processed successfully.
2. Empty/unreadable resume handled gracefully.
3. Resume chunks & embeddings stored and reused (idempotent caching).
4. Multi-query targeted retrieval returns correct project context.
5. Questions based on correct project and verified resume evidence.
6. Cross-project contamination rejection (Tech in Project B not attributed to Project A).
7. Unsupported/fabricated technologies and projects rejected.
8. Duplicate and near-identical questions detected and removed.
9. Malformed Gemini responses handled safely.
10. Candidate authorization and isolation (candidate cannot access another's resume or session).
11. Generated questions persist across sessions.
12. Answer evaluation for technical correctness and depth.
"""

import os
import json
import uuid
import unittest

from database import init_db, get_db_connection
from rag_pipeline import (
    extract_text_from_bytes,
    clean_resume_text,
    chunk_resume_structurally,
    LocalEmbeddingEngine,
    store_candidate_resume,
    get_candidate_chunks,
    retrieve_targeted_resume_context,
    validate_question_evidence,
    deduplicate_questions,
    generate_resume_interview_questions,
    evaluate_candidate_answer,
    GeneratedQuestionItem,
    DocumentProcessingError
)

# Sample Adversarial Resume with distinct projects and segregated technology stacks
ADVERSARIAL_RESUME_TEXT = """
ALEXANDER CHEN
alex.chen@example.com | (555) 234-5678 | San Francisco, CA

SUMMARY
Senior Software Engineer with 6 years of experience building distributed backend systems and analytics platforms.

TECHNICAL SKILLS
Languages: Python, JavaScript, TypeScript, SQL
Backend: Django, FastAPI, Node.js, Express
Databases: PostgreSQL, MongoDB, Redis
Cloud & DevOps: Docker, AWS S3, GitHub Actions

PROJECTS

Project 1: Distributed E-Commerce Checkout Engine
Technologies: Python, Django, PostgreSQL, Redis, Celery
- Architected high-throughput checkout microservice processing 8,000 orders per minute during peak flash sales.
- Implemented Redis distributed locking and caching layer to prevent inventory overselling race conditions.
- Optimized PostgreSQL relational schema and database query indexing, cutting p99 query latency from 450ms to 65ms.
- Integrated Celery asynchronous worker queues for automated order confirmation and payment webhook retries.

Project 2: Clinical Healthcare Telemetry Portal
Technologies: Node.js, Express, MongoDB, Firebase
- Developed real-time patient vital monitoring dashboard integrating hospital IoT telemetry feeds.
- Configured Firebase Authentication with role-based access control (RBAC) ensuring strict HIPAA compliance for clinical staff.
- Designed document schemas in MongoDB using time-series collections for high-volume physiological sensor readings.
- Built WebSocket duplex event channels for sub-second critical arrhythmia alert dispatching.

WORK EXPERIENCE

Senior Backend Engineer | Apex Cloud Systems
June 2021 - Present | San Francisco, CA
- Spearheaded migration of legacy monolith to containerized microservices using Docker and FastAPI.
- Implemented automated CI/CD deployment pipelines using GitHub Actions, decreasing release cycle duration by 40%.

EDUCATION
B.S. in Computer Science | University of California, Berkeley | 2018
"""


class TestRagPipeline(unittest.TestCase):

    def setUp(self):
        init_db()

    # -------------------------------------------------------------------------
    # Test 1: Valid resume processed successfully
    # -------------------------------------------------------------------------
    def test_valid_resume_processing(self):
        cleaned = clean_resume_text(ADVERSARIAL_RESUME_TEXT)
        self.assertIn("ALEXANDER CHEN", cleaned)
        self.assertIn("Distributed E-Commerce Checkout Engine", cleaned)
        self.assertIn("Clinical Healthcare Telemetry Portal", cleaned)

        chunks = chunk_resume_structurally(cleaned)
        self.assertGreaterEqual(len(chunks), 3, "Resume should produce multiple structured chunks")
        
        project_chunks = [c for c in chunks if c["category"] == "project"]
        self.assertGreaterEqual(len(project_chunks), 2, "Both projects must be recognized as distinct project chunks")
        
        p1 = [c for c in project_chunks if "E-Commerce" in c["heading"]][0]
        self.assertTrue("django" in p1["technologies"] or "redis" in p1["technologies"])

    # -------------------------------------------------------------------------
    # Test 2: Empty or unreadable resume handled gracefully
    # -------------------------------------------------------------------------
    def test_empty_or_unreadable_resume_rejection(self):
        with self.assertRaises(DocumentProcessingError) as ctx_empty:
            extract_text_from_bytes(b"", "empty.txt")
        self.assertIn("no readable text", str(ctx_empty.exception).lower())

        with self.assertRaises(DocumentProcessingError) as ctx_white:
            extract_text_from_bytes(b"   \n\n\t   \n  ", "blank.txt")
        self.assertIn("no readable text", str(ctx_white.exception).lower())

        with self.assertRaises(DocumentProcessingError) as ctx_fmt:
            extract_text_from_bytes(b"some content", "file.xyz")
        self.assertIn("unsupported file format", str(ctx_fmt.exception).lower())

    # -------------------------------------------------------------------------
    # Test 3: Resume chunks and embeddings are stored and reused (idempotent caching)
    # -------------------------------------------------------------------------
    def test_resume_chunks_storage_and_caching(self):
        cand_id = f"cand_test_{uuid.uuid4().hex[:6]}"
        file_bytes = ADVERSARIAL_RESUME_TEXT.encode("utf-8")
        
        res_id1, is_cached1 = store_candidate_resume(
            candidate_id=cand_id,
            filename="alex_chen_resume.txt",
            raw_text=ADVERSARIAL_RESUME_TEXT,
            file_bytes=file_bytes
        )
        self.assertFalse(is_cached1)
        self.assertTrue(res_id1.startswith("res_"))

        chunks1 = get_candidate_chunks(cand_id, res_id1)
        self.assertGreater(len(chunks1), 0)
        self.assertEqual(len(chunks1[0]["embedding"]), LocalEmbeddingEngine.DIM)

        # Second upload with identical bytes: should reuse cached resume without reindexing
        res_id2, is_cached2 = store_candidate_resume(
            candidate_id=cand_id,
            filename="alex_chen_resume.txt",
            raw_text=ADVERSARIAL_RESUME_TEXT,
            file_bytes=file_bytes
        )
        self.assertTrue(is_cached2)
        self.assertEqual(res_id1, res_id2)

    # -------------------------------------------------------------------------
    # Test 4: Retrieval returns correct project context via multi-query targeted search
    # -------------------------------------------------------------------------
    def test_multi_query_targeted_retrieval(self):
        cand_id = f"cand_test_{uuid.uuid4().hex[:6]}"
        file_bytes = ADVERSARIAL_RESUME_TEXT.encode("utf-8")
        res_id, _ = store_candidate_resume(cand_id, "resume.txt", ADVERSARIAL_RESUME_TEXT, file_bytes)

        retrieved, formatted = retrieve_targeted_resume_context(
            candidate_id=cand_id,
            resume_id=res_id,
            target_role="Backend Developer"
        )

        self.assertGreater(len(retrieved), 0)
        self.assertIn("EXCERPT", formatted)
        self.assertTrue("E-Commerce" in formatted or "Checkout" in formatted)
        self.assertTrue("Healthcare" in formatted or "Telemetry" in formatted)

    # -------------------------------------------------------------------------
    # Test 5 & 6 & 7: Evidence grounding & Cross-project contamination rejection
    # -------------------------------------------------------------------------
    def test_cross_project_contamination_rejection(self):
        """
        CRITICAL ADVERSARIAL TEST:
        Firebase Authentication belongs to Project 2 (Healthcare Telemetry Portal).
        If a generated question attributes Firebase Authentication to Project 1 (E-Commerce),
        the server-side evidence validator MUST reject it!
        """
        cand_id = f"cand_test_{uuid.uuid4().hex[:6]}"
        file_bytes = ADVERSARIAL_RESUME_TEXT.encode("utf-8")
        res_id, _ = store_candidate_resume(cand_id, "resume.txt", ADVERSARIAL_RESUME_TEXT, file_bytes)
        chunks = get_candidate_chunks(cand_id, res_id)

        # Question 1: Cross-project attribution bug
        bad_question_1 = GeneratedQuestionItem(
            question="In your Distributed E-Commerce Checkout Engine, how did you configure Firebase Authentication to secure checkout orders?",
            project_or_context="Distributed E-Commerce Checkout Engine",
            supporting_evidence="Configured Firebase Authentication with role-based access control (RBAC)",
            category="project_deep_dive",
            difficulty="hard",
            expected_keywords=["firebase", "auth"],
            relevance_explanation="Testing cross contamination"
        )
        is_valid_1, reason_1 = validate_question_evidence(bad_question_1, ADVERSARIAL_RESUME_TEXT, chunks)
        self.assertFalse(is_valid_1, "Cross-project technology attribution must be rejected")
        self.assertTrue("attribution error" in reason_1.lower() or "not found" in reason_1.lower())

        # Question 2: Fabricated technology not in resume
        bad_question_2 = GeneratedQuestionItem(
            question="How did you use Kubernetes clusters and GraphQL subscriptions to scale your database?",
            project_or_context="Distributed E-Commerce Checkout Engine",
            supporting_evidence="Architected Kubernetes clusters with GraphQL subscriptions",
            category="architecture_design",
            difficulty="hard",
            expected_keywords=["kubernetes", "graphql"],
            relevance_explanation="Testing fabricated tech"
        )
        is_valid_2, _ = validate_question_evidence(bad_question_2, ADVERSARIAL_RESUME_TEXT, chunks)
        self.assertFalse(is_valid_2, "Fabricated evidence and technology must be rejected")

        # Question 3: Non-existent project
        bad_question_3 = GeneratedQuestionItem(
            question="In your Autonomous Drone Navigation project, what pathfinding algorithm did you use?",
            project_or_context="Autonomous Drone Navigation",
            supporting_evidence="Autonomous Drone Navigation using A* search",
            category="project_deep_dive",
            difficulty="hard",
            expected_keywords=["drone", "pathfinding"],
            relevance_explanation="Non-existent project"
        )
        is_valid_3, _ = validate_question_evidence(bad_question_3, ADVERSARIAL_RESUME_TEXT, chunks)
        self.assertFalse(is_valid_3, "Non-existent project context must be rejected")

        # Question 4: Legitimate evidence-grounded question on Project 1
        good_question_1 = GeneratedQuestionItem(
            question="In your Distributed E-Commerce Checkout Engine, how did you implement Redis distributed locking to prevent inventory overselling race conditions?",
            project_or_context="Distributed E-Commerce Checkout Engine",
            supporting_evidence="Implemented Redis distributed locking and caching layer to prevent inventory overselling race conditions.",
            category="project_deep_dive",
            difficulty="hard",
            expected_keywords=["redis", "distributed lock", "race condition"],
            relevance_explanation="Directly tests Redis locking implemented in Project 1."
        )
        is_valid_good, reason_good = validate_question_evidence(good_question_1, ADVERSARIAL_RESUME_TEXT, chunks)
        self.assertTrue(is_valid_good, f"Legitimate question should be accepted: {reason_good}")

        # Question 5: Legitimate evidence-grounded question on Project 2
        good_question_2 = GeneratedQuestionItem(
            question="In your Clinical Healthcare Telemetry Portal, how did you structure MongoDB time-series collections for physiological sensor telemetry?",
            project_or_context="Clinical Healthcare Telemetry Portal",
            supporting_evidence="Designed document schemas in MongoDB using time-series collections for high-volume physiological sensor readings.",
            category="technical_implementation",
            difficulty="medium",
            expected_keywords=["mongodb", "time-series", "schemas"],
            relevance_explanation="Directly tests MongoDB time-series in Project 2."
        )
        is_valid_good2, reason_good2 = validate_question_evidence(good_question_2, ADVERSARIAL_RESUME_TEXT, chunks)
        self.assertTrue(is_valid_good2, f"Legitimate question 2 should be accepted: {reason_good2}")

    # -------------------------------------------------------------------------
    # Test 8: Duplicate and near-identical questions detected and filtered
    # -------------------------------------------------------------------------
    def test_duplicate_question_detection(self):
        q1 = GeneratedQuestionItem(
            question="How did you implement Redis distributed locking to prevent inventory overselling race conditions?",
            project_or_context="Project 1",
            supporting_evidence="Redis distributed locking",
            category="project",
            relevance_explanation="Redis question"
        )
        q2 = GeneratedQuestionItem(
            question="How did you implement Redis distributed locks to prevent inventory overselling race condition bugs?",
            project_or_context="Project 1",
            supporting_evidence="Redis distributed locking",
            category="project",
            relevance_explanation="Redis duplicate"
        )
        q3 = GeneratedQuestionItem(
            question="How did you optimize PostgreSQL query indexing to reduce p99 query latency?",
            project_or_context="Project 1",
            supporting_evidence="Optimized PostgreSQL relational schema",
            category="project",
            relevance_explanation="Postgres question"
        )

        deduped = deduplicate_questions([q1, q2, q3], threshold=0.75)
        self.assertEqual(len(deduped), 2, "Near-identical questions must be deduplicated")
        self.assertTrue(any("PostgreSQL" in q.question for q in deduped))

    # -------------------------------------------------------------------------
    # Test 9: Malformed Gemini responses handled safely
    # -------------------------------------------------------------------------
    def test_malformed_gemini_response_handling(self):
        cand_id = f"cand_test_{uuid.uuid4().hex[:6]}"
        file_bytes = ADVERSARIAL_RESUME_TEXT.encode("utf-8")
        res_id, _ = store_candidate_resume(cand_id, "resume.txt", ADVERSARIAL_RESUME_TEXT, file_bytes)

        def broken_mock_caller(prompt):
            return "Not JSON at all! Some random model output with invalid syntax {['"

        result = generate_resume_interview_questions(
            candidate_id=cand_id,
            resume_id=res_id,
            target_role="Backend Developer",
            num_questions=6,
            difficulty="medium",
            gemini_client_caller=broken_mock_caller
        )

        self.assertGreaterEqual(result["total_questions"], 3)
        self.assertGreaterEqual(len(result["questions"]), 3)
        for q in result["questions"]:
            self.assertTrue(q["question_id"].startswith("rag_q_"))
            self.assertGreater(len(q["question"]), 15)

    # -------------------------------------------------------------------------
    # Test 10: Candidate authorization isolation
    # -------------------------------------------------------------------------
    def test_candidate_authorization_isolation(self):
        cand1 = f"cand_user_1_{uuid.uuid4().hex[:6]}"
        cand2 = f"cand_user_2_{uuid.uuid4().hex[:6]}"
        file_bytes = ADVERSARIAL_RESUME_TEXT.encode("utf-8")

        res_id1, _ = store_candidate_resume(cand1, "resume1.txt", ADVERSARIAL_RESUME_TEXT, file_bytes)

        chunks_cand1 = get_candidate_chunks(cand1, res_id1)
        self.assertGreater(len(chunks_cand1), 0)

        chunks_cand2 = get_candidate_chunks(cand2, res_id1)
        self.assertEqual(len(chunks_cand2), 0, "Candidate 2 must not see Candidate 1's chunks")

        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT candidate_id FROM candidate_resumes WHERE id = ?", (res_id1,))
        owner = cursor.fetchone()["candidate_id"]
        conn.close()
        self.assertEqual(owner, cand1)
        self.assertNotEqual(owner, cand2)

    # -------------------------------------------------------------------------
    # Test 11: Generated questions persist across sessions
    # -------------------------------------------------------------------------
    def test_generated_questions_persistence(self):
        cand_id = f"cand_test_{uuid.uuid4().hex[:6]}"
        file_bytes = ADVERSARIAL_RESUME_TEXT.encode("utf-8")
        res_id, _ = store_candidate_resume(cand_id, "resume.txt", ADVERSARIAL_RESUME_TEXT, file_bytes)

        result = generate_resume_interview_questions(
            candidate_id=cand_id,
            resume_id=res_id,
            target_role="Senior Backend Engineer",
            num_questions=8
        )

        session_id = result["session_id"]
        
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM resume_interview_sessions WHERE id = ?", (session_id,))
        session_row = cursor.fetchone()
        conn.close()

        self.assertIsNotNone(session_row)
        self.assertEqual(session_row["candidate_id"], cand_id)
        self.assertEqual(session_row["total_questions"], result["total_questions"])
        
        saved_questions = json.loads(session_row["questions_json"])
        self.assertEqual(len(saved_questions), result["total_questions"])
        self.assertEqual(saved_questions[0]["question"], result["questions"][0]["question"])

    # -------------------------------------------------------------------------
    # Test 12: Candidate Answer Evaluation
    # -------------------------------------------------------------------------
    def test_candidate_answer_evaluation(self):
        question = "In your Distributed E-Commerce Checkout Engine, how did you implement Redis distributed locking to prevent inventory overselling race conditions?"
        good_answer = (
            "We used Redlock with SET key value NX PX to acquire locks with an atomic expiration timeout. "
            "Before mutating inventory in PostgreSQL, the worker acquires the lock for that specific SKU. "
            "If another concurrent checkout request attempts to acquire the lock, it backs off with exponential jitter. "
            "Once the inventory decrement transaction commits, the lock is released via a Lua script verifying the lock token."
        )
        expected_kw = ["redis", "distributed lock", "atomic", "timeout", "sku", "lua script"]

        eval_result = evaluate_candidate_answer(
            question_text=question,
            answer_text=good_answer,
            difficulty="hard",
            category="technical",
            expected_keywords=expected_kw
        )

        self.assertGreaterEqual(eval_result["technical_accuracy"], 0.70)
        self.assertGreaterEqual(eval_result["overall_score"], 0.70)
        self.assertGreater(len(eval_result["strengths"]), 0)

        poor_answer = "I don't know much about Redis, I just used it like a database."
        eval_poor = evaluate_candidate_answer(
            question_text=question,
            answer_text=poor_answer,
            difficulty="hard",
            category="technical",
            expected_keywords=expected_kw
        )

        self.assertLess(eval_poor["overall_score"], 0.65)
        self.assertGreater(len(eval_poor["improvements"]), 0)


if __name__ == "__main__":
    unittest.main()
