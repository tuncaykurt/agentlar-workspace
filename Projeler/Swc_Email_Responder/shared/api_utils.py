import time
import requests
from googleapiclient.errors import HttpError
import traceback

def retry_api_call(max_retries=3, base_delay=2, exceptions=(Exception,)):
    """
    Decorator for retrying API calls with exponential backoff.
    Saves Google API HttpError, Request exceptions, etc.
    """
    def decorator(func):
        def wrapper(*args, **kwargs):
            last_err = None
            for attempt in range(max_retries):
                try:
                    return func(*args, **kwargs)
                except exceptions as e:
                    last_err = e
                    delay = base_delay * (2 ** attempt)
                    print(f"  🔄 API Call failed (Attempt {attempt+1}/{max_retries}) in {func.__name__} - {type(e).__name__}: {str(e)[:100]}. Waiting {delay}s...")
                    time.sleep(delay)
            print(f"  ❌ API Call failed permanently after {max_retries} retries in {func.__name__}")
            if last_err:
                raise last_err
            raise RuntimeError("API Call failed")
        return wrapper
    return decorator

def execute_google_api(request_obj, max_retries=3, base_delay=2):
    """
    Executes a Google API request object with retry mechanism.
    Usage: execute_google_api(gmail_service.users().threads().list(...))
    """
    last_err = None
    for attempt in range(max_retries):
        try:
            return request_obj.execute()
        except HttpError as e:
            last_err = e
            # Only retry 5xx errors or 429 rate limits
            if e.resp.status in [429, 500, 502, 503, 504]:
                delay = base_delay * (2 ** attempt)
                print(f"  🔄 Google API Transient Error {e.resp.status} (Attempt {attempt+1}/{max_retries}). Waiting {delay}s...")
                time.sleep(delay)
            else:
                # 400, 401, 403, 404 vs direkt fırlat
                raise e
        except Exception as e:
            last_err = e
            delay = base_delay * (2 ** attempt)
            print(f"  🔄 Google API Network Error (Attempt {attempt+1}/{max_retries}): {e}. Waiting {delay}s...")
            time.sleep(delay)
            
    print(f"  ❌ Google API request failed permanently after {max_retries} retries.")
    if last_err:
        raise last_err
    raise RuntimeError("API Call failed")
