"""
Feedback Engine — AI Agent Kendi Kendini Geliştirme Mekanizması
================================================================
Bu script:
1. Gmail'den gerçek thread çiftlerini çeker (creator → [İSİM] yanıtı)
2. AI agent'ı aynı mesaja nasıl draft yazacağını simüle eder
3. [İSİM]'ın gerçek yanıtıyla AI draft'ını Groq LLM ile karşılaştırır
4. Her karşılaştırma için feedback puanı ve iyileştirme önerisi üretir
5. Tüm sonuçları kaydeder → agent bilgi tabanını iyileştirmek için kullanılır

Bu bir "offline backtesting" sistemidir. Gerçek email göndermez, sadece analiz yapar.

Kullanım:
    python feedback_engine.py               # Son 30 güne bak
    python feedback_engine.py --days 60     # Son 60 güne bak
    python feedback_engine.py --limit 5     # Sadece 5 thread test et
"""

import os
import sys
import json
import base64
import pickle
import argparse
from datetime import datetime

# Proje kök dizinini path'e ekle
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from shared.gmail_client import authenticate, extract_body
from shared.email_utils import extract_name, extract_sender_email, get_header
from shared.llm_client import (
    classify_thread_type, analyze_reply_intent,
    generate_draft, review_and_improve_draft, _call_groq
)
from router.dispatcher import determine_thread_type, CREATIVE_SOURCING_CONTACTS
from agents.creative_sourcing_agent import CreativeSourcingAgent, CS_KNOWLEDGE
from agents.influencer_program_agent import InfluencerProgramAgent, IP_KNOWLEDGE


# ══════════════════════════════════════════════════════════════════════
# ADIM 1: Gmail'den Gerçek Thread Çiftlerini Çek
# ══════════════════════════════════════════════════════════════════════

def extract_thread_pairs(service, days=30, limit=20):
    """
    Gmail'den 'creator yazdı → [İSİM] cevap verdi' çiftlerini çek.
    
    Her çift:
    {
        "thread_id": "...",
        "creator_email": "...",
        "creator_name": "...",
        "creator_message": "...",     # Creator'ın yazdığı
        "[isim]_reply": "...",       # [İSİM]'ın gerçek yanıtı
        "subject": "...",
        "thread_type": "CREATIVE_SOURCING" | "INFLUENCER_PROGRAM",
        "first_message_body": "...",  # Thread'in ilk mesajı (router için)
    }
    """
    print(f"📧 Son {days} günden thread çiftleri çekiliyor...")
    
    # EMAIL_ADRESI_BURAYA'in yanıtladığı thread'leri bul
    query = f"from:EMAIL_ADRESI_BURAYA newer_than:{days}d"
    results = service.users().messages().list(userId='me', q=query, maxResults=200).execute()
    messages = results.get('messages', [])
    
    if not messages:
        print("❌ Yanıtlanmış email bulunamadı.")
        return []
    
    print(f"   {len(messages)} yanıt mesajı bulundu. Thread çiftleri oluşturuluyor...")
    
    pairs = []
    seen_threads = set()
    
    for msg_meta in messages:
        if len(pairs) >= limit:
            break
        
        msg_id = msg_meta['id']
        
        try:
            # Bu mesajı çek
            msg_obj = service.users().messages().get(userId='me', id=msg_id, format='full').execute()
            thread_id = msg_obj['threadId']
            
            # Aynı thread'i tekrar işleme
            if thread_id in seen_threads:
                continue
            seen_threads.add(thread_id)
            
            # Thread'in tüm mesajlarını çek
            thread = service.users().threads().get(userId='me', id=thread_id, format='full').execute()
            thread_messages = thread.get('messages', [])
            
            if len(thread_messages) < 2:
                continue  # Tek mesajlı thread, çift yok
            
            # Thread'in ilk mesajını al (router analizi için)
            first_msg = thread_messages[0]
            first_sender = get_header(first_msg['payload']['headers'], 'From').lower()
            first_body = extract_body(first_msg['payload'])
            first_subject = get_header(first_msg['payload']['headers'], 'Subject')
            
            # "Creator yazdı → [İSİM] cevap verdi" çiftlerini bul
            for i in range(len(thread_messages) - 1):
                current_msg = thread_messages[i]
                next_msg = thread_messages[i + 1]
                
                current_sender = get_header(current_msg['payload']['headers'], 'From').lower()
                next_sender = get_header(next_msg['payload']['headers'], 'From').lower()
                
                # Creator yazdı → [İSİM] cevap verdi
                if 'sweatco.in' not in current_sender and 'sweatco.in' in next_sender:
                    creator_body = extract_body(current_msg['payload'])
                    [isim]_body = extract_body(next_msg['payload'])
                    
                    # Boş body'leri atla
                    if not creator_body.strip() or not [isim]_body.strip():
                        continue
                    
                    # Sistem emaillerini atla
                    if any(sd in current_sender for sd in ['noreply', 'no-reply', 'notification', '@google.com']):
                        continue
                    
                    creator_email = extract_sender_email(
                        get_header(current_msg['payload']['headers'], 'From')
                    )
                    creator_name_full = get_header(current_msg['payload']['headers'], 'From')
                    creator_name = extract_name(creator_name_full, creator_email) or "there"
                    
                    subject = get_header(current_msg['payload']['headers'], 'Subject') or first_subject
                    
                    # Thread tipini belirle
                    if any(cs.lower() in creator_email.lower() for cs in CREATIVE_SOURCING_CONTACTS):
                        thread_type = "CREATIVE_SOURCING"
                    elif 'sweatco.in' in first_sender:
                        # Biz başlattık ama CS listesinde değil → muhtemelen IP
                        thread_type = "INFLUENCER_PROGRAM"
                    else:
                        thread_type = "UNKNOWN"
                    
                    pairs.append({
                        "thread_id": thread_id,
                        "creator_email": creator_email,
                        "creator_name": creator_name,
                        "creator_message": creator_body[:3000],
                        "[isim]_reply": [isim]_body[:3000],
                        "subject": subject,
                        "thread_type": thread_type,
                        "first_message_body": first_body[:2000],
                        "first_message_subject": first_subject,
                    })
                    
                    # Bu thread'den bir çift yeter
                    break
        
        except Exception as e:
            print(f"   ⚠️ Thread {msg_id} işlenirken hata: {e}")
            continue
    
    print(f"   ✅ {len(pairs)} thread çifti oluşturuldu.")
    return pairs


