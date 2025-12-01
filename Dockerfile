# نستخدم الصورة الرسمية للنسخة 2.2.2 (أكثر استقراراً من atendai)
FROM atendai/evolution-api:v2.2.1

# ----------------------------------------------------------------
# 1. إعدادات السيرفر الأساسية
# ----------------------------------------------------------------
ENV SERVER_PORT=8080
ENV SERVER_TYPE=http
ENV SERVER_URL=https://surver-for-whatsapp.onrender.com

# ----------------------------------------------------------------
# 2. إعدادات الأمان (المفتاح)
# ----------------------------------------------------------------
ENV AUTHENTICATION_TYPE=apikey
ENV AUTHENTICATION_API_KEY=12345
# السماح بظهور واجهة التحكم (Swagger/Manager)
ENV AUTHENTICATION_EXPOSE_IN_URL=true

# ----------------------------------------------------------------
# 3. قاعدة البيانات (أهم جزء لعدم ضياع الباركود)
# ----------------------------------------------------------------
ENV DATABASE_ENABLED=true
ENV DATABASE_PROVIDER=postgresql
# رابط قاعدة بياناتك في Neon (صحيح)
ENV DATABASE_CONNECTION_URI="postgresql://neondb_owner:npg_dOCMAKR5s2ye@ep-withered-tree-ah2npho3-pooler.c-3.us-east-1.aws.neon.tech/neondb?sslmode=require"
ENV DATABASE_CLIENT_NAME=evolution_exchange

# ⚠️ إعدادات حفظ الجلسة في قاعدة البيانات (الإضافة الجديدة المهمة)
# هذا يضمن أنك لا تمسح الباركود كل مرة يعيد فيها السيرفر التشغيل
ENV DATABASE_SAVE_DATA_INSTANCE=true
ENV DATABASE_SAVE_DATA_NEW_MESSAGE=false
ENV DATABASE_SAVE_DATA_MESSAGES=false
ENV DATABASE_SAVE_DATA_CHATS=false
ENV DATABASE_SAVE_DATA_CONTACTS=false

# ----------------------------------------------------------------
# 4. تحسينات الذاكرة لـ Render (Free Tier)
# ----------------------------------------------------------------
# تقليل استهلاك الرام للحد الأقصى
ENV NODE_OPTIONS="--max-old-space-size=460"

# تعطيل الخدمات غير الضرورية لتوفير الموارد
ENV TYPEBOT_ENABLED=false
ENV OPENAI_ENABLED=false
ENV CACHE_REDIS_ENABLED=false
ENV S3_ENABLED=false

# إعدادات المتصفح المخففة جداً
ENV BROWSER_ARGS='["--no-sandbox","--disable-setuid-sandbox","--disable-dev-shm-usage","--disable-accelerated-2d-canvas","--no-first-run","--no-zygote","--single-process","--disable-gpu"]'

# ----------------------------------------------------------------
# 5. الويب هوك (Webhook)
# ----------------------------------------------------------------
ENV WEBHOOK_GLOBAL_URL="https://whatsapp-bot-jh7d.onrender.com/webhook"
ENV WEBHOOK_GLOBAL_ENABLED=true
# تفعيل استقبال الرسائل فقط (لتخفيف الضغط)
ENV WEBHOOK_EVENTS_MESSAGE_UPSERT=true
ENV WEBHOOK_EVENTS_ERRORS=false
ENV WEBHOOK_EVENTS_STATUS_INSTANCE=false

# مستوى اللوج (نجعله error فقط لتنظيف الشاشة)
ENV LOG_LEVEL=error

EXPOSE 8080
