# نستخدم نسخة CodeChat الخفيفة والمستقرة
FROM codechat/api:v1.3.4

# -----------------------------------------------
# 1. إعدادات السيرفر
# -----------------------------------------------
ENV PORT=8080

# -----------------------------------------------
# 2. إعدادات قاعدة البيانات (MongoDB) - لحفظ الجلسة
# -----------------------------------------------
ENV STORE_TYPE=mongodb
# 👇 تم تصحيح الرابط (حذفنا الأقواس < >)
ENV STORE_CONNECTION_URI="mongodb+srv://admin:db_abdallah12345@whatsapp-surver.kdxgo1l.mongodb.net/?retryWrites=true&w=majority&appName=whatsapp-surver"

# -----------------------------------------------
# 3. إعدادات الأمان
# -----------------------------------------------
ENV AUTHENTICATION_TYPE=apikey
ENV AUTHENTICATION_API_KEY=12345

# -----------------------------------------------
# 4. الويب هوك (ربط بالبوت)
# -----------------------------------------------
ENV WEBHOOK_URL="https://whatsapp-bot-jh7d.onrender.com/webhook"
ENV WEBHOOK_ENABLED=true
ENV WEBHOOK_EVENTS_MESSAGE_UPSERT=true
ENV WEBHOOK_EVENTS_ERRORS=false

# -----------------------------------------------
# 5. تحسينات الذاكرة لـ Render
# -----------------------------------------------
# تحديد سقف للذاكرة (400 ميجا) لمنع الانهيار
ENV NODE_OPTIONS="--max-old-space-size=400"
ENV LOG_LEVEL=error
ENV DEL_INSTANCE=false

EXPOSE 8080