# ══════════════════════════════════════════════════════════════════════
# ADIM 2: AI Agent'ı Simüle Et (Backtesting)
# ══════════════════════════════════════════════════════════════════════

def simulate_agent_response(pair):
    """
    Bir thread çifti için AI agent'ın ne yazacağını simüle et.
    Gerçekte email göndermez — sadece draft üretir.
    """
    context_type = pair["thread_type"]
    
    if context_type == "UNKNOWN":
        # LLM ile thread tipini belirle
        llm_result = classify_thread_type(
            pair["first_message_subject"],
            pair["first_message_body"]
        )
        if llm_result:
            context_type = llm_result.get("type", "INFLUENCER_PROGRAM")
        else:
            context_type = "INFLUENCER_PROGRAM"
    
    # Bilgi tabanını ve template'leri seç
    knowledge = CS_KNOWLEDGE if context_type == "CREATIVE_SOURCING" else IP_KNOWLEDGE
    
    # Intent analizi
    intent_result = analyze_reply_intent(
        reply_body=pair["creator_message"],
        reply_subject=pair["subject"],
        context_type=context_type,
        agent_knowledge=knowledge
    )
    
    if not intent_result:
        intent_result = {"intent": "UNCLEAR", "confidence": 0.5}
    
    # Template hint seç (agent'daki template'lerden)
    intent = intent_result.get("intent", "GENERAL")
    if context_type == "CREATIVE_SOURCING":
        from agents.creative_sourcing_agent import CS_TEMPLATES
        template_hint = CS_TEMPLATES.get(intent, CS_TEMPLATES.get("GENERAL", ""))
    else:
        from agents.influencer_program_agent import IP_TEMPLATES
        template_hint = IP_TEMPLATES.get(intent, IP_TEMPLATES.get("GENERAL", ""))
    
    # Draft üret
    draft_result = generate_draft(
        name=pair["creator_name"],
        reply_body=pair["creator_message"],
        intent_result=intent_result,
        context_type=context_type,
        agent_knowledge=knowledge,
        template_hint=template_hint
    )
    
    ai_draft = draft_result.get("draft", "") if draft_result else ""
    draft_confidence = draft_result.get("confidence", 0.5) if draft_result else 0.5
    needs_review = draft_result.get("needs_review", True) if draft_result else True
    
    # Draft review
    reviewed_draft = ai_draft
    review_info = None
    if needs_review and ai_draft:
        review_result = review_and_improve_draft(
            original_draft=ai_draft,
            reply_body=pair["creator_message"],
            name=pair["creator_name"],
            context_type=context_type,
            intent_result=intent_result,
            template_hint=template_hint
        )
        if review_result:
            reviewed_draft = review_result.get("improved_draft", ai_draft)
            review_info = {
                "changes_made": review_result.get("changes_made", "none"),
                "quality_score": review_result.get("quality_score", 5),
            }
    
    return {
        "context_type": context_type,
        "intent": intent_result,
        "initial_draft": ai_draft,
        "final_draft": reviewed_draft,
        "draft_confidence": draft_confidence,
        "review_info": review_info,
    }


