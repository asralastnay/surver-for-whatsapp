# نستخدم النسخة 2.0.0 (الذهبية: مستقرة وخفيفة)
FROM attdevelopers/evolution-api:v2.0.0

# ----------------------------------------------------------------
# 1. إعدادات السيرفر
# ----------------------------------------------------------------
ENV SERVER_PORT=8080
ENV SERVER_TYPE=http
ENV SERVER_URL=https://surver-for-whatsapp.onrender.com

# ----------------------------------------------------------------
# 2. إعدادات الأمان
# ----------------------------------------------------------------
ENV AUTHENTICATION_TYPE=apikey
ENV AUTHENTICATION_API_KEY=12345
ENV AUTHENTICATION_EXPOSE_IN_URL=true

# ----------------------------------------------------------------
# 3. قاعدة البيانات (مع خدعة المسار الجديد)
# ----------------------------------------------------------------
ENV DATABASE_ENABLED=true
ENV DATABASE_PROVIDER=postgresql

# 👇 ركز هنا: أضفنا &search_path=v200 في نهاية الرابط
# هذا سيجعل البرنامج ينشئ جداول جديدة نظيفة ويتجاهل القديمة المعطوبة
ENV DATABASE_CONNECTION_URI="postgresql://neondb_owner:npg_dOCMAKR5s2ye@ep-withered-tree-ah2npho3-pooler.c-3.us-east-1.aws.neon.tech/neondb?sslmode=require&search_path=v200"
ENV DATABASE_CLIENT_NAME=evolution_exchange

# إعدادات الحفظ (لضمان بقاء الجلسة)
ENV DATABASE_SAVE_DATA_INSTANCE=true
ENV DATABASE_SAVE_DATA_NEW_MESSAGE=false
ENV DATABASE_SAVE_DATA_MESSAGES=false
ENV DATABASE_SAVE_DATA_CHATS=false
ENV DATABASE_SAVE_DATA_CONTACTS=false

# ----------------------------------------------------------------
# 4. تقليل الذاكرة (لإنجاح التشغيل في Render)
# ----------------------------------------------------------------
ENV NODE_OPTIONS="--max-old-space-size=400"
ENV TYPEBOT_ENABLED=false
ENV OPENAI_ENABLED=false
ENV CACHE_REDIS_ENABLED=false
# تعطيل WebSocket لتوفير الموارد
ENV WEBSOCKET_ENABLED=false 

# المتصفح المخفف
ENV BROWSER_ARGS='["--no-sandbox","--disable-setuid-sandbox","--disable-dev-shm-usage","--disable-accelerated-2d-canvas","--no-first-run","--no-zygote","--single-process","--disable-gpu"]'

# ----------------------------------------------------------------
# 5. الويب هوك
# ----------------------------------------------------------------
ENV WEBHOOK_GLOBAL_URL="https://whatsapp-bot-jh7d.onrender.com/webhook"
ENV WEBHOOK_GLOBAL_ENABLED=true
ENV WEBHOOK_EVENTS_MESSAGE_UPSERT=true
ENV WEBHOOK_EVENTS_ERRORS=false

EXPOSE 8080
