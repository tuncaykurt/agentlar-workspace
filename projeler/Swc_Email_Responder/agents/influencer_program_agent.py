"""
Influencer Program Agent 📱
=============================
Performance-bazlı affiliate program iletişimi.

Bu agent:
- Creator Sweatcoin uygulamasını tanıtıyor
- Her davet (install) başına ödeme yapılıyor  
- Creator'ın kendi kanalında yayınlanıyor
- Ücretsiz katılım, ön ödeme YOK

Yanıt tipleri:
- İlgileniyor → Onboarding talimatları
- Sadece ücretli istiyor → Performance model açıklaması
- İlgilenmiyor → Nazik kapanış
- Ödeme şikayeti → Operasyon yönlendirmesi
- Soru → Bilgilendirme
- Auto-reply / Bounce → Okundu yap
"""

from agents.base_agent import BaseAgent
from shared.gmail_client import create_draft, mark_as_read
from shared.llm_client import analyze_reply_intent, generate_draft, review_and_improve_draft

# ══════════════════════════════════════════════════════
# Influencer Program Bilgi Tabanı
# ══════════════════════════════════════════════════════
IP_KNOWLEDGE = """
BUSINESS: Sweatcoin Influencer Program — Performance-bazlı affiliate model.
- Creator Sweatcoin uygulamasını kendi kitlelerine tanıtıyor
- Her yeni kullanıcı daveti (app install) başına ödeme yapılıyor
- Creator'ın kendi kanalında organik içerik olarak yayınlanıyor
- Ücretsiz katılım, ön ödeme YOK

🚫 HARD RULES (ASLA İHLAL ETMEYİN):
- ASLA fiyat/ücret/para birimi uydurmayın
- ASLA "four-figure payouts" veya "1000$+" gibi abartılı rakamlar kullanmayın
- ASLA "username" kelimesini kullanmayın — "email address you used to sign up" deyin
- ASLA gereksiz pazarlama dili eklemeyin (e.g. "top creators", "gaming audiences")
- Withdrawal/ödeme şikayetlerine ASLA spesifik rakam tekrarlama ($8, Bitrefill vb.)

[İSİM]'IN GERÇEK YAKLAŞIMI (backtesting'den öğrenildi):
- "Awesome!" ile başla, enthusiastic ve kısa
- Numbered list kullan (1. Download app, 2. Reply with email)
- Sadece gerekli bilgiyi ver, fazladan pazarlama dili kullanma
- Ödeme şikayetlerinde: kişiyi onboarding akışına yönlendir (sign-up email iste)

ONBOARDING ADIMLARI:
1. Sweatcoin uygulamasını indir (ücretsiz)
2. Hesap oluştur
3. Kayıt olduğu email adresini bize bildir
4. Biz Influencer Hub'ı aktive edelim
5. Benzersiz takip linkini al
6. Tanıtmaya ve kazanmaya başla

TON KURALLARI:
- "Awesome!" veya "Great to hear!" ile başla
- Kısa cümleler, max 3-5 cümle
- Numbered/bullet list kullan
- İmza: Best,\n[İSİM]\nInfluencer & Affiliate Marketing – Sweatcoin

BAŞARI ÖRNEKLERİ:
- https://www.tiktok.com/@philosophy353
- https://www.facebook.com/DebruyneGee/
"""

# ══════════════════════════════════════════════════════
# Fallback Template'ler (LLM yoksa kullanılır)
# ══════════════════════════════════════════════════════
IP_TEMPLATES = {
    "INTERESTED": """Hi {name},

Awesome! Getting started is very simple:

1. Download the free Sweatcoin app and create an account.
2. Reply back to this email with the email address you used to sign up.

Once you provide your sign-up email, I will activate your Influencer Hub so you can get your unique link and start tracking your invites and earning cash!

Let me know if you have any questions.

Best,
[İSİM]
Influencer & Affiliate Marketing – Sweatcoin""",

    "PAID_ONLY": """Hi {name},

Thank you for getting back to me! 

Currently, our program operates purely on a performance basis (per install), and we do not have an upfront budget for sponsored integrations. However, some of our creators actually earn more through our performance program than standard sponsorships due to the high conversion rate of their audience!

If you ever decide to try it out on a performance basis, I'd be happy to set you up. Just let me know.

Best,
[İSİM]
Influencer & Affiliate Marketing – Sweatcoin""",

    "NOT_INTERESTED": """Hi {name},

No worries, thank you for letting me know and for your time! 

Feel free to reach out if you change your mind in the future. Wishing the best to you and your channel!

Best,
[İSİM]
Influencer & Affiliate Marketing – Sweatcoin""",

    "PAYMENT_COMPLAINT": """Hi {name},

Thank you for reaching out about this. To look into this for you, could you please share the email address you used to sign up for Sweatcoin?

Once I have that, I'll check your account status and get back to you with an update.

Best,
[İSİM]
Influencer & Affiliate Marketing – Sweatcoin""",

    "INFO_REQUEST": """Hi {name},

Awesome! Getting started is very simple:

1. Download the free Sweatcoin app and create an account.
2. Reply back to this email with the email address you used to sign up.

Once you provide your sign-up email, I will activate your Influencer Hub so you can get your unique link and start tracking your invites and earning cash!

Let me know if you have any questions.

Best,
[İSİM]
Influencer & Affiliate Marketing – Sweatcoin""",

    "REWARD_QUESTION": """Hi {name},

Yes, exactly! Once you hit a certain amount of invites and cash out a reward, your payment amount resets for that specific reward tier. However, you can keep earning and cashing out rewards as many times as you like!

Let me know if anything else comes up.

Best,
[İSİM]
Influencer & Affiliate Marketing – Sweatcoin""",

    "GENERAL": """Hi {name},

Thank you for getting back to me! I'd love to discuss this further.

Best,
[İSİM]
Influencer & Affiliate Marketing – Sweatcoin""",
}

