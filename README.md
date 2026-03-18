# BTC Alert Engine — Deployment Guide

## How to Get This Live (15 minutes, no coding)

### Step 1: Create a GitHub Account
- Go to https://github.com
- Click "Sign up" and create a free account
- Verify your email

### Step 2: Upload This Project to GitHub
- Log into GitHub
- Click the **"+"** icon (top-right corner) → **"New repository"**
- Name it: `btc-alerts`
- Set to **Public**
- Click **"Create repository"**
- On the next page, click **"uploading an existing file"**
- Drag ALL the files and folders from this zip into the upload area:
  - `index.html`
  - `package.json`
  - `vite.config.js`
  - `.gitignore`
  - `src/` folder (with `main.jsx` and `App.jsx` inside)
- Click **"Commit changes"**

### Step 3: Deploy on Vercel (Free)
- Go to https://vercel.com
- Click **"Sign Up"** → Choose **"Continue with GitHub"**
- Authorize Vercel to access your GitHub
- Click **"Add New Project"**
- Find `btc-alerts` in your repo list → Click **"Import"**
- Leave all settings as default (Vercel auto-detects Vite)
- Click **"Deploy"**
- Wait 1-2 minutes. Done!

### Step 4: Access Your Dashboard
- Vercel gives you a URL like: `btc-alerts-xxxx.vercel.app`
- Open it on your phone, laptop, anywhere
- Bookmark it — this is your live alert dashboard
- It runs in your browser — no server needed

### Step 5: Get Alerts on Your Phone
- Open the Vercel URL on your phone's browser
- On iPhone: tap Share → "Add to Home Screen"
- On Android: tap Menu → "Add to Home Screen"
- Now it works like an app with sound alerts

## Notes
- The dashboard connects to Binance public APIs (no key needed)
- Alerts fire with sound when conditions are met
- Adjust thresholds in the Settings panel
- Keep the browser tab open for live monitoring
- Free Vercel hosting handles this perfectly — no paid plan needed
