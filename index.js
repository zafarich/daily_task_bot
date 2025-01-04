require("dotenv").config();
const {Bot, session, InlineKeyboard} = require("grammy");
const mongoose = require("mongoose");

const User = require("./models/User");
const Task = require("./models/Task");

// Bot tokenini .env faylidan olish
const bot = new Bot(process.env.BOT_TOKEN);

// Middleware
bot.use(session({initial: () => ({step: "idle"})}));

// Debug middleware
bot.use(async (ctx, next) => {
  console.log("Yangi xabar keldi:", {
    from: ctx.from,
    text: ctx.message?.text,
    type: ctx.message ? "message" : ctx.callbackQuery ? "callback" : "other",
  });
  await next();
});

// Error handling middleware
bot.catch((err) => {
  console.error("Bot xatosi:", err);
});

// Start komandasi
bot.command("start", async (ctx) => {
  try {
    // Havola orqali kirish
    const args = ctx.message.text.split(" ");
    if (args.length > 1) {
      const taskId = args[1];
      const task = await Task.findOne({shareLink: taskId});

      if (!task) {
        await ctx.reply("Vazifa topilmadi");
        return;
      }

      const user = await User.findOne({telegramId: ctx.from.id});
      if (!user) {
        // Yangi o'quvchi uchun ro'yxatdan o'tkazish
        await User.create({
          telegramId: ctx.from.id,
          username: ctx.from.username,
          firstName: ctx.from.first_name || "Yangi o'quvchi",
          lastName: ctx.from.last_name,
          role: "student",
        });

        // Vazifaga obuna qilish
        task.subscribers.push({
          studentId: ctx.from.id,
          status: "pending",
        });
        await task.save();

        // Ism so'rash
        ctx.session.step = "waiting_name";
        await ctx.reply(
          "Vazifaga muvaffaqiyatli obuna bo'ldingiz!\n\nIltimos, ismingizni kiriting:",
          {
            reply_markup: {force_reply: true},
          }
        );
        return;
      }

      // Mavjud foydalanuvchi uchun tekshirish
      if (user.role === "teacher") {
        await ctx.reply(
          "Siz o'qituvchi sifatida ro'yxatdan o'tgansiz. O'quvchilar vazifalariga obuna bo'la olmaysiz.",
          {
            reply_markup: {
              keyboard: [[{text: "📝 Vazifalar"}, {text: "👥 O'quvchilar"}]],
              resize_keyboard: true,
            },
          }
        );
        return;
      }

      // O'quvchi uchun obuna qilish
      const isSubscribed = task.subscribers.some(
        (s) => s.studentId === ctx.from.id
      );
      if (!isSubscribed) {
        task.subscribers.push({
          studentId: ctx.from.id,
          status: "pending",
        });
        await task.save();
        await ctx.reply("Siz vazifaga muvaffaqiyatli obuna bo'ldingiz!", {
          reply_markup: {
            keyboard: [[{text: "📝 Vazifalar"}]],
            resize_keyboard: true,
          },
        });
      } else {
        await ctx.reply("Siz bu vazifaga allaqachon obuna bo'lgansiz", {
          reply_markup: {
            keyboard: [[{text: "📝 Vazifalar"}]],
            resize_keyboard: true,
          },
        });
      }
      return;
    }

    // Havolasiz kirish
    const user = await User.findOne({telegramId: ctx.from.id});

    if (!user) {
      ctx.session.step = "waiting_name";
      await ctx.reply("Botga xush kelibsiz! Iltimos, ismingizni kiriting:", {
        reply_markup: {remove_keyboard: true},
      });
      return;
    }

    // Mavjud foydalanuvchi uchun
    if (user.role === "student") {
      await ctx.reply("Kerakli bo'limni tanlang:", {
        reply_markup: {
          keyboard: [[{text: "📝 Vazifalar"}]],
          resize_keyboard: true,
        },
      });
    } else {
      await ctx.reply("Kerakli bo'limni tanlang:", {
        reply_markup: {
          keyboard: [[{text: "📝 Vazifalar"}, {text: "👥 O'quvchilar"}]],
          resize_keyboard: true,
        },
      });
    }
  } catch (error) {
    console.error("Start xatosi:", error);
    await ctx.reply("Xatolik yuz berdi. Iltimos qayta urinib ko'ring");
  }
});

