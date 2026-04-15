"""
Groq LLM Client — Akıllı email analizi ve draft üretimi
========================================================
Groq API üzerinden GPT-OSS modeli ile:
1. Email intent tespiti (sınıflandırma)
2. Draft üretimi
3. Draft review (kalite kontrol + yeniden yazma)

Draft Review Mekanizması:
- İlk draft üretilir (hızlı, ucuz)
- Eğer confidence düşükse veya review gerekiyorsa, 
  aynı LLM ile draft review edilip ikinci versiyonu yazılır
- Bu, maliyet-etkin bir kalite kontrol sağlar
"""

import os
import json
import time
import requests

GROQ_API_KEY = os.environ.get('GROQ_API_KEY', '')
GROQ_BASE_URL = os.environ.get('GROQ_BASE_URL', 'https://api.groq.com/openai/v1')
GROQ_MODEL = os.environ.get('GROQ_MODEL', 'openai/gpt-oss-120b')

# Retry ayarları
MAX_RETRIES = 3
RETRY_BASE_DELAY = 2  # saniye (exponential: 2s → 4s → 8s)


def _call_groq(messages, temperature=0.3, max_tokens=1000):
    """
    Groq API'ye istek gönder — retry mekanizması ile.
    
    Retry stratejisi:
    - 429 (rate limit): Exponential backoff ile tekrar dene
    - 400 (bad request): Prompt'u kısaltarak tekrar dene (max_tokens düşür)
    - 5xx (server error): Exponential backoff ile tekrar dene
    - Timeout: Timeout süresini artırarak tekrar dene
    """
    if not GROQ_API_KEY:
        print("  ⚠️ GROQ_API_KEY bulunamadı — LLM devre dışı, rule-based fallback kullanılıyor.")
        return None
    
    last_error = None
    current_max_tokens = max_tokens
    current_timeout = 15
    
    for attempt in range(MAX_RETRIES):
        try:
            # Retry mesajları kısaltma: 400 hatasında content'i truncate et
            retry_messages = messages
            if attempt > 0 and last_error and "400" in str(last_error):
                # Prompt'u kısaltarak tekrar dene
                retry_messages = _truncate_messages(messages, attempt)
                current_max_tokens = max(500, max_tokens - (attempt * 200))
                print(f"  🔄 Retry {attempt}/{MAX_RETRIES}: prompt kısaltıldı, max_tokens={current_max_tokens}")
            elif attempt > 0:
                delay = RETRY_BASE_DELAY * (2 ** (attempt - 1))
                print(f"  🔄 Retry {attempt}/{MAX_RETRIES}: {delay}s bekleniyor...")
                time.sleep(delay)
            
            response = requests.post(
                f"{GROQ_BASE_URL}/chat/completions",
                headers={
                    "Authorization": f"Bearer {GROQ_API_KEY}",
                    "Content-Type": "application/json",
                },
                json={
                    "model": GROQ_MODEL,
                    "messages": retry_messages,
                    "temperature": temperature,
                    "max_tokens": current_max_tokens,
                    "response_format": {"type": "json_object"},
                },
                timeout=current_timeout,
            )
            response.raise_for_status()
            content = response.json()["choices"][0]["message"]["content"]
            return json.loads(content)
        
        except requests.exceptions.Timeout:
            last_error = "timeout"
            current_timeout += 10  # Her retry'da timeout'u artır
            if attempt < MAX_RETRIES - 1:
                print(f"  ⏱️ Timeout — retry {attempt + 1}/{MAX_RETRIES} (timeout={current_timeout}s)")
                continue
            print("  ⚠️ Groq API timeout (tüm denemeler tükendi) — rule-based fallback kullanılıyor.")
            return None
        
        except requests.exceptions.HTTPError as e:
            status_code = e.response.status_code if e.response is not None else 0
            last_error = str(e)
            
            # Rate limit — bekle ve tekrar dene
            if status_code == 429:
                retry_after = int(e.response.headers.get("Retry-After", RETRY_BASE_DELAY * (2 ** attempt)))
                if attempt < MAX_RETRIES - 1:
                    print(f"  ⏳ Rate limit — {retry_after}s bekleniyor (retry {attempt + 1}/{MAX_RETRIES})")
                    time.sleep(retry_after)
                    continue
            
            # Bad request — prompt kısaltarak tekrar dene
            elif status_code == 400:
                if attempt < MAX_RETRIES - 1:
                    continue  # Üstteki truncate logic ile tekrar deneyecek
            
            # Server error — exponential backoff
            elif status_code >= 500:
                if attempt < MAX_RETRIES - 1:
                    delay = RETRY_BASE_DELAY * (2 ** attempt)
                    print(f"  🔄 Server error {status_code} — {delay}s bekleniyor (retry {attempt + 1}/{MAX_RETRIES})")
                    time.sleep(delay)
                    continue
            
            print(f"  ⚠️ Groq API hatası: {e} — rule-based fallback kullanılıyor.")
            return None
        
        except json.JSONDecodeError as e:
            last_error = str(e)
            if attempt < MAX_RETRIES - 1:
                print(f"  🔄 JSON parse hatası — retry {attempt + 1}/{MAX_RETRIES}")
                time.sleep(RETRY_BASE_DELAY)
                continue
            print(f"  ⚠️ Groq API JSON hatası: {e} — rule-based fallback kullanılıyor.")
            return None
        
        except Exception as e:
            last_error = str(e)
            if attempt < MAX_RETRIES - 1:
                delay = RETRY_BASE_DELAY * (2 ** attempt)
                print(f"  🔄 Beklenmeyen hata — {delay}s bekleniyor (retry {attempt + 1}/{MAX_RETRIES})")
                time.sleep(delay)
                continue
            print(f"  ⚠️ Groq API hatası: {e} — rule-based fallback kullanılıyor.")
            return None
    
    return None


