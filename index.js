const { makeWASocket, DisconnectReason, WAMessageStubType, generateWAMessage } = require('@whiskeysockets/baileys');
const { WAStore } = require('wa-store');
const pino = require('pino');
const express = require('express');
const axios = require('axios');
const qrcode = require('qrcode-terminal');

// ---------------------------------------------------------------------
// 1. المتغيرات الهامة من البيئة (Render Environment Variables)
// ---------------------------------------------------------------------
// هذه المتغيرات يتم جلبها من لوحة تحكم Render
const WEBHOOK_URL = process.env.WEBHOOK_URL; 
const DATABASE_URL = process.env.DATABASE_URL;
const API_KEY = process.env.API_KEY; // مفتاح التحكم السري
const PORT = process.env.PORT || 3000;

// ---------------------------------------------------------------------
// 2. التحقق من صلاحية مفتاح API (حماية مسار الإرسال)
// ---------------------------------------------------------------------
const checkApiKey = (req, res, next) => {
    const key = req.headers['x-api-key'];
    if (key && key === API_KEY) {
        next();
    } else {
        res.status(403).json({ success: false, message: 'Forbidden: Invalid API Key' });
    }
};

// ---------------------------------------------------------------------
// 3. إعداد السيرفر (Express)
// ---------------------------------------------------------------------
const app = express();
app.use(express.json());

// مسار صحة الخدمة (Render Health Check)
app.get('/', (req, res) => {
    res.send('WhatsApp Webhook Gateway is Running and Awaiting Connection...');
});

// ---------------------------------------------------------------------
// 4. دالة الربط وبدء البوت
// ---------------------------------------------------------------------

