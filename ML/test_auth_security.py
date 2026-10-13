import unittest
import time
import uuid
from fastapi.testclient import TestClient
from main import (
    app,
    hash_password,
    verify_password,
    create_jwt_token,
    verify_jwt_token,
)
from database import init_db, get_db_connection

class TestAuthSecurity(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        init_db()
        cls.client = TestClient(app)

    def test_password_hashing(self):
        password = "SecurePassword123!"
        hashed = hash_password(password)

        self.assertTrue(hashed.startswith("pbkdf2_sha256$"))
        self.assertNotEqual(password, hashed)
        self.assertTrue(verify_password(password, hashed))
        self.assertFalse(verify_password("WrongPassword!", hashed))

    def test_jwt_token_creation_and_verification(self):
        payload = {"sub": "user_123", "email": "test@example.com", "role": "candidate"}
        token = create_jwt_token(payload, expires_in_seconds=3600)

        self.assertIsInstance(token, str)
        self.assertEqual(len(token.split(".")), 3)

        decoded = verify_jwt_token(token)
        self.assertEqual(decoded["sub"], "user_123")
        self.assertEqual(decoded["email"], "test@example.com")
        self.assertEqual(decoded["role"], "candidate")

    def test_jwt_tampered_signature_rejected(self):
        token = create_jwt_token({"sub": "user_456"}, expires_in_seconds=3600)
        parts = token.split(".")
        # Tamper payload
        tampered = f"{parts[0]}.eyJzdWIiOiJhZG1pbiJ9.{parts[2]}"
        with self.assertRaises(ValueError):
            verify_jwt_token(tampered)

    def test_jwt_expired_token_rejected(self):
        # Create token that expired 10 seconds ago
        token = create_jwt_token({"sub": "user_expired"}, expires_in_seconds=-10)
        with self.assertRaises(ValueError):
            verify_jwt_token(token)

    def test_registration_hashes_password_in_db(self):
        email = f"user_{uuid.uuid4().hex[:8]}@example.com"
        password = "PlaintextPassword999!"

        resp = self.client.post("/api/auth/register", json={
            "name": "Test Candidate",
            "email": email,
            "password": password,
            "role": "candidate"
        })
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertIn("token", data)

        # Inspect database to verify password is NOT plaintext
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT password FROM users WHERE email=?", (email,))
        row = cursor.fetchone()
        conn.close()

        self.assertIsNotNone(row)
        stored_password = row["password"]
        self.assertNotEqual(stored_password, password)
        self.assertTrue(stored_password.startswith("pbkdf2_sha256$"))

    def test_forgot_password_does_not_expose_otp(self):
        email = f"user_{uuid.uuid4().hex[:8]}@example.com"
        self.client.post("/api/auth/register", json={
            "name": "OTP User",
            "email": email,
            "password": "Password123!",
            "role": "candidate"
        })

        # Request forgot-password
        resp = self.client.post("/api/auth/forgot-password", json={"email": email})
        # If email service isn't configured, returns safe 500 without leaking OTP
        # If successful, returns 200 without leaking OTP
        body = resp.text
        self.assertNotIn("otp", resp.json() if resp.status_code == 200 else {})
        self.assertNotIn("otp_debug", body)

if __name__ == "__main__":
    unittest.main()