// Message handler
bot.on("message:text", async (ctx) => {
  console.log("Yangi xabar keldi:", {
    text: ctx.message.text,
    session: ctx.session,
    from: ctx.from,
  });

  // Ism kiritish
  if (ctx.session.step === "waiting_name") {
    try {
      // Pastki tugmalar bosilganini tekshirish
      if (
        ctx.message.text === "📝 Vazifalar" ||
        ctx.message.text === "👥 O'quvchilar"
      ) {
        await ctx.reply(
          "Iltimos, avval ismingizni kiriting (kamida 3 ta harf):",
          {
            reply_markup: {remove_keyboard: true},
          }
        );
        return;
      }

      const name = ctx.message.text.trim();
      if (name.length < 3) {
        await ctx.reply("Ism juda qisqa. Iltimos, kamida 3 ta harf kiriting:", {
          reply_markup: {remove_keyboard: true},
        });
        return;
      }

      // Maxsus belgilar va raqamlarni tekshirish
      if (!/^[a-zA-Zа-яА-ЯёЁўЎқҚғҒҳҲ\s]+$/.test(name)) {
        await ctx.reply("Iltimos, faqat harflardan foydalaning:", {
          reply_markup: {remove_keyboard: true},
        });
        return;
      }

      const user = await User.findOne({telegramId: ctx.from.id});
      if (user) {
        await User.updateOne({telegramId: ctx.from.id}, {firstName: name});

        // Havola orqali kirgan o'quvchi uchun
        if (user.role === "student") {
          await ctx.reply(`✅ Ismingiz saqlandi`, {
            reply_markup: {
              keyboard: [[{text: "📝 Vazifalar"}]],
              resize_keyboard: true,
            },
          });
          ctx.session.step = "idle";
        } else {
          ctx.session.step = "waiting_role";
          await ctx.reply(`Xush kelibsiz, ${name}! Rolni tanlang:`, {
            reply_markup: new InlineKeyboard()
              .text("O'quvchi", "role_student")
              .text("O'qituvchi", "role_teacher"),
          });
        }
      } else {
        // Yangi foydalanuvchi uchun
        await User.create({
          telegramId: ctx.from.id,
          username: ctx.from.username,
          firstName: name,
          lastName: ctx.from.last_name,
        });

        ctx.session.step = "waiting_role";
        await ctx.reply(`Xush kelibsiz, ${name}! Rolni tanlang:`, {
          reply_markup: new InlineKeyboard()
            .text("O'quvchi", "role_student")
            .text("O'qituvchi", "role_teacher"),
        });
      }
    } catch (error) {
      console.error("Ism saqlash xatosi:", error);
      await ctx.reply("Xatolik yuz berdi. Iltimos qayta urinib ko'ring", {
        reply_markup: {remove_keyboard: true},
      });
    }
    return;
  }

  // Vazifa sarlavhasini kiritish
  if (ctx.session.step === "waiting_task_title") {
    console.log("Vazifa sarlavhasi kiritilmoqda");
    try {
      const user = await User.findOne({telegramId: ctx.from.id});
      console.log("Foydalanuvchi:", user);

      if (!user || user.role !== "teacher") {
        ctx.session.step = "idle";
        await ctx.reply("Xatolik: Siz o'qituvchi emassiz");
        return;
      }

      const title = ctx.message.text.trim();
      if (title.length < 3) {
        await ctx.reply(
          "Vazifa sarlavhasi juda qisqa. Kamida 3 ta belgi bo'lishi kerak."
        );
        return;
      }

      // Vazifani yaratish
      const shareLink = Math.random().toString(36).substring(2, 8);
      console.log("Yangi vazifa yaratilmoqda:", {
        title,
        teacherId: ctx.from.id,
        shareLink,
      });

      const task = await Task.create({
        teacherId: ctx.from.id,
        title: title,
        shareLink: shareLink,
      });
      console.log("Vazifa yaratildi:", task);

      ctx.session.step = "idle";
      console.log("Sessiya yangilandi:", ctx.session);

      const shareUrl = `https://t.me/${ctx.me.username}?start=${shareLink}`;
      await ctx.reply(
        `✅ Vazifa muvaffaqiyatli yaratildi!\n\n📝 Sarlavha: ${title}\n\n🔗 O'quvchilar uchun havola:\n${shareUrl}\n\nBu havolani o'quvchilarga yuboring. Ular havola orqali vazifaga obuna bo'lishlari mumkin.`,
        {
          reply_markup: {
            keyboard: [[{text: "📝 Vazifalar"}, {text: "👥 O'quvchilar"}]],
            resize_keyboard: true,
          },
        }
      );
    } catch (error) {
      console.error("Vazifa yaratish xatosi:", error);
      ctx.session.step = "idle";
      await ctx.reply("Xatolik yuz berdi. Iltimos qayta urinib ko'ring");
    }
    return;
  }

  // Pastki tugmalar uchun handlerlar
  if (ctx.message.text === "📝 Vazifalar") {
    try {
      const user = await User.findOne({telegramId: ctx.from.id});

      if (!user) {
        await ctx.reply("Iltimos, avval /start buyrug'ini bosing");
        return;
      }

      if (user.role === "teacher") {
        // O'qituvchi uchun - o'zi yaratgan vazifalar
        const tasks = await Task.find({
          teacherId: ctx.from.id,
        }).sort("-createdAt");

        const keyboard = new InlineKeyboard();

        if (tasks.length > 0) {
          tasks.forEach((task) => {
            const completed = task.subscribers.filter(
              (s) => s.status === "completed"
            ).length;
            const total = task.subscribers.length;
            const status = `[${completed}/${total}]`;
            keyboard
              .text(`${status} ${task.title}`, `share_task_${task._id}`)
              .row();
          });
        }

        keyboard.text("➕ Yangi vazifa", "create_task");

        await ctx.reply(
          tasks.length > 0
            ? "Vazifalar ro'yxati (vazifani tanlang):"
            : "Hali vazifalar yo'q. Yangi vazifa yarating:",
          {reply_markup: keyboard}
        );
      } else {
        // O'quvchi uchun - obuna bo'lgan vazifalar
        const tasks = await Task.find({
          "subscribers.studentId": ctx.from.id,
        }).sort("-createdAt");

        if (tasks.length === 0) {
          await ctx.reply("Hali vazifalarga obuna bo'lmagansiz");
          return;
        }

        const keyboard = new InlineKeyboard();
        tasks.forEach((task) => {
          const subscription = task.subscribers.find(
            (s) => s.studentId === ctx.from.id
          );
          const status = subscription.status === "completed" ? "✅" : "⏳";
          keyboard.text(`${status} ${task.title}`, `task_${task._id}`).row();
        });

        await ctx.reply("Vazifalar ro'yxati:", {reply_markup: keyboard});
      }
    } catch (error) {
      console.error("Vazifalarni ko'rsatish xatosi:", error);
      await ctx.reply("Xatolik yuz berdi. Iltimos qayta urinib ko'ring");
    }
    return;
  }

  if (ctx.message.text === "👥 O'quvchilar") {
    try {
      const user = await User.findOne({telegramId: ctx.from.id});
      if (!user || user.role !== "teacher") {
        await ctx.reply("Bu buyruq faqat o'qituvchilar uchun");
        return;
      }

      // O'qituvchining barcha vazifalarini olish
      const tasks = await Task.find({teacherId: ctx.from.id});

      // Barcha o'quvchilar ID larini yig'ish
      const studentIds = new Set();
      tasks.forEach((task) => {
        task.subscribers.forEach((sub) => studentIds.add(sub.studentId));
      });

      if (studentIds.size === 0) {
        await ctx.reply("Hali o'quvchilar yo'q");
        return;
      }

      // O'quvchilar ma'lumotlarini olish
      const students = await User.find({
        telegramId: {$in: Array.from(studentIds)},
      });

      const keyboard = new InlineKeyboard();
      students.forEach((student) => {
        keyboard
          .text(`👤 ${student.firstName}`, `student_${student.telegramId}`)
          .row();
      });

      await ctx.reply(
        "O'quvchilar ro'yxati (batafsil ma'lumot uchun tanlang):",
        {
          reply_markup: keyboard,
        }
      );
    } catch (error) {
      console.error("O'quvchilar ro'yxati xatosi:", error);
      await ctx.reply("Xatolik yuz berdi. Iltimos qayta urinib ko'ring");
    }
    return;
  }
});

