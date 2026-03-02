/**
 * Google Apps Script for Wedding Registry
 *
 * This script provides a REST API for the wedding registry:
 * - GET: Returns all registry items as JSON
 * - POST: Updates the "Claimed" status of an item
 *
 * SETUP INSTRUCTIONS:
 * 1. Open your Google Sheet: https://docs.google.com/spreadsheets/d/1c5030F5UL3VHeIMxPgdNUPmgPjfw6wwJDdyTvhaAZYA/edit
 * 2. Go to Extensions > Apps Script
 * 3. Delete any existing code and paste this entire script
 * 4. Click "Deploy" > "New deployment"
 * 5. Select type: "Web app"
 * 6. Set "Execute as": "Me"
 * 7. Set "Who has access": "Anyone"
 * 8. Click "Deploy" and authorize the app
 * 9. Copy the Web App URL and update REGISTRY_API_URL in your website code
 * 10. UPDATE the WEBSITE_URL constant below with your actual website URL
 * 11. Run setupReminderTrigger() once to enable automatic reminder emails
 *
 * EXPECTED SHEET FORMAT (Tab name: "REGISTRY"):
 * Row 1: Headers
 * Column A: Product Name
 * Column B: Manufacturer/Brand
 * Column C: Price (e.g., "$199.99")
 * Column D: Product URL (link to purchase)
 * Column E: Image URL (thumbnail image)
 * Column F: Claimed (TRUE/FALSE or Yes/No, empty = not claimed)
 * Column G: Claimed By (optional - name of person who claimed)
 * Column H: Claim Timestamp (auto-filled)
 * Column I: Total Contributed (running total of contributions toward this item)
 *
 * AUTO-CREATED SHEET (Tab name: "PENDING_CLAIMS"):
 * This sheet is created automatically when needed. It tracks:
 * - Claim Token, Item ID, Item Name, Guest Name, Guest Email
 * - Product URL, Created At, Status, First/Second Reminder Sent
 */

const SHEET_NAME = 'REGISTRY';
const PENDING_CLAIMS_SHEET = 'PENDING_CLAIMS';
const PENDING_CONTRIBUTIONS_SHEET = 'PENDING_CONTRIBUTIONS';

// Email configuration
const COUPLE_NAMES = 'Daphne & Adam';
const WEBSITE_URL = 'https://daphneandadam.site/'; // UPDATE THIS with your actual website URL

// Payment accounts
const PAYMENT_ACCOUNTS = {
  venmo: '@Adag96',
  paypal: 'https://paypal.me/adagostino96',
  zelle: 'adag96@gmail.com'
};

/**
 * Handle GET requests - return all registry items as JSON
 */
function doGet(e) {
  try {
    const data = getRegistryData();
    return createJsonResponse(data);
  } catch (error) {
    return createJsonResponse({ error: error.message }, 500);
  }
}

/**
 * Handle POST requests - update claimed status
 */
function doPost(e) {
  try {
    const params = JSON.parse(e.postData.contents);

    if (params.action === 'claim') {
      const result = claimItem(params.rowIndex, params.claimedBy);
      return createJsonResponse(result);
    }

    if (params.action === 'createPendingClaim') {
      const result = createPendingClaim(params.itemId, params.itemName, params.guestName, params.guestEmail, params.productUrl);
      return createJsonResponse(result);
    }

    if (params.action === 'confirmClaim') {
      const result = confirmClaim(params.token);
      return createJsonResponse(result);
    }

    if (params.action === 'cancelClaim') {
      const result = cancelClaim(params.token);
      return createJsonResponse(result);
    }

    if (params.action === 'getPendingClaim') {
      const result = getPendingClaim(params.token);
      return createJsonResponse(result);
    }

    if (params.action === 'saveClaimNote') {
      const result = saveClaimNote(params.token, params.note);
      return createJsonResponse(result);
    }

    // Contribution actions (WED-28)
    if (params.action === 'createPendingContribution') {
      const result = createPendingContribution(
        params.itemId,
        params.itemName,
        params.amount,
        params.guestName,
        params.guestEmail,
        params.paymentMethod
      );
      return createJsonResponse(result);
    }

    if (params.action === 'getPendingContribution') {
      const result = getPendingContribution(params.token);
      return createJsonResponse(result);
    }

    if (params.action === 'confirmContribution') {
      const result = confirmContribution(params.token);
      return createJsonResponse(result);
    }

    if (params.action === 'cancelContribution') {
      const result = cancelContribution(params.token);
      return createJsonResponse(result);
    }

    if (params.action === 'saveContributionNote') {
      const result = saveContributionNote(params.token, params.note);
      return createJsonResponse(result);
    }

    return createJsonResponse({ error: 'Invalid action' }, 400);
  } catch (error) {
    return createJsonResponse({ error: error.message }, 500);
  }
}

