"""
Creative Sourcing Agent 🎬
===========================
Creator'larla video/içerik iş birliği iletişimi.

ÖNEMLİ — GERÇEK İŞ MODELİ (Backtesting'den Öğrenildi):
[İSİM]'ın gerçek yanıtları analiz edildiğinde, CS thread'lerde bile
performance-based modeli açıkladığı ve upfront ödeme yapmadığı görüldü.

Bu agent:
- Başlangıçta video iş birliği teklifiyle gidilmiş olsa da
- Yanıtlarda genellikle "no upfront budget, performance basis" açıklanıyor
- Eğer ileride ücretli model aktive edilirse knowledge base güncellenmeli
- ŞİMDİLİK: [İSİM]'ın gerçek davranışını taklit ediyoruz

Yanıt tipleri:
- Fiyat soran / ücretli istek → "Performance-based, no upfront budget" açıklaması
- Video teslimi → Alındı konfirmasyonu
- İlgi → Onboarding veya detay paylaşımı
- Sözleşme soruları → Kontrat linki
- Soru (brief, format, süre) → Bilgilendirme  
- İlgilenmiyor → Nazik kapanış
"""

from agents.base_agent import BaseAgent
from shared.gmail_client import create_draft, mark_as_read
from shared.email_utils import has_video_link
from shared.llm_client import analyze_reply_intent, generate_draft, review_and_improve_draft

# ══════════════════════════════════════════════════════
# Creative Sourcing Bilgi Tabanı
# ══════════════════════════════════════════════════════
CS_KNOWLEDGE = """
BUSINESS: Sweatcoin Creative Sourcing — Creator iş birliği iletişimi.

🚫 HARD RULES (ASLA İHLAL ETMEYİN):
- ASLA fiyat/ücret/para birimi uydurmayın (€, $, EUR, USD vb.)
- ASLA "we'll pay you X" veya "your rate" gibi ödeme vaadi yapmayın
- ASLA kontrat/sözleşme detayları uydurmayın
- ASLA takipçi sayısına göre fiyat teklif etmeyin
- Eğer creator fiyat sorarsa: "Performance-based, no upfront budget" deyin

[İSİM]'IN GERÇEK YAKLAŞIMI (backtesting'den öğrenildi):
- Çoğu CS thread'de: "Our program operates purely on a performance basis (per install),
  and we do not have an upfront budget for sponsored integrations."
- Performans modelinin avantajını açıklıyor: bazı creator'lar 4 haneli kazanıyor
- İlgilenirse performance basis'te denesin diye teklif ediyor
- Sıcak, kısa, bullet list tarzı yanıtlar

VIDEO SPECS (sadece creator ilgilenirse paylaş):
- Format: 9:16 vertical (TikTok/Reels/Shorts)
- Duration: 15-60 seconds
- Style: Natural skit integrating Sweatcoin

TON KURALLARI:
- "Awesome!" veya "Great to hear!" ile başla
- Kısa cümleler, max 3-5 cümle
- Bullet/numbered list kullan
- ASLA "four-figure payouts" gibi abartılı pazarlama dili kullanma
- İmza: Best,\n[İSİM]\nInfluencer & Affiliate Marketing – Sweatcoin
"""

