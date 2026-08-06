import os
import sys
import json
import argparse
import asyncio
import random
import re
from datetime import datetime, timezone
from pathlib import Path
from dotenv import load_dotenv
from google import genai

# Load environment variables from .env in ML directory
env_path = Path(__file__).parent / ".env"
load_dotenv(dotenv_path=env_path, override=True)

# Add current folder to sys.path
sys.path.append(str(Path(__file__).parent))
from question_bank_manager import (
    ROLE_FOLDER_MAP,
    ROLE_BLUEPRINT,
    validate_and_heal_role_bank,
    generate_questions_for_topic,
    build_metadata_document,
    write_role_question_bank,
    get_flat_question_list,
    load_role_metadata,
    classify_gemini_error,
)

class QuotaExceededException(Exception):
    pass

class GeminiClientCLI:
    def __init__(self, verbose=True):
        self.api_keys = []
        for i in range(1, 6):
            key = os.getenv(f"GOOGLE_API_KEY_{i}")
            if key:
                key = key.strip("'\"")
                self.api_keys.append(key)
        
        if not self.api_keys:
            fallback = os.getenv("GOOGLE_API_KEY")
            if fallback:
                fallback = fallback.strip("'\"")
                self.api_keys.append(fallback)
                
        self.verbose = verbose
        if self.verbose:
            print(f"Loaded {len(self.api_keys)} Gemini API keys successfully.")
            
        self.model_name = os.getenv("GEMINI_MODEL", "gemini-2.0-flash").strip("'\"")
        if self.verbose:
            print(f"Using model: {self.model_name}")
            
        self.clients = [genai.Client(api_key=k) for k in self.api_keys]
        self.current_index = 0
        
    def generate_content(self, client_type: str, contents: str, config=None):
        if not self.clients:
            print("ERROR: No Google API keys loaded! Please check ML/.env file.")
            sys.exit(1)
            
        tested_count = 0
        failures = []
        while tested_count < len(self.clients):
            key_index = self.current_index
            client = self.clients[key_index]
            
            print(f"Using API Key #{key_index + 1}...")
            
            try:
                kwargs = {
                    "model": self.model_name,
                    "contents": contents
                }
                if config:
                    kwargs["config"] = config
                    
                response = client.models.generate_content(**kwargs)
                return response
            except Exception as e:
                error_type = classify_gemini_error(e)
                error_detail = str(e)
                failures.append((key_index, error_type, error_detail))
                
                print(f"API Key #{key_index + 1} failed with error: {error_type}")
                
                if error_type in ("QUOTA EXCEEDED", "RATE LIMIT"):
                    print("Quota exceeded.")
                    self.current_index = (self.current_index + 1) % len(self.clients)
                    tested_count += 1
                    if tested_count < len(self.clients):
                        print(f"Switching to API Key #{self.current_index + 1}...")
                    continue
                else:
                    print(f"Generation failed due to non-quota error: {error_type}. Retries skipped.")
                    raise e
                    
        # If every API key fails
        print("\n=== API Key Failure Summary ===")
        for key_idx, err_type, err_det in failures:
            truncated_det = err_det.replace('\n', ' ')[:120] + '...' if len(err_det) > 120 else err_det.replace('\n', ' ')
            print(f"Key #{key_idx + 1}: {err_type} - {truncated_det}")
        print("================================")
        raise QuotaExceededException("Quota exceeded. All configured API keys are exhausted.")

def normalize_role(role_arg):
    if not role_arg:
        return None
    normalized = role_arg.lower().strip().replace(" ", "_").replace("-", "_")
    if normalized in ROLE_FOLDER_MAP.values():
        return normalized
    for friendly, folder in ROLE_FOLDER_MAP.items():
        friendly_norm = friendly.lower().strip().replace(" ", "_").replace("-", "_")
        if friendly_norm == normalized:
            return folder
    return None

def display_status():
    print("-" * 60)
    print(f"{'Role':<30} {'Status'}")
    print("-" * 60)
    
    for friendly, folder in ROLE_FOLDER_MAP.items():
        meta = load_role_metadata(folder)
        
        clean_bank, gaps = validate_and_heal_role_bank(folder)
        blueprint = ROLE_BLUEPRINT.get(folder, {})
        target_total = sum(sum(diff_blue.values()) for diff_blue in blueprint.values())
        
        if meta:
            total_current = meta.get("total_questions", 0)
        else:
            total_current = target_total - sum(gaps.values()) if gaps else 0

        if not gaps:
            status_str = "Completed"
        elif total_current == 0:
            status_str = "Not Generated"
        else:
            pct = (total_current / target_total) * 100 if target_total > 0 else 0
            status_str = f"{pct:.0f}% Complete"
            
        print(f"{friendly:<30} {status_str}")
        
    print("-" * 60)

