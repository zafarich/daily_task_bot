# Ingliz tili o'quvchilari uchun Telegram Bot

Bu bot o'quvchilarning kunlik vazifalarini kuzatib borish va o'qituvchiga hisobot yuborish uchun xizmat qiladi.

## O'rnatish

1. Repositoryni clone qiling
2. Kerakli paketlarni o'rnating:

```bash
npm install
```

3. `.env` faylini sozlang:
   - `BOT_TOKEN` - Telegram bot tokeni (@BotFather dan olinadi)
   - `MONGODB_URI` - MongoDB ulanish URL'i

## Ishga tushirish

```bash
npm start
```

## Bot buyruqlari

### O'quvchilar uchun

- `/start` - Botni ishga tushirish
- `/new_task` - Yangi vazifa qo'shish
- `/report` - Vazifalar hisobotini ko'rish

### O'qituvchilar uchun

- `/start` - Botni ishga tushirish
- `/students` - O'quvchilar ro'yxati va ularning hisobotlarini ko'rish
