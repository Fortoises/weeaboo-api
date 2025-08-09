
import { exec } from 'child_process';

let backupTimeout: NodeJS.Timeout | null = null;

const performBackup = () => {
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = process.env.TELEGRAM_CHAT_ID;

    if (!botToken || !chatId) {
        console.warn("Telegram token/chat ID not set. Skipping backup.");
        return;
    }

    const timestamp = new Date().toISOString();
    const caption = `Backup WeeabooDB - ${timestamp}`;
    const dbPath = './weeaboo.sqlite';

    const command = `curl -F "document=@${dbPath}" -F "caption=${caption}" https://api.telegram.org/bot${botToken}/sendDocument?chat_id=${chatId}`;

    exec(command, (error, stdout, stderr) => {
        if (error) {
            console.error(`Backup failed: ${error.message}`);
            return;
        }
        if (stderr) {
            console.error(`Backup stderr: ${stderr}`);
            return;
        }
        console.log(`Backup successful: ${stdout}`);
    });
};

export const scheduleBackup = () => {
    if (backupTimeout) {
        clearTimeout(backupTimeout);
    }

    backupTimeout = setTimeout(() => {
        console.log("Debounce timer finished. Performing backup...");
        performBackup();
    }, 10000); // 10-second debounce
};