def _truncate_messages(messages, attempt):
    """
    400 hatası aldığında mesajları kısalt.
    Her attempt'te daha agresif kısaltma yapar.
    """
    truncated = []
    # Her attempt'te content'i daha fazla kısalt
    max_content_len = max(500, 2000 - (attempt * 500))
    
    for msg in messages:
        new_msg = {"role": msg["role"]}
        content = msg.get("content", "")
        if len(content) > max_content_len and msg["role"] == "user":
            new_msg["content"] = content[:max_content_len] + "\n\n[...truncated for API limits...]"
        elif len(content) > max_content_len * 2 and msg["role"] == "system":
            # System prompt'u da kısalt ama daha az agresif
            new_msg["content"] = content[:max_content_len * 2]
        else:
            new_msg["content"] = content
        truncated.append(new_msg)
    
    return truncated


def classify_thread_type(first_message_subject, first_message_body):
    """
    Thread'in ilk mesajını analiz ederek Creative Sourcing mi 
    yoksa Influencer Program mı olduğunu belirle.
    
    Returns: {"type": "CREATIVE_SOURCING" | "INFLUENCER_PROGRAM", "confidence": 0.0-1.0}
    """
    messages = [
        {
            "role": "system",
            "content": """You are an email classifier for Sweatcoin's marketing team.
Your job is to classify outreach emails into two categories:

CREATIVE_SOURCING: We initially reached out about video collaboration / content creation.
Signals: collaboration inquiry, video integration, "your exact style", creative brief,
UGC, content creation, promotional video.
IMPORTANT: Even if our initial outreach mentioned 'collaboration', [İSİM] usually
explains that the program is PERFORMANCE-BASED (per install), NOT upfront paid.

INFLUENCER_PROGRAM: We are inviting creators to join our free affiliate program.
Signals: download the app, sign up, unique link, earn cash, performance basis,
per install, invite, influencer hub, tracking, gaming creators.

NOTE: Both programs ultimately operate on a PERFORMANCE BASIS. The main difference
is the initial outreach style, not the payment model.

Respond in JSON: {"type": "CREATIVE_SOURCING" or "INFLUENCER_PROGRAM", "confidence": 0.0-1.0, "reason": "brief explanation"}"""
        },
        {
            "role": "user",
            "content": f"Subject: {first_message_subject}\n\nBody:\n{first_message_body[:2000]}"
        }
    ]
    
    result = _call_groq(messages, temperature=0.1)
    if result and "type" in result:
        return result
    return None


