import os
import json
import google.generativeai as genai
from PIL import Image
from src.config import GEMINI_API_KEY, logger

class VisualAnalyzer:
    def __init__(self):
        if not GEMINI_API_KEY:
            logger.warning("GEMINI_API_KEY not found in config. Ensure it is set in .env")
        else:
            genai.configure(api_key=GEMINI_API_KEY)
            
        # We can use gemini-1.5-pro or gemini-2.0-flash-lite. Let's start with gemini-2.5-flash if available, or just gemini-1.5-pro.
        # "gemini-1.5-pro" is great for visual reasoning.
        try:
            self.model = genai.GenerativeModel('gemini-2.5-pro')
        except Exception as e:
            logger.error(f"Failed to initialize Gemini model: {e}")
            self.model = None

    def analyze_and_improve_prompt(self, image_path: str, original_prompt: str, context: str = "") -> dict:
        """
        Analyzes the generated image against the original prompt and suggests a better prompt if needed.
        
        Returns a dict with:
            - "analysis": str (the evaluation of the image)
            - "needs_improvement": bool
            - "improved_prompt": str (the new prompt, or original if no improvement needed)
        """
        if not self.model:
            logger.error("Gemini model not initialized.")
            return {"analysis": "Error", "needs_improvement": False, "improved_prompt": original_prompt}

        if not os.path.exists(image_path):
            logger.error(f"Image not found at {image_path}")
            return {"analysis": "File not found", "needs_improvement": False, "improved_prompt": original_prompt}

        try:
            img = Image.open(image_path)
            
            system_instruction = (
                "You are an expert AI prompt engineer specializing in visual image generation. "
                "Your task is to analyze the provided image to see if it perfectly fulfills the given prompt. "
                "If there are artifacts, missing elements, or deviations from the prompt, explain them briefly. "
                "Then, provide a newly improved prompt that will result in a better outcome. "
                "Return the result strictly as a JSON block with the following keys:\n"
                "- \"analysis\": (string) brief evaluation of the image\n"
                "- \"score\": (integer) 1 to 10 rating of how well it matches the prompt\n"
                "- \"needs_improvement\": (boolean) true if you think a better prompt will help, false if the image is basically perfect\n"
                "- \"improved_prompt\": (string) the new prompt you suggest (or the original if no change needed)\n"
                "Do not include any text outside the JSON block."
            )
            
            user_message = f"Original Prompt Used:\n{original_prompt}\n"
            if context:
                user_message += f"\nAdditional Context:\n{context}\n"
            
            prompt_parts = [system_instruction, user_message, img]
            
            logger.info(f"Sending visual analysis request to Gemini for {os.path.basename(image_path)}...")
            response = self.model.generate_content(prompt_parts)
            
            return self._parse_json_response(response.text, original_prompt)
            
        except Exception as e:
            logger.error(f"Visual analysis failed: {e}")
            return {"analysis": f"API Error: {e}", "needs_improvement": False, "improved_prompt": original_prompt}

    def _parse_json_response(self, text: str, original_prompt: str) -> dict:
        # Tries to extract JSON from the response
        try:
            # clean backticks if present
            clean_text = text.strip()
            if clean_text.startswith("```json"):
                clean_text = clean_text[7:]
            elif clean_text.startswith("```"):
                clean_text = clean_text[3:]
            if clean_text.endswith("```"):
                clean_text = clean_text[:-3]
                
            data = json.loads(clean_text.strip())
            
            if "improved_prompt" not in data:
                data["improved_prompt"] = original_prompt
                
            return data
            
        except json.JSONDecodeError:
            logger.error(f"Failed to parse JSON from Gemini. Raw response:\n{text}")
            return {
                "analysis": "Failed to parse JSON", 
                "needs_improvement": False, 
                "improved_prompt": original_prompt
            }
