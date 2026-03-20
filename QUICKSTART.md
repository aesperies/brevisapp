# 🚀 QUICK START - BREVIS

## ⚡ Get Running in 5 Minutes

### 1. Install
```bash
cd brevis
npm install
```

### 2. Configure
```bash
cp .env.example .env
```

Edit `.env` and add:
```
ANTHROPIC_API_KEY=your-key-here
JWT_SECRET=any-random-string
```

Get API key: https://console.anthropic.com/

### 3. Start
```bash
npm start
```

### 4. Open
```
http://localhost:3000
```

### 5. Create Account
- Click "Registrarse"
- Fill in details
- You get:
  - Free plan (unlimited newsletters)
  - Unique email code: `brief-xxxxx@newsletters.brevisapp.com`

---

## ✨ What You Get

### Free Users
- Unlimited newsletters
- Email forwarding
- PDF export
- Search & filters

### Standard ($8/month)
- Unlimited newsletters
- ✅ **AI Summaries**
- ✅ **Batch Brief**
- Tags & organization

### Premium ($10/month)
- Unlimited newsletters
- ✅ **AI Summaries**
- ✅ **Batch Brief**
- ✅ **Full Reports**

---

## 🎯 Key Features

1. **Tags**: Create colored tags, organize newsletters
2. **Multi-Select**: Select multiple → Generate Brief/Report
3. **AI Summaries**: Click "Resumen" on any newsletter
4. **Batch Brief**: Select 5-10 newsletters → Brief (bullet points)
5. **Full Report**: Select newsletters → Report (detailed analysis, Premium only)
6. **Multi-Language**: Toggle ES/EN in header

---

## 💡 Pro Tips

### Upgrading Plans
In the current version, upgrades are simplified for testing:
- Click "Upgrade" button
- Select plan
- ✅ Done (no payment required)

For production, integrate Stripe (see README.md)

### Testing AI Features
1. Add a few newsletters (use "+ Añadir" button)
2. Click "Resumen" on any newsletter (Pro/Premium only)
3. Select 3-5 newsletters → Click "☐ Select" → Click "Brief"
4. View AI-generated summary!

### Adding Tags
1. Click "Etiquetas" button
2. Create tags with colors
3. On newsletters, click "+ Tag" to assign
4. Filter by clicking tag chips

---

## 🐛 Common Issues

**"ANTHROPIC_API_KEY not configured"**
→ Add your API key to `.env` file


**Port 3000 in use**
```bash
lsof -ti:3000 | xargs kill
npm start
```

---

## 📊 Understanding the Numbers

Your app costs per 100 newsletters:
- AI Summaries: ~$1.70
- Batch operations: ~$0.80 extra
- Server: ~$0.50

With pricing at $9.99 (Pro) and $19.99 (Premium), you have excellent margins (80-90%).

---

## 🚀 Ready for Production?

1. ✅ Add Stripe integration (see README.md)
2. ✅ Configure email service (SendGrid/Mailgun)
3. ✅ Deploy to Railway/Render
4. ✅ Point domain to server
5. ✅ Launch!

---

## 🎉 You're Ready!

Open http://localhost:3000 and start using BREVIS.

Questions? Check the full README.md for detailed documentation.

**Happy newsletter reading! 📬**
