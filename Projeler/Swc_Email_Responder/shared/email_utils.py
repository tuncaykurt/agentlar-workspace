"""
Email Utility Functions — Ortak yardımcı fonksiyonlar
=====================================================
İsim çıkarma, header okuma, video link tespiti vb.
"""


def extract_name(sender_str, sender_email):
    """Gönderen bilgisinden gerçek ismi çıkar (sadece ilk isim)."""
    if "<" in sender_str:
        name = sender_str.split("<")[0].strip().strip('"').strip("'")
    else:
        name = sender_str.strip()
    
    if not name or len(name) < 2:
        local_part = sender_email.split("@")[0]
        clean = ''.join(c for c in local_part if c.isalpha() or c == '.')
        if clean:
            return clean.split('.')[0].capitalize()
        return None
    
    parts = name.split()
    if parts:
        return parts[0]
    return name


def extract_sender_email(sender_str):
    """Sender string'inden e-posta adresini çıkar."""
    if "<" in sender_str:
        return sender_str.split("<")[-1].strip(">").lower()
    return sender_str.lower()


def get_header(headers, name):
    """Headerlardan istenen değeri al."""
    return next((h['value'] for h in headers if h['name'] == name), '')


def has_video_link(body_text):
    """Mesajda video linki var mı kontrol et."""
    video_patterns = [
        "we.tl", "wetransfer", "swisstransfer", "drive.google.com",
        "dropbox.com", "youtu.be", "youtube.com", "vimeo.com",
        "mediafire.com", "mega.nz", "transfer.sh",
    ]
    body_lower = body_text.lower()
    return any(p in body_lower for p in video_patterns)