/**
 * Get all registry items from the sheet
 */
function getRegistryData() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);

  if (!sheet) {
    throw new Error(`Sheet "${SHEET_NAME}" not found`);
  }

  const data = sheet.getDataRange().getValues();

  // Skip header row
  if (data.length < 2) {
    return { items: [] };
  }

  // Get confirmed contribution totals for all items
  const contributionTotals = getConfirmedContributionTotals();

  const items = [];

  // Start from row 2 (index 1) to skip headers
  for (let i = 1; i < data.length; i++) {
    const row = data[i];

    // Skip empty rows
    if (!row[0] || row[0].toString().trim() === '') {
      continue;
    }

    const itemId = i; // Row index (1-based, matches sheet row number)

    // Use dynamic contribution total from confirmed contributions
    const dynamicTotal = contributionTotals[itemId] || 0;

    items.push({
      id: itemId,
      productName: row[0] || '',
      manufacturer: row[1] || '',
      price: row[2] || '',
      productUrl: row[3] || '',
      imageUrl: row[4] || '',
      claimed: isClaimed(row[5]),
      claimedBy: row[6] || '', // Optional: Column G can store who claimed it
      totalContributed: dynamicTotal // Calculated from confirmed contributions
    });
  }

  return { items: items };
}

/**
 * Calculate total confirmed contributions for all items
 * Returns an object mapping itemId -> total amount
 */
function getConfirmedContributionTotals() {
  const totals = {};

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(PENDING_CONTRIBUTIONS_SHEET);

  if (!sheet) {
    return totals; // No contributions sheet yet
  }

  const data = sheet.getDataRange().getValues();

  // Skip header row
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    const itemId = row[1]; // Column B: Item ID
    const amount = parseFloat(row[3]) || 0; // Column D: Amount
    const status = row[8]; // Column I: Status

    // Only count confirmed contributions
    if (status === 'confirmed') {
      if (!totals[itemId]) {
        totals[itemId] = 0;
      }
      totals[itemId] += amount;
    }
  }

  return totals;
}

/**
 * Check if an item is claimed (handles various formats)
 */
function isClaimed(value) {
  if (!value) return false;
  const strValue = value.toString().toLowerCase().trim();
  return strValue === 'true' || strValue === 'yes' || strValue === 'claimed' || strValue === 'x';
}

/**
 * Mark an item as claimed in the sheet
 */
function claimItem(rowIndex, claimedBy) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);

  if (!sheet) {
    throw new Error(`Sheet "${SHEET_NAME}" not found`);
  }

  // Validate row index
  const lastRow = sheet.getLastRow();
  if (rowIndex < 2 || rowIndex > lastRow) {
    throw new Error('Invalid row index');
  }

  // Check if already claimed
  const currentValue = sheet.getRange(rowIndex, 6).getValue();
  if (isClaimed(currentValue)) {
    return { success: false, message: 'Item already claimed' };
  }

  // Update claimed status (Column F)
  sheet.getRange(rowIndex, 6).setValue('TRUE');

  // Optionally store who claimed it (Column G)
  if (claimedBy) {
    sheet.getRange(rowIndex, 7).setValue(claimedBy);
  }

  // Add timestamp (Column H)
  sheet.getRange(rowIndex, 8).setValue(new Date());

  return { success: true, message: 'Item claimed successfully' };
}