// Rol tanlash
bot.on("callback_query:data", async (ctx) => {
  const data = ctx.callbackQuery.data;
  console.log("Callback data:", data);

  try {
    // Rol tanlash
    if (data.startsWith("role_")) {
      const role = data.split("_")[1];
      await User.findOneAndUpdate({telegramId: ctx.from.id}, {role: role});

      if (role === "student") {
        await ctx.reply("Siz o'quvchi sifatida ro'yxatdan o'tdingiz.", {
          reply_markup: {
            keyboard: [[{text: "📝 Vazifalar"}]],
            resize_keyboard: true,
          },
        });
        ctx.session.step = "idle";
      } else {
        await ctx.reply("Siz o'qituvchi sifatida ro'yxatdan o'tdingiz.", {
          reply_markup: {
            keyboard: [[{text: "📝 Vazifalar"}, {text: "👥 O'quvchilar"}]],
            resize_keyboard: true,
          },
        });
        ctx.session.step = "idle";
      }
      await ctx.answerCallbackQuery();
      return;
    }

    // Yangi vazifa yaratish
    if (data === "create_task") {
      const user = await User.findOne({telegramId: ctx.from.id});
      console.log("Foydalanuvchi:", user);

      if (!user || user.role !== "teacher") {
        await ctx.answerCallbackQuery("Bu buyruq faqat o'qituvchilar uchun");
        return;
      }

      ctx.session.step = "waiting_task_title";
      console.log("Sessiya yangilandi:", ctx.session);

      await ctx.answerCallbackQuery();
      await ctx.reply("Vazifa sarlavhasini kiriting:", {
        reply_markup: {force_reply: true},
      });
      return;
    }

    // Vazifa ma'lumotlarini ko'rsatish
    if (data.startsWith("share_task_")) {
      const taskId = data.split("_")[2];
      const task = await Task.findById(taskId);

      if (!task) {
        await ctx.answerCallbackQuery("Vazifa topilmadi");
        return;
      }

      const shareUrl = `https://t.me/${ctx.me.username}?start=${task.shareLink}`;
      const completed = task.subscribers.filter(
        (s) => s.status === "completed"
      ).length;
      const message =
        `📝 Vazifa: ${task.title}\n` +
        `📊 O'quvchilar soni: ${task.subscribers.length}\n` +
        `✅ Bajarilgan: ${completed}\n` +
        `⏳ Bajarilmagan: ${task.subscribers.length - completed}\n\n` +
        `🔗 O'quvchilar uchun havola:\n${shareUrl}`;

      await ctx.answerCallbackQuery();
      await ctx.reply(message, {
        reply_markup: {
          keyboard: [[{text: "📝 Vazifalar"}, {text: "👥 O'quvchilar"}]],
          resize_keyboard: true,
        },
      });
      return;
    }

    // O'quvchi ma'lumotlarini ko'rsatish
    if (data.startsWith("student_")) {
      const studentId = parseInt(data.split("_")[1]);
      const student = await User.findOne({telegramId: studentId});

      if (!student) {
        await ctx.answerCallbackQuery("O'quvchi topilmadi");
        return;
      }

      const tasks = await Task.find({
        teacherId: ctx.from.id,
        "subscribers.studentId": studentId,
      });

      let completedTasks = 0;
      tasks.forEach((task) => {
        const subscription = task.subscribers.find(
          (s) => s.studentId === studentId
        );
        if (subscription && subscription.status === "completed") {
          completedTasks++;
        }
      });

      const keyboard = new InlineKeyboard()
        .text("❌ O'chirish", `remove_student_${studentId}`)
        .row()
        .text("📝 Vazifalarini ko'rish", `student_tasks_${studentId}`)
        .row()
        .text("⬅️ Orqaga", "back_to_students");

      let message = `👤 O'quvchi: ${student.firstName}`;
      message += student.username ? ` (@${student.username})` : "";
      message += `\n📊 Jami vazifalar: ${tasks.length}`;
      message += `\n✅ Bajarilgan: ${completedTasks}`;
      message += `\n⏳ Bajarilmagan: ${tasks.length - completedTasks}`;

      await ctx.answerCallbackQuery();
      await ctx.reply(message, {
        reply_markup: keyboard,
      });
      return;
    }

    // O'quvchining vazifalarini ko'rsatish
    if (data.startsWith("student_tasks_")) {
      try {
        // O'qituvchini tekshirish
        const teacher = await User.findOne({
          telegramId: ctx.from.id,
          role: "teacher",
        });

        if (!teacher) {
          await ctx.answerCallbackQuery("Bu buyruq faqat o'qituvchilar uchun");
          return;
        }

        // O'quvchi ID sini olish
        const studentId = data.replace("student_tasks_", "");
        console.log("O'quvchi ID (string):", studentId);

        // O'quvchini tekshirish
        const student = await User.findOne({
          telegramId: studentId,
        });
        console.log("Topilgan o'quvchi:", student);

        if (!student) {
          await ctx.answerCallbackQuery("O'quvchi topilmadi");
          return;
        }

        // O'quvchining vazifalarini olish
        const tasks = await Task.find({
          teacherId: ctx.from.id,
          "subscribers.studentId": studentId,
        }).sort("-createdAt");

        if (tasks.length === 0) {
          await ctx.answerCallbackQuery();
          await ctx.reply("O'quvchining vazifalari yo'q", {
            reply_markup: {
              keyboard: [[{text: "📝 Vazifalar"}, {text: "👥 O'quvchilar"}]],
              resize_keyboard: true,
            },
          });
          return;
        }

        const keyboard = new InlineKeyboard();
        tasks.forEach((task) => {
          const subscription = task.subscribers.find(
            (s) => s.studentId === studentId
          );
          if (subscription) {
            const status = subscription.status === "completed" ? "✅" : "⏳";
            keyboard
              .text(
                `${status} ${task.title}`,
                `student_task_${studentId}_${task._id}`
              )
              .row();
          }
        });
        keyboard.text("⬅️ Orqaga", `student_${studentId}`);

        await ctx.answerCallbackQuery();
        await ctx.reply(`${student.firstName}ning vazifalari:`, {
          reply_markup: keyboard,
          reply_markup_bottom: {
            keyboard: [[{text: "📝 Vazifalar"}, {text: "👥 O'quvchilar"}]],
            resize_keyboard: true,
          },
        });
      } catch (error) {
        console.error("O'quvchi vazifalarini ko'rsatish xatosi:", error);
        await ctx.answerCallbackQuery("Xatolik yuz berdi");
        await ctx.reply("Xatolik yuz berdi. Iltimos qayta urinib ko'ring", {
          reply_markup: {
            keyboard: [[{text: "📝 Vazifalar"}, {text: "👥 O'quvchilar"}]],
            resize_keyboard: true,
          },
        });
      }
      return;
    }

    // O'quvchini o'chirish
    if (data.startsWith("remove_student_")) {
      const studentId = parseInt(data.split("_")[2]);

      await Task.updateMany(
        {teacherId: ctx.from.id},
        {$pull: {subscribers: {studentId: studentId}}}
      );

      await ctx.answerCallbackQuery("O'quvchi barcha vazifalardan o'chirildi");
      await ctx.reply("O'quvchi muvaffaqiyatli o'chirildi");

      // O'quvchilar ro'yxatini yangilash
      const tasks = await Task.find({teacherId: ctx.from.id});
      const studentIds = new Set();
      tasks.forEach((task) => {
        task.subscribers.forEach((sub) => studentIds.add(sub.studentId));
      });

      if (studentIds.size === 0) {
        await ctx.reply("Hali o'quvchilar yo'q");
        return;
      }

      const students = await User.find({
        telegramId: {$in: Array.from(studentIds)},
      });

      const keyboard = new InlineKeyboard();
      students.forEach((student) => {
        keyboard
          .text(`👤 ${student.firstName}`, `student_${student.telegramId}`)
          .row();
      });

      await ctx.reply("O'quvchilar ro'yxati:", {
        reply_markup: keyboard,
      });
      return;
    }
  } catch (error) {
    console.error("Callback query xatosi:", error);
    await ctx.answerCallbackQuery("Xatolik yuz berdi");
  }
});

