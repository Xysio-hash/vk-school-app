const express = require('express');
const fs = require('fs');
const path = require('path');
const cors = require('cors');
const { google } = require('googleapis');

const app = express();
const PORT = process.env.PORT || 3000;

// ⚠️ ЗДЕСЬ ТВОЙ ID ТАБЛИЦЫ
const SPREADSHEET_ID = '1tEklyTXbYXTO8d47lLz0HJMRax-starW9gnBmfiZdpA';

app.use(cors({
    origin: ['https://xysio-hash.github.io', 'http://localhost:3000', 'https://vk.com', 'https://dev.vk.com'],
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
    optionsSuccessStatus: 200
}));
app.options('*', cors());

app.use(express.json());

const DB_FILE = path.join(__dirname, 'database.json');
if (!fs.existsSync(DB_FILE)) {
    fs.writeFileSync(DB_FILE, JSON.stringify([]));
}

async function getGoogleSheetsClient() {
    try {
        let credentials;
        if (process.env.GOOGLE_CREDENTIALS) {
            credentials = JSON.parse(process.env.GOOGLE_CREDENTIALS);
        } else {
            const credsPath = path.join(__dirname, 'config', 'google-credentials.json');
            credentials = JSON.parse(fs.readFileSync(credsPath, 'utf8'));
        }
        const auth = new google.auth.GoogleAuth({
            credentials,
            scopes: ['https://www.googleapis.com/auth/spreadsheets']
        });
        const client = await auth.getClient();
        return google.sheets({ version: 'v4', auth: client });
    } catch (error) {
        console.error('Ошибка авторизации Google Sheets:', error);
        return null;
    }
}

async function saveToGoogleSheets(data) {
    try {
        const sheets = await getGoogleSheetsClient();
        if (!sheets) {
            console.log('❌ Нет доступа к Google Sheets');
            return false;
        }
        const values = [[
            data.vk_id,
            data.name,
            data.school_id,
            data.school_name,
            data.game_id,
            data.game_name,
            data.phone,
            data.date
        ]];
        const request = {
            spreadsheetId: SPREADSHEET_ID,
            range: 'A:H',
            valueInputOption: 'RAW',
            insertDataOption: 'INSERT_ROWS',
            resource: { values }
        };
        await sheets.spreadsheets.values.append(request);
        console.log('✅ Данные сохранены в Google Sheets');
        return true;
    } catch (error) {
        console.error('❌ Ошибка сохранения в Google Sheets:', error);
        return false;
    }
}

app.get('/', (req, res) => {
    res.send('🚀 Сервер работает! Данные сохраняются в Google Sheets');
});

app.post('/save', async (req, res) => {
    const newData = req.body;
    console.log('📥 Получены данные:', newData);
    try {
        const db = JSON.parse(fs.readFileSync(DB_FILE));
        // Приводим к строке для сравнения
        const existing = db.find(entry => 
            String(entry.vk_id) === String(newData.vk_id) && 
            entry.game_id === newData.game_id
        );
        if (existing) {
            console.log('⚠️ Участник уже зарегистрирован на эту игру');
            return res.json({ status: "already_exists", message: "Вы уже участвуете в этой игре", google: false });
        }
        db.push(newData);
        fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
        const saved = await saveToGoogleSheets(newData);
        if (saved) {
            res.json({ status: "saved", message: "Данные сохранены в Google Sheets", google: true });
        } else {
            res.json({ status: "saved", message: "Данные сохранены локально", google: false });
        }
    } catch (error) {
        console.error("Ошибка при сохранении:", error);
        res.status(500).json({ status: "error", message: "Внутренняя ошибка сервера" });
    }
});

app.get('/stats', (req, res) => {
    try {
        const db = JSON.parse(fs.readFileSync(DB_FILE));
        res.json(db);
    } catch (error) {
        res.status(500).json({ error: true, message: "Ошибка чтения базы" });
    }
});

app.get('/test-google', async (req, res) => {
    const testData = {
        vk_id: "test_" + Date.now(),
        name: "Тест Тестов",
        school_id: "1",
        school_name: "Тестовая школа",
        game_id: "test_game",
        game_name: "Тестовая игра",
        phone: "+79999999999",
        date: new Date().toISOString()
    };
    const result = await saveToGoogleSheets(testData);
    res.json({ success: result, message: result ? "✅ Google Sheets работает!" : "❌ Ошибка Google Sheets", testData });
});

// Проверка участия с приведением к строке и флагом ошибки
app.get('/check-participation', (req, res) => {
    const { user_id, game_id } = req.query;
    console.log(`🔍 Проверка участия: user=${user_id}, game=${game_id}`);
    try {
        const db = JSON.parse(fs.readFileSync(DB_FILE));
        const participant = db.find(entry => 
            String(entry.vk_id) === String(user_id) && 
            entry.game_id === game_id
        );
        console.log(`📊 Результат: ${participant ? 'уже участвует' : 'не участвует'}`);
        res.json({ participates: !!participant, error: false });
    } catch (error) {
        console.error("Ошибка проверки участия:", error);
        res.json({ participates: false, error: true });
    }
});

