"""
Email Filters — Sistem/bot filtreleme
======================================
Hangi emailler görmezden gelinmeli, hangilerine bakılmalı.

v2.3 — 2026-03-16 güncellemesi:
  - Ödeme şikâyeti tespiti LLM tabanlı sisteme taşındı (v2.2'de yapıldı)
  - Forward özelliği tamamen kaldırıldı (v2.2'de yapıldı)
  - UGC cold outreach ve cold email tespiti LLM tabanlı sisteme taşındı (v2.3)
    Keyword listeleri FALLBACK olarak korunuyor (LLM çökerse veya confidence düşükse)
"""

# ═══════════════════════════════════════════════════════════════
# NOT: Ödeme şikâyeti tespiti artık LLM tabanlı (dispatcher.py)
# NOT: UGC cold outreach ve cold email tespiti artık LLM tabanlı (dispatcher.py)
#      Keyword listeleri FALLBACK olarak korunuyor.
# Forward özelliği 2026-03-16'da kaldırıldı (yanlış forward riski)
# ═══════════════════════════════════════════════════════════════

# Sistem/bot e-posta domainleri
SYSTEM_DOMAINS = [
    '@mail.notion.so', '@mailsuite.com', '@docs.google.com', '@whop.com',
    '@onesignal.com', '@calendar.google.com', '@notebooklm.google.com',
    '@accounts.google.com', '@atlassian.com', '@slack.com', '@github.com',
    '@linkedin.com', '@facebookmail.com', '@canva.com', '@adobe.com',
    '@figma.com', '@vercel.com', '@netlify.com', '@heroku.com',
    '@stripe.com', '@paypal.com', '@wise.com', '@zoom.us',
    '@loom.com', '@grammarly.com', '@notion.so', '@apify.com',
    '@meetgeek.ai', '@crowdin.com', '@repocloud.io', '@hostinger.com',
    '@info.hostinger.com', '@manus.im', '@email.apple.com',
    '@google.com',
]

SYSTEM_PREFIXES = [
    'noreply', 'no-reply', 'no_reply', 'notifications@', 'digest@', 'updates@',
    'team@', 'support@', 'billing@', 'reminders@', 'newsletter@',
    'mailer-daemon@', 'postmaster@', 'info@', 'hello@', 'donotreply',
    'do-not-reply', 'automated@', 'notification@', 'alert@', 'admin@',
    'daily-report@', 'comments-noreply@', 'drive-shares-',
]

# Transactional email gönderenler — sadece okundu yap, geç
# MailSuite Daily Report vb. otomatik raporlama servisleri
TRANSACTIONAL_SENDERS = [
    '@mailsuite.com',
    '@mailtrack.io',
    '@yesware.com',
    '@boomeranggmail.com',
    '@streak.com',
    '@mixmax.com',
]

TRANSACTIONAL_SUBJECT_PATTERNS = [
    'daily report',
    'weekly report',
    'monthly report',
    'tracking report',
    'emails sent',
    'email tracking',
    'open report',
    'click report',
    'mailsuite',          # Mailsuite Daily Report — okundu yap geç
    'mailtrack report',
    'email opens',
]

# NOT: PAYMENT_COMPLAINT_TRIGGERS listesi kaldırıldı (v2.2)
# Ödeme şikâyeti tespiti artık LLM tabanlı → shared/llm_client.py → classify_email_relevance()

# UGC cold outreach — bize içerik satmak isteyen kişiler
UGC_COLD_TRIGGERS = [
    "i'm a ugc creator", "ugc creator", "ugc content",
    "content creation product exchange", "collab idea",
    "i specialize in", "my ugc experience",
    "i'd love to partner with", "i'd love to create content",
    "exploring ugc partnership", "creator inquiry",
    "i was drawn to your", "fresh ugc from",
    "portfolio", "content ideas ready to go",
    "wellness driven content", "lifestyle driven content",
    "product exchange", "i would be excited to create",
    "media kit", "my services include",
    "user generated content", "content creator reaching out",
    "let me create content for", "product seeding",
    "love to collaborate on content",
    # 2026-03-12 eklenenler — gerçek örneklerden
    "open to chatting about ugc", "ugc inquiry",
    "let's tell a good story", "i would love to collaborate",
    "content that your customers trust",
    "idea for your next campaign",
    "love to collaborate",
]