// Eslatma yuborish funksiyasi
async function sendReminders() {
  try {
    console.log("Eslatmalarni tekshirish boshlandi...");

    // Bugungi kun
    const now = new Date();
    const startOfDay = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate()
    );
    const endOfDay = new Date(startOfDay);
    endOfDay.setDate(endOfDay.getDate() + 1);

    // Bajarilmagan vazifalarni olish
    const tasks = await Task.find({
      status: "pending",
      remindersSent: {$lt: 3},
      $or: [{nextReminderAt: {$exists: false}}, {nextReminderAt: {$lte: now}}],
    });

    console.log(`${tasks.length} ta eslatma yuborilishi kerak`);

    for (const task of tasks) {
      try {
        const student = await User.findOne({telegramId: task.studentId});
        if (!student) continue;

        // Eslatma xabari
        const reminderMessage = `⚠️ Eslatma!\nVazifa: ${task.title}\nStatus: Bajarilmagan\nIltimos, vazifani bajarishni unutmang!`;

        await bot.api.sendMessage(student.telegramId, reminderMessage);

        // Keyingi eslatma vaqtini hisoblash (har 4 soatda)
        const nextReminder = new Date();
        nextReminder.setHours(nextReminder.getHours() + 4);

        // Eslatma ma'lumotlarini yangilash
        await Task.updateOne(
          {_id: task._id},
          {
            $inc: {remindersSent: 1},
            lastReminderAt: now,
            nextReminderAt: nextReminder,
          }
        );

        console.log(`Eslatma yuborildi: ${student.firstName} - ${task.title}`);
      } catch (error) {
        console.error(`Eslatma yuborish xatosi (task ${task._id}):`, error);
      }
    }
  } catch (error) {
    console.error("Eslatmalar yuborish xatosi:", error);
  }
}