// Список игр пользователя (только id)
app.get('/user-games', (req, res) => {
    const { user_id } = req.query;
    try {
        const db = JSON.parse(fs.readFileSync(DB_FILE));
        const userGames = db
            .filter(entry => String(entry.vk_id) === String(user_id))
            .map(entry => entry.game_id);
        res.json({ games: userGames, error: false });
    } catch (error) {
        console.error("Ошибка получения игр пользователя:", error);
        res.json({ games: [], error: true });
    }
});

// Полные заявки пользователя (для "Мои заявки")
app.get('/user-applications', (req, res) => {
    const { user_id } = req.query;
    console.log(`🔍 Запрос заявок пользователя: ${user_id}`);
    try {
        const db = JSON.parse(fs.readFileSync(DB_FILE));
        const userApps = db
            .filter(entry => String(entry.vk_id) === String(user_id))
            .map(app => ({
                game_id: app.game_id,
                game_name: app.game_name,
                school_name: app.school_name,
                date: app.date
            }));
        console.log(`📊 Найдено заявок: ${userApps.length}`);
        res.json({ applications: userApps, error: false });
    } catch (error) {
        console.error("Ошибка получения заявок пользователя:", error);
        res.json({ applications: [], error: true });
    }
});

// ========== АДМИН-ПАНЕЛЬ И РАССЫЛКА ==========

// Хранилище отправленных уведомлений (чтобы не дублировать)
const NOTIFICATIONS_FILE = path.join(__dirname, 'notifications.json');
if (!fs.existsSync(NOTIFICATIONS_FILE)) {
    fs.writeFileSync(NOTIFICATIONS_FILE, JSON.stringify([]));
}

// Твой VK ID (админ)
const ADMIN_ID = '540480418';

// Ссылки на Telegram чаты для каждой игры
const GAME_LINKS = {
    'ks_2x2': 'https://t.me/+9BIv7lv9H01jODRi',
    'ks_5x5': 'https://t.me/+9BIv7lv9H01jODRi',
    'dota': 'https://t.me/+XXIwYCueQN02YWVi',
    'minecraft': 'https://t.me/+wKTMh2pAt5U2MjI6',
    'roblox': 'https://t.me/+Y-bhwlSanj4yNWQy',
    'valorant': 'https://t.me/+nZdiu2duBlw0OWEy'
};

// Названия игр для сообщений
const GAME_NAMES = {
    'ks_2x2': 'КС 2x2',
    'ks_5x5': 'КС 5x5',
    'dota': 'Дота 2',
    'minecraft': 'Майнкрафт',
    'roblox': 'Роблокс',
    'valorant': 'Валорант'
};

// Функция для отправки уведомления через VK
async function sendVKNotification(userId, gameId, eventDate) {
    try {
        const gameName = GAME_NAMES[gameId] || gameId;
        const gameLink = GAME_LINKS[gameId] || '#';
        
        // Формируем сообщение
        const message = `Вы записались на турнир по "${gameName}", он проходит ${eventDate}, присоединяйтесь в нашу группу с участниками, чтобы окончательно завершить регистрацию - ${gameLink}`;
        
        // Отправляем через VK API (нужен ключ доступа)
        // ВАЖНО: Нужно создать ключ доступа в настройках приложения VK
        const response = await fetch('https://api.vk.com/method/notifications.sendMessage', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: new URLSearchParams({
                v: '5.131',
                access_token: process.env.VK_API_TOKEN,
                user_ids: userId,
                message: message,
                fragment: 'app54452043'
            })
        });
        
        const result = await response.json();
        console.log(`📨 Уведомление для ${userId}:`, result);
        return !result.error;
    } catch (error) {
        console.error('❌ Ошибка отправки уведомления:', error);
        return false;
    }
}

// Проверка, является ли пользователь админом
app.get('/api/check-admin', (req, res) => {
    const { user_id } = req.query;
    res.json({ isAdmin: String(user_id) === ADMIN_ID });
});