# ══════════════════════════════════════════════════════════════════════
# ADIM 3: AI Draft vs [İSİM] Gerçek Yanıt Karşılaştırması
# ══════════════════════════════════════════════════════════════════════

def compare_with_human(pair, ai_result):
    """
    AI'ın ürettiği draft ile [İSİM]'ın gerçek yanıtını karşılaştır.
    LLM ile detaylı feedback üret.
    """
    messages = [
        {
            "role": "system",
            "content": """You are an expert email quality analyst. You will compare an AI-generated 
email draft with the ACTUAL email written by a human ([İSİM] from Sweatcoin).

Your task:
1. Compare the two emails side by side
2. Score the AI draft on several dimensions (1-10)
3. Identify specific differences and provide actionable feedback
4. Extract patterns that the AI should learn from

Be BRUTALLY HONEST. If the AI's draft would cause confusion or send the wrong message, 
say so clearly.

Respond in JSON:
{
    "overall_score": 1-10,
    "scores": {
        "intent_match": 1-10,       // Did AI correctly identify what the person wanted?
        "tone_match": 1-10,         // Is the tone similar to [İSİM]'s style?
        "content_accuracy": 1-10,   // Are the facts/links/details correct?
        "brevity": 1-10,            // Is the length appropriate?
        "would_send": true/false    // Would this draft be good enough to send as-is?
    },
    "critical_issues": ["list of serious problems, if any"],
    "differences": ["key differences between AI and human version"],
    "learning_points": ["specific things AI should incorporate for future emails"],
    "category_correct": true/false,  // Did AI classify the email type correctly?
    "summary": "1-2 sentence overall assessment"
}"""
        },
        {
            "role": "user",
            "content": f"""CONTEXT: {ai_result['context_type'].replace('_', ' ').title()}
CREATOR MESSAGE:
{pair['creator_message'][:1500]}

---

[İSİM]'S ACTUAL REPLY:
{pair['[isim]_reply'][:1500]}

---

AI AGENT'S DRAFT:
{ai_result['final_draft'][:1500]}

---

AI's detected intent: {ai_result['intent'].get('intent', 'UNCLEAR')}
AI's confidence: {ai_result['intent'].get('confidence', 0)}"""
        }
    ]
    
    result = _call_groq(messages, temperature=0.2, max_tokens=1200)
    return result


# ══════════════════════════════════════════════════════════════════════
# ADIM 4: Toplu Sonuç Analizi — Genel Eğilimler
# ══════════════════════════════════════════════════════════════════════

