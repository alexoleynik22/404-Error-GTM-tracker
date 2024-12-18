// Author: Alexander Oleynik
// Date: 2024-11-13
// Description: This script tracks 404 errors on websites using Google Tag Manager and logs them into a Google Sheet. It also sends Telegram notifications and daily summary emails with KPIs.
// clone this app script to your google account and replace the SPREADSHEET_ID with your own google sheet id https://docs.google.com/spreadsheets/d/1mHand33wG2_dKL6hYqPaLWfbiB_wuwWpW9fJNFin2bw/edit?gid=0#gid=0 
// and replace the TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID with your own telegram bot token and chat id
// and replace the EMAILS with your own email address
// and replace the TIME_ZONE with your own timezone
// and replace the SHEET_NAME with your own sheet name, unless you clone the sheet from the link above
// and replace the EMAIL_SUBJECT_PREFIX with your own email subject prefix 
// and replace the SEND_EMAIL with YES or NO
// and replace the SEND_TELEGRAM with YES or NO

// Provide your Spreadsheet ID here
var SPREADSHEET_ID = 'REPLACE_WITH_YOUR_SPREADSHEET_ID'; // Replace with your actual Spreadsheet ID

// Function to get settings from the "Settings" sheet
function getSettings() {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var settingsSheet = ss.getSheetByName("Settings");
  if (!settingsSheet) {
    // If the Settings sheet doesn't exist, create it with default values
    settingsSheet = ss.insertSheet("Settings");
    settingsSheet.appendRow(["Setting", "Value"]);
    settingsSheet.appendRow(["SHEET_NAME", "404 Errors"]);
    settingsSheet.appendRow(["EMAILS", "email1@example.com, email2@example.com"]);
    settingsSheet.appendRow(["TIME_ZONE", "America/New_York"]); // Set default to EST
    settingsSheet.appendRow(["SEND_EMAIL", "YES"]); // YES or NO
    settingsSheet.appendRow(["EMAIL_SUBJECT_PREFIX", "404 Error Report - "]);
    settingsSheet.appendRow(["SEND_TELEGRAM", "NO"]); // YES or NO
    settingsSheet.appendRow(["TELEGRAM_BOT_TOKEN", "123123123123:123123123123KldoninuEfCc1y4wbchZsoA"]);
    settingsSheet.appendRow(["TELEGRAM_CHAT_ID", "-12312312312"]);
    SpreadsheetApp.flush();
  }

  var settings = {};
  var data = settingsSheet.getRange(2, 1, settingsSheet.getLastRow() - 1, 2).getValues();
  data.forEach(function(row) {
    settings[row[0]] = row[1];
  });
  settings["SPREADSHEET_ID"] = SPREADSHEET_ID;
  return settings;
}

// Function to format UTM columns as plain text
function formatUTMColumns(sheet) {
  sheet.getRange(2, 5, sheet.getLastRow(), 5).setNumberFormat("@"); // Columns E to I (UTM Source to UTM Content)
}

function doGet(e) {
  return handleRequest(e);
}

function doPost(e) {
  return handleRequest(e);
}

function handleRequest(e) {
  var lock = LockService.getScriptLock();
  lock.waitLock(30000); // Wait up to 30 seconds for previous execution to finish

  try {
    var settings = getSettings();
    var ss = SpreadsheetApp.openById(settings["SPREADSHEET_ID"]);
    var SHEET_NAME = settings["SHEET_NAME"] || "404 Errors";

    var sheet = ss.getSheetByName(SHEET_NAME);
    if (!sheet) {
      // If sheet doesn't exist, create it and add headers
      sheet = ss.insertSheet(SHEET_NAME);
      sheet.appendRow(["Timestamp", "URL", "Hostname", "Referrer", "UTM Source", "UTM Medium", "UTM Campaign", "UTM Term", "UTM Content"]);
    }

    // Ensure UTM columns are formatted as plain text
    formatUTMColumns(sheet);

    var timestamp = new Date();
    var url = e.parameter.url || '';
    var hostname = e.parameter.hostname || '';
    var referrer = e.parameter.referrer || '';
    var utm_source = e.parameter.utm_source || '';
    var utm_medium = e.parameter.utm_medium || '';
    var utm_campaign = e.parameter.utm_campaign || '';
    var utm_term = e.parameter.utm_term || '';
    var utm_content = e.parameter.utm_content || '';

    var row = [timestamp, url, hostname, referrer, utm_source, utm_medium, utm_campaign, utm_term, utm_content];
    sheet.appendRow(row);

    // Prepare data for Telegram message
    var data = {
      url: url,
      hostname: hostname,
      referrer: referrer,
      utm_source: utm_source,
      utm_medium: utm_medium,
      utm_campaign: utm_campaign,
      utm_term: utm_term,
      utm_content: utm_content
    };

    // Send Telegram message
    sendTelegramMessage(data);

    return ContentService.createTextOutput(JSON.stringify({ "result": "success" })).setMimeType(ContentService.MimeType.JSON);
  } catch (error) {
    // Log error to "Error Log" sheet
    logError(error);
    return ContentService.createTextOutput(JSON.stringify({ "result": "error", "error": error.toString() })).setMimeType(ContentService.MimeType.JSON);
  } finally {
    lock.releaseLock();
  }
}