def analyze_reply_intent(reply_body, reply_subject, context_type, agent_knowledge=""):
    """
    Gelen yanıtın niyetini (intent) analiz et.
    
    context_type: "CREATIVE_SOURCING" veya "INFLUENCER_PROGRAM"
    agent_knowledge: Agent'ın bilgi tabanından ek bağlam
    
    Returns: {"intent": str, "confidence": 0.0-1.0, "details": dict}
    """
    if context_type == "CREATIVE_SOURCING":
        intent_options = """
PRICE_SHARED: Creator shared their rate/pricing or is asking about payment
COUNTER_OFFER: Creator wants upfront/sponsored payment instead of performance basis
VIDEO_SENT: Creator sent a video or file link
INTERESTED: Creator is interested and wants to proceed (positive response)
QUESTION: Specific question about the app, brief, timeline, format, what Sweatcoin is
CONTRACT_QUESTION: Question about contract/agreement
NOT_INTERESTED: Creator is not interested
AUTO_REPLY: Out of office / vacation auto-reply
BOUNCE: Delivery failure / address not found
UNCLEAR: Cannot determine intent

IMPORTANT: If the creator asks 'what is Sweatcoin?' or 'what do I need to do?'
that is QUESTION, not INTERESTED. If they ask about rates/budget, that is
COUNTER_OFFER (they want upfront pay)."""
    else:
        intent_options = """
INTERESTED: Wants to join the program / sounds positive / wants to get started
PAID_ONLY: Only wants paid/sponsored work, no performance
NOT_INTERESTED: Not interested at all
PAYMENT_COMPLAINT: ONLY if they have an EXISTING account and report a specific
  payment/withdrawal failure. If they just mention wanting money or haven't
  started yet, use INTERESTED instead.
INFO_REQUEST: Asking questions about how it works
REWARD_QUESTION: Question about rewards/payouts
AUTO_REPLY: Out of office / vacation auto-reply
BOUNCE: Delivery failure / address not found
UNCLEAR: Cannot determine intent

CRITICAL RULE: If someone just mentions they want to earn money or are frustrated
but haven't signed up yet, classify as INTERESTED (they need onboarding), NOT as
PAYMENT_COMPLAINT. PAYMENT_COMPLAINT is ONLY for people who already have an
account and report a specific technical issue with receiving money."""

    messages = [
        {
            "role": "system",
            "content": f"""You are an email intent analyzer for Sweatcoin's {context_type.replace('_', ' ').title()} team.

Context: {agent_knowledge}

IMPORTANT CONTEXT FROM BACKTESTING:
- [İSİM] treats MOST replies with the same approach: explain performance model + offer to set up
- Even when people complain, [İSİM] often just sends onboarding steps
- Only classify as PAYMENT_COMPLAINT if the person explicitly reports a technical failure
  with an EXISTING account (e.g., "my withdrawal failed", "I didn't receive my Bitrefill code")
- If someone mentions wanting money but hasn't signed up: classify as INTERESTED

Analyze the reply and classify it into one of these intents:
{intent_options}

Respond in JSON: {{"intent": "...", "confidence": 0.0-1.0, "extracted_info": {{"price": null_or_number, "currency": null_or_string, "key_points": ["..."]}}, "reason": "brief explanation"}}"""
        },
        {
            "role": "user",
            "content": f"Subject: {reply_subject}\n\nReply:\n{reply_body[:2000]}"
        }
    ]
    
    result = _call_groq(messages, temperature=0.2)
    if result and "intent" in result:
        return result
    return None