/**
 * Create a JSON response with CORS headers
 */
function createJsonResponse(data, statusCode = 200) {
  const output = ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
  return output;
}

/**
 * Test function - run this to verify your sheet setup
 */
function testGetRegistry() {
  const data = getRegistryData();
  Logger.log(JSON.stringify(data, null, 2));
}

// ============================================
// PENDING CLAIMS FUNCTIONALITY (WED-34)
// ============================================

/**
 * Generate a unique claim token
 */
function generateClaimToken() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let token = '';
  for (let i = 0; i < 32; i++) {
    token += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return token;
}

/**
 * Get or create the PENDING_CLAIMS sheet with proper headers
 */
function getPendingClaimsSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(PENDING_CLAIMS_SHEET);

  if (!sheet) {
    sheet = ss.insertSheet(PENDING_CLAIMS_SHEET);
    // Set headers
    sheet.getRange(1, 1, 1, 11).setValues([[
      'Claim Token',
      'Item ID',
      'Item Name',
      'Guest Name',
      'Guest Email',
      'Product URL',
      'Created At',
      'Status',
      'First Reminder Sent',
      'Second Reminder Sent',
      'Note'
    ]]);
    sheet.getRange(1, 1, 1, 11).setFontWeight('bold');
  }

  return sheet;
}

/**
 * Create a pending claim for an item
 */
function createPendingClaim(itemId, itemName, guestName, guestEmail, productUrl) {
  if (!itemId || !guestEmail || !guestName) {
    return { success: false, message: 'Item ID, email, and name are required' };
  }

  const sheet = getPendingClaimsSheet();
  const token = generateClaimToken();
  const now = new Date();

  // Add new row
  sheet.appendRow([
    token,
    itemId,
    itemName || '',
    guestName || '',
    guestEmail,
    productUrl || '',
    now,
    'pending',
    'FALSE',
    'FALSE'
  ]);

  return {
    success: true,
    token: token,
    confirmUrl: WEBSITE_URL + '?confirm=' + token
  };
}

/**
 * Get pending claim data by token
 */
function getPendingClaim(token) {
  if (!token) {
    return { success: false, message: 'Token is required' };
  }

  const sheet = getPendingClaimsSheet();
  const data = sheet.getDataRange().getValues();

  // Find the row with this token (skip header)
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === token) {
      return {
        success: true,
        claim: {
          token: data[i][0],
          itemId: data[i][1],
          itemName: data[i][2],
          guestName: data[i][3],
          guestEmail: data[i][4],
          productUrl: data[i][5],
          createdAt: data[i][6],
          status: data[i][7]
        }
      };
    }
  }

  return { success: false, message: 'Claim not found or expired' };
}

/**
 * Confirm a pending claim (mark item as claimed)
 */