# Subject-bazlı cold outreach — subject'te bunlardan biri varsa kesin cold outreach
COLD_OUTREACH_SUBJECT_TRIGGERS = [
    "partnership inquiry", "ugc creator", "ugc inquiry",
    "open to chatting about ugc", "let's tell a good story",
    "i would love to collaborate", "content that your customers trust",
    "idea for your next campaign", "collab opportunity",
    "collaboration opportunity", "partnership opportunity",
    "content creator", "influencer collaboration",
    "brand collaboration", "ugc content for",
    "content partnership", "creative partnership",
    "would love to work with", "pitch for",
]

# Bize servis/ürün satan cold emailler
COLD_EMAIL_TRIGGERS = [
    "user acquisition", "let's partner", "i represent",
    "our platform", "our solution", "our service",
    "book a call", "schedule a demo", "special offer",
    "exclusive deal", "limited time", "free trial",
    "we help brands", "we've helped", "case study",
    "growth strategy", "marketing agency",
    "partnership opportunity", "business proposal",
    # 2026-03-12 eklenenler
    "gwm", "user acquisition",
]


def is_system_email(sender_email):
    """Sistem/bot e-postasını tespit et."""
    sender_lower = sender_email.lower()
    for domain in SYSTEM_DOMAINS:
        if domain in sender_lower:
            return True
    for prefix in SYSTEM_PREFIXES:
        if sender_lower.startswith(prefix):
            return True
    return False


def is_transactional_email(sender_email, subject):
    """
    Transactional / raporlama e-postalarını tespit et.
    MailSuite Daily Report gibi otomatik raporlar → okundu yap, geç.
    """
    sender_lower = sender_email.lower()
    subject_lower = subject.lower()
    
    # Gönderen transactional servis mi?
    for domain in TRANSACTIONAL_SENDERS:
        if domain in sender_lower:
            return True
    
    # Subject transactional pattern'e uyuyor mu?
    for pattern in TRANSACTIONAL_SUBJECT_PATTERNS:
        if pattern in subject_lower:
            return True
    
    return False


# is_payment_complaint() kaldırıldı (v2.2) — LLM tabanlı classify_email_relevance() kullanılıyor


def is_team_email(sender_email):
    """Takım üyesi ve Sweatcoin iç e-postalarını tespit et."""
    sender_lower = sender_email.lower()
    domain = sender_lower.split('@')[-1] if '@' in sender_lower else sender_lower
    
    # Kök domain ve ana alt domainler (örn. em.sweatco.in, sweatco.in)
    if domain == 'sweatco.in' or domain.endswith('.sweatco.in'):
        return True
        
    # Sweatcoin kelimesi geçen diğer domainler (TeamTailor, vs)
    if 'sweatcoin' in domain:
        return True
        
    return False


def is_ugc_cold_outreach(subject, body_text):
    """
    Bize UGC içeriği satmak isteyen kişileri tespit et.
    v2.1: Subject-bazlı eşleşme eklendi — subject'te net sinyal varsa
    body analizi bile yapmadan cold outreach olarak işaretle.
    """
    subject_lower = subject.lower()
    combined = (subject + " " + body_text).lower()
    
    # Subject-bazlı kesin eşleşme (hızlı karar)
    for trigger in COLD_OUTREACH_SUBJECT_TRIGGERS:
        if trigger in subject_lower:
            return True
    
    # Body + Subject kombine analiz
    match_count = sum(1 for t in UGC_COLD_TRIGGERS if t in combined)
    
    if match_count >= 2:
        return True
    
    if match_count >= 1:
        has_portfolio = any(p in combined for p in [
            "portfolio", "instagram.com", "tiktok.com",
            "canva.com/design", "my work", "my content"
        ])
        if has_portfolio:
            return True
    return False


def is_cold_email(subject, body_text):
    """Bize servis/ürün satan cold email'leri tespit et."""
    combined = (subject + " " + body_text).lower()
    return any(t in combined for t in COLD_EMAIL_TRIGGERS)
