"""Server-side sessions, Argon2 passwords, CSRF, role permissions."""
from __future__ import annotations
import hashlib
import hmac
import os
import secrets
from datetime import timedelta
from fastapi import Depends, HTTPException, Request, Response
from sqlalchemy import select
from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError, VerificationError
from .db import SessionLocal, User, SessionToken, PRODUCTION, now

hasher = PasswordHasher()
SESSION_NAME = "growa_session"
CSRF_NAME = "growa_csrf"
ONE_WEEK = timedelta(days=7)

def hash_password(password: str) -> str:
    return hasher.hash(password)

def bootstrap_admin():
    email = os.getenv("BOOTSTRAP_ADMIN_EMAIL", "").strip().lower()
    password = os.getenv("BOOTSTRAP_ADMIN_PASSWORD", "")
    if not email or not password:
        if PRODUCTION:
            raise RuntimeError("Set BOOTSTRAP_ADMIN_EMAIL and BOOTSTRAP_ADMIN_PASSWORD in production.")
        return
    if len(password) < 14 or password.lower() in ("password123456", "growalocal2026!", "changeme12345678"):
        raise RuntimeError("BOOTSTRAP_ADMIN_PASSWORD must be a strong, unique password of at least 14 characters.")
    with SessionLocal.begin() as db:
        existing = db.scalar(select(User).where(User.email == email))
        if existing is None:
            db.add(User(email=email, name="Administración Growa", role="admin", password_hash=hash_password(password)))

def verify_password(stored: str, password: str) -> bool:
    try:
        return bool(hasher.verify(stored, password))
    except (VerifyMismatchError, VerificationError, ValueError):
        return False

def token_digest(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()

def create_session(db, response: Response, user: User):
    raw = secrets.token_urlsafe(40)
    csrf = secrets.token_urlsafe(30)
    db.add(SessionToken(token_hash=token_digest(raw), user_id=user.id, expires_at=now() + ONE_WEEK))
    # Secure cookies are essential on the publicly served HTTPS demo too.
    secure_cookies=PRODUCTION or os.getenv("PUBLIC_BASE_URL","").startswith("https://")
    response.set_cookie(SESSION_NAME, raw, max_age=604800, httponly=True, secure=secure_cookies,
                        samesite="lax", path="/")
    response.set_cookie(CSRF_NAME, csrf, max_age=604800, httponly=False, secure=secure_cookies,
                        samesite="lax", path="/")
    return {"id":user.id, "name":user.name, "role":user.role, "email":user.email}

def revoke_session(request: Request, response: Response):
    raw = request.cookies.get(SESSION_NAME, "")
    if raw:
        with SessionLocal.begin() as db:
            record = db.get(SessionToken, token_digest(raw))
            if record: db.delete(record)
    response.delete_cookie(SESSION_NAME, path="/")
    response.delete_cookie(CSRF_NAME, path="/")

def current_user(request: Request) -> User:
    raw = request.cookies.get(SESSION_NAME, "")
    if not raw:
        raise HTTPException(401, "Inicia sesión para continuar.")
    with SessionLocal() as db:
        t = db.get(SessionToken, token_digest(raw))
        if not t or t.expires_at <= now():
            raise HTTPException(401, "Sesión vencida.")
        user = db.get(User, t.user_id)
        if not user or not user.active:
            raise HTTPException(401, "La cuenta no está disponible.")
        db.expunge(user)
        return user

def require(*roles: str):
    def check(user: User = Depends(current_user)) -> User:
        if user.role not in roles:
            raise HTTPException(403, "Tu cuenta no tiene permisos para esta operación.")
        return user
    return check

def check_csrf(request: Request):
    if request.method not in ("POST","PUT","PATCH","DELETE"):
        return
    if request.url.path == "/api/login":
        return
    cookie = request.cookies.get(CSRF_NAME, "")
    header = request.headers.get("x-csrf-token", "")
    if not cookie or not header or not hmac.compare_digest(cookie, header):
        raise HTTPException(403, "Protección CSRF: actualiza la sesión e inténtalo de nuevo.")
    origin = request.headers.get("origin")
    expected=os.getenv("PUBLIC_BASE_URL",str(request.base_url)).rstrip("/")
    if origin and origin.rstrip("/") != expected:
        # Render's proxy supplies the original scheme via forwarded headers.
        raise HTTPException(403, "Origen no autorizado.")