def generate_draft(name, reply_body, intent_result, context_type, agent_knowledge="", template_hint=""):
    """
    Gelen yanıta uygun draft e-posta üret.
    
    Returns: {"draft": str, "confidence": 0.0-1.0, "needs_review": bool}
    """
    messages = [
        {
            "role": "system",
            "content": f"""You are [İSİM] from Sweatcoin's marketing team, writing email replies.

CONTEXT: {context_type.replace('_', ' ').title()}
{agent_knowledge}

🚫 ABSOLUTE RULES — NEVER BREAK THESE:
1. NEVER invent prices, rates, fees, or monetary amounts (€, $, EUR, USD)
2. NEVER promise upfront payment or sponsored rates
3. NEVER ask for follower counts, media kits, or rate cards
4. NEVER add marketing fluff like "four-figure payouts" or "top creators earn..."
5. NEVER use the word "username" — say "email address you used to sign up"
6. If creator asks about payment/rates: explain performance-based model (per install)
7. NEVER add video specifications (9:16, 15-60s, vertical) unless they explicitly asked for it
8. NEVER explain what Sweatcoin is unless they explicitly asked "what is Sweatcoin?"
9. NEVER add a creative brief unless they explicitly asked for one
10. DO NOT add information that the template hint doesn't contain

✅ MANDATORY STRUCTURE:
1. ALWAYS start with "Hi {name}," on the first line
2. ALWAYS include a closing line before the signature
3. ALWAYS end with:
   Best,
   [İSİM]
   Influencer & Affiliate Marketing – Sweatcoin

[İSİM]'S REAL STYLE (learned from backtesting against 10 real threads):
- For CS/COUNTER_OFFER/PRICE_SHARED: After "Hi {name},", write "Thank you for getting back to me!"
- For IP onboarding (INTERESTED): After "Hi {name},", write "Awesome! Getting started is very simple:"
- Keep replies SHORT: 3-5 sentences max
- Use numbered lists ONLY for onboarding steps (1. Download app, 2. Reply with email)
- When declining upfront payment: "Our program operates purely on a performance
  basis (per install), and we do not have an upfront budget for sponsored integrations."
- After declining: "However, some of our creators actually earn more through our
  performance program than standard sponsorships due to the high conversion rate of their audience!"
- End declining messages with: "If you ever decide to try it out on a
  performance basis, I'd be happy to set you up. Just let me know."
- End onboarding messages with: "Let me know if you have any questions."
- For payment complaints: ask for sign-up email to investigate

CRITICAL: The TEMPLATE HINT is a REAL email [İSİM] has sent before.
Your job is to REPRODUCE the template with ONLY the name changed.
Do NOT add, remove, or change any content from the template.

{f"TEMPLATE HINT (REPRODUCE THIS — only change the name): {template_hint}" if template_hint else ""}

The person's intent was classified as: {intent_result.get('intent', 'UNCLEAR')}
{f"Extracted info: {json.dumps(intent_result.get('extracted_info', {}))}" if intent_result.get('extracted_info') else ""}

REPRODUCE the template hint with the correct name. Minimal changes only.
Respond in JSON: {{"draft": "the email text", "confidence": 0.0-1.0, "needs_review": true/false}}"""
        },
        {
            "role": "user",
            "content": f"Their reply:\n{reply_body[:2000]}"
        }
    ]
    
    result = _call_groq(messages, temperature=0.4, max_tokens=800)
    if result and "draft" in result:
        return result
    return None