// Получение статистики для админа
app.get('/api/admin-stats', (req, res) => {
    const { admin_id } = req.query;
    
    if (String(admin_id) !== ADMIN_ID) {
        return res.status(403).json({ error: 'Доступ запрещён' });
    }
    
    try {
        const db = JSON.parse(fs.readFileSync(DB_FILE));
        const notifications = JSON.parse(fs.readFileSync(NOTIFICATIONS_FILE));
        
        // Статистика по играм
        const gameStats = {};
        const usersByGame = {};
        
        db.forEach(entry => {
            // Считаем количество заявок по играм
            gameStats[entry.game_id] = (gameStats[entry.game_id] || 0) + 1;
            
            // Собираем уникальных пользователей по играм
            if (!usersByGame[entry.game_id]) {
                usersByGame[entry.game_id] = new Set();
            }
            usersByGame[entry.game_id].add(entry.vk_id);
        });
        
        // Преобразуем Set в массивы
        const usersByGameArray = {};
        Object.keys(usersByGame).forEach(gameId => {
            usersByGameArray[gameId] = Array.from(usersByGame[gameId]);
        });
        
        // Информация о последних отправках
        const lastNotifications = notifications.slice(-10).reverse();
        
        res.json({
            gameStats,
            usersByGame: usersByGameArray,
            totalUsers: new Set(db.map(e => e.vk_id)).size,
            totalApplications: db.length,
            lastNotifications,
            games: GAME_NAMES
        });
        
    } catch (error) {
        console.error('Ошибка получения статистики:', error);
        res.status(500).json({ error: true });
    }
});

// Отправка уведомлений участникам конкретной игры
app.post('/api/send-notifications', async (req, res) => {
    const { admin_id, game_id, event_date } = req.body;
    
    // Проверка админа
    if (String(admin_id) !== ADMIN_ID) {
        return res.status(403).json({ error: 'Доступ запрещён' });
    }
    
    if (!game_id || !event_date) {
        return res.status(400).json({ error: 'Не указана игра или дата' });
    }
    
    try {
        // Получаем всех участников игры
        const db = JSON.parse(fs.readFileSync(DB_FILE));
        const notifications = JSON.parse(fs.readFileSync(NOTIFICATIONS_FILE));
        
        // Уникальные пользователи для этой игры
        const gameUsers = db
            .filter(entry => entry.game_id === game_id)
            .map(entry => entry.vk_id);
        
        const uniqueUserIds = [...new Set(gameUsers)];
        
        console.log(`📊 Найдено участников игры ${game_id}: ${uniqueUserIds.length}`);
        
        // Проверяем, кому уже отправляли уведомление об этой игре на эту дату
        const notificationKey = `${game_id}_${event_date}`;
        const alreadySent = notifications
            .filter(n => n.key === notificationKey)
            .map(n => n.user_id);
        
        const usersToSend = uniqueUserIds.filter(id => !alreadySent.includes(id));
        
        console.log(`📨 Будет отправлено: ${usersToSend.length} уведомлений`);
        
        // Отправляем уведомления
        const results = [];
        for (const userId of usersToSend) {
            const success = await sendVKNotification(userId, game_id, event_date);
            
            // Сохраняем информацию об отправке
            notifications.push({
                key: notificationKey,
                user_id: userId,
                game_id,
                event_date,
                sent_at: new Date().toISOString(),
                success
            });
            
            results.push({ userId, success });
            
            // Небольшая задержка, чтобы не нагружать API
            await new Promise(resolve => setTimeout(resolve, 200));
        }
        
        // Сохраняем обновлённый список уведомлений
        fs.writeFileSync(NOTIFICATIONS_FILE, JSON.stringify(notifications, null, 2));
        
        // Считаем статистику отправки
        const successful = results.filter(r => r.success).length;
        const failed = results.filter(r => !r.success).length;
        
        res.json({
            success: true,
            total: uniqueUserIds.length,
            alreadySent: alreadySent.length,
            sent: usersToSend.length,
            successful,
            failed,
            results
        });
        
    } catch (error) {
        console.error('Ошибка при отправке уведомлений:', error);
        res.status(500).json({ error: 'Внутренняя ошибка сервера' });
    }
});

// Получение истории отправок
app.get('/api/notification-history', (req, res) => {
    const { admin_id } = req.query;
    
    if (String(admin_id) !== ADMIN_ID) {
        return res.status(403).json({ error: 'Доступ запрещён' });
    }
    
    try {
        const notifications = JSON.parse(fs.readFileSync(NOTIFICATIONS_FILE));
        
        // Группируем по ключу (игра + дата)
        const grouped = {};
        notifications.forEach(n => {
            if (!grouped[n.key]) {
                grouped[n.key] = {
                    key: n.key,
                    game_id: n.game_id,
                    event_date: n.event_date,
                    first_sent: n.sent_at,
                    total: 0,
                    successful: 0
                };
            }
            grouped[n.key].total++;
            if (n.success) {
                grouped[n.key].successful++;
            }
        });
        
        res.json({
            history: Object.values(grouped).sort((a, b) => 
                new Date(b.first_sent) - new Date(a.first_sent)
            )
        });
        
    } catch (error) {
        console.error('Ошибка получения истории:', error);
        res.status(500).json({ error: true });
    }
});

app.listen(PORT, () => {
    console.log(`🚀 Сервер запущен на порту ${PORT}`);
    console.log(`📊 Google Sheets ID: ${SPREADSHEET_ID}`);
});
