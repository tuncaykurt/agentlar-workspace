"""
Dispatcher — Akıllı Email Router
=================================
Her emaili analiz edip doğru agent'a yönlendirir.

Karar Akışı:
1. Sistem/Bot → IGNORE
2. Takım → IGNORE (dokunma)
3. LLM ilgi analizi → PAYMENT_COMPLAINT/BUSINESS_PARTNER/IRRELEVANT → IGNORE
4. Onlar başlattıysa → Cold filtrele, GENUINE ise Agent'a yönlendir
5. Biz başlattıysak → Thread tipine göre Agent'a yönlendir
"""

from shared.gmail_client import (
    extract_body, mark_as_read, create_draft,
    get_thread_first_message, get_unread_messages, get_message
)
from shared.email_utils import extract_name, extract_sender_email, get_header
from shared.llm_client import classify_thread_type, classify_email_relevance, classify_cold_outreach
from router.filters import (
    is_system_email, is_team_email, is_ugc_cold_outreach, is_cold_email,
    is_transactional_email,
)


# Bilinen Creative Sourcing kontakları (fallback — LLM yoksa kullanılır)
CREATIVE_SOURCING_CONTACTS = [
    "tylerdaviscsatari@gmail.com", "davidecuellibusiness@gmail.com", "off_kchri",
    "ilrealista_steven", "r3ui_tech", "ugc.beatrice@gmail.com", "usseindach@icloud.com",
    "gemfatimazahraefilali@gmail.com", "1btypep@gmail.com", "abc.u.in.italy@gmail.com",
    "dexter.commerciale@gmail.com", "info@gretamenchi.it", "a.suwd1114@gmail.com",
    "aleandrobussola23@gmail.com", "alexiswarr.booking@gmail.com", "alicicomeprima@gmail.com",
    "amedeo@atommanagement.it", "annuhamza@gmail.com", "aracamriv12@gmail.com",
    "auwlabdllh@gmail.com", "avenged_saretta@hotmail.it", "bise@atommanagement.it",
    "blakesecuritysystems@gmail.com", "camihawke@artisti.show-reel.it",
    "christypolinio@gmail.com", "contatocarolvpacheco@gmail.com",
    "contatoitalianotv@gmail.com", "daniellecandosin@gmail.com",
    "dellasalapasquale@gmail.com", "denisecarusofr1@gmail.com",
    "dineshmahato9824@gmail.com", "dosericcardo@gmail.com",
    "gabriele@doom-entertainment.com", "gliautogol@artisti.show-reel.it",
    "gmailcom.gulmiraomorova9@gmail.com", "gulmiraomorova9@gmail.com",
    "ibra@gmail.com", "info@mattiastanga.com", "info@newco-mgmt.com",
    "info@theshowsrl.it", "info@willwoosh.it", "infogiordanaematteo@gmail.com",
    "ipantellas@in-sane.it", "kessyemelycollab@gmail.com", "kiro@doom-entertainment.com",
    "management@tessamasazza.com", "manuel@role-talent.com",
    "martina.eigner1@gmail.com", "martinkiplimo54@gmail.com", "mgmt@imsimone.com",
    "partnership@faffapix.com", "pr.multitaskingmom@gmail.com",
    "ricadoflash@gmail.com", "sashaderomaofficial@gmail.com", "selimash@gmail.com",
    "thebestgamehater@gmail.com", "tiktokricadoflash@gmail.com", "totor@gmail.com",
    "ugc.elyn@gmail.com", "waheedbutt202107@gmail.com",
]

# Rule-based CS sinyal kelimeleri (LLM fallback)
CREATIVE_SOURCING_SIGNALS = [
    "your standard rate", "rate for a", "video integration",
    "promotional video", "produce a short", "media kit",
    "pricing", "initial pricing", "collaboration inquiry",
    "collaborate with you", "looking for talented creators",
    "your exact style", "dedicated video", "15-60 seconds",
    "9:16 vertical", "send over your media kit",
    "short promotional video", "comedy videos and skits",
    "collaborate", "collaboration",
]


