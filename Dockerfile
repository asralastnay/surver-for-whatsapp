FROM atendai/evolution-api:v2.2.2

# ----------------------------------------------------------------
# 1. إعدادات السيرفر والمنفذ
# ----------------------------------------------------------------
ENV SERVER_PORT=8080
ENV SERVER_TYPE=http
ENV SERVER_URL=https://surver-for-whatsapp.onrender.com
EXPOSE 8080

# ----------------------------------------------------------------
# 2. إعدادات الأمان
# ----------------------------------------------------------------
ENV AUTHENTICATION_TYPE=apikey
ENV AUTHENTICATION_API_KEY=12345

# ----------------------------------------------------------------
# 3. ربط قاعدة البيانات (MongoDB) - هام جداً لحفظ الجلسة
# ----------------------------------------------------------------
ENV DATABASE_ENABLED=true
ENV DATABASE_PROVIDER=mongodb
# هنا وضعت رابطك مع كلمة المرور الجديدة المصححة
ENV DATABASE_CONNECTION_URI="mongodb+srv://admin:abdallah12345@whatsapp-surver.kdxgo1l.mongodb.net/?appName=whatsapp-surver"
ENV DATABASE_NAME=evolution_whatsapp

# ----------------------------------------------------------------
# 4. إعدادات الويب هوك (Webhook) - لربطه ببوت البايثون تلقائياً
# ----------------------------------------------------------------
# ضع رابط بوت البايثون هنا لكي لا تضطر لإعداده يدوياً كل مرة
ENV WEBHOOK_GLOBAL_URL="https://whatsapp-bot-jh7d.onrender.com/webhook"
ENV WEBHOOK_GLOBAL_ENABLED=true
# تفعيل استقبال الرسائل فقط
ENV WEBHOOK_EVENTS_MESSAGE_UPSERT=true
ENV WEBHOOK_EVENTS_QRCODE_UPDATED=true

# تقليل السجلات (Logs) لتوفير المساحة
ENV LOG_LEVEL=error
