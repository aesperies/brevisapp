# BREVIS 🚀

Newsletter management platform with AI summaries, tags, and multi-user support.

## 🎯 Features

### Free Plan ($0/month)
- ✅ 10 newsletters/month
- ✅ Email forwarding
- ✅ Read/unread tracking
- ✅ PDF export
- ✅ Search & filters

### Pro Plan ($9.99/month)
- ✅ **31 newsletters/month**
- ✅ **AI Summaries** (individual)
- ✅ **Batch Brief** (multi-newsletter summary)
- ✅ Tags & organization
- ✅ Multi-language (ES/EN)

### Premium Plan ($19.99/month)
- ✅ **Unlimited newsletters**
- ✅ **AI Summaries**
- ✅ **Batch Brief**
- ✅ **Full Reports** (comprehensive analysis)
- ✅ Everything from Pro
- ✅ Priority support

---

## 💰 Cost Analysis

### Per User/Month:
- **Free**: $0.10 (server only)
- **Pro**: $0.83 cost → $9.16 profit (92% margin)
- **Premium**: $3.70 cost → $16.29 profit (81% margin)

### At Scale (100 users):
- 50 Free: $5 cost
- 30 Pro: $299 revenue - $25 cost = **$274 profit**
- 20 Premium: $399 revenue - $74 cost = **$325 profit**
- **Total: ~$600/month profit**

---

## 🚀 Quick Start

### 1. Install Dependencies
```bash
npm install
```

### 2. Configure Environment
```bash
cp .env.example .env
nano .env
```

Required variables:
```
ANTHROPIC_API_KEY=your-key-here
JWT_SECRET=random-secret-string
```

### 3. Run the Server
```bash
npm start
```

Visit: http://localhost:3000

---

## 📁 Project Structure

```
brevis/
├── server.js              # Main backend server
├── database.js            # LowDB with tags & subscriptions
├── ai-service.js          # Claude API integration
├── auth.js                # JWT authentication
├── i18n/
│   ├── es.json           # Spanish translations
│   └── en.json           # English translations
├── public/
│   └── index.html        # Complete frontend
└── package.json
```

---

## 🎨 Features Explained

### 1. Tags & Organization
- Create custom tags with colors
- Assign multiple tags per newsletter
- Filter by tag
- Quick tag management

### 2. Multi-Select & Batch Operations
- Select multiple newsletters
- Generate "Brief" (bullet points)
- Generate "Report" (full analysis)
- Batch actions bar

### 3. AI Summaries
- **Individual**: 3-4 paragraph summary per newsletter
- **Brief**: Bullet points from multiple newsletters
- **Report**: Comprehensive analysis (Premium only)

### 4. Multi-Language
- Spanish / English toggle
- All UI translated
- AI responses in user's language

### 5. Plan Management
- Visual usage indicators
- Progress bars
- Upgrade prompts at limits
- Simplified upgrade flow (Stripe-ready)

---

## 🔧 Tech Stack

**Backend:**
- Node.js + Express
- LowDB (JSON database, M1-compatible)
- JWT authentication
- Claude Sonnet 4 API
- Stripe-ready (structure in place)

**Frontend:**
- React 18 (CDN)
- Vanilla CSS (Nothing-inspired design)
- jsPDF for PDF generation
- No build step required

---

## 💳 Stripe Integration (TODO)

Current setup has simplified upgrade for testing. To add Stripe:

1. **Install Stripe**:
```bash
npm install stripe
```

2. **Add to .env**:
```
STRIPE_SECRET_KEY=sk_live_xxx
STRIPE_WEBHOOK_SECRET=whsec_xxx
```

3. **Create Products** in Stripe Dashboard:
   - Pro: $9.99/month recurring
   - Premium: $19.99/month recurring

4. **Update `/api/plans/upgrade`** in `server.js`:
```javascript
// Replace simplified upgrade with:
const session = await stripe.checkout.sessions.create({
    customer_email: user.email,
    line_items: [{
        price: plan === 'pro' ? 'price_pro_id' : 'price_premium_id',
        quantity: 1,
    }],
    mode: 'subscription',
    success_url: `${FRONTEND_URL}/success`,
    cancel_url: `${FRONTEND_URL}/cancel`,
});
```

5. **Add webhook endpoint** for subscription events

---

## 📧 Email Setup

### Option 1: SendGrid (Recommended)
```bash
# 1. Configure Inbound Parse
# 2. Point to: https://yourdomain.com/api/webhook/email
# 3. All emails to *@yourdomain.com forward to webhook
```

### Option 2: Mailgun
```bash
# 1. Configure Routes
# 2. Pattern match: brief-*@yourdomain.com
# 3. Forward to webhook
```

### Option 3: CloudMailin
```bash
# Simple HTTP POST to your webhook
```

---

## 🚢 Deployment

### Railway (Easiest)
```bash
railway login
railway init
railway up

# Set environment variables in dashboard
railway variables set ANTHROPIC_API_KEY=xxx
railway variables set JWT_SECRET=xxx
```