// Eslatmalarni har 4 soatda tekshirish
setInterval(sendReminders, 4 * 60 * 60 * 1000);

// Botni ishga tushganda ham eslatmalarni tekshirish
bot.start({
  onStart: () => {
    console.log("Bot serverga ulandi va xabarlarni kutmoqda...");
    sendReminders();
  },
});

// Botni ishga tushirish
async function startBot() {
  try {
    console.log("Bot ishga tushmoqda...");
    console.log("Bot token:", process.env.BOT_TOKEN);

    // Botni ishga tushirish
    await bot.init();
    console.log("Bot muvaffaqiyatli ishga tushdi!");

    // Bot ma'lumotlarini olish
    const botInfo = await bot.api.getMe();
    console.log("Bot ma'lumotlari:", botInfo);

    // Asosiy komandalarni ro'yxatdan o'tkazish
    await bot.api.setMyCommands([
      {command: "start", description: "Botni ishga tushirish"},
    ]);

    // Botni ishga tushirish
    bot.start({
      onStart: () => {
        console.log("Bot serverga ulandi va xabarlarni kutmoqda...");
      },
    });
  } catch (error) {
    console.error("Bot ishga tushirish xatosi:", error);
    process.exit(1);
  }
}

// MongoDB va botni ishga tushirish
mongoose
  .connect(process.env.MONGODB_URI)
  .then(() => {
    console.log("MongoDB ulanish muvaffaqiyatli");
    return startBot();
  })
  .catch((err) => {
    console.error("MongoDB ulanish xatosi:", err);
    process.exit(1);
  });

