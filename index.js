require("dotenv").config();
const {Bot, session, InlineKeyboard} = require("grammy");
const mongoose = require("mongoose");

const User = require("./models/User");
const Task = require("./models/Task");
const TaskHistory = require("./models/TaskHistory");
const Subscription = require("./models/Subscription");

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
        await Subscription.create({
          taskId: task._id,
          studentId: ctx.from.id,
          teacherId: task.teacherId,
          status: "pending",
        });

        // O'qituvchiga xabar yuborish
        const student = await User.findOne({telegramId: ctx.from.id});
        const taskInfo = await Task.findById(task._id);
        await bot.api.sendMessage(
          task.teacherId,
          `🔔 Yangi obuna!\n\nO'quvchi: ${student.firstName}\nVazifa: ${taskInfo.title}`
        );

        // Tarixga yozish
        await TaskHistory.create({
          taskId: task._id,
          studentId: ctx.from.id,
          teacherId: task.teacherId,
          taskTitle: task.title,
          action: "subscribed",
        });

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
      const existingSubscription = await Subscription.findOne({
        taskId: task._id,
        studentId: ctx.from.id,
      });

      if (!existingSubscription) {
        // Vazifaga obuna qilish
        await Subscription.create({
          taskId: task._id,
          studentId: ctx.from.id,
          teacherId: task.teacherId,
          status: "pending",
        });

        // O'qituvchiga xabar yuborish
        const student = await User.findOne({telegramId: ctx.from.id});
        const taskInfo = await Task.findById(task._id);
        await bot.api.sendMessage(
          task.teacherId,
          `🔔 Yangi obuna!\n\nO'quvchi: ${student.firstName}\nVazifa: ${taskInfo.title}`
        );

        // Tarixga yozish
        await TaskHistory.create({
          taskId: task._id,
          studentId: ctx.from.id,
          teacherId: task.teacherId,
          taskTitle: task.title,
          action: "subscribed",
        });

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

      // Ortga tugmasi bosilganda
      if (ctx.message.text === "⬅️ Ortga") {
        ctx.session.step = "idle";
        await ctx.reply("Vazifa yaratish bekor qilindi", {
          reply_markup: {
            keyboard: [[{text: "📝 Vazifalar"}, {text: "👥 O'quvchilar"}]],
            resize_keyboard: true,
          },
        });
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
          for (const task of tasks) {
            // Har bir vazifa uchun obunalar sonini olish
            const subscriptions = await Subscription.find({taskId: task._id});
            const completed = subscriptions.filter(
              (s) => s.status === "completed"
            ).length;
            const total = subscriptions.length;

            keyboard.text(`${task.title}`, `share_task_${task._id}`).row();
          }
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
        const subscriptions = await Subscription.find({
          studentId: ctx.from.id,
        }).sort("-subscribedAt");

        if (subscriptions.length === 0) {
          await ctx.reply("Hali vazifalarga obuna bo'lmagansiz", {
            reply_markup: {
              keyboard: [[{text: "📝 Vazifalar"}]],
              resize_keyboard: true,
            },
          });
          return;
        }

        // Bugungi kun uchun bajarilgan vazifalarni olish
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const completedToday = await TaskHistory.find({
          studentId: ctx.from.id,
          action: "completed",
          timestamp: {
            $gte: today,
            $lt: new Date(today.getTime() + 24 * 60 * 60 * 1000),
          },
        });

        const keyboard = new InlineKeyboard();
        for (const subscription of subscriptions) {
          const task = await Task.findById(subscription.taskId);
          if (task) {
            // Bugun bajarilganligini tekshirish
            const isCompletedToday = completedToday.some(
              (h) => h.taskId.toString() === task._id.toString()
            );
            const status = isCompletedToday ? "✅" : "⏳";
            keyboard.text(`${status} ${task.title}`, `task_${task._id}`).row();
          }
        }

        await ctx.reply("Bugungi vazifalar:", {
          reply_markup: keyboard,
          reply_markup_bottom: {
            keyboard: [[{text: "📝 Vazifalar"}]],
            resize_keyboard: true,
          },
        });
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

      // O'qituvchining barcha obunalarini olish
      const subscriptions = await Subscription.find({
        teacherId: ctx.from.id,
      });

      // Barcha o'quvchilar ID larini yig'ish
      const studentIds = new Set(subscriptions.map((s) => s.studentId));

      if (studentIds.size === 0) {
        await ctx.reply("Hali o'quvchilar yo'q", {
          reply_markup: {
            keyboard: [[{text: "📝 Vazifalar"}, {text: "👥 O'quvchilar"}]],
            resize_keyboard: true,
          },
        });
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
          reply_markup_bottom: {
            keyboard: [[{text: "📝 Vazifalar"}, {text: "👥 O'quvchilar"}]],
            resize_keyboard: true,
          },
        }
      );
    } catch (error) {
      console.error("O'quvchilar ro'yxati xatosi:", error);
      await ctx.reply("Xatolik yuz berdi. Iltimos qayta urinib ko'ring", {
        reply_markup: {
          keyboard: [[{text: "📝 Vazifalar"}, {text: "👥 O'quvchilar"}]],
          resize_keyboard: true,
        },
      });
    }
    return;
  }
});