def test_api_keys():
    api_keys = []
    for i in range(1, 6):
        key = os.getenv(f"GOOGLE_API_KEY_{i}")
        if key:
            key = key.strip("'\"")
            api_keys.append(key)
            
    if not api_keys:
        fallback = os.getenv("GOOGLE_API_KEY")
        if fallback:
            fallback = fallback.strip("'\"")
            api_keys.append(fallback)
            
    print(f"Loaded {len(api_keys)} Gemini API keys successfully.")
    model_name = os.getenv("GEMINI_MODEL", "gemini-2.0-flash").strip("'\"")
    print(f"Using model: {model_name}\n")
    
    for idx, key in enumerate(api_keys):
        try:
            client = genai.Client(api_key=key)
            response = client.models.generate_content(
                model=model_name,
                contents="Reply only with the word SUCCESS."
            )
            # Check response text
            if response.text and "success" in response.text.lower():
                print(f"Key {idx + 1} : SUCCESS")
            else:
                print(f"Key {idx + 1} : FAILED (Unexpected response: {response.text})")
        except Exception as e:
            import traceback
            print(f"Key {idx + 1} : ERROR")
            print("--- Diagnostic Info ---")
            print(f"1. Exception Type: {type(e).__module__}.{type(e).__name__}")
            print(f"2. Exception Message: {str(e)}")
            
            # Response Body
            res_body = "N/A"
            if hasattr(e, "response") and e.response is not None:
                res_body = getattr(e.response, "text", None) or getattr(e.response, "content", None)
            print(f"3. Response Body:\n{res_body}")
            
            # HTTP Status Code
            status_code = getattr(e, "code", None)
            if status_code is None and hasattr(e, "response") and e.response is not None:
                status_code = getattr(e.response, "status_code", None)
            print(f"4. HTTP Status Code: {status_code}")
            
            # Error Details
            err_details = getattr(e, "details", None)
            print(f"5. Error Details:\n{err_details}")
            
            print("\n--- Complete Raw Traceback ---")
            traceback.print_exc()
            print("-------------------------------\n")

async def generate_role(role_folder, client, force=False):
    blueprint = ROLE_BLUEPRINT.get(role_folder)
    friendly_name = [k for k, v in ROLE_FOLDER_MAP.items() if v == role_folder][0]
    
    print(f"Current role: {friendly_name}")
    
    clean_bank, gaps = validate_and_heal_role_bank(role_folder)
    meta = load_role_metadata(role_folder)
    if not meta:
        meta = build_metadata_document(role_folder, clean_bank)
        
    if force:
        clean_bank = {"role": role_folder, "easy": {}, "medium": {}, "hard": {}}
        gaps = {}
        for diff in ["easy", "medium", "hard"]:
            diff_blue = blueprint.get(diff, {})
            for topic, target in diff_blue.items():
                gaps[(diff, topic)] = target
                
    if not gaps:
        print(f"{friendly_name} question bank is already complete.")
        meta["generation_status"] = "completed"
        meta["last_generation_attempt"] = datetime.now(timezone.utc).isoformat()
        meta["completed_topics"] = list(meta["topics_completion"].keys())
        meta["remaining_topics"] = []
        write_role_question_bank(role_folder, clean_bank, meta)
        return True

    meta["generation_status"] = "in_progress"
    meta["last_generation_attempt"] = datetime.now(timezone.utc).isoformat()
    write_role_question_bank(role_folder, clean_bank, meta)
    
    flat_existing = get_flat_question_list(clean_bank)
    
    try:
        for (diff, topic), missing_count in list(gaps.items()):
            print(f"Generating topic: {topic}")
            print(f"Current API Key: #{client.current_index + 1}")
            
            def generate_content_fn(client_type, contents, config=None):
                return client.generate_content(client_type, contents, config)
                
            new_qs = await generate_questions_for_topic(
                role_folder, topic, diff, missing_count, generate_content_fn, flat_existing
            )
            
            if diff not in clean_bank:
                clean_bank[diff] = {}
            if topic not in clean_bank[diff]:
                clean_bank[diff][topic] = []
            clean_bank[diff][topic].extend(new_qs)
            
            flat_existing.extend([q["question"] for q in new_qs])
            
            # Save progress and update metadata
            meta = build_metadata_document(role_folder, clean_bank)
            meta["generation_status"] = "in_progress"
            meta["last_generation_attempt"] = datetime.now(timezone.utc).isoformat()
            write_role_question_bank(role_folder, clean_bank, meta)
            
            print(f"Saved {topic} ({len(clean_bank[diff][topic])}/{blueprint[diff][topic]})")
            
        # Finalize
        meta = build_metadata_document(role_folder, clean_bank)
        meta["generation_status"] = "completed"
        meta["last_generation_attempt"] = datetime.now(timezone.utc).isoformat()
        write_role_question_bank(role_folder, clean_bank, meta)
        print(f"\n{friendly_name} completed successfully.")
        return True

    except QuotaExceededException as qe:
        meta = build_metadata_document(role_folder, clean_bank)
        meta["generation_status"] = "paused"
        meta["last_generation_attempt"] = datetime.now(timezone.utc).isoformat()
        write_role_question_bank(role_folder, clean_bank, meta)
        print("\nQuota exceeded.")
        print("Generation paused.")
        print(f"Resume later by running:\npython generate_question_bank.py {role_folder}")
        raise qe
        
    except Exception as e:
        print(f"\nAn error occurred during generation: {e}")
        meta = build_metadata_document(role_folder, clean_bank)
        meta["generation_status"] = "failed"
        meta["last_generation_attempt"] = datetime.now(timezone.utc).isoformat()
        write_role_question_bank(role_folder, clean_bank, meta)
        raise e