// Vazifalarni ko'rsatish
bot.callbackQuery("show_tasks", async (ctx) => {
  try {
    const user = await User.findOne({telegramId: ctx.from.id});
    if (!user) {
      await ctx.answerCallbackQuery("Iltimos, avval /start buyrug'ini bosing");
      return;
    }

    let tasks;
    if (user.role === "student") {
      // O'quvchi uchun - faqat obuna bo'lgan vazifalar
      tasks = await Task.find({
        "subscribers.studentId": ctx.from.id,
      })
        .sort("-createdAt")
        .limit(10);
    } else {
      // O'qituvchi uchun - o'zi yaratgan vazifalar
      tasks = await Task.find({
        teacherId: ctx.from.id,
      })
        .sort("-createdAt")
        .limit(10);
    }

    if (tasks.length === 0) {
      await ctx.answerCallbackQuery();
      await ctx.reply("Hali vazifalar yo'q");
      return;
    }

    const keyboard = new InlineKeyboard();
    tasks.forEach((task) => {
      let status = "📝";
      if (user.role === "student") {
        const subscription = task.subscribers.find(
          (s) => s.studentId === ctx.from.id
        );
        status = subscription.status === "completed" ? "✅" : "⏳";
      }
      keyboard.text(`${status} ${task.title}`, `task_${task._id}`).row();
    });

    await ctx.answerCallbackQuery();
    await ctx.reply("Vazifalar ro'yxati:", {reply_markup: keyboard});
  } catch (error) {
    console.error("Vazifalarni ko'rsatish xatosi:", error);
    await ctx.answerCallbackQuery("Xatolik yuz berdi");
  }
});