// Rol tanlash
bot.on("callback_query:data", async (ctx) => {
  const data = ctx.callbackQuery.data;
  const [action, ...params] = data.split("_");

  console.log("Callback data:", data);

  try {
    // Vazifalarni ko'rsatish
    if (data === "show_tasks") {
      try {
        console.log("Vazifalar ko'rsatilmoqda...");
        const user = await User.findOne({telegramId: ctx.from.id});
        console.log("Foydalanuvchi:", user);

        if (!user) {
          console.log("Foydalanuvchi topilmadi");
          await ctx.answerCallbackQuery("Foydalanuvchi topilmadi");
          return;
        }

        let tasks;
        if (user.role === "teacher") {
          console.log("O'qituvchi vazifalari olinmoqda...");
          tasks = await Task.find({teacherId: ctx.from.id});
        } else {
          console.log("O'quvchi vazifalari olinmoqda...");
          const subscriptions = await Subscription.find({
            studentId: ctx.from.id,
          });
          console.log("O'quvchi obunalari:", subscriptions);

          const taskIds = subscriptions.map((s) => s.taskId);
          tasks = await Task.find({_id: {$in: taskIds}});
        }
        console.log("Topilgan vazifalar:", tasks);

        if (!tasks || tasks.length === 0) {
          console.log("Vazifalar topilmadi");
          await ctx.answerCallbackQuery();
          await ctx.reply("Hozircha vazifalar yo'q", {
            reply_markup: {
              keyboard:
                user.role === "student"
                  ? [[{text: "📝 Vazifalar"}]]
                  : [[{text: "📝 Vazifalar"}, {text: "👥 O'quvchilar"}]],
              resize_keyboard: true,
            },
          });
          return;
        }

        const keyboard = new InlineKeyboard();

        if (user.role === "student") {
          for (const task of tasks) {
            const subscription = await Subscription.findOne({
              taskId: task._id,
              studentId: ctx.from.id,
            });
            const status = subscription.status === "completed" ? "✅" : "⏳";
            keyboard.text(`${status} ${task.title}`, `task_${task._id}`).row();
          }
        } else {
          for (const task of tasks) {
            keyboard.text(task.title, `task_${task._id}`).row();
          }
        }
        await ctx.answerCallbackQuery();
        await ctx.reply("Vazifalar ro'yxati:", {
          reply_markup: keyboard,
          reply_markup_bottom: {
            keyboard:
              user.role === "student"
                ? [[{text: "📝 Vazifalar"}]]
                : [[{text: "📝 Vazifalar"}, {text: "👥 O'quvchilar"}]],
            resize_keyboard: true,
          },
        });
      } catch (error) {
        console.error("Vazifalarni ko'rsatish xatosi:", error);
        await ctx.answerCallbackQuery("Xatolik yuz berdi");
      }
    }

    // Rol tanlash
    if (data.startsWith("role_")) {
      const role = data.split("_")[1];
      await User.findOneAndUpdate({telegramId: ctx.from.id}, {role: role});

      await ctx.answerCallbackQuery();

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
        reply_markup: {
          force_reply: true,
          keyboard: [[{text: "⬅️ Ortga"}]],
          resize_keyboard: true,
        },
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

      // O'quvchilar ro'yxatini olish
      const subscriptions = await Subscription.find({taskId: task._id}).sort(
        "-subscribedAt"
      );
      const studentIds = subscriptions.map((s) => s.studentId);
      const students = await User.find({telegramId: {$in: studentIds}});

      let message = `📝 Vazifa: ${task.title}\n\n`;

      if (students?.length) {
        message += `👥 Obuna bo'lgan o'quvchilar:\n\n`;
      } else {
        message += `🟠 Hech kim bu vazifaga obuna bo'lmagan\n`;
      }

      // O'quvchilar ro'yxatini ko'rsatish
      for (const student of students) {
        const subscription = subscriptions.find(
          (s) => s.studentId === student.telegramId
        );
        message += `${student.firstName}`;
        if (student.username) message += ` (@${student.username})`;
        if (subscription.completedAt) {
          message += ` - ${subscription.completedAt.toLocaleTimeString(
            "uz-UZ",
            {hour: "2-digit", minute: "2-digit"}
          )}`;
        }
        message += "\n";
      }

      message += `\n🔗 O'quvchilar uchun havola:\nhttps://t.me/${ctx.me.username}?start=${task.shareLink}`;

      const keyboard = new InlineKeyboard()
        .text("⬅️ Orqaga", "show_tasks")
        .row();

      await ctx.answerCallbackQuery();
      await ctx.reply(message, {
        reply_markup: keyboard,
        reply_markup_bottom: {
          keyboard: [[{text: "📝 Vazifalar"}, {text: "👥 O'quvchilar"}]],
          resize_keyboard: true,
        },
      });
      return;
    }

    // Obunani bekor qilish
    if (data.startsWith("unfollow_")) {
      try {
        const [, studentId, taskId] = data.split("_");
        const user = await User.findOne({telegramId: ctx.from.id});

        // O'quvchining obunasini o'chirish
        const subscription = await Subscription.findOneAndDelete({
          taskId: taskId,
          studentId: parseInt(studentId),
        });

        const teacherId = subscription.teacherId;
        console.log("subscription", subscription);

        if (!subscription) {
          await ctx.answerCallbackQuery("Obuna topilmadi");
          return;
        }

        // Tarixga yozish
        const task = await Task.findById(taskId);
        const student = await User.findOne({telegramId: parseInt(studentId)});

        // Vazifa tarixini o'chirish
        await TaskHistory.deleteMany({
          taskId: taskId,
          studentId: parseInt(studentId),
        });

        if (!task || !student) {
          await ctx.answerCallbackQuery("Vazifa yoki o'quvchi topilmadi");
          return;
        }

        // O'quvchiga va o'qituvchiga xabar yuborish
        try {
          if (user.role === "teacher") {
            await ctx.reply(
              `✅ Siz "${task.title}" vazifasidan ${student.firstName} o'quvchisini chiqardingiz`
            );
            await bot.api.sendMessage(
              parseInt(studentId),
              `❌ Siz "${task.title}" vazifasidan chiqarildingiz.`
            );
          } else {
            bot.api.sendMessage(
              parseInt(teacherId),
              `❌ ${student.firstName} o'quvchingiz "${task.title}" vazifasidan chiqib ketdi`
            );

            ctx.reply(`✅ Siz "${task.title}" vazifasidan chiqdingiz`, {
              reply_markup: {
                keyboard: [[{text: "📝 Vazifalar"}]],
                resize_keyboard: true,
              },
            });
          }
        } catch (error) {
          console.error(
            "O'quvchiga/o'qituvchiga xabar yuborish xatosi:",
            error
          );
        }

        if (user.role === "teacher") {
          // O'quvchining vazifalar ro'yxatiga qaytish
          const subscriptions = await Subscription.find({
            studentId: parseInt(studentId),
            teacherId: teacherId,
          }).sort("-subscribedAt");

          if (subscriptions.length === 0 && user.role === "teacher") {
            await ctx.answerCallbackQuery("O'quvchi vazifadan chiqarildi");
            await ctx.reply("O'quvchining boshqa vazifalari yo'q", {
              reply_markup: {
                keyboard: [[{text: "📝 Vazifalar"}, {text: "👥 O'quvchilar"}]],
                resize_keyboard: true,
              },
            });
            return;
          }

          const keyboard = new InlineKeyboard();
          for (const subscription of subscriptions) {
            const task = await Task.findById(subscription.taskId);
            if (task) {
              // Bugungi kun uchun bajarilganlik holatini tekshirish
              const today = new Date();
              today.setHours(0, 0, 0, 0);

              const todayHistory = await TaskHistory.findOne({
                taskId: task._id,
                studentId: parseInt(studentId),
                action: "completed",
                timestamp: {
                  $gte: today,
                  $lt: new Date(today.getTime() + 24 * 60 * 60 * 1000),
                },
              });

              keyboard
                .text(`${task.title}`, `student_task_${studentId}_${task._id}`)
                .row();
            }
          }
          keyboard.text("⬅️ Orqaga", `student_${studentId}`);

          await ctx.answerCallbackQuery("O'quvchi vazifadan chiqarildi");
          await ctx.reply(`${student.firstName}ning vazifalari:`, {
            reply_markup: keyboard,
            reply_markup_bottom: {
              keyboard: [[{text: "📝 Vazifalar"}, {text: "👥 O'quvchilar"}]],
              resize_keyboard: true,
            },
          });
        }

        await ctx.answerCallbackQuery();
      } catch (error) {
        console.error("Vazifadan chiqarish xatosi:", error);
        await ctx.answerCallbackQuery("Xatolik yuz berdi");
      }
      return;
    }

    // O'quvchini o'chirish
    if (data.startsWith("remove_student_")) {
      const studentId = parseInt(data.split("_")[2]);

      // O'quvchining barcha obunalarini o'chirish
      await Subscription.deleteMany({
        teacherId: ctx.from.id,
        studentId: studentId,
      });

      await ctx.answerCallbackQuery();
      await ctx.reply("O'quvchi muvaffaqiyatli o'chirildi");

      await showStudentsList(ctx);
      return;
    }

    // O'quvchilar ro'yxatiga qaytish
    if (data === "back_to_students") {
      await ctx.answerCallbackQuery();
      await showStudentsList(ctx);
      return;
    }

    // O'quvchini alohida vazifasini ko'rsatish
    if (data.startsWith("student_task_")) {
      try {
        const [, , studentId, taskId] = data.split("_");
        const task = await Task.findById(taskId);
        const student = await User.findOne({telegramId: parseInt(studentId)});
        const teacherId = ctx.from.id;
        const subscription = await Subscription.findOne({
          taskId: taskId,
          studentId: parseInt(studentId),
          teacherId: teacherId,
        });

        if (!task || !student || !subscription) {
          await ctx.answerCallbackQuery("Vazifa yoki o'quvchi topilmadi");
          return;
        }

        // Bugungi kun uchun bajarilganlik holatini tekshirish
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const todayHistory = await TaskHistory.findOne({
          taskId: task._id,
          studentId: parseInt(studentId),
          action: "completed",
          timestamp: {
            $gte: today,
            $lt: new Date(today.getTime() + 24 * 60 * 60 * 1000),
          },
        });

        // Oxirgi 10 kunlik tarix
        const history = await TaskHistory.find({
          taskId: task._id,
          studentId: parseInt(studentId),
          action: "completed",
          timestamp: {
            $gte: new Date(today.getTime() - 9 * 24 * 60 * 60 * 1000),
            $lt: new Date(today.getTime() + 24 * 60 * 60 * 1000),
          },
        }).sort("timestamp");

        let message = `📝 Vazifa: ${task.title}\n`;
        message += `👤 O'quvchi: ${student.firstName}\n\n`;

        message += "📅 Oxirgi 10 kunlik natijalar:\n";

        // Har bir kun uchun natijani tekshirish
        const results = [];
        for (let i = 9; i >= 0; i--) {
          const date = new Date(today);
          date.setDate(date.getDate() - i);
          date.setHours(0, 0, 0, 0);

          // Agar sana obuna bo'lgan kundan oldin bo'lsa
          const subscribeDate = new Date(subscription.subscribedAt);
          subscribeDate.setHours(0, 0, 0, 0);

          if (date < subscribeDate) {
            results.push("⚪️");
            continue;
          }

          // Shu kundagi natijani topish
          const dayHistory = history.find((h) => {
            const historyDate = new Date(h.timestamp);
            historyDate.setHours(0, 0, 0, 0);
            return historyDate.getTime() === date.getTime();
          });

          if (dayHistory) {
            results.push("✅");
          } else {
            results.push("❌");
          }
        }

        message += `${results.join("")}\n`;

        const keyboard = new InlineKeyboard()
          .text("⬅️ Orqaga", `student_tasks_${studentId}`)
          .row()
          .text("❌ Obunani bekor qilish", `unfollow_${studentId}_${task._id}`);

        await ctx.answerCallbackQuery();
        await ctx.reply(message, {
          reply_markup: keyboard,
          reply_markup_bottom: {
            keyboard: [[{text: "📝 Vazifalar"}, {text: "👥 O'quvchilar"}]],
            resize_keyboard: true,
          },
        });
      } catch (error) {
        console.error("Vazifa ma'lumotlarini ko'rsatish xatosi:", error);
        await ctx.answerCallbackQuery("Xatolik yuz berdi");
      }
      return;
    }

    // O'quvchi ma'lumotlarini ko'rsatish
    if (
      data.startsWith("student_") &&
      !data.startsWith("student_tasks_") &&
      !data.startsWith("student_task_")
    ) {
      try {
        const studentId = parseInt(data.split("_")[1]);
        const student = await User.findOne({telegramId: studentId});

        if (!student) {
          await ctx.answerCallbackQuery("O'quvchi topilmadi");
          return;
        }

        // O'quvchining barcha obunalarini olish
        const subscriptions = await Subscription.find({
          studentId: studentId,
          teacherId: ctx.from.id,
        }).sort("-subscribedAt");

        // Vazifalarni olish
        const tasks = await Task.find({
          _id: {$in: subscriptions.map((s) => s.taskId)},
        });

        let message = `👤 O'quvchi: ${student.firstName}`;
        message += student.username ? ` (@${student.username})` : "";
        message += "\n\n📊 Oxirgi 10 kunlik natijalar:\n\n";

        // Har bir vazifa uchun kunlik natijalarni ko'rsatish
        for (const task of tasks) {
          message += `${task.title}:\n`;

          const subscription = subscriptions.find(
            (s) => s.taskId.toString() === task._id.toString()
          );

          if (!subscription) {
            message += "❌ Obuna ma'lumotlari topilmadi\n\n";
            continue;
          }

          // Bugungi kunni olish
          const today = new Date();
          today.setHours(0, 0, 0, 0);

          // Oxirgi 10 kunlik tarix
          const history = await TaskHistory.find({
            taskId: task._id,
            studentId: studentId,
            action: "completed",
            timestamp: {
              $gte: new Date(today.getTime() - 9 * 24 * 60 * 60 * 1000),
              $lt: new Date(today.getTime() + 24 * 60 * 60 * 1000),
            },
          }).sort("timestamp");

          // Har bir kun uchun natijani tekshirish
          const results = [];
          for (let i = 9; i >= 0; i--) {
            const date = new Date(today);
            date.setDate(date.getDate() - i);
            date.setHours(0, 0, 0, 0);

            // Agar sana obuna bo'lgan kundan oldin bo'lsa
            const subscribeDate = new Date(subscription.subscribedAt);
            subscribeDate.setHours(0, 0, 0, 0);

            if (date < subscribeDate) {
              results.push("⚪️");
              continue;
            }

            // Shu kundagi natijani topish
            const dayHistory = history.find((h) => {
              const historyDate = new Date(h.timestamp);
              historyDate.setHours(0, 0, 0, 0);
              return historyDate.getTime() === date.getTime();
            });

            if (dayHistory) {
              results.push("✅");
            } else {
              results.push("❌");
            }
          }

          message += `${results.join("")}\n\n`;
        }

        const keyboard = new InlineKeyboard()
          .text("📝 Vazifalar", `student_tasks_${studentId}`)
          .row()
          .text("❌ O'chirish", `remove_student_${studentId}`);

        await ctx.answerCallbackQuery();
        await ctx.reply(message, {
          reply_markup: keyboard,
          reply_markup_bottom: {
            keyboard: [[{text: "📝 Vazifalar"}, {text: "👥 O'quvchilar"}]],
            resize_keyboard: true,
          },
        });
      } catch (error) {
        console.error("O'quvchi ma'lumotlarini ko'rsatish xatosi:", error);
        await ctx.answerCallbackQuery("Xatolik yuz berdi");
      }
      return;
    }

    // O'quvchining vazifalarini ko'rsatish
    if (data.startsWith("student_tasks_")) {
      try {
        const studentId = parseInt(data.split("_")[2]);
        const student = await User.findOne({telegramId: studentId});

        if (!student) {
          await ctx.answerCallbackQuery("O'quvchi topilmadi");
          return;
        }

        const keyboard = new InlineKeyboard();
        const subscriptions = await Subscription.find({
          studentId: studentId,
          teacherId: ctx.from.id,
        }).sort("-subscribedAt");

        if (subscriptions.length === 0) {
          await ctx.reply("O'quvchining hech qanday vazifasi yo'q", {
            reply_markup: {
              keyboard: [[{text: "📝 Vazifalar"}, {text: "👥 O'quvchilar"}]],
              resize_keyboard: true,
            },
          });
          return;
        }

        for (const subscription of subscriptions) {
          const task = await Task.findById(subscription.taskId);
          if (task) {
            // Bugungi kun uchun bajarilganlik holatini tekshirish
            const today = new Date();
            today.setHours(0, 0, 0, 0);

            const todayHistory = await TaskHistory.findOne({
              taskId: task._id,
              studentId: studentId,
              action: "completed",
              timestamp: {
                $gte: today,
                $lt: new Date(today.getTime() + 24 * 60 * 60 * 1000),
              },
            });

            keyboard
              .text(`${task.title}`, `student_task_${studentId}_${task._id}`)
              .row();
          }
        }
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
      }
      return;
    }

    // Vazifa ma'lumotlarini ko'rsatish
    if (data.startsWith("task_")) {
      try {
        console.log("Vazifa tanlanmoqda...");
        const taskId = data.split("_")[1];
        console.log("TaskId:", taskId);

        const task = await Task.findById(taskId);
        console.log("Topilgan vazifa:", task);

        if (!task) {
          console.log("Vazifa topilmadi");
          await ctx.answerCallbackQuery("Vazifa topilmadi");
          return;
        }

        const user = await User.findOne({telegramId: ctx.from.id});
        console.log("Foydalanuvchi:", user);

        const teacher = await User.findOne({telegramId: task.teacherId});
        console.log("O'qituvchi:", teacher);

        let message = `📝 Vazifa: ${task.title}\n\n`;

        if (user.role === "student") {
          message += `👤 O'qituvchi: ${teacher.firstName}\n\n`;
        }
        let subscription;
        if (user.role === "teacher") {
          console.log("O'qituvchi uchun ma'lumotlar tayyorlanmoqda...");
          // O'qituvchi uchun statistika
          const subscriptions = await Subscription.find({taskId: task._id});
          console.log("Obunalar:", subscriptions);

          const completed = subscriptions.filter(
            (s) => s.status === "completed"
          ).length;
          message += `\n📊 Statistika:\n`;
          message += `👥 Obunachi o'quvchilar: ${subscriptions.length}\n`;
          message += `✅ Bajarilgan: ${completed}\n`;
          message += `⏳ Bajarilmagan: ${subscriptions.length - completed}\n`;

          // Obuna havolasini ko'rsatish
          const shareUrl = `https://t.me/${ctx.me.username}?start=${task.shareLink}`;
          message += `\n🔗 Obuna havolasi:\n${shareUrl}`;
        } else {
          console.log("O'quvchi uchun ma'lumotlar tayyorlanmoqda...");
          // O'quvchi uchun status
          subscription = await Subscription.findOne({
            taskId: task._id,
            studentId: ctx.from.id,
          });
          console.log("O'quvchining obunasi:", subscription);

          if (!subscription) {
            console.log("Obuna topilmadi");
            await ctx.answerCallbackQuery("Siz bu vazifaga obuna bo'lmagansiz");
            return;
          }

          message += `📊 Status: ${
            subscription.status === "completed"
              ? "✅ Bajarilgan"
              : "⏳ Bajarilmagan"
          }\n`;

          // Bugungi kun uchun bajarilganlik holatini tekshirish
          const today = new Date();
          today.setHours(0, 0, 0, 0);

          const todayHistory = await TaskHistory.findOne({
            taskId: task._id,
            studentId: ctx.from.id,
            action: "completed",
            timestamp: {
              $gte: today,
              $lt: new Date(today.getTime() + 24 * 60 * 60 * 1000),
            },
          });
          console.log("Bugungi natija:", todayHistory);
        }

        const keyboard = new InlineKeyboard();

        if (user.role === "student") {
          if (!subscription) {
            subscription = await Subscription.findOne({
              taskId: task._id,
              studentId: ctx.from.id,
            });
          }
          console.log("Tugmalar uchun obuna:", subscription);

          if (!subscription) {
            console.log("Obuna topilmadi");
            await ctx.answerCallbackQuery("Siz bu vazifaga obuna bo'lmagansiz");
            return;
          }

          if (subscription.status === "pending") {
            keyboard.text("✅ Bajarildi", `complete_${task._id}`);
          }
        }
        keyboard
          .text("⬅️ Orqaga", "show_tasks")
          .row()
          .text(
            "❌ Obunani bekor qilish",
            `unfollow_${ctx.from.id}_${task._id}`
          );

        console.log("Xabar yuborilmoqda:", message);
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
                  keyboard: [
                    [{text: "📝 Vazifalar"}, {text: "👥 O'quvchilar"}],
                  ],
                  resize_keyboard: true,
                },
        });
      } catch (error) {
        console.error("Vazifa ma'lumotlarini ko'rsatish xatosi:", error);
        await ctx.answerCallbackQuery("Xatolik yuz berdi");
      }
    }

    // Vazifani bajarildi deb belgilash
    if (data.startsWith("complete_")) {
      try {
        console.log("Vazifa bajarildi deb belgilanmoqda...");
        const taskId = data.split("_")[1];
        console.log("TaskId:", taskId);

        const task = await Task.findById(taskId);
        console.log("Topilgan vazifa:", task);

        if (!task) {
          console.log("Vazifa topilmadi");
          await ctx.answerCallbackQuery("Vazifa topilmadi");
          return;
        }

        // O'quvchini tekshirish
        const user = await User.findOne({telegramId: ctx.from.id});
        if (!user || user.role !== "student") {
          console.log("Foydalanuvchi o'quvchi emas");
          await ctx.answerCallbackQuery("Bu funksiya faqat o'quvchilar uchun");
          return;
        }

        const subscription = await Subscription.findOne({
          taskId: task._id,
          studentId: ctx.from.id,
        });
        console.log("O'quvchining obunasi:", subscription);

        if (!subscription) {
          console.log("Obuna topilmadi");
          await ctx.answerCallbackQuery("Siz bu vazifaga obuna bo'lmagansiz");
          return;
        }

        if (subscription.status === "completed") {
          console.log("Vazifa allaqachon bajarilgan");
          await ctx.answerCallbackQuery("Bu vazifa allaqachon bajarilgan");
          return;
        }

        // Vazifani bajarildi deb belgilash
        subscription.status = "completed";
        subscription.completedAt = new Date();
        subscription.lastCompletedDate = new Date();
        await subscription.save();
        console.log("Obuna yangilandi:", subscription);

        // Tarixga yozish
        const history = await TaskHistory.create({
          taskId: task._id,
          studentId: ctx.from.id,
          teacherId: task.teacherId,
          taskTitle: task.title,
          action: "completed",
          timestamp: new Date(),
        });
        console.log("Tarixga yozildi:", history);

        // O'qituvchiga xabar yuborish
        try {
          await bot.api.sendMessage(
            task.teacherId,
            `✅ Vazifa bajarildi!\n\n👤 O'quvchi: ${
              user.firstName
            }\n\n📝 Vazifa: ${
              task.title
            }\n\n⏰ Vaqt: ${new Date().toLocaleTimeString("uz-UZ", {
              hour: "2-digit",
              minute: "2-digit",
            })}`
          );
          console.log("O'qituvchiga xabar yuborildi");
        } catch (error) {
          console.error("O'qituvchiga xabar yuborish xatosi:", error);
        }

        await ctx.answerCallbackQuery("✅ Vazifa bajarildi deb belgilandi!");

        // Vazifani yangilangan ma'lumotlarini ko'rsatish
        const teacher = await User.findOne({telegramId: task.teacherId});
        const keyboard = new InlineKeyboard()
          .text("⬅️ Orqaga", "show_tasks")
          .row()
          .text(
            "❌ Obunani bekor qilish",
            `unfollow_${ctx.from.id}_${task._id}`
          );

        let message = `📝 Vazifa: ${task.title}\n`;
        message += `👤 O'qituvchi: ${
          teacher ? teacher.firstName : "O'chirilgan"
        }\n`;

        console.log("Xabar yuborilmoqda:", message);
        await ctx.reply(message, {
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
    }

    await ctx.answerCallbackQuery();
  } catch (error) {
    console.error("Callback query xatosi:", error);
    await ctx.answerCallbackQuery("Xatolik yuz berdi");
  }
});