### Render
1. Connect GitHub repo
2. Add environment variables
3. Deploy!

### VPS
```bash
# On server
npm install --production
npm install -g pm2
pm2 start server.js --name personal-brief
pm2 startup
pm2 save
```

---

## 🗄️ Database

Uses **LowDB** (JSON file: `db.json`)

### Schema:
```javascript
{
  users: [
    {
      id, email, password_hash, name, email_code,
      plan: 'free'|'pro'|'premium',
      newsletters_count, newsletters_limit,
      language: 'es'|'en'
    }
  ],
  newsletters: [
    { id, user_id, title, sender, content, summary, url, is_read, date_added }
  ],
  tags: [
    { id, user_id, name, color }
  ],
  newsletterTags: [
    { newsletter_id, tag_id }
  ]
}
```

### Backup:
```bash
cp db.json db-backup-$(date +%Y%m%d).json
```

---

## 🔐 Security

- ✅ Bcrypt password hashing (10 rounds)
- ✅ JWT tokens (30-day expiration)
- ✅ HTTP-only cookies
- ✅ Rate limiting (100 req/15min)
- ✅ Helmet.js security headers
- ✅ Input validation (express-validator)
- ✅ CORS protection

**Production Checklist:**
- [ ] Change JWT_SECRET
- [ ] Change admin password
- [ ] Enable HTTPS/SSL
- [ ] Configure firewall
- [ ] Set up backups
- [ ] Add monitoring (Sentry)

---

## 📊 API Endpoints

### Auth
- `POST /api/auth/register` - Create account
- `POST /api/auth/login` - Login
- `POST /api/auth/logout` - Logout
- `GET /api/auth/me` - Get current user
- `PUT /api/auth/settings` - Update settings

### Newsletters
- `GET /api/newsletters` - List all
- `POST /api/newsletters` - Create
- `PUT /api/newsletters/:id/read` - Toggle read
- `DELETE /api/newsletters/:id` - Delete
- `POST /api/newsletters/:id/summary` - Generate AI summary

### Batch AI
- `POST /api/newsletters/batch/brief` - Generate brief
- `POST /api/newsletters/batch/report` - Generate report (Premium)

### Tags
- `GET /api/tags` - List all
- `POST /api/tags` - Create
- `DELETE /api/tags/:id` - Delete
- `POST /api/newsletters/:id/tags/:tagId` - Add tag
- `DELETE /api/newsletters/:id/tags/:tagId` - Remove tag

### Plans
- `GET /api/plans` - List plans
- `GET /api/plans/current` - Current plan info
- `POST /api/plans/upgrade` - Upgrade (Stripe-ready)

---

## 🐛 Troubleshooting

### "ANTHROPIC_API_KEY not configured"
```bash
# Add to .env:
ANTHROPIC_API_KEY=sk-ant-xxx
```

### "Newsletter limit reached"
- Upgrade plan or wait for monthly reset
- Free: 10/month, Pro: 31/month, Premium: unlimited

### "Cannot find module"
```bash
rm -rf node_modules package-lock.json
npm install
```

### Port in use
```bash
lsof -ti:3000 | xargs kill
npm start
```

---

## 📈 Roadmap

### Phase 1 (Current) ✅
- Multi-user support
- AI summaries & reports
- Tags & organization
- 3-tier pricing
- Multi-language

### Phase 2 (Next)
- [ ] Stripe integration
- [ ] Email notifications
- [ ] Mobile app
- [ ] Browser extension
- [ ] Team accounts

### Phase 3 (Future)
- [ ] API for developers
- [ ] Zapier integration
- [ ] Advanced analytics
- [ ] Custom AI prompts
- [ ] Newsletter recommendations

---

## 🎯 Marketing Strategy

### Launch Checklist:
1. **Landing Page** with clear value prop
2. **Product Hunt** launch
3. **Free tier** to build user base
4. **Content marketing** (blog about newsletters)
5. **Twitter/X** presence
6. **Newsletter** about newsletters (meta!)
7. **Partnerships** with popular newsletters

### Pricing Psychology:
- Free: Get users in
- Pro ($9.99): Sweet spot for individuals
- Premium ($19.99): Power users & professionals

### Target Audience:
- 📰 Newsletter enthusiasts
- 💼 Professionals tracking industry news
- 🎓 Students/researchers
- 📊 Content creators
- 🚀 Founders staying updated

---

## 📝 License

MIT License - Use it, modify it, sell it!

---

## 🆘 Support

Issues? Questions?
- Open an issue on GitHub
- Email: support@brevisapp.com (coming soon)
- Twitter: @personalbrief (coming soon)

---

## 🙏 Credits

Built with:
- [Claude](https://claude.ai) by Anthropic
- [Express](https://expressjs.com/)
- [React](https://react.dev/)
- [LowDB](https://github.com/typicode/lowdb)
- Inspired by [Nothing](https://nothing.tech) design

---

**Made with ❤️ for newsletter readers everywhere**

**Ready to launch? Let's go! 🚀**