// Vazifa ma'lumotlarini ko'rsatish
bot.callbackQuery(/^task_/, async (ctx) => {
  try {
    const taskId = ctx.callbackQuery.data.split("_")[1];
    const task = await Task.findById(taskId);
    if (!task) {
      await ctx.answerCallbackQuery("Vazifa topilmadi");
      return;
    }

    const user = await User.findOne({telegramId: ctx.from.id});
    const teacher = await User.findOne({telegramId: task.teacherId});

    let message = `📝 Vazifa: ${task.title}\n`;
    message += `👤 O'qituvchi: ${teacher.firstName}\n`;
    message += `📅 Sana: ${task.createdAt.toLocaleDateString()}\n`;

    if (user.role === "teacher") {
      // O'qituvchi uchun statistika
      const completed = task.subscribers.filter(
        (s) => s.status === "completed"
      ).length;
      message += `\n📊 Statistika:\n`;
      message += `👥 Obunachi o'quvchilar: ${task.subscribers.length}\n`;
      message += `✅ Bajarilgan: ${completed}\n`;
      message += `⏳ Bajarilmagan: ${task.subscribers.length - completed}\n`;

      // Obuna havolasini ko'rsatish
      const shareUrl = `https://t.me/${ctx.me.username}?start=${task.shareLink}`;
      message += `\n🔗 Obuna havolasi:\n${shareUrl}`;
    } else {
      // O'quvchi uchun status
      const subscription = task.subscribers.find(
        (s) => s.studentId === ctx.from.id
      );
      message += `📊 Status: ${
        subscription.status === "completed"
          ? "✅ Bajarilgan"
          : "⏳ Bajarilmagan"
      }\n`;
      if (subscription.completedAt) {
        message += `✅ Bajarilgan vaqt: ${subscription.completedAt.toLocaleString()}\n`;
      }
    }

    const keyboard = new InlineKeyboard();

    if (user.role === "student") {
      const subscription = task.subscribers.find(
        (s) => s.studentId === ctx.from.id
      );
      if (subscription.status === "pending") {
        keyboard.text("✅ Bajarildi", `complete_${task._id}`);
      }
    }
    keyboard.text("⬅️ Orqaga", "show_tasks");

    await ctx.answerCallbackQuery();
    await ctx.reply(message, {
      reply_markup: keyboard,
      reply_markup_bottom:
        user.role === "student"
          ? {
              keyboard: [[{text: "📝 Vazifalar"}]],
              resize_keyboard: true,
            }
          : {
              keyboard: [[{text: "📝 Vazifalar"}, {text: "👥 O'quvchilar"}]],
              resize_keyboard: true,
            },
    });
  } catch (error) {
    console.error("Vazifa ma'lumotlarini ko'rsatish xatosi:", error);
    await ctx.answerCallbackQuery("Xatolik yuz berdi");
  }
});

