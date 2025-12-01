# تأكد أن السطر الأول هو هذا بالضبط
FROM codechat/api:v1.3.4

ENV PORT=8080

# إعدادات MongoDB
ENV STORE_TYPE=mongodb
ENV STORE_CONNECTION_URI="mongodb+srv://admin:abdallah12345@whatsapp-surver.kdxgo1l.mongodb.net/?retryWrites=true&w=majority&appName=whatsapp-surver"

# إعدادات الأمان
ENV AUTHENTICATION_TYPE=apikey
ENV AUTHENTICATION_API_KEY=12345

# الويب هوك
ENV WEBHOOK_URL="https://whatsapp-bot-jh7d.onrender.com/webhook"
ENV WEBHOOK_ENABLED=true
ENV WEBHOOK_EVENTS_MESSAGE_UPSERT=true
ENV WEBHOOK_EVENTS_ERRORS=false

ENV NODE_OPTIONS="--max-old-space-size=400"
ENV LOG_LEVEL=error
ENV DEL_INSTANCE=false

EXPOSE 8080