function confirmClaim(token) {
  if (!token) {
    return { success: false, message: 'Token is required' };
  }

  const pendingSheet = getPendingClaimsSheet();
  const pendingData = pendingSheet.getDataRange().getValues();

  // Find the pending claim
  let claimRow = -1;
  let claimData = null;

  for (let i = 1; i < pendingData.length; i++) {
    if (pendingData[i][0] === token) {
      claimRow = i + 1; // 1-based row index
      claimData = pendingData[i];
      break;
    }
  }

  if (!claimData) {
    return { success: false, message: 'Claim not found or expired' };
  }

  // Check if already confirmed or cancelled
  if (claimData[7] === 'confirmed') {
    return { success: false, message: 'This item has already been confirmed' };
  }
  if (claimData[7] === 'cancelled') {
    return { success: false, message: 'This claim was cancelled' };
  }

  const itemName = claimData[2];
  const guestName = claimData[3];

  // Find the registry item by name and mark as claimed
  const registrySheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
  if (registrySheet) {
    const registryData = registrySheet.getDataRange().getValues();

    // Find the row with matching product name (column A)
    let itemRow = -1;
    for (let i = 1; i < registryData.length; i++) {
      if (registryData[i][0] === itemName) {
        itemRow = i + 1; // Convert to 1-based sheet row
        break;
      }
    }

    if (itemRow === -1) {
      return { success: false, message: 'Item not found in registry' };
    }

    const currentClaimed = registrySheet.getRange(itemRow, 6).getValue();
    if (isClaimed(currentClaimed)) {
      // Already claimed - update pending claim status
      pendingSheet.getRange(claimRow, 8).setValue('already_claimed');
      return { success: false, message: 'This item has already been claimed by someone else' };
    }

    // Mark the item as claimed in REGISTRY sheet
    registrySheet.getRange(itemRow, 6).setValue('TRUE');
    if (guestName) {
      registrySheet.getRange(itemRow, 7).setValue(guestName);
    }
    registrySheet.getRange(itemRow, 8).setValue(new Date());
  }

  // Update pending claim status to confirmed
  pendingSheet.getRange(claimRow, 8).setValue('confirmed');

  return {
    success: true,
    message: 'Thank you! The item has been marked as claimed.',
    itemName: claimData[2]
  };
}

/**
 * Save a note from the guest on a confirmed claim
 */
function saveClaimNote(token, note) {
  if (!token) {
    return { success: false, message: 'Token is required' };
  }

  const sheet = getPendingClaimsSheet();
  const data = sheet.getDataRange().getValues();

  // Find the row with this token
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === token) {
      // Save note in column K (column 11)
      sheet.getRange(i + 1, 11).setValue(note);
      return { success: true, message: 'Note saved successfully' };
    }
  }

  return { success: false, message: 'Claim not found' };
}

/**
 * Cancel a pending claim
 */
function cancelClaim(token) {
  if (!token) {
    return { success: false, message: 'Token is required' };
  }

  const sheet = getPendingClaimsSheet();
  const data = sheet.getDataRange().getValues();

  // Find the row with this token
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === token) {
      // Only cancel if still pending
      if (data[i][7] === 'pending') {
        sheet.getRange(i + 1, 8).setValue('cancelled');
        return { success: true, message: 'Your claim has been cancelled.' };
      } else if (data[i][7] === 'confirmed') {
        return { success: false, message: 'This item has already been confirmed and cannot be cancelled.' };
      } else {
        return { success: false, message: 'This claim was already cancelled.' };
      }
    }
  }

  return { success: false, message: 'Claim not found' };
}

/**
 * Send scheduled reminder emails
 * This should be set up as a time-based trigger to run every 5 minutes
 */
function sendScheduledReminders() {
  const sheet = getPendingClaimsSheet();
  const data = sheet.getDataRange().getValues();
  const now = new Date();

  Logger.log('Running sendScheduledReminders at ' + now);
  Logger.log('Found ' + (data.length - 1) + ' rows to check');

  // Skip header row
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    const status = row[7];
    const createdAt = new Date(row[6]);
    const firstReminderSent = row[8] === true || row[8] === 'TRUE';
    const secondReminderSent = row[9] === true || row[9] === 'TRUE';

    Logger.log('Row ' + i + ': status=' + status + ', createdAt=' + createdAt + ', firstSent=' + firstReminderSent);

    // Only process pending claims
    if (status !== 'pending') {
      Logger.log('Skipping row ' + i + ' - status is not pending');
      continue;
    }

    const minutesSinceCreation = (now - createdAt) / (1000 * 60);
    Logger.log('Row ' + i + ': minutesSinceCreation=' + minutesSinceCreation);

    // First reminder: after 5 minutes
    if (!firstReminderSent && minutesSinceCreation >= 5) {
      Logger.log('Sending first reminder for row ' + i);
      sendReminderEmail(row, 'first');
      sheet.getRange(i + 1, 9).setValue('TRUE');
    }

    // Second reminder: after 1 hour (60 minutes)
    if (firstReminderSent && !secondReminderSent && minutesSinceCreation >= 60) {
      Logger.log('Sending second reminder for row ' + i);
      sendReminderEmail(row, 'second');
      sheet.getRange(i + 1, 10).setValue('TRUE');
    }
  }
}

