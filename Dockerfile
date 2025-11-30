FROM atendai/evolution-api:v2.2.2

# ----------------------------------------------------------------
# 1. إعدادات السيرفر
# ----------------------------------------------------------------
ENV SERVER_PORT=8080
ENV SERVER_TYPE=http
# تأكد من أن هذا الرابط هو رابط سيرفر الواتس حقك
ENV SERVER_URL=https://surver-for-whatsapp.onrender.com
EXPOSE 8080

# ----------------------------------------------------------------
# 2. إعدادات الأمان
# ----------------------------------------------------------------
ENV AUTHENTICATION_TYPE=apikey
ENV AUTHENTICATION_API_KEY=12345

# ----------------------------------------------------------------
# 3. قاعدة البيانات (PostgreSQL) - الحل الجذري
# ----------------------------------------------------------------
ENV DATABASE_ENABLED=true
ENV DATABASE_PROVIDER=postgresql
# 👇👇 ضع الرابط الذي نسخته من الخطوة 1 هنا 👇👇
ENV DATABASE_CONNECTION_URI="postgresql://neondb_owner:npg_dOCMAKR5s2ye@ep-withered-tree-ah2npho3-pooler.c-3.us-east-1.aws.neon.tech/neondb?sslmode=require"
ENV DATABASE_CLIENT_NAME=evolution_exchange

# ----------------------------------------------------------------
# 4. الويب هوك (Webhook) - لربطه بالبوت
# ----------------------------------------------------------------
# رابط بوت البايثون
ENV WEBHOOK_GLOBAL_URL="https://whatsapp-bot-jh7d.onrender.com/webhook"
ENV WEBHOOK_GLOBAL_ENABLED=true
ENV WEBHOOK_EVENTS_MESSAGE_UPSERT=true
ENV WEBHOOK_EVENTS_QRCODE_UPDATED=true

# تقليل السجلات
ENV LOG_LEVEL=error