async def main():
    if "-h" in sys.argv or "--help" in sys.argv:
        print("""
Speak2HR Question Bank Generator CLI

Usage:
  python generate_question_bank.py <role_name> [options]
  python generate_question_bank.py --all [options]
  python generate_question_bank.py --status
  python generate_question_bank.py --test-api

Available Commands:
  python generate_question_bank.py frontend_developer
      Generate or resume only the Frontend Developer question bank.

  python generate_question_bank.py data_scientist
      Generate or resume only the Data Scientist question bank.

  python generate_question_bank.py --all
      Generate all roles sequentially.

  python generate_question_bank.py --status
      Display the generation status of every role without calling Gemini.

  python generate_question_bank.py --test-api
      Verify each API key works by sending a tiny prompt (does not generate questions).

  python generate_question_bank.py frontend_developer --force
      Regenerate the Frontend Developer question bank from scratch.

Options:
  -h, --help    Show this help message and exit.
  --force       Force regeneration of the specified role(s) from scratch.
  --status      Display generation status of every role (no API calls).
  --all         Iterate and generate all roles sequentially.
  --test-api    Test all API keys and verify connectivity.
""")
        sys.exit(0)

    parser = argparse.ArgumentParser(add_help=False)
    parser.add_argument("role", nargs="?", help="The role to generate questions for")
    parser.add_argument("--all", action="store_true", help="Generate all roles sequentially")
    parser.add_argument("--status", action="store_true", help="Display status of every role")
    parser.add_argument("--test-api", action="store_true", help="Test API keys")
    parser.add_argument("--force", action="store_true", help="Force regeneration")
    args = parser.parse_args()

    if args.status:
        display_status()
        return

    if args.test_api:
        test_api_keys()
        return

    client = GeminiClientCLI()

    if args.all:
        print("Starting generation for all roles sequentially...")
        for role_friendly, role_folder in ROLE_FOLDER_MAP.items():
            try:
                await generate_role(role_folder, client, force=args.force)
            except QuotaExceededException:
                print(f"\nQuota exceeded. Stopped at role: '{role_friendly}'.")
                sys.exit(0)
            except Exception as e:
                print(f"\nError generating questions for '{role_friendly}': {e}")
                sys.exit(1)
        print("\nAll roles generated successfully.")
        return

    if not args.role:
        print("Error: Please specify a role to generate, or use --all, or use --status, or use --test-api.")
        print("Run with -h or --help for instructions.")
        sys.exit(1)

    role_folder = normalize_role(args.role)
    if not role_folder:
        print(f"Error: Invalid role name '{args.role}'.")
        print("Valid roles are:")
        for r in ROLE_FOLDER_MAP.values():
            print(f"  {r}")
        sys.exit(1)

    try:
        await generate_role(role_folder, client, force=args.force)
    except QuotaExceededException:
        sys.exit(1)
    except Exception:
        sys.exit(1)

if __name__ == "__main__":
    asyncio.run(main())
