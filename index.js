const { 
    default: makeWASocket, 
    DisconnectReason, 
    fetchLatestBaileysVersion, 
    makeCacheableSignalKeyStore,
    initAuthCreds,
    BufferJSON
} = require('@whiskeysockets/baileys');
const { Pool } = require('pg');
const express = require('express');
const axios = require('axios');
const pino = require('pino');
const QRCode = require('qrcode');

const app = express();
app.use(express.json());

// ------------------------------------------------------------------
// إعدادات
// ------------------------------------------------------------------
const PORT = process.env.PORT || 8080;
const PYTHON_BOT_URL = "https://whatsapp-bot-jh7d.onrender.com/webhook"; 

// يجب وضع رابط قاعدة البيانات في متغيرات البيئة في Render
// Environment Variables -> DATABASE_URL
const CONNECTION_STRING = process.env.DATABASE_URL; 

let currentQR = null;
let isConnected = false;
let sock;

// ------------------------------------------------------------------
// إعداد قاعدة البيانات PostgreSQL
// ------------------------------------------------------------------
if (!CONNECTION_STRING) {
    console.error("❌ Error: DATABASE_URL is missing!");
    process.exit(1);
}

const pool = new Pool({
    connectionString: CONNECTION_STRING,
    ssl: { rejectUnauthorized: false } // ضروري لـ Render
});

// إنشاء الجدول إذا لم يكن موجوداً
async function initDb() {
    await pool.query(`CREATE TABLE IF NOT EXISTS auth_sessions (id VARCHAR(255) PRIMARY KEY, data TEXT)`);
}

// دالة لحذف الجلسة بالكامل عند التلف
async function clearSession() {
    console.log("⚠️ Clearing corrupted session from database...");
    await pool.query('DELETE FROM auth_sessions');
}

// دالة مخصصة للتعامل مع حفظ واسترجاع الجلسة من PostgreSQL
const usePostgresAuthState = async (saveCreds) => {
    const readData = async (type, id) => {
        const key = `${type}-${id}`;
        try {
            const res = await pool.query('SELECT data FROM auth_sessions WHERE id = $1', [key]);
            if (res.rows.length > 0) {
                return JSON.parse(res.rows[0].data, BufferJSON.reviver);
            }
        } catch (error) {
            console.error('Error reading auth data:', error);
        }
        return null;
    };

    const writeData = async (data, type, id) => {
        const key = `${type}-${id}`;
        try {
            const value = JSON.stringify(data, BufferJSON.replacer);
            await pool.query(
                'INSERT INTO auth_sessions (id, data) VALUES ($1, $2) ON CONFLICT (id) DO UPDATE SET data = $2',
                [key, value]
            );
        } catch (error) {
            console.error('Error writing auth data:', error);
        }
    };

    const creds = await readData('creds', 'main') || initAuthCreds();

    return {
        state: {
            creds: creds,
            keys: makeCacheableSignalKeyStore({
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
            }, pino({ level: 'silent' }))
        },
        saveCreds: async () => {
            await writeData(creds, 'creds', 'main');
        }
    };
};