async function connectToWhatsApp() {
    if (!DATABASE_URL || !WEBHOOK_URL || !API_KEY) {
        console.error("FATAL: Please ensure DATABASE_URL, WEBHOOK_URL, and API_KEY are set in Render environment variables.");
        // إذا كان أحد المتغيرات مفقودًا، يجب عدم المتابعة
        return; 
    }

    // إعداد تخزين الجلسة باستخدام PostgreSQL عبر مكتبة wa-store
    try {
        const store = new WAStore({ url: DATABASE_URL });
        await store.initialize();
        const { state, saveCreds } = await store.useLegacyAuth();

        const sock = makeWASocket({
            logger: pino({ level: 'silent' }),
            printQRInTerminal: true,
            auth: state,
            browser: ['Render Webhook Gateway', 'Baileys', '1.0'] // تعريف البوت
        });

        // حفظ الجلسة في PostgreSQL عند كل تحديث
        sock.ev.on('creds.update', saveCreds);

        // ---------------------------------------------------------------------
        // 5. مسار الـ API للإرسال (التحكم من البوت الرئيسي)
        // ---------------------------------------------------------------------
        app.post('/send', checkApiKey, async (req, res) => {
            // JID هو رقم الواتساب للمرسل إليه (مثلاً 96777xxxxxxx@s.whatsapp.net)
            const { jid, text, media, button_message } = req.body; 
            
            if (!jid) return res.status(400).json({ success: false, message: 'JID is required' });

            try {
                if (text) {
                    await sock.sendMessage(jid, { text });
                    return res.json({ success: true, message: 'Text message sent' });
                } else if (media && media.url) {
                    // إرسال الوسائط (صورة، فيديو، الخ)
                    const type = media.type || 'image'; 
                    const messageType = {};
                    
                    if (type === 'image') messageType.image = { url: media.url };
                    else if (type === 'video') messageType.video = { url: media.url };
                    else if (type === 'document') messageType.document = { url: media.url, mimetype: media.mimetype || 'application/pdf', fileName: media.fileName || 'file' };
                    else if (type === 'audio') messageType.audio = { url: media.url, mimetype: media.mimetype || 'audio/mp4' };
                    
                    messageType.caption = media.caption || '';
                    
                    await sock.sendMessage(jid, messageType);
                    return res.json({ success: true, message: `${type} sent` });

                } else if (button_message) {
                    // إرسال رسائل الأزرار
                    const { buttons, header, body, footer } = button_message;

                    // إنشاء قائمة الأزرار
                    const buttonsArray = buttons.map((btn, index) => ({
                        buttonId: `id-${index}-${Date.now()}`,
                        buttonText: { displayText: btn.text },
                        type: 1
                    }));

                    const templateButtonsMessage = {
                        text: body,
                        footer: footer,
                        buttons: buttonsArray,
                        headerType: 1
                    };

                    await sock.sendMessage(jid, templateButtonsMessage);
                    return res.json({ success: true, message: 'Button message sent' });
                } 
                
                return res.status(400).json({ success: false, message: 'No valid message type provided (text, media, or button_message)' });

            } catch (error) {
                console.error('Error sending message:', error);
                return res.status(500).json({ success: false, message: 'Failed to send message', error: error.message });
            }
        });

        // ---------------------------------------------------------------------
        // 6. معالجة الرسائل الواردة وتحويلها إلى الـ Webhook
        // ---------------------------------------------------------------------
        sock.ev.on('messages.upsert', async m => {
            const msg = m.messages[0];
            
            // تجاهل الرسائل المرسلة من البوت نفسه، الرسائل التي ليس لها محتوى، أو رسائل الحالة (Status)
            if (!msg.key.fromMe && m.type === 'notify' && msg.message && msg.key.remoteJid.endsWith('@s.whatsapp.net')) {
                
                let messageContent = { type: 'text', content: msg.message.conversation || msg.message.extendedTextMessage?.text || '' };

                // تحديد نوع الوسائط المرفقة وإرسال البيانات الوصفية (Metadata)
                if (msg.message.imageMessage) {
                    messageContent = { type: 'image', caption: msg.message.imageMessage.caption || '', media_url: 'Requires download (not included)' };
                } else if (msg.message.videoMessage) {
                    messageContent = { type: 'video', caption: msg.message.videoMessage.caption || '', media_url: 'Requires download (not included)' };
                } else if (msg.message.audioMessage) {
                    messageContent = { type: 'audio', media_url: 'Requires download (not included)' };
                } else if (msg.message.documentMessage) {
                    messageContent = { type: 'document', filename: msg.message.documentMessage.fileName, media_url: 'Requires download (not included)' };
                }
                // إضافة دعم لرسائل الأزرار المستقبلة
                else if (msg.message.buttonsResponseMessage) {
                    messageContent = { type: 'button_reply', button_id: msg.message.buttonsResponseMessage.selectedButtonId, button_text: msg.message.buttonsResponseMessage.selectedDisplayText };
                }
                
                // تجميع بيانات الـ Webhook
                const webhookData = {
                    event: 'message_received',
                    sender_jid: msg.key.remoteJid,
                    sender_name: msg.pushName,
                    message_id: msg.key.id,
                    timestamp: msg.messageTimestamp,
                    message: messageContent
                };
                
                try {
                    await axios.post(WEBHOOK_URL, webhookData);
                    console.log(`Message from ${msg.key.remoteJid} sent to Webhook successfully: ${WEBHOOK_URL}`);
                } catch (error) {
                    console.error('FAILED to send to Webhook:', error.message);
                }
            }
        });

        // ---------------------------------------------------------------------
        // 7. مراقبة حالة الاتصال وإعادة الاتصال
        // ---------------------------------------------------------------------
        sock.ev.on('connection.update', (update) => {
            const { connection, lastDisconnect, qr } = update;
            if (qr) {
                console.log("------------------ Scan QR Code Now -------------------");
                qrcode.generate(qr, { small: true });
                console.log("-----------------------------------------------------");
            }

            if (connection === 'close') {
                const shouldReconnect = (lastDisconnect.error)?.output?.statusCode !== DisconnectReason.loggedOut;
                console.log('Connection closed, Reconnecting:', shouldReconnect);
                if (shouldReconnect) {
                    connectToWhatsApp();
                }
            } else if (connection === 'open') {
                console.log('✅ Connection Open! Bot is ready to receive messages.');
            }
        });

    } catch (dbError) {
        console.error("FATAL: Failed to initialize PostgreSQL store. Check DATABASE_URL:", dbError.message);
    }
}

// ابدأ السيرفر واستمع للمنفذ
app.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}`);
    connectToWhatsApp();
});
