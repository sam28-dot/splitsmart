# SplitSmart — Complete Deployment Guide

**Stack:** Flask backend on Render (free) + React frontend on Vercel (free)  
**Total cost:** ₹0 / $0 forever on free tiers  
**Time to deploy:** ~15 minutes

---

## PART 1 — Gmail OTP Setup (5 minutes)

This is the most important step. Do this first.

### Step 1 — Enable 2-Step Verification on your Gmail

1. Go to **myaccount.google.com**
2. Click **Security** in the left sidebar
3. Under "How you sign in to Google", click **2-Step Verification**
4. Follow the prompts to enable it (takes 2 minutes)

> You must have 2-Step Verification ON before App Passwords work.

### Step 2 — Create an App Password

1. Go to **myaccount.google.com/apppasswords**  
   *(or: Google Account → Security → scroll down → App passwords)*
2. Under "App name", type: `SplitSmart`
3. Click **Create**
4. Google shows a **16-character password** like: `abcd efgh ijkl mnop`
5. **Copy it immediately** — you won't see it again

### Step 3 — Note your credentials

```
GMAIL_USER         = youremail@gmail.com
GMAIL_APP_PASSWORD = abcd efgh ijkl mnop   ← the 16-char password (spaces are fine)
```

> **Important:** Use a dedicated Gmail account for this, not your personal one.  
> If you don't have one, create one at gmail.com — it takes 2 minutes.

---

## PART 2 — Deploy Backend to Render (free)

### Step 1 — Create a GitHub repository

```bash
# In the splitsmart/backend/ folder:
git init
git add .
git commit -m "Initial commit"

# Create a new repo on github.com, then:
git remote add origin https://github.com/YOUR_USERNAME/splitsmart-backend.git
git push -u origin main
```

### Step 2 — Deploy on Render

1. Go to **render.com** → Sign up (free)
2. Click **New +** → **Web Service**
3. Connect your GitHub account → select `splitsmart-backend`
4. Fill in:
   - **Name:** `splitsmart-backend`
   - **Region:** Singapore (closest to India)
   - **Branch:** `main`
   - **Root Directory:** *(leave blank)*
   - **Runtime:** `Python 3`
   - **Build Command:** `pip install -r requirements.txt`
   - **Start Command:** `gunicorn app:app --bind 0.0.0.0:$PORT --workers 2 --timeout 120`
   - **Instance Type:** `Free`

5. Scroll down to **Environment Variables** → Add these one by one:

| Key | Value |
|-----|-------|
| `GMAIL_USER` | `youremail@gmail.com` |
| `GMAIL_APP_PASSWORD` | `abcd efgh ijkl mnop` |
| `JWT_SECRET` | Any long random string, e.g. `splitsmart-super-secret-jwt-key-2025-ahiwale-bante-bonde` |
| `FLASK_DEBUG` | `0` |
| `DATABASE_PATH` | `/data/splitwise.db` |

6. Scroll down to **Disks** → Click **Add Disk**:
   - **Name:** `splitsmart-db`
   - **Mount Path:** `/data`
   - **Size:** `1 GB`

7. Click **Create Web Service**

8. Wait ~3 minutes for first deploy. You'll see logs in real time.

9. Once deployed, copy your URL: `https://splitsmart-backend.onrender.com`

### Step 3 — Test the backend

Open your browser and visit:
```
https://splitsmart-backend.onrender.com/api/v1/health
```

You should see:
```json
{"status": "ok", "version": "2.0.0", "otp_mode": "gmail_smtp"}
```

If `otp_mode` says `console_dev`, your Gmail env vars aren't set correctly. Go back and re-check them.

---

## PART 3 — Deploy Frontend to Vercel (free)

### Step 1 — Create a GitHub repository

```bash
# In the splitsmart/frontend/ folder:
git init
git add .
git commit -m "Initial commit"

# Create a new repo on github.com, then:
git remote add origin https://github.com/YOUR_USERNAME/splitsmart-frontend.git
git push -u origin main
```

### Step 2 — Deploy on Vercel

1. Go to **vercel.com** → Sign up with GitHub (free)
2. Click **Add New Project**
3. Import `splitsmart-frontend` from GitHub
4. Configure:
   - **Framework Preset:** Vite
   - **Root Directory:** *(leave as `.`)*
   - **Build Command:** `npm run build`
   - **Output Directory:** `dist`

5. Expand **Environment Variables** → Add:

| Key | Value |
|-----|-------|
| `VITE_API_URL` | `https://splitsmart-backend.onrender.com/api/v1` |

6. Click **Deploy**

7. Wait ~2 minutes. Vercel gives you a URL like:  
   `https://splitsmart-frontend.vercel.app`

### Step 3 — Update backend CORS

Go back to **Render dashboard** → your backend service → **Environment** → add:

| Key | Value |
|-----|-------|
| `CORS_ORIGIN` | `https://splitsmart-frontend.vercel.app` |

Click **Save Changes** — Render redeploys automatically.

### Step 4 — Update invite link base URL

Add one more env var on Render:

| Key | Value |
|-----|-------|
| `FRONTEND_URL` | `https://splitsmart-frontend.vercel.app` |

---

## PART 4 — Test Everything

Visit your frontend URL and:

1. **Register** with your email → check your inbox for OTP
2. **Enter OTP** → you're in
3. **Create a group** → add an expense → check balances
4. **Generate invite link** → open in incognito → join as different user
5. **Download PDF report** → opens the settlement PDF

---

## Local Development (no Gmail needed)

When `GMAIL_USER` env var is not set, the app runs in **dev mode** — OTPs print to your terminal instead of being emailed.

```bash
# Terminal 1 — Backend
cd splitsmart/backend
pip install -r requirements.txt
python app.py
# Watch the terminal — OTP will print here when you register/login

# Terminal 2 — Frontend
cd splitsmart/frontend
npm install
npm run dev
# Open http://localhost:3000
```

When you register, your terminal shows:
```
==================================================
[DEV EMAIL] To: you@example.com
[DEV EMAIL] OTP CODE: 847291
==================================================
```

Just enter that code in the browser.

---

## Troubleshooting

### "OTP never arrives"
- Check spam folder
- Make sure 2-Step Verification is ON in your Google account
- Make sure App Password was created after enabling 2-Step Verification
- Verify `GMAIL_USER` matches exactly (no spaces)
- Verify `GMAIL_APP_PASSWORD` is the 16-char app password, not your Gmail password

### "Backend URL not working" / CORS error
- Make sure `CORS_ORIGIN` on Render matches your Vercel URL exactly (no trailing slash)
- Check Render logs for errors

### "Render service sleeps" (free tier limitation)
- Free Render services sleep after 15 minutes of inactivity
- First request after sleep takes ~30 seconds to wake up
- This is normal on free tier — paid tier ($7/mo) keeps it awake

### "SQLite data lost after Render redeploy"
- Make sure you added the **Disk** in Step 2.6 above
- The disk persists across deploys — your data is safe

---

## Quick Reference — All URLs

| Service | URL |
|---------|-----|
| Frontend | `https://splitsmart-frontend.vercel.app` |
| Backend API | `https://splitsmart-backend.onrender.com/api/v1` |
| Health check | `https://splitsmart-backend.onrender.com/api/v1/health` |
| Gmail App Passwords | `https://myaccount.google.com/apppasswords` |
| Render Dashboard | `https://dashboard.render.com` |
| Vercel Dashboard | `https://vercel.com/dashboard` |

---

*SplitSmart — by Samyak Ahiwale, Dipesh Bante & Yash Bonde*