// Vazifani bajarildi deb belgilash
bot.callbackQuery(/^complete_/, async (ctx) => {
  try {
    const taskId = ctx.callbackQuery.data.split("_")[1];
    const task = await Task.findById(taskId);

    if (!task) {
      await ctx.answerCallbackQuery("Vazifa topilmadi");
      return;
    }

    const subscription = task.subscribers.find(
      (s) => s.studentId === ctx.from.id
    );
    if (!subscription) {
      await ctx.answerCallbackQuery("Siz bu vazifaga obuna bo'lmagansiz");
      return;
    }

    if (subscription.status === "completed") {
      await ctx.answerCallbackQuery("Bu vazifa allaqachon bajarilgan");
      return;
    }

    // Vazifani bajarildi deb belgilash
    subscription.status = "completed";
    subscription.completedAt = new Date();
    await task.save();

    // O'qituvchiga xabar yuborish
    const user = await User.findOne({telegramId: ctx.from.id});
    try {
      await bot.api.sendMessage(
        task.teacherId,
        `✅ Vazifa bajarildi!\nO'quvchi: ${
          user.firstName || ctx.from.first_name
        }\nVazifa: ${task.title}\nVaqt: ${new Date().toLocaleString()}`
      );
    } catch (error) {
      console.error("O'qituvchiga xabar yuborish xatosi:", error);
    }

    await ctx.answerCallbackQuery("Vazifa bajarildi deb belgilandi! Rahmat!");

    // Vazifalar ro'yxatini yangilash
    const tasks = await Task.find({
      "subscribers.studentId": ctx.from.id,
    })
      .sort("-createdAt")
      .limit(10);

    const keyboard = new InlineKeyboard();
    tasks.forEach((t) => {
      const sub = t.subscribers.find((s) => s.studentId === ctx.from.id);
      const status = sub.status === "completed" ? "✅" : "⏳";
      keyboard.text(`${status} ${t.title}`, `task_${t._id}`).row();
    });

    await ctx.reply("Vazifalar ro'yxati:", {
      reply_markup: keyboard,
      reply_markup_bottom: {
        keyboard: [[{text: "📝 Vazifalar"}]],
        resize_keyboard: true,
      },
    });
  } catch (error) {
    console.error("Vazifani bajarildi deb belgilash xatosi:", error);
    await ctx.answerCallbackQuery("Xatolik yuz berdi");
  }
});

// Yangi vazifa qo'shish callback
bot.callbackQuery("add_task", async (ctx) => {
  try {
    const user = await User.findOne({telegramId: ctx.from.id});

    if (!user) {
      await ctx.answerCallbackQuery("Iltimos, avval /start buyrug'ini bosing");
      return;
    }

    if (user.role !== "teacher") {
      await ctx.answerCallbackQuery("Bu buyruq faqat o'qituvchilar uchun");
      return;
    }

    ctx.session.step = "waiting_task_title";
    await ctx.answerCallbackQuery();
    await ctx.reply("Vazifa sarlavhasini kiriting:", {
      reply_markup: {force_reply: true},
    });
  } catch (error) {
    console.error("Yangi vazifa qo'shish xatosi:", error);
    await ctx.answerCallbackQuery("Xatolik yuz berdi");
  }
});

// O'qituvchi uchun qo'shimcha komandalar
async function setTeacherCommands(ctx) {
  await bot.api.setMyCommands(
    [{command: "start", description: "Botni ishga tushirish"}],
    {
      scope: {
        type: "chat",
        chat_id: ctx.from.id,
      },
    }
  );
}
