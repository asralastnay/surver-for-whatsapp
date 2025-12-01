# ⚠️ التغيير الجذري: عدنا للنسخة v2.1.1 لأنها أخف من v2.2.2 ومستقرة على Render
FROM atendai/evolution-api:v2.1.1

# 1. إعدادات السيرفر
ENV SERVER_PORT=8080
ENV SERVER_TYPE=http
ENV SERVER_URL=https://surver-for-whatsapp.onrender.com

# 2. إعدادات الأمان (المفتاح الموحد)
ENV AUTHENTICATION_TYPE=apikey
ENV AUTHENTICATION_API_KEY=12345
ENV AUTHENTICATION_EXPOSE_IN_URL=true

# 3. قاعدة البيانات (ضرورية لحفظ الجلسة)
ENV DATABASE_ENABLED=true
ENV DATABASE_PROVIDER=postgresql
ENV DATABASE_CONNECTION_URI="postgresql://neondb_owner:npg_dOCMAKR5s2ye@ep-withered-tree-ah2npho3-pooler.c-3.us-east-1.aws.neon.tech/neondb?sslmode=require"
ENV DATABASE_CLIENT_NAME=evolution_exchange
ENV DATABASE_SAVE_DATA_INSTANCE=true

# 🚫 تعطيل كل شيء يستهلك الذاكرة (مهم جداً)
ENV DATABASE_SAVE_DATA_NEW_MESSAGE=false
ENV DATABASE_SAVE_DATA_MESSAGES=false
ENV DATABASE_SAVE_DATA_CHATS=false
ENV DATABASE_SAVE_DATA_CONTACTS=false
ENV TYPEBOT_ENABLED=false
ENV OPENAI_ENABLED=false
ENV CACHE_REDIS_ENABLED=false

# 4. تحسينات الذاكرة القصوى
# نحدد للعملية أن تستخدم 400 ميجا فقط وتترك الباقي للنظام
ENV NODE_OPTIONS="--max-old-space-size=400"

# 5. الويب هوك
ENV WEBHOOK_GLOBAL_URL="https://whatsapp-bot-jh7d.onrender.com/webhook"
ENV WEBHOOK_GLOBAL_ENABLED=true
ENV WEBHOOK_EVENTS_MESSAGE_UPSERT=true

EXPOSE 8080
