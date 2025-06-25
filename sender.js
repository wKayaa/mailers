const nodemailer = require("nodemailer");
const colors = require("colors");
const { prompt } = require("inquirer");
const fs = require("fs");
const axios = require("axios");

const config = JSON.parse(fs.readFileSync("config.json", "utf-8"));

const loadLetters = () => {
  const files = fs.readdirSync("./letters").filter(f => f.endsWith(".html"));
  return files.map(f => ({ name: f, value: f }));
};

const loadSubjects = () => {
  try {
    const data = fs.readFileSync("subjects.txt", "utf-8");
    const subjects = data.split("\n").map(l => l.trim()).filter(Boolean);
    if (!subjects.length) throw new Error("Aucun sujet trouvé.");
    return subjects;
  } catch (e) {
    console.error(`Erreur lecture 'subjects.txt' : ${e.message}`.red);
    process.exit(1);
  }
};

const loadRecipientsFromFile = (filePath) => {
  try {
    const lines = fs.readFileSync(filePath, "utf-8").split("\n").filter(Boolean);
    return lines.map(line => {
      const parts = line.split(",").map(p => p.trim().replace(/^"|"$/g, ""));
      const email = parts[1] || parts[0];
      const name = parts[0].includes("@") ? parts[0] : (parts[0] || email);
      return {
        name,
        email,
        phone: parts[2] || "",
        address: parts[3] || "",
        zip: parts[5] || "",
        city: parts[6] || "",
        country: parts[7] || "",
      };
    }).filter(r => r.email);
  } catch (e) {
    console.error(`Erreur lecture destinataires : ${e.message}`.red);
    process.exit(1);
  }
};

const personalizeTemplate = (html, r) => {
  return html
    .replace(/%name%/g, r.name || r.email)
    .replace(/%email%/g, r.email)
    .replace(/%phone%/g, r.phone)
    .replace(/%address%/g, r.address)
    .replace(/%zip%/g, r.zip)
    .replace(/%city%/g, r.city)
    .replace(/%country%/g, r.country);
};

const sendTelegramNotification = async (message) => {
  const { botToken, chatId } = config.telegram;
  const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
  try {
    await axios.post(url, { chat_id: chatId, text: message });
    console.log(`✔ Telegram : ${message}`.blue);
  } catch (e) {
    console.log(`✘ Telegram : ${e.message}`.red);
  }
};

const updateConsoleTitle = (sent, rest, failed) => {
  process.title = `Turbo SMTP | Envoyés: ${sent} | Restants: ${rest} | Échecs: ${failed}`;
};

const delay = (ms) => new Promise(res => setTimeout(res, ms));

const generateRandomEncryptedString = () => {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < 18; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
};

const sendEmails = async (recipients, subjects, html, fromDomain, fromName, delayMs, port, concurrency) => {
  const secure = port === 465;
  const transporter = nodemailer.createTransport({
    host: config.smtp.host,
    port,
    secure,
    auth: config.smtp.auth,
  });

  let sent = 0, failed = 0, subjectIndex = 0;
  let i = 0;

  console.log(`📨 Envoi via ${config.smtp.host} (port ${port}) avec ${concurrency} envois simultanés...\n`.cyan);

  while (i < recipients.length) {
    const batch = recipients.slice(i, i + concurrency);

    const results = await Promise.allSettled(batch.map((r, idx) => {
      const currentSubject = subjects[(subjectIndex + idx) % subjects.length];
      // Generate unique encrypted email for each recipient
      const uniqueFromEmail = `${generateRandomEncryptedString()}@${fromDomain}`;
      const mailOptions = {
        from: `${fromName} <${uniqueFromEmail}>`,
        to: r.email,
        subject: currentSubject,
        html: personalizeTemplate(html, r),
      };

      return transporter.sendMail(mailOptions)
        .then(() => {
          console.log(`✔ ${r.email} | Sujet : ${currentSubject} | From: ${uniqueFromEmail}`.green);
          return true;
        })
        .catch(e => {
          console.log(`✘ ${r.email} | ${e.message}`.red);
          return false;
        });
    }));

    results.forEach(r => r.status === "fulfilled" && r.value ? sent++ : failed++);
    updateConsoleTitle(sent, recipients.length - sent - failed, failed);
    subjectIndex = (subjectIndex + concurrency) % subjects.length;

    if (sent > 0 && sent % 500 === 0) {
      await sendTelegramNotification(`📧 ${sent} e-mails envoyés via Turbo SMTP.`);
    }

    i += concurrency;
    if (delayMs > 0) await delay(delayMs);
  }

  console.log(`\n✅ Terminé. Envoyés: ${sent}, Échecs: ${failed}\n`.blue.bold);
};

(async () => {
  try {
    console.clear();
    console.log("=== TURBO SMTP MAILER ===\n".bold.blue);

    const letters = loadLetters();
    if (!letters.length) return console.error("❌ Aucun template HTML trouvé.".red);

    const subjects = loadSubjects();

    const { selectedLetter } = await prompt([
      {
        type: "list",
        name: "selectedLetter",
        message: "📄 Sélectionnez le template :",
        choices: letters,
      },
    ]);

    const html = fs.readFileSync(`./letters/${selectedLetter}`, "utf-8");

    const { filePath } = await prompt([
      {
        type: "input",
        name: "filePath",
        message: "📂 Fichier destinataires (.txt) :",
      },
    ]);

    const recipients = loadRecipientsFromFile(filePath);
    console.log(`👥 ${recipients.length} destinataires chargés`.yellow.bold);

    const { sendFromDomain, sendFromName, delaySeconds, smtpPort, concurrency } = await prompt([
      {
        type: "input",
        name: "sendFromDomain",
        message: "🌐 Domaine expéditeur (ex: example.com) :",
        validate: input => {
          const domain = input.trim();
          if (!domain) return "Requis.";
          if (domain.includes("@")) return "Saisissez uniquement le domaine (sans @).";
          if (!domain.includes(".")) return "Format de domaine invalide.";
          return true;
        },
      },
      {
        type: "input",
        name: "sendFromName",
        message: "👤 Nom expéditeur :",
        validate: input => input.trim() ? true : "Requis.",
      },
      {
        type: "input",
        name: "delaySeconds",
        message: "⏱️ Délai (sec) entre lots :",
        default: 1,
        validate: input => parseFloat(input) >= 0 ? true : "Nombre invalide.",
      },
      {
        type: "list",
        name: "smtpPort",
        message: "📡 Port SMTP :",
        choices: [587, 465],
      },
      {
        type: "input",
        name: "concurrency",
        message: "🚀 Envois simultanés (concurrency) :",
        default: 5,
        validate: input => parseInt(input) > 0 ? true : "Doit être > 0.",
      },
    ]);

    await sendEmails(
      recipients,
      subjects,
      html,
      sendFromDomain,
      sendFromName,
      parseFloat(delaySeconds) * 1000,
      smtpPort,
      parseInt(concurrency)
    );
  } catch (e) {
    console.error(`❌ Erreur : ${e.message}`.red);
  }
})();
