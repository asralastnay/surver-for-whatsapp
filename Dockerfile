FROM devlikeapro/waha:latest

# إعدادات لتقليل استهلاك الذاكرة في راندر
ENV WHATSAPP_DEFAULT_ENGINE=WEBJS
ENV WAHA_PRINT_QR=True
ENV WAHA_DASHBOARD_USERNAME=admin
ENV WAHA_DASHBOARD_PASSWORD=admin
# تغيير المنفذ ليناسب راندر
ENV PORT=8080
EXPOSE 8080
