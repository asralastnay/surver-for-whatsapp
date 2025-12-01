const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion, makeCacheableSignalKeyStore } = require('@whiskeysockets/baileys');
const { Pool } = require('pg');
const express = require('express');
const axios = require('axios');
const pino = require('pino');
const QRCode = require('qrcode-terminal');

const app = express();
app.use(express.json());

// ------------------------------------------------------------------
// 1. إعداداتك (عدلها بما يناسبك)
// ------------------------------------------------------------------
const PORT = process.env.PORT || 8080;
// رابط بوت البايثون الخاص بك
const PYTHON_BOT_URL = "https://whatsapp-bot-jh7d.onrender.com/webhook"; 
// رابط قاعدة بيانات Neon (ضعه في Environment Variables في راندر باسم DATABASE_URL)
const CONNECTION_STRING = process.env.DATABASE_URL; 

// ------------------------------------------------------------------
// 2. إعداد قاعدة البيانات (PostgreSQL Auth Adapter)
// ------------------------------------------------------------------
const pool = new Pool({ connectionString: CONNECTION_STRING, ssl: { rejectUnauthorized: false } });

// دالة لإنشاء الجدول إذا لم يكن موجوداً
async function initDb() {
    await pool.query(`CREATE TABLE IF NOT EXISTS auth_sessions (id VARCHAR(255) PRIMARY KEY, data TEXT)`);
}

// نظام التوثيق المربوط بقاعدة البيانات
const usePostgresAuthState = async (saveCreds) => {
    // تحميل البيانات من القاعدة
    const readData = async (type, id) => {
        const key = `${type}-${id}`;
        const res = await pool.query('SELECT data FROM auth_sessions WHERE id = $1', [key]);
        if (res.rows.length > 0) return JSON.parse(res.rows[0].data);
        return null;
    };

    // كتابة البيانات للقاعدة
    const writeData = async (data, type, id) => {
        const key = `${type}-${id}`;
        const value = JSON.stringify(data);
        await pool.query(
            'INSERT INTO auth_sessions (id, data) VALUES ($1, $2) ON CONFLICT (id) DO UPDATE SET data = $2',
            [key, value]
        );
    };

    const removeData = async (type, id) => {
        const key = `${type}-${id}`;
        await pool.query('DELETE FROM auth_sessions WHERE id = $1', [key]);
    };

    // محاكاة نظام الملفات ولكن باستخدام الدوال أعلاه
    const state = {
        creds: await readData('creds', 'main') || (await import('@whiskeysockets/baileys')).initAuthCreds(),
        keys: {
            get: async (type, ids) => {
                const data = {};
                for (const id of ids) {
                    const val = await readData(type, id);
                    if (val) data[id] = val;
                }
                return data;
            },
            set: async (data) => {
                for (const category in data) {
                    for (const id in data[category]) {
                        await writeData(data[category][id], category, id);
                    }
                }
            }
        }
    };

    return {
        state: {
            creds: state.creds,
            keys: makeCacheableSignalKeyStore(state.keys, pino({ level: 'silent' }))
        },
        saveCreds: async () => {
            await writeData(state.creds, 'creds', 'main');
        }
    };
};

// ------------------------------------------------------------------
// 3. تشغيل الواتساب (Logic)
// ------------------------------------------------------------------
let sock;

async function startSock() {
    await initDb();
    const { state, saveCreds } = await usePostgresAuthState();
    const { version } = await fetchLatestBaileysVersion();

    console.log(`بدء تشغيل Baileys نسخة: ${version.join('.')}`);

    sock = makeWASocket({
        version,
        logger: pino({ level: 'silent' }), // تقليل الإزعاج في اللوج
        printQRInTerminal: true, // سيظهر الباركود في اللوج
        auth: state,
        browser: ["QuranBot", "Chrome", "1.0.0"],
        // إعدادات مهمة لاستقرار الاتصال
        connectTimeoutMs: 60000,
        keepAliveIntervalMs: 10000,
        emitOwnEvents: false,
    });

    // إدارة أحداث الاتصال
    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, qr } = update;
        
        if (qr) {
            console.log("\n⚠️ امسح الباركود بسرعة من اللوج أعلاه ⚠️\n");
        }

        if (connection === 'close') {
            const shouldReconnect = (lastDisconnect.error)?.output?.statusCode !== DisconnectReason.loggedOut;
            console.log('انقطع الاتصال. إعادة المحاولة؟', shouldReconnect);
            if (shouldReconnect) startSock();
        } else if (connection === 'open') {
            console.log('✅ تم الاتصال بالواتساب بنجاح!');
        }
    });

    sock.ev.on('creds.update', saveCreds);

    // استقبال الرسائل وإرسالها للبايثون
    sock.ev.on('messages.upsert', async (m) => {
        const msg = m.messages[0];
        if (!msg.message || msg.key.fromMe) return;

        const sender = msg.key.remoteJid;
        
        // استخراج النص من مختلف أنواع الرسائل
        let text = msg.message.conversation || 
                   msg.message.extendedTextMessage?.text || 
                   msg.message.imageMessage?.caption || "";

        if (text) {
            console.log(`📩 رسالة من ${sender}: ${text}`);
            
            // إرسال Webhook للبايثون
            try {
                await axios.post(PYTHON_BOT_URL, {
                    event: 'message',
                    payload: {
                        from: sender,
                        body: text,
                        fromMe: false
                    }
                });
            } catch (err) {
                console.error("خطأ في إرسال الويب هوك:", err.message);
            }
        }
    });
}

startSock();

// ------------------------------------------------------------------
// 4. API (لاستقبال الأوامر من البايثون)
// ------------------------------------------------------------------

// إرسال نص
app.post('/api/sendText', async (req, res) => {
    const { chatId, text } = req.body;
    try {
        await sock.sendMessage(chatId, { text: text });
        res.json({ status: 'success' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// إرسال ملف (صوت/صورة) عبر رابط
app.post('/api/sendFile', async (req, res) => {
    const { chatId, file, caption } = req.body;
    try {
        // file.url يحتوي على رابط الصوت من بوت البايثون
        await sock.sendMessage(chatId, { 
            audio: { url: file.url }, 
            mimetype: 'audio/mp4', // Baileys يحب mp4 للصوتيات أحياناً أو mpeg
            ptt: false // false = ملف صوتي، true = ملاحظة صوتية (voice note)
        });
        res.json({ status: 'success' });
    } catch (err) {
        console.error("فشل إرسال الملف:", err);
        res.status(500).json({ error: err.message });
    }
});

app.get('/', (req, res) => res.send('Baileys Server is Running! 🚀'));

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