// Function to process 404 errors and send daily email
function tracker404() {
  var settings = getSettings();
  var ss = SpreadsheetApp.openById(settings["SPREADSHEET_ID"]);
  var SHEET_NAME = settings["SHEET_NAME"] || "404 Errors";
  var TIME_ZONE = settings["TIME_ZONE"] || "America/New_York";
  var SEND_EMAIL = settings["SEND_EMAIL"] || "YES";
  var EMAIL_SUBJECT_PREFIX = settings["EMAIL_SUBJECT_PREFIX"] || "404 Error Report - ";
  var EMAILS = settings["EMAILS"] || "";

  var sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) return;

  var data = sheet.getDataRange().getValues();
  if (data.length < 2) return; // No data to process

  var headers = data[0];
  var rows = data.slice(1);

  var today = new Date();
  var checkDate = Utilities.formatDate(today, TIME_ZONE, 'yyyy-MM-dd');

  // Filter rows for today's date
  var todayRows = rows.filter(function(row) {
    var timestamp = row[0];
    var dateString = Utilities.formatDate(new Date(timestamp), TIME_ZONE, 'yyyy-MM-dd');
    return dateString == checkDate;
  });

  if (todayRows.length === 0) return; // No data for today

  // Collect unique URLs for today
  var todayUrls = todayRows.map(function(row) {
    return row[1]; // URL is in column 2
  });

  // Remove duplicates
  todayUrls = todayUrls.filter(function(value, index, self) {
    return self.indexOf(value) === index;
  });

  // Optionally, send email with today's URLs
  if (SEND_EMAIL.toUpperCase() === "YES") {
    sendDailyEmail();
  }
}