def classify_email_relevance(subject, body_text, sender_email):
    """
    LLM tabanlı email ilgi/kategori analizi.
    
    Email'in [İSİM]'ın sorumluluğunda olup olmadığını belirler.
    Keyword-based filtrelerin aksine, bağlamı anlayarak karar verir.
    
    Kategoriler:
    - RELEVANT: [İSİM]'ın işi — influencer/creator outreach yanıtları
    - PAYMENT_COMPLAINT: Son kullanıcı ödeme/çekim şikâyeti ([İSİM]'ın işi DEĞİL)
    - BUSINESS_PARTNER: İş ortağı görüşmesi (Runa, vs.) — [İSİM]'ın işi DEĞİL
    - IRRELEVANT: [İSİM]'ın işiyle hiç alakasız
    
    Returns: {"category": str, "confidence": 0.0-1.0, "reason": str}
    """
    messages = [
        {
            "role": "system",
            "content": """You are an email classifier for Sweatcoin's marketing team.

[İSİM] works in Influencer & Affiliate Marketing. His responsibility is:
- Outreach to influencers/creators for video collaborations
- Managing the Influencer Program (affiliate/performance-based)
- Responding to creators who reply to his outreach emails

Things that are NOT [İSİM]'s responsibility:
- End-user payment/withdrawal complaints (e.g. "I didn't receive my payment", "my withdrawal failed")
- Business partner discussions (e.g. Runa, payment providers, B2B partnerships)
- Internal operations, finance, legal matters
- Product/app bug reports from end users

Classify the email into one of these categories:

RELEVANT: This email IS related to [İSİM]'s influencer/creator work.
  Examples: creator asking about collaboration, replying to outreach, asking about the program

PAYMENT_COMPLAINT: An END-USER (not a business partner) is complaining about
  a specific payment/withdrawal issue with their personal Sweatcoin account.
  CRITICAL: A business partner discussing payout DATA, distribution metrics,
  or growth opportunities is NOT a payment complaint — that's BUSINESS_PARTNER.

BUSINESS_PARTNER: A B2B partner (like Runa, payment providers, ad networks)
  discussing business matters. Even if they mention "payouts" or "withdrawals",
  they are discussing it from a BUSINESS perspective, not complaining about
  their personal account.

IRRELEVANT: Completely unrelated to any of the above.

Respond in JSON: {"category": "RELEVANT" | "PAYMENT_COMPLAINT" | "BUSINESS_PARTNER" | "IRRELEVANT", "confidence": 0.0-1.0, "reason": "brief explanation"}"""
        },
        {
            "role": "user",
            "content": f"Sender: {sender_email}\nSubject: {subject}\n\nBody:\n{body_text[:2000]}"
        }
    ]
    
    result = _call_groq(messages, temperature=0.1)
    if result and "category" in result:
        return result
    return None


def classify_cold_outreach(subject, body_text, sender_email):
    """
    LLM tabanlı cold outreach / cold email / genuine ayrımı.
    
    Keyword-based filtrelerin aksine bağlamı anlayarak karar verir:
    - "I'd love to collaborate" bir UGC spamciden mi yoksa gerçek iş ortağından mı geliyor?
    - "Partnership opportunity" bir cold sales pitch mi yoksa meşru teklif mi?
    
    Kategoriler:
    - UGC_COLD: Bize UGC içerik satmak isteyen kişi (istenmeyen teklif)
    - COLD_EMAIL: Bize servis/ürün satan cold email (sales pitch)
    - GENUINE: Gerçek bir konuşma, meşru iletişim
    
    Returns: {"category": str, "confidence": 0.0-1.0, "reason": str} veya None (LLM çökerse)
    """
    messages = [
        {
            "role": "system",
            "content": """You are an email classifier for Sweatcoin's Influencer & Affiliate Marketing team.

Your job is to determine if an inbound email (not initiated by us) is unsolicited cold outreach or a genuine message.

Classify into one of these categories:

UGC_COLD: An unsolicited pitch from a UGC creator or content creator trying to sell us their services.
  Strong signals:
  - "I'm a UGC creator" / "I specialize in UGC" / "user generated content"
  - Offering content creation, product seeding, or media kit
  - Mentioning their portfolio, rates, or previous work unprompted
  - Generic templates like "I'd love to create content for your brand"
  - "Partnership inquiry" or "collab opportunity" in subject from unknown senders
  - Phrases like "content that your customers trust", "fresh UGC", "content ideas ready to go"
  IMPORTANT: Even if they mention "collaboration", if the core message is them
  pitching their content creation services TO US, it's UGC_COLD.

COLD_EMAIL: A sales/marketing email trying to sell us a product or service.
  Strong signals:
  - "Our platform/solution/service can help you..."
  - "Book a call" / "Schedule a demo" / "Free trial"
  - Marketing agency pitches, user acquisition services
  - "We help brands like yours..." / "We've helped X achieve..."
  - "Business proposal" / "Special offer" / "Limited time"
  - Growth strategy, lead generation, or ad platform pitches
  
GENUINE: A real, legitimate message that deserves attention.
  Examples:
  - A creator replying to an ongoing conversation
  - A real business inquiry about Sweatcoin's influencer program
  - Someone referred by a colleague or partner
  - A genuine question about working with Sweatcoin
  - An email from someone we've had previous contact with
  KEY: The message feels personal, references specific details, 
  or is clearly part of an ongoing relationship.

IMPORTANT RULES:
- If the email is clearly a mass-sent template (generic, no personal details): UGC_COLD or COLD_EMAIL
- If the email references a specific previous interaction or shows genuine knowledge of Sweatcoin: likely GENUINE
- When in doubt between UGC_COLD and GENUINE, consider: did they specifically seek US out with a template, or is there genuine context?
- "I'd love to collaborate" alone is NOT enough to classify as UGC_COLD — look at the full context

Respond in JSON: {"category": "UGC_COLD" | "COLD_EMAIL" | "GENUINE", "confidence": 0.0-1.0, "reason": "brief explanation"}"""
        },
        {
            "role": "user",
            "content": f"Sender: {sender_email}\nSubject: {subject}\n\nBody:\n{body_text[:2000]}"
        }
    ]
    
    result = _call_groq(messages, temperature=0.1)
    if result and "category" in result:
        return result
    return None