def did_we_start_thread(service, thread_id):
    """Thread'in ilk mesajını kontrol et — biz mi başlattık?"""
    first_msg = get_thread_first_message(service, thread_id)
    if first_msg:
        first_sender = get_header(first_msg['payload']['headers'], 'From').lower()
        return 'sweatco.in' in first_sender
    return False


def determine_thread_type(service, thread_id, sender_email):
    """
    3 katmanlı tespit: Thread Creative Sourcing mı yoksa Influencer Program mı?
    
    Katman 1: Bilinen CS kontak listesi (anında sonuç)
    Katman 2: LLM sınıflandırması (en doğru)
    Katman 3: Rule-based sinyal analizi (LLM fallback)
    """
    # Katman 1: Kontak listesi
    if any(cs.lower() in sender_email.lower() for cs in CREATIVE_SOURCING_CONTACTS):
        return {"type": "CREATIVE_SOURCING", "confidence": 0.95, "method": "kontak_listesi"}
    
    # Thread'in ilk mesajını al
    first_msg = get_thread_first_message(service, thread_id)
    if not first_msg:
        return {"type": "INFLUENCER_PROGRAM", "confidence": 0.5, "method": "varsayılan"}
    
    first_subject = get_header(first_msg['payload']['headers'], 'Subject')
    first_body = extract_body(first_msg['payload'])
    
    # Katman 2: LLM sınıflandırması
    llm_result = classify_thread_type(first_subject, first_body)
    if llm_result and llm_result.get("confidence", 0) >= 0.7:
        return {
            "type": llm_result["type"],
            "confidence": llm_result["confidence"],
            "method": "llm",
            "reason": llm_result.get("reason", "")
        }
    
    # Katman 3: Rule-based fallback
    combined = (first_subject + " " + first_body).lower()
    match_count = sum(1 for signal in CREATIVE_SOURCING_SIGNALS if signal in combined)
    
    if match_count >= 2:
        return {"type": "CREATIVE_SOURCING", "confidence": 0.8, "method": "sinyal_analizi"}
    
    return {"type": "INFLUENCER_PROGRAM", "confidence": 0.7, "method": "varsayılan"}


class EmailContext:
    """Bir email hakkında tüm bilgileri tutan container."""
    def __init__(self, service, msg_obj):
        self.service = service
        self.msg_obj = msg_obj
        self.msg_id = msg_obj['id']
        self.thread_id = msg_obj['threadId']
        self.headers = msg_obj['payload']['headers']
        
        self.subject = get_header(self.headers, 'Subject') or 'No Subject'
        self.sender = get_header(self.headers, 'From') or 'Unknown'
        self.sender_email = extract_sender_email(self.sender)
        self.message_id_header = get_header(self.headers, 'Message-ID')
        self.reply_subject = self.subject if self.subject.startswith("Re:") else "Re: " + self.subject
        
        self.body = extract_body(msg_obj['payload'])
        self.name = extract_name(self.sender, self.sender_email) or "there"


