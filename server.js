const express = require('express');
const fs = require('fs');
const path = require('path');
const cors = require('cors'); // Добавим позже, установим через npm

const app = express();
const PORT = process.env.PORT || 3000; // Render сам даст порт

// Разрешаем запросы с твоего GitHub Pages
app.use(cors({
    origin: 'https://xysio-hash.github.io'
}));

app.use(express.json());

const DB_FILE = path.join(__dirname, 'database.json');

// Создаём файл, если его нет
if (!fs.existsSync(DB_FILE)) {
    fs.writeFileSync(DB_FILE, JSON.stringify([]));
}

// Проверка работы сервера (корневой маршрут)
app.get('/', (req, res) => {
    res.send('Сервер работает!');
});

// Сохранение данных
app.post('/save', (req, res) => {
    const newData = req.body;
    const db = JSON.parse(fs.readFileSync(DB_FILE));
    
    // Проверяем, есть ли уже такой пользователь
    const existingUser = db.find(user => user.vk_id === newData.vk_id);
    if (existingUser) {
        return res.json({ status: "already_exists", message: "Пользователь уже участвовал" });
    }
    
    db.push(newData);
    fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
    res.json({ status: "saved", message: "Данные сохранены" });
});

// Просмотр статистики
app.get('/stats', (req, res) => {
    const db = JSON.parse(fs.readFileSync(DB_FILE));
    res.json(db);
});

app.listen(PORT, () => {
    console.log(`Сервер запущен на порту ${PORT}`);
});