/**
 * Send a reminder email to a guest
 */
function sendReminderEmail(claimRow, reminderType) {
  const token = claimRow[0];
  const itemName = claimRow[2];
  const guestName = claimRow[3] || 'there';
  const guestEmail = claimRow[4];

  if (!guestEmail) return;

  const confirmUrl = WEBSITE_URL + '?confirm=' + token;

  let subject, htmlBody;

  if (reminderType === 'first') {
    subject = `Confirm Your Registry Purchase for Daphne & Adam's Wedding`;
    htmlBody = `
      <div style="font-family: Georgia, serif; max-width: 600px; margin: 0 auto; color: #2a1f1a;">
        <p>Hi ${guestName},</p>

        <p>We noticed you were looking at <strong>"${itemName}"</strong> from ${COUPLE_NAMES}'s wedding registry.</p>

        <p>If you purchased this item, please click the button below to let us know so others don't buy duplicates:</p>

        <p style="text-align: center; margin: 30px 0;">
          <a href="${confirmUrl}" style="background-color: #5a5948; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold;">Confirm Purchase</a>
        </p>

        <p>If you decided not to purchase it, no action is needed — the item will remain available for others.</p>

        <p>Thank you!<br>${COUPLE_NAMES}</p>

        <hr style="border: none; border-top: 1px solid #ccc; margin: 30px 0;">
        <p style="font-size: 12px; color: #888; font-style: italic;">
          This is an automated message from our wedding website. You received this because you clicked "Gift Item" on our registry.
        </p>
      </div>
    `;
  } else {
    subject = `Reminder: Confirm your registry purchase for Daphne & Adam's Wedding`;
    htmlBody = `
      <div style="font-family: Georgia, serif; max-width: 600px; margin: 0 auto; color: #2a1f1a;">
        <p>Hi ${guestName},</p>

        <p>Just a friendly reminder about <strong>"${itemName}"</strong> from ${COUPLE_NAMES}'s wedding registry.</p>

        <p>If you purchased this item, please confirm by clicking the button below:</p>

        <p style="text-align: center; margin: 30px 0;">
          <a href="${confirmUrl}" style="background-color: #5a5948; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold;">Confirm Purchase</a>
        </p>

        <p>This helps us ensure no duplicate gifts are purchased.</p>

        <p>Thank you so much!<br>${COUPLE_NAMES}</p>

        <hr style="border: none; border-top: 1px solid #ccc; margin: 30px 0;">
        <p style="font-size: 12px; color: #888; font-style: italic;">
          This is an automated message from our wedding website. You received this because you clicked "Gift Item" on our registry.
        </p>
      </div>
    `;
  }

  try {
    MailApp.sendEmail({
      to: guestEmail,
      subject: subject,
      htmlBody: htmlBody
    });
  } catch (error) {
    console.error('Failed to send email to ' + guestEmail + ': ' + error.message);
  }
}

/**
 * Set up time-based trigger for sending reminders
 * Run this once to create the trigger
 */
function setupReminderTrigger() {
  // Delete existing triggers for this function
  const triggers = ScriptApp.getProjectTriggers();
  triggers.forEach(trigger => {
    if (trigger.getHandlerFunction() === 'sendScheduledReminders') {
      ScriptApp.deleteTrigger(trigger);
    }
  });

  // Create new trigger to run every 5 minutes
  ScriptApp.newTrigger('sendScheduledReminders')
    .timeBased()
    .everyMinutes(5)
    .create();

  Logger.log('Reminder trigger set up successfully');
}

/**
 * Test function - manually test sending reminders
 */
function testSendReminders() {
  sendScheduledReminders();
  Logger.log('Reminder check completed');
}