def generate_improvement_report(all_results):
    """
    Tüm feedback verilerini analiz edip genel iyileştirme raporu üret.
    Bu rapor, agent bilgi tabanını güncellemek için kullanılabilir.
    """
    messages = [
        {
            "role": "system",
            "content": """You are an AI training specialist. Analyze the backtesting results 
from an email automation system and produce a comprehensive improvement report.

Focus on:
1. PATTERNS: What mistakes does the AI consistently make?
2. STRENGTHS: What does the AI do well?
3. SPECIFIC FIXES: What exact changes should be made to templates/knowledge base?
4. PRIORITY: Order improvements by impact

Respond in JSON:
{
    "overall_grade": "A/B/C/D/F",
    "overall_accuracy": 0.0-1.0,
    "strengths": ["list of things AI does well"],
    "weaknesses": ["list of consistent problems"],
    "high_priority_fixes": [
        {"issue": "description", "fix": "specific action to take", "impact": "high/medium/low"}
    ],
    "template_updates": [
        {"template_name": "...", "current_issue": "...", "suggested_change": "..."}
    ],
    "knowledge_gaps": ["topics the AI doesn't know enough about"],
    "summary": "2-3 sentence executive summary"
}"""
        },
        {
            "role": "user",
            "content": f"Here are the backtesting results for {len(all_results)} email threads:\n\n{json.dumps(all_results, indent=2)[:8000]}"
        }
    ]
    
    result = _call_groq(messages, temperature=0.3, max_tokens=2000)
    return result


# ══════════════════════════════════════════════════════════════════════
# ANA FONKSİYON — Backtesting Pipeline
# ══════════════════════════════════════════════════════════════════════

