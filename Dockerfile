# نعود للنسخة التي اشتغلت معك
FROM atendai/evolution-api:v2.2.2

# ----------------------------------------------------------------
# 1. إعدادات السيرفر
# ----------------------------------------------------------------
ENV SERVER_PORT=8080
ENV SERVER_TYPE=http
ENV SERVER_URL=https://surver-for-whatsapp.onrender.com

# ----------------------------------------------------------------
# 2. إعدادات الأمان (المفتاح الموحد)
# ----------------------------------------------------------------
ENV AUTHENTICATION_TYPE=apikey
ENV AUTHENTICATION_API_KEY=12345
# السماح بعرض التوثيق
ENV AUTHENTICATION_EXPOSE_IN_URL=true

# ----------------------------------------------------------------
# 3. إعدادات قاعدة البيانات (Neon)
# ----------------------------------------------------------------
ENV DATABASE_ENABLED=true
ENV DATABASE_PROVIDER=postgresql
# تأكد أن هذا الرابط هو رابط قاعدة بياناتك الصحيح
ENV DATABASE_CONNECTION_URI="postgresql://neondb_owner:npg_dOCMAKR5s2ye@ep-withered-tree-ah2npho3-pooler.c-3.us-east-1.aws.neon.tech/neondb?sslmode=require"
ENV DATABASE_CLIENT_NAME=evolution_exchange

# ----------------------------------------------------------------
# 4. تحسينات الذاكرة لـ Render (مهم جداً)
# ----------------------------------------------------------------
ENV NODE_OPTIONS="--max-old-space-size=460"
ENV TYPEBOT_ENABLED=false
ENV OPENAI_ENABLED=false
ENV CACHE_REDIS_ENABLED=false
# إعدادات المتصفح المخففة
ENV BROWSER_ARGS='["--no-sandbox","--disable-setuid-sandbox","--disable-dev-shm-usage","--disable-accelerated-2d-canvas","--no-first-run","--no-zygote","--single-process","--disable-gpu"]'

# ----------------------------------------------------------------
# 5. الويب هوك
# ----------------------------------------------------------------
ENV WEBHOOK_GLOBAL_URL="https://whatsapp-bot-jh7d.onrender.com/webhook"
ENV WEBHOOK_GLOBAL_ENABLED=true
ENV WEBHOOK_EVENTS_MESSAGE_UPSERT=true
ENV LOG_LEVEL=error

EXPOSE 8080