/**
 * Debug function - test each part separately
 */
function testDebug() {
  Logger.log('Step 1: Getting sheet...');
  const sheet = getPendingClaimsSheet();
  Logger.log('Step 2: Got sheet: ' + sheet.getName());

  const data = sheet.getDataRange().getValues();
  Logger.log('Step 3: Got ' + data.length + ' rows');

  if (data.length > 1) {
    Logger.log('Step 4: First data row: ' + JSON.stringify(data[1]));

    const row = data[1];
    const status = row[7];
    const createdAt = row[6];
    Logger.log('Step 5: status=' + status + ', createdAt=' + createdAt + ', type=' + typeof createdAt);
  }
}

// ============================================
// CONTRIBUTION FUNCTIONALITY (WED-28)
// ============================================

/**
 * Get or create the PENDING_CONTRIBUTIONS sheet with proper headers
 */
function getPendingContributionsSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(PENDING_CONTRIBUTIONS_SHEET);

  if (!sheet) {
    sheet = ss.insertSheet(PENDING_CONTRIBUTIONS_SHEET);
    // Set headers
    sheet.getRange(1, 1, 1, 12).setValues([[
      'Contribution Token',  // A
      'Item ID',             // B
      'Item Name',           // C
      'Amount',              // D
      'Guest Name',          // E
      'Guest Email',         // F
      'Payment Method',      // G
      'Created At',          // H
      'Status',              // I
      'First Reminder Sent', // J
      'Second Reminder Sent', // K
      'Note'                 // L
    ]]);
    sheet.getRange(1, 1, 1, 12).setFontWeight('bold');
  }

  return sheet;
}

/**
 * Generate a unique contribution token
 */
function generateContributionToken() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let token = '';
  for (let i = 0; i < 32; i++) {
    token += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return token;
}

/**
 * Create a pending contribution for an item
 */
function createPendingContribution(itemId, itemName, amount, guestName, guestEmail, paymentMethod) {
  if (!itemId || !guestEmail || !guestName || !amount || !paymentMethod) {
    return { success: false, message: 'All fields are required' };
  }

  // Validate amount
  const amountNum = parseFloat(amount);
  if (isNaN(amountNum) || amountNum <= 0) {
    return { success: false, message: 'Invalid amount' };
  }

  // Validate payment method
  const validMethods = ['venmo', 'paypal', 'zelle'];
  if (!validMethods.includes(paymentMethod)) {
    return { success: false, message: 'Invalid payment method' };
  }

  const sheet = getPendingContributionsSheet();
  const token = generateContributionToken();
  const now = new Date();

  // Add new row
  sheet.appendRow([
    token,
    itemId,
    itemName || '',
    amountNum,
    guestName || '',
    guestEmail,
    paymentMethod,
    now,
    'pending',
    'FALSE',
    'FALSE'
  ]);

  return {
    success: true,
    token: token,
    confirmUrl: WEBSITE_URL + '?contribution=' + token,
    paymentAccounts: PAYMENT_ACCOUNTS
  };
}

/**
 * Get pending contribution data by token
 */
function getPendingContribution(token) {
  if (!token) {
    return { success: false, message: 'Token is required' };
  }

  const sheet = getPendingContributionsSheet();
  const data = sheet.getDataRange().getValues();

  // Find the row with this token (skip header)
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === token) {
      return {
        success: true,
        contribution: {
          token: data[i][0],
          itemId: data[i][1],
          itemName: data[i][2],
          amount: data[i][3],
          guestName: data[i][4],
          guestEmail: data[i][5],
          paymentMethod: data[i][6],
          createdAt: data[i][7],
          status: data[i][8]
        }
      };
    }
  }

  return { success: false, message: 'Contribution not found or expired' };
}

/**
 * Confirm a pending contribution (guest says they paid)
 * Sets status to 'pending_verification' - admin must approve to 'confirmed'
 */
