"""Admin backoffice — API endpoints + self-contained HTML panel."""
import secrets
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.responses import HTMLResponse, JSONResponse
from pydantic import BaseModel, EmailStr
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..database import get_db
from ..deps import get_current_admin_user
from ..models import Challenge, Message, MoodLog, Session, User
from ..schemas import UserOut
from ..security import create_access_token, decode_token, verify_password

router = APIRouter(prefix="/admin", tags=["admin"])


# ── API: stats ──────────────────────────────────────────────────────────────

@router.get("/stats")
async def admin_stats(
    admin: User = Depends(get_current_admin_user),
    db: AsyncSession = Depends(get_db),
):
    total_users = (await db.execute(select(func.count(User.id)))).scalar() or 0
    premium_users = (
        await db.execute(select(func.count(User.id)).where(User.is_premium))
    ).scalar() or 0
    total_sessions = (await db.execute(select(func.count(Session.id)))).scalar() or 0
    total_messages = (await db.execute(select(func.count(Message.id)))).scalar() or 0
    total_mood_logs = (await db.execute(select(func.count(MoodLog.id)))).scalar() or 0
    total_challenges = (
        await db.execute(select(func.count(Challenge.id)))
    ).scalar() or 0
    return {
        "total_users": total_users,
        "premium_users": premium_users,
        "total_sessions": total_sessions,
        "total_messages": total_messages,
        "total_mood_logs": total_mood_logs,
        "total_challenges": total_challenges,
    }


# ── API: user management ────────────────────────────────────────────────────

@router.get("/users")
async def list_users(
    admin: User = Depends(get_current_admin_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(User).order_by(User.created_at.desc()).limit(100)
    )
    users = result.scalars().all()
    return [
        {
            "id": u.id,
            "email": u.email,
            "name": u.name,
            "is_premium": u.is_premium,
            "is_admin": u.is_admin,
            "email_verified": u.email_verified,
            "created_at": u.created_at.isoformat() if u.created_at else None,
        }
        for u in users
    ]


@router.get("/users/{user_id}")
async def get_user(
    user_id: int,
    admin: User = Depends(get_current_admin_user),
    db: AsyncSession = Depends(get_db),
):
    user = (await db.execute(select(User).where(User.id == user_id))).scalar_one_or_none()
    if not user:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "User not found")
    sessions = (
        await db.execute(
            select(Session).where(Session.user_id == user_id).order_by(Session.created_at.desc())
        )
    ).scalars().all()
    mood_logs = (
        await db.execute(
            select(MoodLog).where(MoodLog.user_id == user_id).order_by(MoodLog.created_at.desc()).limit(30)
        )
    ).scalars().all()
    return {
        "user": {
            "id": user.id,
            "email": user.email,
            "name": user.name,
            "is_premium": user.is_premium,
            "is_admin": user.is_admin,
            "email_verified": user.email_verified,
            "created_at": user.created_at.isoformat() if user.created_at else None,
        },
        "sessions": [
            {"id": s.id, "title": s.title, "created_at": s.created_at.isoformat() if s.created_at else None}
            for s in sessions
        ],
        "mood_logs": [
            {"id": m.id, "score": m.score, "label": m.label, "created_at": m.created_at.isoformat() if m.created_at else None}
            for m in mood_logs
        ],
    }


@router.put("/users/{user_id}/toggle-admin")
async def toggle_admin(
    user_id: int,
    admin: User = Depends(get_current_admin_user),
    db: AsyncSession = Depends(get_db),
):
    user = (await db.execute(select(User).where(User.id == user_id))).scalar_one_or_none()
    if not user:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "User not found")
    user.is_admin = not user.is_admin
    await db.commit()
    return {"id": user.id, "is_admin": user.is_admin}


@router.put("/users/{user_id}/toggle-premium")
async def toggle_premium(
    user_id: int,
    admin: User = Depends(get_current_admin_user),
    db: AsyncSession = Depends(get_db),
):
    user = (await db.execute(select(User).where(User.id == user_id))).scalar_one_or_none()
    if not user:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "User not found")
    user.is_premium = not user.is_premium
    await db.commit()
    return {"id": user.id, "is_premium": user.is_premium}


# ── Admin login (separate from app login, uses email+password) ─────────────

class AdminLoginIn(BaseModel):
    email: EmailStr
    password: str


