const express = require('express');
const fs = require('fs');
const path = require('path');
const cors = require('cors');
const { google } = require('googleapis');

const app = express();
const PORT = process.env.PORT || 3000;

// Настройки Google Sheets - ЗАМЕНИ НА СВОЙ ID ТАБЛИЦЫ!
const SPREADSHEET_ID = 'тут_должен_быть_id_твоей_таблицы';

// Middleware
app.use(cors({
    origin: ['https://xysio-hash.github.io', 'http://localhost:3000']
}));
app.use(express.json());

// Локальная база (на всякий случай)
const DB_FILE = path.join(__dirname, 'database.json');
if (!fs.existsSync(DB_FILE)) {
    fs.writeFileSync(DB_FILE, JSON.stringify([]));
}

// Авторизация в Google Sheets через переменные окружения
async function getGoogleSheetsClient() {
    try {
        let credentials;
        
        // На Render используем переменную окружения
        if (process.env.GOOGLE_CREDENTIALS) {
            credentials = JSON.parse(process.env.GOOGLE_CREDENTIALS);
        } else {
            // Локально читаем из файла
            const credsPath = path.join(__dirname, 'config', 'google-credentials.json');
            credentials = JSON.parse(fs.readFileSync(credsPath, 'utf8'));
        }
        
        const auth = new google.auth.GoogleAuth({
            credentials: credentials,
            scopes: ['https://www.googleapis.com/auth/spreadsheets']
        });
        
        const client = await auth.getClient();
        return google.sheets({ version: 'v4', auth: client });
    } catch (error) {
        console.error('Ошибка авторизации Google Sheets:', error);
        return null;
    }
}

// Функция для записи в Google Sheets
async function saveToGoogleSheets(data) {
    try {
        const sheets = await getGoogleSheetsClient();
        if (!sheets) {
            console.log('❌ Нет доступа к Google Sheets');
            return false;
        }
        
        // Подготовка данных для записи
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
            resource: {
                values: values
            }
        };
        
        const response = await sheets.spreadsheets.values.append(request);
        console.log('✅ Данные сохранены в Google Sheets');
        return true;
    } catch (error) {
        console.error('❌ Ошибка сохранения в Google Sheets:', error);
        return false;
    }
}

// Корневой маршрут
app.get('/', (req, res) => {
    res.send('🚀 Сервер работает! Данные сохраняются в Google Sheets');
});

// Сохранение данных
app.post('/save', async (req, res) => {
    const newData = req.body;
    
    console.log('📥 Получены данные:', newData);
    
    // Сохраняем локально (для бэкапа)
    const db = JSON.parse(fs.readFileSync(DB_FILE));
    db.push(newData);
    fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
    
    // Сохраняем в Google Sheets
    const saved = await saveToGoogleSheets(newData);
    
    if (saved) {
        res.json({ 
            status: "saved", 
            message: "Данные сохранены в Google Sheets",
            google: true 
        });
    } else {
        res.json({ 
            status: "saved", 
            message: "Данные сохранены локально (ошибка Google Sheets)",
            google: false 
        });
    }
});

// Статистика из локальной базы
app.get('/stats', (req, res) => {
    const db = JSON.parse(fs.readFileSync(DB_FILE));
    res.json(db);
});

// Проверка Google Sheets
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
    res.json({ 
        success: result, 
        message: result ? "✅ Google Sheets работает!" : "❌ Ошибка Google Sheets",
        testData: testData
    });
});

app.listen(PORT, () => {
    console.log(`🚀 Сервер запущен на порту ${PORT}`);
    console.log(`📊 Google Sheets ID: ${SPREADSHEET_ID}`);
});