# Rule-based intent tetikleyicileri (LLM fallback)
IP_INTENT_TRIGGERS = {
    "INTERESTED": [
        "interested", "sounds good", "send details", "how to join", "sign me up",
        "i'd like to", "tell me more", "let's do it", "count me in", "sure",
        "i'm in", "i'm down", "yes please", "yes!", "would love to", "absolutely",
        "how do i start", "how can i join", "i want to", "sign up",
        "sounds great", "sounds amazing", "love to try", "happy to try",
        "i'd love to", "let's go", "where do i sign", "please share",
        "share examples", "share some examples", "how does it work",
    ],
    "PAID_ONLY": [
        "paid", "sponsor", "fee", "budget", "rate", "not doing performance",
        "upfront payment", "media kit", "pricing", "quote", "rate card",
        "cost", "price", "invoice", "compensation", "flat fee", "fixed rate",
        "minimum guarantee", "guaranteed payment", "per video", "per post",
        "my rate is", "my fee is", "we charge", "our rate", "our fee",
        "management fee", "agency fee", "brand deal",
    ],
    "NOT_INTERESTED": [
        "not interested", "no thank you", "pass", "no thanks",
        "not at this time", "declining", "not for me", "i'll pass",
        "not right now", "maybe later", "not looking", "unsubscribe",
        "remove me", "stop emailing", "don't contact",
    ],
    "PAYMENT_COMPLAINT": [
        "didn't get the funds", "missing payment", "didn't receive",
        "haven't been paid", "payment issue", "not received my payment",
        "where is my payment", "withdrawal", "bitrefill",
        "code refused", "claimed even though", "funds not received",
        "stopped promoting", "stopped actively promoting",
        "only cares about invites", "no help is rendered",
    ],
    "AUTO_REPLY": [
        "out of office", "auto-reply", "vacation", "away from",
        "autoresponder", "automatic reply",
    ],
    "BOUNCE": [
        "delivery incomplete", "address not found", "undeliverable",
        "message not delivered", "delivery status notification",
        "returned mail", "mail delivery failed",
    ],
}