// Function to send daily email with summary
function sendDailyEmail() {
  var settings = getSettings();
  var ss = SpreadsheetApp.openById(settings["SPREADSHEET_ID"]);
  var SHEET_NAME = settings["SHEET_NAME"] || "404 Errors";
  var TIME_ZONE = settings["TIME_ZONE"] || "America/New_York";
  var SEND_EMAIL = settings["SEND_EMAIL"] || "YES";
  var EMAIL_SUBJECT_PREFIX = settings["EMAIL_SUBJECT_PREFIX"] || "404 Error Report - ";
  var EMAILS = settings["EMAILS"] || "";

  if (SEND_EMAIL.toUpperCase() !== "YES") return;

  var sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) return;

  var data = sheet.getDataRange().getValues();
  if (data.length < 2) return; // No data to process

  var headers = data[0];
  var rows = data.slice(1);

  var today = new Date();
  var checkDate = Utilities.formatDate(today, TIME_ZONE, 'yyyy-MM-dd');

  // Filter rows for today's date
  var todayRows = rows.filter(function(row) {
    var timestamp = row[0];
    var dateString = Utilities.formatDate(new Date(timestamp), TIME_ZONE, 'yyyy-MM-dd');
    return dateString == checkDate;
  });

  if (todayRows.length === 0) return; // No data for today

  // Collect KPIs
  var total404s = todayRows.length;
  var uniqueHosts = [...new Set(todayRows.map(row => row[2]))]; // Hostname is in column 3
  var totalHosts = uniqueHosts.length;
  var paid404s = todayRows.filter(function(row) {
    return row[5] === 'cpc' || row[5] === 'ppc'; // UTM Medium is in column 6
  }).length;

  // Build HTML email content
  var htmlContent = '<html><body>';
  htmlContent += '<h3>404 Error Report for ' + checkDate + '</h3>';
  htmlContent += '<p><strong>Total 404s:</strong> ' + total404s + '</p>';
  htmlContent += '<p><strong>Total Hosts:</strong> ' + totalHosts + '</p>';
  htmlContent += '<p><strong>Paid 404s:</strong> ' + paid404s + '</p>';
  htmlContent += '<table border="1" cellpadding="5" cellspacing="0" style="border-collapse: collapse;">';
  htmlContent += '<tr>';
  headers.forEach(function(header) {
    htmlContent += '<th>' + header + '</th>';
  });
  htmlContent += '</tr>';

  todayRows.forEach(function(row) {
    htmlContent += '<tr>';
    row.forEach(function(cell, index) {
      if (index === 0 && cell instanceof Date) {
        // Format the timestamp
        var formattedDate = Utilities.formatDate(cell, TIME_ZONE, 'MM/dd/yyyy hh:mma');
        htmlContent += '<td>' + formattedDate + '</td>';
      } else {
        htmlContent += '<td>' + cell + '</td>';
      }
    });
    htmlContent += '</tr>';
  });
  htmlContent += '</table>';
  htmlContent += '<p>You can view the full report <a href="' + ss.getUrl() + '">here</a>.</p>';
  htmlContent += '</body></html>';

  var recipients = getRecipients(settings);
  if (recipients.length === 0) return; // No recipients to send email

  var subject = EMAIL_SUBJECT_PREFIX + checkDate;
  MailApp.sendEmail({
    to: recipients.join(','),
    subject: subject,
    htmlBody: htmlContent,
    noReply: true
  });
}

// Function to get email recipients from the "EMAILS" setting
function getRecipients(settings) {
  var EMAILS = settings["EMAILS"] || "";
  var emails = EMAILS.split(',').map(function(email) {
    return email.trim();
  }).filter(function(email) {
    return email && email.indexOf('@') > -1; // Basic validation
  });
  return emails;
}

// Function to send Telegram message
function sendTelegramMessage(data) {
  var settings = getSettings();
  var SEND_TELEGRAM = settings["SEND_TELEGRAM"] || "NO";
  if (SEND_TELEGRAM.toUpperCase() !== "YES") return;

  var TELEGRAM_BOT_TOKEN = settings["TELEGRAM_BOT_TOKEN"];
  var TELEGRAM_CHAT_ID = settings["TELEGRAM_CHAT_ID"];

  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) return;

  var message = '<b>🚫 404 Detected!</b>\n' +
    '<b>URL:</b> <a href="' + data.url + '">' + data.url + '</a>\n' +
    '<b>Hostname:</b> ' + data.hostname + '\n' +
    '<b>Referrer:</b> ' + data.referrer + '\n' +
    '<b>UTM Source:</b> ' + data.utm_source + '\n' +
    '<b>UTM Medium:</b> ' + data.utm_medium + '\n' +
    '<b>UTM Campaign:</b> ' + data.utm_campaign + '\n' +
    '<b>UTM Term:</b> ' + data.utm_term + '\n' +
    '<b>UTM Content:</b> ' + data.utm_content;

  var url = 'https://api.telegram.org/bot' + TELEGRAM_BOT_TOKEN + '/sendMessage';

  var payload = {
    'chat_id': TELEGRAM_CHAT_ID,
    'text': message,
    'parse_mode': 'HTML'
  };

  var options = {
    'method': 'post',
    'contentType': 'application/json',
    'payload': JSON.stringify(payload),
    'muteHttpExceptions': true // Add this to prevent the script from failing on HTTP errors
  };

  try {
    var response = UrlFetchApp.fetch(url, options);
    var result = JSON.parse(response.getContentText());
    if (!result.ok) {
      throw new Error('Telegram API Error: ' + result.description);
    }
  } catch (error) {
    // Log Telegram errors but continue execution
    logError('Telegram Error: ' + error);
  }
}

// Function to log errors to "Error Log" sheet
function logError(error) {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sheet = ss.getSheetByName("Error Log") || ss.insertSheet("Error Log");
  sheet.appendRow([new Date(), error.message || error.toString()]);
}