def dispatch_email(service, msg_obj, cs_agent, ip_agent):
    """
    Ana dispatcher — emaili analiz edip doğru agent'a yönlendir.
    
    Returns: {"action": str, "details": str}
    """
    ctx = EmailContext(service, msg_obj)
    
    print(f"{'─' * 50}")
    print(f"📧 From: {ctx.sender}")
    print(f"   Subject: {ctx.subject}")
    
    # ═══════════════════════════════════════════════════
    # ADIM 1: Takım İçi E-postalar
    # Ödeme şikayeti konulu email'ler bile olsa takım
    # üyelerine otomatik cevap vermeyiz — sadece UNREAD bırak.
    # ═══════════════════════════════════════════════════
    if is_team_email(ctx.sender_email):
        print("   ⏭️  Action: IGNORE (Team member - Keep UNREAD)")
        return {"action": "ignored", "reason": "team_member"}
    
    # ═══════════════════════════════════════════════════
    # ADIM 2: Sistem/Bot E-postaları
    # Mailsuite daily reports gibi otomatik raporlar dahil.
    # Sadece IGNORE etmek yetmez — okundu da yap ki
    # inbox'ta kalmasınlar.
    # ═══════════════════════════════════════════════════
    if is_system_email(ctx.sender_email):
        print(f"   📨 Action: System/Bot email → Mark as read. ({ctx.sender_email})")
        mark_as_read(service, ctx.msg_id)
        return {"action": "read_only", "reason": "system_bot"}
    
    # ═══════════════════════════════════════════════════
    # ADIM 2.5: Transactional E-postalar (MailSuite vb.)
    # Okundu yap, geç — hiçbir işlem yapılmaz
    # ═══════════════════════════════════════════════════
    if is_transactional_email(ctx.sender_email, ctx.subject):
        print(f"   📨 Action: Transactional email (MailSuite vb.) → Mark as read only.")
        mark_as_read(service, ctx.msg_id)
        return {"action": "read_only", "reason": "transactional"}
    
    # ═══════════════════════════════════════════════════
    # ADIM 2.7: LLM Tabanlı Email İlgi Analizi
    # Email'in [İSİM]'ın sorumluluk alanında olup olmadığını
    # LLM ile belirle. Ödeme şikâyetleri, iş ortağı görüşmeleri
    # vb. [İSİM]'ın işi olmayan mailler sadece okundu yapılır.
    # NOT: Forward özelliği 2026-03-16'da kaldırıldı.
    # ═══════════════════════════════════════════════════
    relevance = classify_email_relevance(ctx.subject, ctx.body, ctx.sender_email)
    
    if relevance is None:
        # LLM 3 retry sonrası çöktü — keyword fallback'e düşmek yerine
        # bildirim gönder ve maili atla (güvenli tarafta kal)
        print(f"   ⚠️ LLM çöktü (3 retry sonrası) — maili atlıyorum, bildirim gönderiyorum.")
        try:
            from shared.notifier import send_alert
            send_alert(
                "Swc Email Responder: LLM Çöktü — Email Atlandı",
                f"LLM (Groq) 3 retry sonrası yanıt veremedi.\n"
                f"Aşağıdaki email işlenmeden atlandı:\n\n"
                f"From: {ctx.sender}\n"
                f"Subject: {ctx.subject}\n"
                f"Body (ilk 500 karakter):\n{ctx.body[:500]}\n\n"
                f"Bu emaili manuel olarak kontrol etmen gerekebilir."
            )
        except Exception:
            pass
        mark_as_read(service, ctx.msg_id)
        return {"action": "read_only", "reason": "llm_failure_skipped"}
    
    if relevance.get("category") in ("PAYMENT_COMPLAINT", "BUSINESS_PARTNER", "IRRELEVANT"):
        category = relevance["category"]
        confidence = relevance.get("confidence", 0)
        reason = relevance.get("reason", "")
        
        print(f"   🧠 LLM Analizi: {category} (confidence: {confidence:.0%})")
        print(f"      Sebep: {reason}")
        print(f"   🔇 Action: {category} → Mark as read only (no forward).")
        mark_as_read(service, ctx.msg_id)
        return {"action": "read_only", "reason": f"llm_{category.lower()}", "llm_confidence": confidence}
    
    # ═══════════════════════════════════════════════════
    # ADIM 3: Thread Başlangıcını Kontrol Et
    # ═══════════════════════════════════════════════════
    we_started = did_we_start_thread(service, ctx.thread_id)
    
    # ═══════════════════════════════════════════════════
    # ADIM 4: Onlar Başlattıysa → Cold/Spam'i filtrele,
    # GENUINE ise doğru Agent'a yönlendir
    # ═══════════════════════════════════════════════════
    # v2.4 refactor (2026-03-17): Eski kural tüm inbound maili
    # ignore ediyordu — genuine fırsatlar kaçıyordu.
    # Yeni kural: Sadece cold outreach/spam ignore edilir,
    # genuine inbound mailler agent'a yönlendirilir.
    # ═══════════════════════════════════════════════════
    if not we_started:
        # LLM tabanlı cold outreach tespiti (keyword fallback ile)
        cold_result = classify_cold_outreach(ctx.subject, ctx.body, ctx.sender_email)
        
        if cold_result and cold_result.get("confidence", 0) >= 0.7:
            # LLM yüksek confidence ile karar verdi
            cold_category = cold_result["category"]
            cold_confidence = cold_result.get("confidence", 0)
            cold_reason = cold_result.get("reason", "")
            
            if cold_category == "UGC_COLD":
                print(f"   🧠 LLM Cold Analizi: UGC_COLD (confidence: {cold_confidence:.0%})")
                print(f"      Sebep: {cold_reason}")
                print("   🔇 Action: UGC Cold Outreach → Mark as read only.")
                mark_as_read(service, ctx.msg_id)
                return {"action": "read_only", "reason": "ugc_cold", "method": "llm", "llm_confidence": cold_confidence}
            
            elif cold_category == "COLD_EMAIL":
                print(f"   🧠 LLM Cold Analizi: COLD_EMAIL (confidence: {cold_confidence:.0%})")
                print(f"      Sebep: {cold_reason}")
                print("   🔇 Action: Cold Email / Promotional → Mark as read only.")
                mark_as_read(service, ctx.msg_id)
                return {"action": "read_only", "reason": "cold_email", "method": "llm", "llm_confidence": cold_confidence}
            
            else:  # GENUINE
                print(f"   🧠 LLM Cold Analizi: GENUINE (confidence: {cold_confidence:.0%})")
                print(f"      Sebep: {cold_reason}")
                print("   ✅ Genuine inbound email → Agent'a yönlendirilecek.")
                # GENUINE inbound → ADIM 5'e düş, agent'a yönlendir
        
        else:
            # LLM çöktü (None) veya confidence düşük → keyword-based fallback
            fallback_reason = "llm_failure" if cold_result is None else f"low_confidence ({cold_result.get('confidence', 0):.0%})"
            print(f"   ⚠️ LLM cold analizi fallback: {fallback_reason} → keyword-based filtre kullanılıyor")
            
            if is_ugc_cold_outreach(ctx.subject, ctx.body):
                print("   🔇 Action: UGC Cold Outreach (keyword fallback) → Mark as read only.")
                mark_as_read(service, ctx.msg_id)
                return {"action": "read_only", "reason": "ugc_cold", "method": "keyword_fallback"}
            
            if is_cold_email(ctx.subject, ctx.body):
                print("   🔇 Action: Cold Email / Promotional (keyword fallback) → Mark as read only.")
                mark_as_read(service, ctx.msg_id)
                return {"action": "read_only", "reason": "cold_email", "method": "keyword_fallback"}
            
            # Cold/spam değil → genuine kabul et, agent'a yönlendir
            print("   ✅ Keyword fallback: cold değil → Agent'a yönlendirilecek.")
    
    # ═══════════════════════════════════════════════════
    # ADIM 5: Doğru Agent'a Yönlendir
    # Hem biz başlattığımız thread'ler hem de genuine
    # inbound mailler buraya düşer.
    # ═══════════════════════════════════════════════════
    source_label = "biz başlattık" if we_started else "genuine inbound"
    thread_type = determine_thread_type(service, ctx.thread_id, ctx.sender_email)
    
    print(f"   🧭 Thread tipi: {thread_type['type']} "
          f"(confidence: {thread_type['confidence']:.0%}, method: {thread_type['method']}, "
          f"kaynak: {source_label})")
    
    if thread_type["type"] == "CREATIVE_SOURCING":
        print("   🎬 → Creative Sourcing Agent'a yönlendiriliyor...")
        result = cs_agent.handle(ctx)
    else:
        print("   📱 → Influencer Program Agent'a yönlendiriliyor...")
        result = ip_agent.handle(ctx)
    
    return result