# ══════════════════════════════════════════════════════
# Fallback Template'ler (LLM yoksa kullanılır)
# ══════════════════════════════════════════════════════
CS_TEMPLATES = {
    "PRICE_SHARED": """Hi {name},

Thank you for getting back to me!

Currently, our program operates purely on a performance basis (per install), and we do not have an upfront budget for sponsored integrations. However, some of our creators actually earn more through our performance program than standard sponsorships due to the high conversion rate of their audience!

If you ever decide to try it out on a performance basis, I'd be happy to set you up. Just let me know.

Best,
[İSİM]
Influencer & Affiliate Marketing – Sweatcoin""",

    "COUNTER_OFFER": """Hi {name},

Thank you for getting back to me!

Currently, our program operates purely on a performance basis (per install), and we do not have an upfront budget for sponsored integrations. However, some of our creators actually earn more through our performance program than standard sponsorships due to the high conversion rate of their audience!

If you ever decide to try it out on a performance basis, I'd be happy to set you up. Just let me know.

Best,
[İSİM]
Influencer & Affiliate Marketing – Sweatcoin""",

    "VIDEO_SENT": """Hi {name},

Thank you for sending the video over! I have received it and will forward it to our ads team for review and testing.

I'll reach out to you once we have some initial feedback on its performance.

Best,
[İSİM]
Influencer & Affiliate Marketing – Sweatcoin""",

    "CONTRACT_QUESTION": """Hi {name},

Here is the contract link for our collaboration:
https://na4.documents.adobe.com/public/esignWidget?wid=CBFCIBAA3AAABLblqZhCYtPlhLHK1gzI07Aqgrz-2M2hsy9Uo5wpw0J2mrivoFbTVlKUB1v9yTc4nZBpuWcQ*

Please review and fill in all the details (including your PayPal email) at your earliest convenience so we can proceed.

Best,
[İSİM]
Influencer & Affiliate Marketing – Sweatcoin""",

    "INTERESTED": """Hi {name},

Awesome! Getting started is very simple:

1. Download the free Sweatcoin app and create an account.
2. Reply back to this email with the email address you used to sign up.

Once you provide your sign-up email, I will activate your Influencer Hub so you can get your unique link and start tracking your invites and earning cash!

Let me know if you have any questions.

Best,
[İSİM]
Influencer & Affiliate Marketing – Sweatcoin""",

    "QUESTION": """Hi {name},

Thank you for getting back to me!

Currently, our program operates purely on a performance basis (per install), and we do not have an upfront budget for sponsored integrations. However, some of our creators actually earn more through our performance program than standard sponsorships due to the high conversion rate of their audience!

If you ever decide to try it out on a performance basis, I'd be happy to set you up. Just let me know.

Best,
[İSİM]
Influencer & Affiliate Marketing – Sweatcoin""",

    "NOT_INTERESTED": """Hi {name},

No worries at all, thank you for letting me know! Feel free to reach out if you change your mind in the future.

Best,
[İSİM]
Influencer & Affiliate Marketing – Sweatcoin""",

    "GENERAL": """Hi {name},

Thank you for getting back to me!

Currently, our program operates purely on a performance basis (per install), and we do not have an upfront budget for sponsored integrations. However, some of our creators actually earn more through our performance program than standard sponsorships due to the high conversion rate of their audience!

If you ever decide to try it out on a performance basis, I'd be happy to set you up. Just let me know.

Best,
[İSİM]
Influencer & Affiliate Marketing – Sweatcoin""",
}

# Rule-based intent tetikleyicileri (LLM fallback)
CS_INTENT_TRIGGERS = {
    "PRICE_SHARED": ["€", "$", "euro", "usd", "rate is", "my rate", "fee is", "charge",
                      "per video", "pricing", "cost", "invoice", "my fee"],
    "VIDEO_SENT": [],  # has_video_link() ile tespit
    "CONTRACT_QUESTION": ["contract", "sign", "agreement", "terms", "paypal"],
    "INTERESTED": ["interested", "sounds good", "love to", "i'm in", "would like to",
                    "tell me more", "how does it work", "more details"],
    "NOT_INTERESTED": ["not interested", "no thanks", "pass", "not at this time",
                        "maybe later", "decline"],
}


class CreativeSourcingAgent(BaseAgent):
    """
    Creative Sourcing Agent — Ücretli video üretimi iletişimi.
    
    LLM ile:
    1. Yanıtın niyetini analiz et
    2. Bağlama uygun draft üret
    3. Draft'ı review et ve gerekirse iyileştir
    """
    
    def __init__(self):
        super().__init__("creative_sourcing")
    
    def handle(self, ctx):
        """Email'i işle ve draft oluştur."""
        body_lower = ctx.body.lower()
        
        # ═══════════════════════════════════════════════
        # ADIM 1: Intent Tespiti (LLM → Rule-based fallback)
        # ═══════════════════════════════════════════════
        intent_result = analyze_reply_intent(
            reply_body=ctx.body,
            reply_subject=ctx.subject,
            context_type="CREATIVE_SOURCING",
            agent_knowledge=CS_KNOWLEDGE
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
                    "Swc Email Responder: LLM Intent Tespiti Başarısız (CS Agent)",
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
        template_hint = CS_TEMPLATES.get(intent, CS_TEMPLATES["GENERAL"])
        
        draft_result = generate_draft(
            name=ctx.name,
            reply_body=ctx.body,
            intent_result=intent_result,
            context_type="CREATIVE_SOURCING",
            agent_knowledge=CS_KNOWLEDGE,
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
                context_type="CREATIVE_SOURCING",
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
        
        # Video kontrolü
        if has_video_link(ctx.body) or ("video" in body_lower and ("attached" in body_lower or "link" in body_lower)):
            return "VIDEO_SENT", 0.85
        
        # Kontrat kontrolü
        if any(t in body_lower for t in CS_INTENT_TRIGGERS["CONTRACT_QUESTION"]):
            return "CONTRACT_QUESTION", 0.80
        
        # Fiyat kontrolü
        if any(t in body_lower for t in CS_INTENT_TRIGGERS["PRICE_SHARED"]):
            return "PRICE_SHARED", 0.75
        
        # İlgileniyor kontrolü
        if any(t in body_lower for t in CS_INTENT_TRIGGERS["INTERESTED"]):
            return "INTERESTED", 0.70
        
        # İlgilenmiyor kontrolü
        if any(t in body_lower for t in CS_INTENT_TRIGGERS["NOT_INTERESTED"]):
            return "NOT_INTERESTED", 0.80
        
        return "UNCLEAR", 0.4