@router.post("/login")
async def admin_login(body: AdminLoginIn, db: AsyncSession = Depends(get_db)):
    user = (await db.execute(select(User).where(User.email == body.email))).scalar_one_or_none()
    if not user or not verify_password(body.password, user.hashed_password):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid credentials")
    if not user.is_admin:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Admin access required")
    token = create_access_token(user.email, user.token_version)
    return {"access_token": token, "token_type": "bearer"}


# ── Self-contained HTML panel ───────────────────────────────────────────────

ADMIN_HTML = """<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Serene — Backoffice</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
:root{--bg:#f8f9fa;--card:#fff;--primary:#6C63FF;--primary-dark:#5A52D5;--text:#1a1a2e;--muted:#6b7280;--border:#e5e7eb;--success:#10b981;--danger:#ef4444;--radius:12px}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:var(--bg);color:var(--text);line-height:1.5}
.container{max-width:1200px;margin:0 auto;padding:20px}
h1{font-size:24px;font-weight:700;margin-bottom:8px}
h2{font-size:18px;font-weight:600;margin-bottom:12px}
.muted{color:var(--muted);font-size:14px}
.login-box{max-width:400px;margin:80px auto;background:var(--card);border-radius:var(--radius);padding:40px;box-shadow:0 1px 3px rgba(0,0,0,0.1)}
.login-box h1{font-size:28px;margin-bottom:24px;text-align:center}
.stats-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:16px;margin-bottom:32px}
.stat-card{background:var(--card);border-radius:var(--radius);padding:20px;box-shadow:0 1px 3px rgba(0,0,0,0.1);text-align:center}
.stat-card .number{font-size:32px;font-weight:700;color:var(--primary)}
.stat-card .label{font-size:13px;color:var(--muted);margin-top:4px}
input[type="email"],input[type="password"],input[type="text"]{width:100%;padding:10px 14px;border:1px solid var(--border);border-radius:8px;font-size:14px;margin-bottom:12px;outline:none;transition:border 0.2s}
input:focus{border-color:var(--primary)}
button{display:inline-flex;align-items:center;justify-content:center;padding:10px 20px;border:none;border-radius:8px;font-size:14px;font-weight:600;cursor:pointer;transition:all 0.2s}
.btn-primary{background:var(--primary);color:#fff;width:100%}
.btn-primary:hover{background:var(--primary-dark)}
.btn-sm{padding:5px 12px;font-size:12px}
.btn-danger{background:var(--danger);color:#fff}
.btn-success{background:var(--success);color:#fff}
.btn-outline{background:transparent;border:1px solid var(--border);color:var(--text)}
.btn-outline:hover{background:#f3f4f6}
table{width:100%;border-collapse:collapse;background:var(--card);border-radius:var(--radius);overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1)}
th{text-align:left;padding:12px 16px;background:#f3f4f6;font-size:13px;font-weight:600;color:var(--muted);text-transform:uppercase;letter-spacing:0.05em}
td{padding:12px 16px;border-top:1px solid var(--border);font-size:14px}
tr:hover td{background:#f9fafb}
.badge{display:inline-block;padding:2px 8px;border-radius:12px;font-size:11px;font-weight:600}
.badge-yes{background:#d1fae5;color:#065f46}
.badge-no{background:#f3f4f6;color:#6b7280}
.nav{display:flex;align-items:center;justify-content:space-between;margin-bottom:24px}
.tabs{display:flex;gap:8px;margin-bottom:24px}
.tab{padding:8px 16px;border-radius:8px;font-size:14px;font-weight:500;cursor:pointer;border:none;background:transparent;color:var(--muted)}
.tab.active{background:var(--primary);color:#fff}
.user-detail{background:var(--card);border-radius:var(--radius);padding:24px;box-shadow:0 1px 3px rgba(0,0,0,0.1);margin-bottom:24px}
.user-detail .row{display:flex;gap:24px;flex-wrap:wrap}
.user-detail .field{margin-bottom:12px}
.user-detail .field label{font-size:12px;color:var(--muted);text-transform:uppercase;display:block;margin-bottom:4px}
.user-detail .field value{font-size:16px;font-weight:500}
.empty{text-align:center;padding:40px;color:var(--muted)}
#app{display:none}
.spinner{display:inline-block;width:20px;height:20px;border:2px solid var(--border);border-top-color:var(--primary);border-radius:50%;animation:spin .6s linear infinite}
@keyframes spin{to{transform:rotate(360deg)}}
</style>
</head>
<body>
<div id="login-view" class="login-box">
<h1>Serene Admin</h1>
<form id="login-form">
<input type="email" id="email" placeholder="Email admin" required>
<input type="password" id="password" placeholder="Mot de passe" required>
<button type="submit" class="btn-primary">Se connecter</button>
<p id="login-error" style="color:var(--danger);font-size:13px;margin-top:12px;text-align:center"></p>
</form>
</div>

<div id="app" class="container">
<div class="nav">
<h1>Serene Backoffice</h1>
<button class="btn-outline btn-sm" onclick="logout()">Déconnexion</button>
</div>
<div class="tabs">
<button class="tab active" onclick="showTab('dashboard')">Dashboard</button>
<button class="tab" onclick="showTab('users')">Utilisateurs</button>
</div>
<div id="tab-dashboard"></div>
<div id="tab-users" style="display:none"></div>
<div id="tab-user-detail" style="display:none"></div>
</div>

<script>
const API = window.location.origin;
let token = localStorage.getItem('admin_token');

function authHeaders(){return{'Authorization':'Bearer '+token,'Content-Type':'application/json'}}
async function apiFetch(path,opts={}){
  const r=await fetch(API+path,{...opts,headers:{...authHeaders(),...(opts.headers||{})}});
  if(r.status===401){logout();throw new Error('Unauthorized')}
  if(!r.ok)throw new Error(await r.text());
  return r.json();
}

document.getElementById('login-form').onsubmit=async e=>{
  e.preventDefault();
  const email=document.getElementById('email').value;
  const password=document.getElementById('password').value;
  try{
    const r=await fetch(API+'/admin/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email,password})});
    const d=await r.json();
    if(!r.ok){document.getElementById('login-error').textContent=d.detail||'Erreur';return}
    token=d.access_token;localStorage.setItem('admin_token',token);showApp();
  }catch(err){document.getElementById('login-error').textContent='Erreur de connexion'}
};

function logout(){localStorage.removeItem('admin_token');token=null;document.getElementById('app').style.display='none';document.getElementById('login-view').style.display='block'}

async function showApp(){
  document.getElementById('login-view').style.display='none';
  document.getElementById('app').style.display='block';
  showTab('dashboard');
}

function showTab(name){
  document.querySelectorAll('.tab').forEach(t=>t.classList.remove('active'));
  document.querySelectorAll('.tabs .tab').forEach(t=>{if(t.textContent.toLowerCase().includes(name))t.classList.add('active')});
  document.getElementById('tab-dashboard').style.display=name==='dashboard'?'block':'none';
  document.getElementById('tab-users').style.display=name==='users'?'block':'none';
  document.getElementById('tab-user-detail').style.display='none';
  if(name==='dashboard')loadDashboard();
  if(name==='users')loadUsers();
}

async function loadDashboard(){
  const el=document.getElementById('tab-dashboard');
  el.innerHTML='<div class="spinner"></div>';
  try{
    const s=await apiFetch('/admin/stats');
    el.innerHTML=`<div class="stats-grid">
      <div class="stat-card"><div class="number">${s.total_users}</div><div class="label">Utilisateurs</div></div>
      <div class="stat-card"><div class="number">${s.premium_users}</div><div class="label">Premium</div></div>
      <div class="stat-card"><div class="number">${s.total_sessions}</div><div class="label">Sessions</div></div>
      <div class="stat-card"><div class="number">${s.total_messages}</div><div class="label">Messages</div></div>
      <div class="stat-card"><div class="number">${s.total_mood_logs}</div><div class="label">Mood Logs</div></div>
      <div class="stat-card"><div class="number">${s.total_challenges}</div><div class="label">Défis</div></div>
    </div>`;
  }catch(e){el.innerHTML='<p class="empty">Erreur de chargement</p>'}
}

async function loadUsers(){
  const el=document.getElementById('tab-users');
  el.innerHTML='<div class="spinner"></div>';
  try{
    const users=await apiFetch('/admin/users');
    if(!users.length){el.innerHTML='<p class="empty">Aucun utilisateur</p>';return}
    el.innerHTML=`<table><thead><tr><th>ID</th><th>Nom</th><th>Email</th><th>Premium</th><th>Admin</th><th>Inscrit</th><th>Actions</th></tr></thead><tbody>${users.map(u=>`<tr>
      <td>${u.id}</td><td>${u.name}</td><td>${u.email}</td>
      <td><span class="badge ${u.is_premium?'badge-yes':'badge-no'}">${u.is_premium?'Oui':'Non'}</span></td>
      <td><span class="badge ${u.is_admin?'badge-yes':'badge-no'}">${u.is_admin?'Oui':'Non'}</span></td>
      <td>${u.created_at?new Date(u.created_at).toLocaleDateString('fr-FR'):'-'}</td>
      <td><button class="btn-outline btn-sm" onclick="viewUser(${u.id})">Voir</button></td>
    </tr>`).join('')}</tbody></table>`;
  }catch(e){el.innerHTML='<p class="empty">Erreur de chargement</p>'}
}

async function viewUser(id){
  document.getElementById('tab-dashboard').style.display='none';
  document.getElementById('tab-users').style.display='none';
  const el=document.getElementById('tab-user-detail');el.style.display='block';
  el.innerHTML='<div class="spinner"></div>';
  try{
    const d=await apiFetch('/admin/users/'+id);
    const u=d.user;
    el.innerHTML=`<button class="btn-outline btn-sm" onclick="showTab('users')" style="margin-bottom:16px">← Retour</button>
    <div class="user-detail">
      <h2>${u.name} <span class="muted">(${u.email})</span></h2>
      <div class="row" style="margin-top:16px">
        <div class="field"><label>ID</label><value>${u.id}</value></div>
        <div class="field"><label>Premium</label><value><span class="badge ${u.is_premium?'badge-yes':'badge-no'}">${u.is_premium?'Oui':'Non'}</span></value></div>
        <div class="field"><label>Admin</label><value><span class="badge ${u.is_admin?'badge-yes':'badge-no'}">${u.is_admin?'Oui':'Non'}</span></value></div>
        <div class="field"><label>Email vérifié</label><value><span class="badge ${u.email_verified?'badge-yes':'badge-no'}">${u.email_verified?'Oui':'Non'}</span></value></div>
        <div class="field"><label>Inscrit le</label><value>${u.created_at?new Date(u.created_at).toLocaleDateString('fr-FR'):'-'}</value></div>
      </div>
      <div style="margin-top:16px;display:flex;gap:8px">
        <button class="btn-sm btn-outline" onclick="toggleAdmin(${u.id})">Toggle Admin</button>
        <button class="btn-sm btn-outline" onclick="togglePremium(${u.id})">Toggle Premium</button>
      </div>
    </div>
    <h2>Sessions (${d.sessions.length})</h2>
    ${d.sessions.length?`<table><thead><tr><th>ID</th><th>Titre</th><th>Date</th></tr></thead><tbody>${d.sessions.map(s=>`<tr><td>${s.id}</td><td>${s.title}</td><td>${s.created_at?new Date(s.created_at).toLocaleDateString('fr-FR'):'-'}</td></tr>`).join('')}</tbody></table>`:'<p class="empty">Aucune session</p>'}
    <h2 style="margin-top:24px">Humeurs (${d.mood_logs.length})</h2>
    ${d.mood_logs.length?`<table><thead><tr><th>Score</th><th>Label</th><th>Date</th></tr></thead><tbody>${d.mood_logs.map(m=>`<tr><td>${m.score}/10</td><td>${m.label}</td><td>${m.created_at?new Date(m.created_at).toLocaleDateString('fr-FR'):'-'}</td></tr>`).join('')}</tbody></table>`:'<p class="empty">Aucune humeur</p>'}
    `;
  }catch(e){el.innerHTML='<p class="empty">Erreur de chargement</p>'}
}

async function toggleAdmin(id){await apiFetch('/admin/users/'+id+'/toggle-admin',{method:'PUT'});viewUser(id)}
async function togglePremium(id){await apiFetch('/admin/users/'+id+'/toggle-premium',{method:'PUT'});viewUser(id)}

if(token)showApp();
</script>
</body>
</html>"""


@router.get("/panel", response_class=HTMLResponse)
async def admin_panel():
    return ADMIN_HTML