def run_backtesting(days=30, limit=15):
    """
    Tam backtesting pipeline'ı çalıştır.
    
    1. Gmail'den thread çiftleri çek
    2. Her çift için AI simülasyonu yap
    3. AI vs Human karşılaştırması yap
    4. Genel iyileştirme raporu üret
    5. Sonuçları kaydet
    """
    print("=" * 70)
    print("🧪 FEEDBACK ENGINE — AI Agent Backtesting")
    print(f"   📅 Son {days} gün | 🔢 Max {limit} thread")
    print(f"   ⏰ {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print("=" * 70)
    
    # Gmail'e bağlan
    service = authenticate()
    
    # 1. Thread çiftlerini çek
    pairs = extract_thread_pairs(service, days=days, limit=limit)
    
    if not pairs:
        print("❌ Test edilecek thread çifti bulunamadı.")
        return
    
    # 2 & 3. Her çift için AI simülasyonu + karşılaştırma
    all_results = []
    scores = []
    
    for i, pair in enumerate(pairs):
        print(f"\n{'─' * 60}")
        print(f"📧 [{i+1}/{len(pairs)}] Thread: {pair['subject'][:50]}...")
        print(f"   Creator: {pair['creator_name']} <{pair['creator_email']}>")
        print(f"   Type: {pair['thread_type']}")
        
        # AI simülasyonu
        print(f"   🤖 AI agent simüle ediliyor...")
        ai_result = simulate_agent_response(pair)
        
        if not ai_result["final_draft"]:
            print(f"   ⚠️ AI draft üretemedi, atlanıyor.")
            continue
        
        print(f"   🔍 AI intent: {ai_result['intent'].get('intent', '?')} "
              f"(confidence: {ai_result['intent'].get('confidence', 0):.0%})")
        
        # Karşılaştırma
        print(f"   📊 [İSİM] vs AI karşılaştırılıyor...")
        comparison = compare_with_human(pair, ai_result)
        
        if comparison:
            score = comparison.get("overall_score", 0)
            would_send = comparison.get("scores", {}).get("would_send", False)
            scores.append(score)
            
            status = "✅" if score >= 7 else "⚠️" if score >= 5 else "❌"
            print(f"   {status} Skor: {score}/10 | Gönderilebilir: {'Evet' if would_send else 'Hayır'}")
            
            if comparison.get("critical_issues"):
                for issue in comparison["critical_issues"][:2]:
                    print(f"   🔴 Kritik: {issue}")
        else:
            comparison = {"overall_score": 0, "summary": "Karşılaştırma yapılamadı"}
        
        result_entry = {
            "thread_id": pair["thread_id"],
            "creator_email": pair["creator_email"],
            "creator_name": pair["creator_name"],
            "subject": pair["subject"],
            "thread_type": pair["thread_type"],
            "ai_detected_type": ai_result["context_type"],
            "ai_intent": ai_result["intent"].get("intent", "UNCLEAR"),
            "ai_confidence": ai_result["intent"].get("confidence", 0),
            "ai_draft_preview": ai_result["final_draft"][:300],
            "human_reply_preview": pair["[isim]_reply"][:300],
            "review_info": ai_result.get("review_info"),
            "comparison": comparison,
        }
        all_results.append(result_entry)
    
    # 4. Genel rapor
    print(f"\n{'=' * 70}")
    print(f"📊 GENEL SONUÇLAR")
    print(f"{'=' * 70}")
    
    if scores:
        avg_score = sum(scores) / len(scores)
        good = sum(1 for s in scores if s >= 7)
        ok = sum(1 for s in scores if 5 <= s < 7)
        bad = sum(1 for s in scores if s < 5)
        
        print(f"   📈 Ortalama Skor: {avg_score:.1f}/10")
        print(f"   ✅ İyi (7+):    {good}/{len(scores)}")
        print(f"   ⚠️  Orta (5-6):  {ok}/{len(scores)}")
        print(f"   ❌ Kötü (<5):   {bad}/{len(scores)}")
    
    # İyileştirme raporu
    print(f"\n   🧪 İyileştirme raporu üretiliyor...")
    improvement_report = generate_improvement_report(all_results)
    
    if improvement_report:
        grade = improvement_report.get("overall_grade", "?")
        accuracy = improvement_report.get("overall_accuracy", 0)
        print(f"   📊 Genel Not: {grade}")
        print(f"   🎯 Doğruluk: {accuracy:.0%}")
        
        print(f"\n   💪 Güçlü Yanlar:")
        for s in improvement_report.get("strengths", [])[:3]:
            print(f"      + {s}")
        
        print(f"\n   🔧 İyileştirme Alanları:")
        for fix in improvement_report.get("high_priority_fixes", [])[:5]:
            print(f"      [{fix.get('impact', '?').upper()}] {fix.get('issue', '?')}")
            print(f"          → {fix.get('fix', '?')}")
    
    # 5. Sonuçları kaydet
    output = {
        "timestamp": datetime.now().isoformat(),
        "config": {"days": days, "limit": limit, "model": os.environ.get('GROQ_MODEL', 'openai/gpt-oss-120b')},
        "summary": {
            "total_tested": len(all_results),
            "average_score": round(avg_score, 2) if scores else 0,
            "scores_distribution": {"good": good, "ok": ok, "bad": bad} if scores else {},
        },
        "improvement_report": improvement_report,
        "detailed_results": all_results,
    }
    
    output_dir = os.path.dirname(os.path.abspath(__file__))
    output_path = os.path.join(output_dir, "feedback_results.json")
    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(output, f, indent=2, ensure_ascii=False)
    
    print(f"\n   💾 Detaylı sonuçlar kaydedildi: {output_path}")
    
    # Öğrenilmiş kalıpları ayrı bir dosyaya da kaydet (agent'ların okuması için)
    if improvement_report:
        learned_path = os.path.join(output_dir, "learned_patterns.json")
        learned = {
            "last_updated": datetime.now().isoformat(),
            "overall_grade": improvement_report.get("overall_grade", "?"),
            "template_updates": improvement_report.get("template_updates", []),
            "knowledge_gaps": improvement_report.get("knowledge_gaps", []),
            "high_priority_fixes": improvement_report.get("high_priority_fixes", []),
        }
        with open(learned_path, 'w', encoding='utf-8') as f:
            json.dump(learned, f, indent=2, ensure_ascii=False)
        print(f"   💾 Öğrenilmiş kalıplar kaydedildi: {learned_path}")
    
    print(f"\n{'=' * 70}")
    print("✅ Backtesting tamamlandı!")
    print(f"{'=' * 70}")
    
    return output


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='AI Agent Feedback Engine — Backtesting')
    parser.add_argument('--days', type=int, default=30, help='Kaç günlük geçmişe bakılsın (varsayılan: 30)')
    parser.add_argument('--limit', type=int, default=15, help='Kaç thread test edilsin (varsayılan: 15)')
    args = parser.parse_args()
    
    run_backtesting(days=args.days, limit=args.limit)