// ------------------------------------------------------------------
// تشغيل الواتساب
// ------------------------------------------------------------------
async function startSock() {
    await initDb();
    const { state, saveCreds } = await usePostgresAuthState();
    const { version } = await fetchLatestBaileysVersion();

    console.log(`Starting Baileys v${version.join('.')}`);

    sock = makeWASocket({
        version,
        logger: pino({ level: 'silent' }),
        printQRInTerminal: true, 
        auth: state,
        browser: ["QuranBot", "Chrome", "3.0.0"],
        connectTimeoutMs: 60000,
        keepAliveIntervalMs: 10000,
        emitOwnEvents: false,
    });

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;
        
        if (qr) {
            currentQR = qr;
            isConnected = false;
            console.log("⚡ QR Code generated/updated");
        }

        if (connection === 'close') {
            isConnected = false;
            const statusCode = (lastDisconnect.error)?.output?.statusCode;
            const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

            console.log('Connection closed. Reason:', statusCode);

            // الحل الجذري لمشكلة التعليق:
            // إذا كان السبب Bad Session أو Logged Out، نحذف البيانات ونبدأ من الصفر
            if (statusCode === DisconnectReason.badSession || statusCode === DisconnectReason.loggedOut) {
                console.log(`Session corrupted or logged out (${statusCode}). Clearing DB and restarting...`);
                await clearSession(); // حذف الجلسة من قاعدة البيانات
                startSock(); // إعادة التشغيل لبدء جلسة نظيفة
            } else if (shouldReconnect) {
                console.log('Reconnecting...');
                startSock();
            } else {
                console.log('Connection closed strictly. Restarting anyway to be safe...');
                startSock();
            }
        } else if (connection === 'open') {
            console.log('✅ Connection Opened Successfully!');
            isConnected = true;
            currentQR = null; 
        }
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('messages.upsert', async (m) => {
        try {
            const msg = m.messages[0];
            if (!msg.message || msg.key.fromMe) return;

            const sender = msg.key.remoteJid;
            
            // استخراج النص من أنواع الرسائل المختلفة
            let text = msg.message.conversation || 
                       msg.message.extendedTextMessage?.text || 
                       msg.message.imageMessage?.caption || "";

            if (text) {
                console.log(`Message from ${sender}: ${text}`);
                // إرسال الرسالة إلى بوت البايثون
                await axios.post(PYTHON_BOT_URL, {
                    event: 'message',
                    payload: { from: sender, body: text, fromMe: false }
                });
            }
        } catch (err) {
            console.error("Error processing message:", err.message);
        }
    });
}

// تشغيل البوت
startSock();

// ------------------------------------------------------------------
// صفحة عرض الباركود (HTML)
// ------------------------------------------------------------------
app.get('/', async (req, res) => {
    res.setHeader('Content-Type', 'text/html');

    if (isConnected) {
        return res.send(`
            <div style="font-family: sans-serif; text-align: center; margin-top: 50px;">
                <h1 style="color: green;">✅ WhatsApp Connected!</h1>
                <p>The bot is active and listening.</p>
            </div>
        `);
    }

    if (currentQR) {
        try {
            const qrImage = await QRCode.toDataURL(currentQR);
            return res.send(`
                <div style="font-family: sans-serif; text-align: center; margin-top: 50px;">
                    <h1>📱 Scan This QR Code</h1>
                    <img src="${qrImage}" width="300" height="300" style="border: 5px solid #333; border-radius: 10px;" />
                    <p>Reloading automatically...</p>
                    <script>setTimeout(() => location.reload(), 5000);</script>
                </div>
            `);
        } catch (e) {
            return res.send("Error generating QR");
        }
    }

    return res.send(`
        <div style="font-family: sans-serif; text-align: center; margin-top: 50px;">
            <h1>⏳ Starting...</h1>
            <p>Please wait while the connection is established.</p>
            <script>setTimeout(() => location.reload(), 3000);</script>
        </div>
    `);
});

// ------------------------------------------------------------------
// API Endpoints لإرسال الرسائل من البايثون
// ------------------------------------------------------------------
app.post('/api/sendText', async (req, res) => {
    const { chatId, text } = req.body;
    if (!sock || !isConnected) return res.status(503).json({ error: "WhatsApp not connected" });
    
    try {
        await sock.sendMessage(chatId, { text: text });
        res.json({ status: 'success' });
    } catch (err) {
        console.error("Send Text Error:", err);
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/sendFile', async (req, res) => {
    const { chatId, file, mimetype, caption } = req.body; // تحسين استقبال المعاملات
    if (!sock || !isConnected) return res.status(503).json({ error: "WhatsApp not connected" });

    try {
        // يمكنك تعديل النوع بناءً على mimetype المرسل
        const msgOptions = { 
            document: { url: file.url },
            mimetype: mimetype || 'application/pdf',
            fileName: file.name || 'file',
            caption: caption || ''
        };

        // إذا كان ملف صوتي
        if (mimetype && mimetype.startsWith('audio')) {
            delete msgOptions.document;
            delete msgOptions.fileName;
            msgOptions.audio = { url: file.url };
            msgOptions.mimetype = mimetype;
            msgOptions.ptt = false; // true إذا كنت تريدها كرسالة صوتية (Voice Note)
        }

        await sock.sendMessage(chatId, msgOptions);
        res.json({ status: 'success' });
    } catch (err) {
        console.error("Send File Error:", err);
        res.status(500).json({ error: err.message });
    }
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