function confirmContribution(token) {
  if (!token) {
    return { success: false, message: 'Token is required' };
  }

  const sheet = getPendingContributionsSheet();
  const data = sheet.getDataRange().getValues();

  // Find the pending contribution
  let contributionRow = -1;
  let contributionData = null;

  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === token) {
      contributionRow = i + 1; // 1-based row index
      contributionData = data[i];
      break;
    }
  }

  if (!contributionData) {
    return { success: false, message: 'Contribution not found or expired' };
  }

  // Check current status
  const status = contributionData[8];
  if (status === 'confirmed') {
    return { success: false, message: 'This contribution has already been confirmed' };
  }
  if (status === 'pending_verification') {
    return { success: false, message: 'This contribution is already pending verification' };
  }
  if (status === 'cancelled') {
    return { success: false, message: 'This contribution was cancelled' };
  }

  // Update status to pending_verification
  sheet.getRange(contributionRow, 9).setValue('pending_verification');

  return {
    success: true,
    message: 'Thank you! Your contribution is pending verification.',
    itemName: contributionData[2],
    amount: contributionData[3]
  };
}

/**
 * Cancel a pending contribution
 */
function cancelContribution(token) {
  if (!token) {
    return { success: false, message: 'Token is required' };
  }

  const sheet = getPendingContributionsSheet();
  const data = sheet.getDataRange().getValues();

  // Find the row with this token
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === token) {
      const status = data[i][8];
      // Only cancel if still pending
      if (status === 'pending') {
        sheet.getRange(i + 1, 9).setValue('cancelled');
        return { success: true, message: 'Your contribution has been cancelled.' };
      } else if (status === 'pending_verification' || status === 'confirmed') {
        return { success: false, message: 'This contribution is already being processed and cannot be cancelled.' };
      } else {
        return { success: false, message: 'This contribution was already cancelled.' };
      }
    }
  }

  return { success: false, message: 'Contribution not found' };
}

/**
 * Save a note from the guest on a confirmed contribution
 */
function saveContributionNote(token, note) {
  if (!token) {
    return { success: false, message: 'Token is required' };
  }

  const sheet = getPendingContributionsSheet();
  const data = sheet.getDataRange().getValues();

  // Find the row with this token
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === token) {
      // Save note in column L (column 12)
      sheet.getRange(i + 1, 12).setValue(note);
      return { success: true, message: 'Note saved successfully' };
    }
  }

  return { success: false, message: 'Contribution not found' };
}

/**
 * Send scheduled reminder emails for both claims and contributions
 * This should be set up as a time-based trigger to run every 5 minutes
 */
function sendScheduledContributionReminders() {
  const sheet = getPendingContributionsSheet();
  const data = sheet.getDataRange().getValues();
  const now = new Date();

  Logger.log('Running sendScheduledContributionReminders at ' + now);
  Logger.log('Found ' + (data.length - 1) + ' rows to check');

  // Skip header row
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    const status = row[8];
    const createdAt = new Date(row[7]);
    const firstReminderSent = row[9] === true || row[9] === 'TRUE';
    const secondReminderSent = row[10] === true || row[10] === 'TRUE';

    // Only process pending contributions
    if (status !== 'pending') {
      continue;
    }

    const minutesSinceCreation = (now - createdAt) / (1000 * 60);

    // First reminder: after 5 minutes
    if (!firstReminderSent && minutesSinceCreation >= 5) {
      Logger.log('Sending first contribution reminder for row ' + i);
      sendContributionReminderEmail(row, 'first');
      sheet.getRange(i + 1, 10).setValue('TRUE');
    }

    // Second reminder: after 1 hour (60 minutes)
    if (firstReminderSent && !secondReminderSent && minutesSinceCreation >= 60) {
      Logger.log('Sending second contribution reminder for row ' + i);
      sendContributionReminderEmail(row, 'second');
      sheet.getRange(i + 1, 11).setValue('TRUE');
    }
  }
}

/**
 * Send a reminder email to a contributor
 */
