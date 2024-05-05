import dotenv from "dotenv";
import { Telegraf } from "telegraf";
import UserModel from "../../src/models/User.js";
import connectDB from "../../src/config/db.js";
import { message } from "telegraf/filters";
import EventModel from "../../src/models/Event.js";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { marked } from "marked";
import PlainTextRenderer from "marked-plaintext";

dotenv.config();

const bot = new Telegraf(process.env.TELEGRAM_BOT_API);

try {
  connectDB();
  console.log("Connected to DB");
} catch (error) {
  process.kill(process.pid, "SIGTERM");
}

//   //This is onstart functionalities
bot.start(async function (ctx) {
  const from = ctx.update.message.from;

  // console.log(ctx.update.message.chat);

  //store the information in DB
  try {
    await UserModel.findOneAndUpdate(
      {
        tgId: from.id.toString(),
      },
      {
        $setOnInsert: {
          firstName: from.first_name,
          lastName: from.last_name,
          isBot: from.is_bot,
          username: from.first_name,
        },
      },
      {
        upsert: true,
        new: true,
      }
    );

    //reply on start after storing it in DB
    await ctx.reply(`
  👋 Welcome to DailyChronicleBot! ${from.first_name},

  🌟 Hey! I'm thrilled to welcome you to DailyChronicleBot – your personal day companion right here on Telegram. 🚀
  
  📝 Let's embark on a journey together where keeping track of your daily activities is as easy as having a conversation. Just chat with me, and I'll help you record your adventures, achievements, and everything in between.
  
  ✨ At the end of the day, I'll weave your day's events into a beautifully crafted social media post, making sure your moments worth sharing shine bright.
  🎉`);

    //just for test
    await ctx.reply("testing another message");
  } catch (error) {
    // if (error.code === 11000) {
    //   // Duplicate key error (e.g., tgId or username already exists)
    //   console.error("Duplicate key error:", error.message);
    //   // Handle the error gracefully (e.g., send a response to the user)
    // } else {
    //   // Other errors
    //   console.error("Error:", error.message);
    //   // Handle other errors
    // }

    await ctx.reply("There is something wrong please try again later.");
  }
});

bot.command("generate", async (ctx) => {
  const from = ctx.update.message.from;

  const startOfTheDay = new Date();
  startOfTheDay.setHours(0, 0, 0, 0);

  const endOfTheDay = new Date();
  endOfTheDay.setHours(23, 59, 59, 999);

  //get events from the user
  const events = await EventModel.find({
    tgId: from.id,
    createdAt: {
      $gte: startOfTheDay,
      $lte: endOfTheDay,
    },
  });

  if (events.length === 0) {
    await ctx.reply("No event for the day. Keep adding events to generate.");
    return;
  }

  //make genai call

  // Create parts array
  const parts = events.map((event) => ({ text: event.text }));
  parts.push({
    text: `Now Act in the role of a senor content creator. Your task? Write captivating posts for LinkedIn use all the above informaion and write a single post with all above information . Each post should be brimming with creativity, utilizing stickers, hashtags, and engaging content to captivate your audience's attention. Dive deep into the art of storytelling, infusing each word with purpose and flair from the above information. `,
  });

  // console.log(parts);

  const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);
  const model = genAI.getGenerativeModel({ model: "gemini-pro" });
  const chat = model.startChat({
    history: [
      {
        role: "user",
        parts: parts,
      },
      {
        role: "model",
        parts: [{ text: "yes, i can." }],
      },
    ],
    generationConfig: {
      maxOutputTokens: 10000,
    },
  });
  const message = "Then please generate it more engaging?";
  const result = await chat.sendMessage(message);
  const response = result.response;
  const textPromise = response.text();
  const text = textPromise;

  const plaintextOptions = {
    sanitize: false,
  };

  function convertToPlainText(markdownText) {
    const renderer = new PlainTextRenderer();
    renderer.checkbox = (text) => {
      return text;
    };
    marked.setOptions(plaintextOptions);
    return marked(markdownText, { renderer });
  }

  function decodeHTML(html) {
    return html.replace(/&quot;/g, '"').replace(/&#39;/g, "'");
  }

  // console.log(text);
  const resultText = decodeHTML(convertToPlainText(text));
  // console.log(resultText);
  //store token count

  //send resonse message
  await ctx.reply(resultText);
});

bot.on(message("text"), async (ctx) => {
  const from = ctx.update.message.from;

  const message = ctx.update.message.text;

  try {
    await EventModel.create({
      text: message,
      tgId: from.id,
    });
    await ctx.reply(`
        Noted 👍, Keep texting me your thoughts. To generate the posts. simply enter the command:  /generate
        `);
  } catch (error) {
    ctx.reply("Something went wrong in server.");
  }
});

bot.launch();

// Enable graceful stop
process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));

// AWS event handler syntax (https://docs.aws.amazon.com/lambda/latest/dg/nodejs-handler.html)
export const handler = async (event) => {
  try {
    await bot.handleUpdate(JSON.parse(event.body));
    return { statusCode: 200, body: "" };
  } catch (e) {
    console.error("error in handler:", e);
    return {
      statusCode: 400,
      body: "This endpoint is meant for bot and telegram communication",
    };
  }
};
