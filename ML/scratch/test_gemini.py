import os
import sys
from dotenv import load_dotenv
from google import genai

# Load env
load_dotenv(dotenv_path="../.env")

API_KEYS = {
    "primary": os.getenv("GOOGLE_API_KEY_1"),
    "secondary": os.getenv("GOOGLE_API_KEY_2"),
    "tertiary": os.getenv("GOOGLE_API_KEY_3"),
    "assessment": os.getenv("GOOGLE_API_KEY_4"),
    "emotion": os.getenv("GOOGLE_API_KEY_5")
}

model_name = os.getenv("GEMINI_MODEL", "gemini-2.5-flash")
print(f"Using model: {model_name}")

for name, key in API_KEYS.items():
    if not key:
        print(f"Key {name} is missing")
        continue
    try:
        client = genai.Client(api_key=key)
        response = client.models.generate_content(
            model=model_name,
            contents="Say Hello!"
        )
        print(f"Key '{name}' works! Response: {response.text.strip()}")
    except Exception as e:
        print(f"Key '{name}' FAILED: {str(e)}")