function sendContributionReminderEmail(contributionRow, reminderType) {
  const token = contributionRow[0];
  const itemName = contributionRow[2];
  const amount = contributionRow[3];
  const guestName = contributionRow[4] || 'there';
  const guestEmail = contributionRow[5];

  if (!guestEmail) return;

  const confirmUrl = WEBSITE_URL + '?contribution=' + token;
  const formattedAmount = '$' + parseFloat(amount).toFixed(2);

  let subject, htmlBody;

  if (reminderType === 'first') {
    subject = `Confirm Your Contribution for ${COUPLE_NAMES}'s Wedding`;
    htmlBody = `
      <div style="font-family: Georgia, serif; max-width: 600px; margin: 0 auto; color: #2a1f1a;">
        <p>Hi ${guestName},</p>

        <p>Did you complete your <strong>${formattedAmount}</strong> contribution toward <strong>"${itemName}"</strong> for ${COUPLE_NAMES}'s wedding?</p>

        <p>If you've sent the payment, please click the button below to let us know:</p>

        <p style="text-align: center; margin: 30px 0;">
          <a href="${confirmUrl}" style="background-color: #5a5948; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold;">Confirm Contribution</a>
        </p>

        <p>If you decided not to contribute, no action is needed.</p>

        <p>Thank you!<br>${COUPLE_NAMES}</p>

        <hr style="border: none; border-top: 1px solid #ccc; margin: 30px 0;">
        <p style="font-size: 12px; color: #888; font-style: italic;">
          This is an automated message from our wedding website. You received this because you started a contribution on our registry.
        </p>
      </div>
    `;
  } else {
    subject = `Reminder: Confirm your contribution for ${COUPLE_NAMES}'s Wedding`;
    htmlBody = `
      <div style="font-family: Georgia, serif; max-width: 600px; margin: 0 auto; color: #2a1f1a;">
        <p>Hi ${guestName},</p>

        <p>Just a friendly reminder about your <strong>${formattedAmount}</strong> contribution toward <strong>"${itemName}"</strong>.</p>

        <p>If you've completed the payment, please confirm by clicking the button below:</p>

        <p style="text-align: center; margin: 30px 0;">
          <a href="${confirmUrl}" style="background-color: #5a5948; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold;">Confirm Contribution</a>
        </p>

        <p>Thank you so much!<br>${COUPLE_NAMES}</p>

        <hr style="border: none; border-top: 1px solid #ccc; margin: 30px 0;">
        <p style="font-size: 12px; color: #888; font-style: italic;">
          This is an automated message from our wedding website. You received this because you started a contribution on our registry.
        </p>
      </div>
    `;
  }

  try {
    MailApp.sendEmail({
      to: guestEmail,
      subject: subject,
      htmlBody: htmlBody
    });
  } catch (error) {
    console.error('Failed to send contribution email to ' + guestEmail + ': ' + error.message);
  }
}

/**
 * Set up time-based trigger for sending contribution reminders
 * Run this once to create the trigger
 */
function setupContributionReminderTrigger() {
  // Delete existing triggers for this function
  const triggers = ScriptApp.getProjectTriggers();
  triggers.forEach(trigger => {
    if (trigger.getHandlerFunction() === 'sendScheduledContributionReminders') {
      ScriptApp.deleteTrigger(trigger);
    }
  });

  // Create new trigger to run every 5 minutes
  ScriptApp.newTrigger('sendScheduledContributionReminders')
    .timeBased()
    .everyMinutes(5)
    .create();

  Logger.log('Contribution reminder trigger set up successfully');
}

/**
 * Test function - create a test contribution
 */
function testCreateContribution() {
  const result = createPendingContribution(
    2, // Test item ID
    'Test Item',
    50.00,
    'Test User',
    'test@example.com',
    'venmo'
  );
  Logger.log(JSON.stringify(result, null, 2));
}

/**
 * Test function - verify contribution total calculation
 */
function testGetContributionTotal() {
  const totals = getConfirmedContributionTotals();
  Logger.log('Contribution totals: ' + JSON.stringify(totals, null, 2));
}
