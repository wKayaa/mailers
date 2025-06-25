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

const sendEmails = async (recipients, subjects, html, fromEmail, fromName, delayMs, port, concurrency) => {
  const secure = port === 465;
  
  // Use rotation configuration if enabled and available
  const rotationEnabled = config.rotation?.enabled === true;
  const senderNames = rotationEnabled && config.rotation?.senderNames ? config.rotation.senderNames : [fromName];
  const smtpHosts = rotationEnabled && config.rotation?.smtpHosts ? config.rotation.smtpHosts : [config.smtp.host];
  
  let sent = 0, failed = 0, subjectIndex = 0, senderIndex = 0, hostIndex = 0;
  let i = 0;
  
  // Create multiple transporters for host rotation
  const transporters = smtpHosts.map(host => 
    nodemailer.createTransport({
      host,
      port,
      secure,
      auth: config.smtp.auth,
    })
  );

  if (rotationEnabled) {
    console.log(`📨 Envoi avec rotation: ${senderNames.length} noms, ${smtpHosts.length} hosts, ${concurrency} envois simultanés...\n`.cyan);
  } else {
    console.log(`📨 Envoi via ${config.smtp.host} (port ${port}) avec ${concurrency} envois simultanés...\n`.cyan);
  }

  while (i < recipients.length) {
    const batch = recipients.slice(i, i + concurrency);

    const results = await Promise.allSettled(batch.map((r, idx) => {
      const currentSubject = subjects[(subjectIndex + idx) % subjects.length];
      const currentSenderName = senderNames[(senderIndex + idx) % senderNames.length];
      const currentHostIndex = (hostIndex + idx) % transporters.length;
      const currentTransporter = transporters[currentHostIndex];
      const currentHost = smtpHosts[currentHostIndex];
      
      const mailOptions = {
        from: `${currentSenderName} <${fromEmail}>`,
        to: r.email,
        subject: currentSubject,
        html: personalizeTemplate(html, r),
      };

      return currentTransporter.sendMail(mailOptions)
        .then(() => {
          if (rotationEnabled) {
            console.log(`✔ ${r.email} | Sujet: ${currentSubject} | De: ${currentSenderName} | Host: ${currentHost}`.green);
          } else {
            console.log(`✔ ${r.email} | Sujet: ${currentSubject}`.green);
          }
          return true;
        })
        .catch(e => {
          console.log(`✘ ${r.email} | ${e.message}`.red);
          return false;
        });
    }));

    results.forEach(r => r.status === "fulfilled" && r.value ? sent++ : failed++);
    updateConsoleTitle(sent, recipients.length - sent - failed, failed);
    
    // Rotate all indexes
    subjectIndex = (subjectIndex + concurrency) % subjects.length;
    senderIndex = (senderIndex + concurrency) % senderNames.length;
    hostIndex = (hostIndex + concurrency) % transporters.length;

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

    const { sendFromEmail, sendFromName, delaySeconds, smtpPort, concurrency } = await prompt([
      {
        type: "input",
        name: "sendFromEmail",
        message: "✉️ E-mail expéditeur :",
        validate: input => input.trim() ? true : "Requis.",
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
      sendFromEmail,
      sendFromName,
      parseFloat(delaySeconds) * 1000,
      smtpPort,
      parseInt(concurrency)
    );
  } catch (e) {
    console.error(`❌ Erreur : ${e.message}`.red);
  }
})();