class InfluencerProgramAgent(BaseAgent):
    """
    Influencer Program Agent — Performance-bazlı affiliate iletişimi.
    
    LLM ile:
    1. Yanıtın niyetini analiz et
    2. Bağlama uygun draft üret
    3. Draft'ı review et ve gerekirse iyileştir
    """
    
    def __init__(self):
        super().__init__("influencer_program")
    
    def handle(self, ctx):
        """Email'i işle ve draft oluştur."""
        body_lower = ctx.body.lower()
        
        # ═══════════════════════════════════════════════
        # ADIM 1: Intent Tespiti (LLM → Rule-based fallback)
        # ═══════════════════════════════════════════════
        intent_result = analyze_reply_intent(
            reply_body=ctx.body,
            reply_subject=ctx.subject,
            context_type="INFLUENCER_PROGRAM",
            agent_knowledge=IP_KNOWLEDGE
        )
        
        if intent_result and intent_result.get("confidence", 0) >= 0.6:
            intent = intent_result["intent"]
            confidence = intent_result["confidence"]
            print(f"   🤖 LLM Intent: {intent} (confidence: {confidence:.0%})")
        else:
            # LLM çöktü veya düşük confidence — keyword fallback'e düşmek yerine
            # bildirim gönder ve emaili atla (güvenli tarafta kal)
            print(f"   ⚠️ LLM intent tespiti başarısız — maili atlıyorum, bildirim gönderiyorum.")
            try:
                from shared.notifier import send_alert
                send_alert(
                    "Swc Email Responder: LLM Intent Tespiti Başarısız (IP Agent)",
                    f"LLM intent analizi başarısız oldu veya düşük confidence döndü.\n"
                    f"Email işlenmeden atlandı:\n\n"
                    f"From: {ctx.sender}\n"
                    f"Subject: {ctx.subject}\n"
                    f"Body (ilk 500 karakter):\n{ctx.body[:500]}\n\n"
                    f"Bu emaili manuel olarak kontrol etmen gerekebilir."
                )
            except Exception:
                pass
            mark_as_read(ctx.service, ctx.msg_id)
            self.stats["read_only"] = self.stats.get("read_only", 0) + 1
            return {"action": "read_only", "reason": "llm_failure_skipped"}
        
        # Auto-reply / Bounce → sadece okundu yap
        if intent in ["AUTO_REPLY", "BOUNCE"]:
            print(f"   🔇 {intent} → Mark as read only.")
            mark_as_read(ctx.service, ctx.msg_id)
            self.stats["read_only"] += 1
            return {"action": "read_only", "reason": intent.lower()}
        
        # ═══════════════════════════════════════════════
        # ADIM 2: Draft Üretimi (LLM → Template fallback)
        # ═══════════════════════════════════════════════
        template_hint = IP_TEMPLATES.get(intent, IP_TEMPLATES["GENERAL"])
        
        draft_result = generate_draft(
            name=ctx.name,
            reply_body=ctx.body,
            intent_result=intent_result,
            context_type="INFLUENCER_PROGRAM",
            agent_knowledge=IP_KNOWLEDGE,
            template_hint=template_hint
        )
        
        if draft_result and draft_result.get("draft"):
            draft_body = draft_result["draft"]
            draft_confidence = draft_result.get("confidence", 0.5)
            needs_review = draft_result.get("needs_review", draft_confidence < 0.7)
        else:
            # Template fallback
            draft_body = template_hint.format(name=ctx.name)
            draft_confidence = confidence
            needs_review = confidence < 0.7
        
        # ═══════════════════════════════════════════════
        # ADIM 3: Draft Review (düşük confidence ise)
        # ═══════════════════════════════════════════════
        if needs_review:
            print(f"   🔍 Draft review başlatılıyor (confidence: {draft_confidence:.0%})...")
            review_result = review_and_improve_draft(
                original_draft=draft_body,
                reply_body=ctx.body,
                name=ctx.name,
                context_type="INFLUENCER_PROGRAM",
                intent_result=intent_result,
                template_hint=template_hint
            )
            
            if review_result:
                quality_score = review_result.get("quality_score", 5)
                changes = review_result.get("changes_made", "none")
                
                if changes and changes.lower() != "none":
                    draft_body = review_result["improved_draft"]
                    print(f"   ✨ Draft iyileştirildi (skor: {quality_score}/10): {changes}")
                else:
                    print(f"   ✅ Draft onaylandı (skor: {quality_score}/10)")
        
        # ═══════════════════════════════════════════════
        # ADIM 4: Draft Oluştur
        # ═══════════════════════════════════════════════
        print(f"   📝 Creating Draft (Keep UNREAD)")
        create_draft(ctx.service, ctx.thread_id, ctx.sender_email,
                     ctx.reply_subject, ctx.message_id_header, draft_body)
        self.stats["drafted"] += 1
        
        return {"action": "drafted", "intent": intent, "agent": self.name}
    
    def _rule_based_intent(self, ctx):
        """LLM yoksa rule-based intent tespiti."""
        body_lower = ctx.body.lower()
        combined = (ctx.subject + " " + ctx.body).lower()
        
        # Sıralama önemli: en spesifik olanlar önce
        if any(t in combined for t in IP_INTENT_TRIGGERS["AUTO_REPLY"]):
            return "AUTO_REPLY", 0.90
        if any(t in combined for t in IP_INTENT_TRIGGERS["BOUNCE"]):
            return "BOUNCE", 0.90
        if any(t in body_lower for t in IP_INTENT_TRIGGERS["PAYMENT_COMPLAINT"]):
            return "PAYMENT_COMPLAINT", 0.85
        if any(t in body_lower for t in IP_INTENT_TRIGGERS["NOT_INTERESTED"]):
            return "NOT_INTERESTED", 0.80
        if any(t in body_lower for t in IP_INTENT_TRIGGERS["PAID_ONLY"]):
            return "PAID_ONLY", 0.75
        if any(t in body_lower for t in IP_INTENT_TRIGGERS["INTERESTED"]):
            return "INTERESTED", 0.75
        
        return "UNCLEAR", 0.4