def review_and_improve_draft(original_draft, reply_body, name, context_type, intent_result, template_hint=""):
    """
    Draft Review Mekanizması — İlk draft'ı review edip iyileştir.
    
    Bu fonksiyon, ilk draft'ın kalitesini kontrol eder ve gerekiyorsa
    yeniden yazar. Maliyet-etkin: sadece gerektiğinde çağrılır.
    
    Returns: {"improved_draft": str, "changes_made": str, "quality_score": 1-10}
    """
    messages = [
        {
            "role": "system",
            "content": f"""You are a senior email reviewer for Sweatcoin's marketing team.

CONTEXT: {context_type.replace('_', ' ').title()}
RECIPIENT: {name}
INTENT: {intent_result.get('intent', 'UNCLEAR')}
{f"TEMPLATE HINT (this is what [İSİM] ACTUALLY writes — use as reference): {template_hint}" if template_hint else ""}

Review the draft reply below and check for:
1. ACCURACY: Does it correctly address the person's intent?
   - BOTH CS and IP use a PERFORMANCE-BASED model (per install)
   - If the draft invents prices, rates, or monetary amounts → REWRITE immediately
   - If the draft promises upfront payment → REWRITE immediately  
2. UNWANTED CONTENT: Does the draft add information NOT in the template hint?
   - If it adds video specs (9:16, 15-60s) that weren't asked for → REMOVE
   - If it adds app explanations that weren't asked for → REMOVE
   - If it adds creative briefs that weren't asked for → REMOVE
   - If it adds extra onboarding steps beyond what the template has → REMOVE
3. TONE:
   - CS threads: Professional. Open with "Thank you for getting back to me!"
   - IP onboarding: Enthusiastic. Open with "Awesome!"
   - Payment complaints: Empathetic but still practical
   - NEVER overly casual or salesy
4. BREVITY: Keep it 3-5 sentences max. Strip unnecessary content.
5. SIGNATURE: Must be "Best,\n[İSİM]\nInfluencer & Affiliate Marketing – Sweatcoin"

IMPORTANT: The template hint represents [İSİM]'s PROVEN real approach.
If the draft significantly deviates from the template, REWRITE it to match
the template more closely.

If the draft is good (score >= 7), return it as-is.
If it needs improvement (score < 7), rewrite it based on the template approach.

Respond in JSON: {{"improved_draft": "the final email text", "changes_made": "what you changed and why (or 'none')", "quality_score": 1-10}}"""
        },
        {
            "role": "user",
            "content": f"Original reply from creator:\n{reply_body[:1500]}\n\n---\n\nDraft to review:\n{original_draft}"
        }
    ]
    
    result = _call_groq(messages, temperature=0.2, max_tokens=800)
    if result and "improved_draft" in result:
        return result
    return None