// O'quvchilar ro'yxatini ko'rsatish funksiyasi
async function showStudentsList(ctx) {
  try {
    // O'qituvchining barcha obunalarini olish
    const subscriptions = await Subscription.find({
      teacherId: ctx.from.id,
    });

    // Barcha o'quvchilar ID larini yig'ish
    const studentIds = new Set(subscriptions.map((s) => s.studentId));

    if (studentIds.size === 0) {
      await ctx.reply("Hali o'quvchilar yo'q", {
        reply_markup: {
          keyboard: [[{text: "📝 Vazifalar"}, {text: "👥 O'quvchilar"}]],
          resize_keyboard: true,
        },
      });
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

    ctx.reply("O'quvchilar ro'yxati:", {
      reply_markup: keyboard,
      reply_markup_bottom: {
        keyboard: [[{text: "📝 Vazifalar"}, {text: "👥 O'quvchilar"}]],
        resize_keyboard: true,
      },
    });
  } catch (error) {
    console.error("O'quvchilar ro'yxatini ko'rsatish xatosi:", error);
    await ctx.reply("Xatolik yuz berdi. Iltimos qayta urinib ko'ring", {
      reply_markup: {
        keyboard: [[{text: "📝 Vazifalar"}, {text: "👥 O'quvchilar"}]],
        resize_keyboard: true,
      },
    });
  }
}

// Eslatma yuborish funksiyasi
async function sendReminders() {
  try {
    console.log("Eslatmalarni tekshirish boshlandi...");

    // Joriy vaqt
    const now = new Date();
    const currentHour = now.getHours();
    const currentMinute = now.getMinutes();

    // Belgilangan vaqtlarni tekshirish
    const reminderTimes = [
      {hour: 9, minute: 30},
      {hour: 12, minute: 30},
      {hour: 20, minute: 0},
    ];

    // Hozirgi vaqt belgilangan vaqtlardan biri bo'lmasa, chiqib ketish
    // const isReminderTime = reminderTimes.some(
    //   (time) => time.hour === currentHour && time.minute === currentMinute
    // );

    // if (!isReminderTime) {
    //   return;
    // }

    // Barcha o'quvchilarni olish
    const students = await User.find({role: "student"});
    console.log(`${students.length} ta o'quvchi topildi`);

    for (const student of students) {
      try {
        const subscriptions = await Subscription.find({
          studentId: student.telegramId,
        });

        for (const subscription of subscriptions) {
          const today = new Date();
          today.setHours(0, 0, 0, 0);

          if (
            !subscription.lastCompletedDate ||
            subscription.lastCompletedDate < today
          ) {
            subscription.status = "pending";
            await subscription.save();
          }
        }

        // O'quvchining bajarilmagan vazifalarini olish
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);

        const completedToday = await TaskHistory.find({
          studentId: student.telegramId,
          action: "completed",
          timestamp: {
            $gte: today,
            $lt: tomorrow,
          },
        });

        // Bajarilmagan vazifalar ro'yxatini tayyorlash
        const pendingTasks = [];
        for (const sub of subscriptions) {
          const isCompletedToday = completedToday.some(
            (h) => h.taskId.toString() === sub.taskId.toString()
          );
          if (!isCompletedToday) {
            const task = await Task.findById(sub.taskId);
            if (task) pendingTasks.push(task.title);
          }
        }

        if (pendingTasks.length === 0) continue;

        // Vaqtga qarab xabar matnini tanlash
        let messageText = "";
        if (currentHour === 9) {
          messageText =
            "🌅 Xayrli kun! Bugun quyidagi vazifalarni bajarishni unutmang:";
        } else if (currentHour === 12) {
          messageText =
            "🌞 Kunning yarmi o'tdi! Quyidagi vazifalar hali bajarilmagan:";
        } else {
          messageText =
            "🌙 Kun tugashidan oldin quyidagi vazifalarni bajarib qo'ying:";
        }

        messageText += "\n\n" + pendingTasks.map((t) => `❌ ${t}`).join("\n");

        await bot.api.sendMessage(student.telegramId, messageText);
        console.log(`${student.firstName} ga eslatma yuborildi`);
      } catch (error) {
        console.error(
          `${student.firstName} ga eslatma yuborish xatosi:`,
          error
        );
      }
    }
  } catch (error) {
    console.error("Eslatmalar yuborish xatosi:", error);
  }
}

// Har daqiqada tekshirish (belgilangan vaqtlarda yuborish uchun)
setInterval(sendReminders, 60 * 1000);

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
