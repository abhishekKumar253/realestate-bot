# 🏠 LeadKaro – AI WhatsApp Lead Qualification Bot for Real Estate

> **Production‑ready WhatsApp bot for real estate builders and brokers.**  
> Automatically captures, qualifies, and delivers property leads 24×7.  
> Built for Ranchi, India – works on existing WhatsApp number, no app install required.

---

## 📌 Problem It Solves

Real estate builders lose **30‑50% of WhatsApp enquiries** because:

- No one replies at night, on weekends, or during site visits.
- Manual follow‑up is slow – leads go cold and move to competitors.
- No system to capture, qualify, or nurture leads automatically.

**LeadKaro solves this by automating the entire lead qualification process.**

---

## 🚀 Key Features

### ✅ Lead Qualification (Rapid 5‑Question Mode)

- Asks only 5 core questions:
  - Property Type (Apartment, Villa, Plot, Commercial)
  - BHK (1/2/3/4+)
  - Location (Area in Ranchi)
  - Budget (in ₹ Lakhs/Crores)
  - Timeline (1 month / 3 months / 6 months / 6+ months)
- Extra fields (amenities, possession, loan, site visit) are auto‑captured if mentioned by user – **never forced**.

### ✅ Instant Builder Notification

- As soon as a lead is fully qualified, the bot sends a **detailed WhatsApp message** to the builder’s phone.
- Includes name, phone, property type, BHK, location, budget, timeline, and any extra info (amenities, possession, etc.).
- Plain text – no template approval issues, works within 24‑hour window.

### ✅ Voice Note Transcription

- Audio messages are transcribed via **OpenAI Whisper**.
- Fallback message if transcription fails.

### ✅ Daily Summary (9 AM IST)

- Every morning, each builder receives a WhatsApp summary:
  - New leads today, qualified leads, total leads, lost leads.
  - Up to 5 new leads with details.
  - CSV export link.

### ✅ CSV Export

- Secure endpoint: `/export/leads?token=BUILDER_VERIFY_TOKEN`
- Returns CSV with BOM for Excel – supports Hindi characters.

### ✅ Automated Follow‑ups

- Cron job every 2 hours sends:  
  *“Kya aap abhi bhi interested hain?”*  
  to leads inactive for 20+ hours (7‑day cooldown).

### ✅ Opt‑Out Handling

- Recognises phrases like `stop`, `band karo`, `unsubscribe`.
- Marks lead as **LOST** and sends confirmation.

### ✅ Conversation Reset

- After a conversation is `COMPLETED`, the next user message starts a **fresh conversation** – all previous lead fields cleared.

### ✅ Duplicate Detection

- Uses `whatsappMessageId` unique constraint – duplicate webhook deliveries are automatically skipped.

### ✅ Builder Caching

- In‑memory cache with 5‑minute TTL – reduces database hits.

### ✅ Enum Safety

- All updates use Prisma enums – prevents database crashes from invalid AI output.

### ✅ Typing Indicator

- Sent immediately after extraction – faster perceived speed.

### ✅ Default Fallback

- If OpenAI fails, bot replies with a polite default message.

---

## 🧰 Tech Stack

| Category | Technology |
|----------|------------|
| **Runtime** | Node.js v22 + TypeScript |
| **Framework** | Express.js |
| **Database** | PostgreSQL (Neon) + Prisma ORM |
| **AI/LLM** | OpenAI GPT‑4o‑mini, Whisper |
| **WhatsApp** | Meta Cloud API v19.0 (axios) |
| **Hosting** | Railway |
| **Logging** | Pino |
| **Error Tracking** | Sentry |
| **Validation** | Zod |
| **Encryption** | AES‑256‑GCM (builder tokens) |



## 🚀 Getting Started

### Prerequisites

- Node.js v22+
- PostgreSQL database (Neon recommended)
- WhatsApp Business API access (Meta Developer account)
- OpenAI API key

### Environment Variables

Create a `.env` file:

```env
PORT=5000
NODE_ENV=development

WHATSAPP_VERIFY_TOKEN=your_verify_token
WHATSAPP_ACCESS_TOKEN=your_access_token
WHATSAPP_PHONE_NUMBER_ID=your_phone_number_id
WHATSAPP_APP_SECRET=your_app_secret

DATABASE_URL=postgresql://...
DIRECT_URL=postgresql://...

OPENAI_API_KEY=sk-...
TOKEN_ENCRYPTION_KEY=64_hex_chars

SENTRY_DSN=optional


# Installation

git clone https://github.com/abhishekKumar253/leadkaro-bot.git
cd leadkaro-bot
npm install

# Set up database
npx prisma migrate dev --name init
npx prisma generate

# Build and start
npm run build
npm start


Add a Builder
npx tsx scripts/createBuilder.ts \
  --name "Builder Name" \
  --phoneNumberId "123456789" \
  --accessToken "EAA..." \
  --wabaId "987654321" \
  --verifyToken "secret_token" \
  --phone "+919876543210"


🤝 Contributing
This is a solo project, but ideas and suggestions are welcome.
Contact: abhishekdev.work253@gmail.com


📄 License
MIT © Abhishek Kumar

📞 Contact
Email: abhishekdev.work253@gmail.com


GitHub: @abhishekKumar253

Demo Bot: +91 95084 01018 (send Hi to try)


