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

// Email configuration
const COUPLE_NAMES = 'Adam & Daphne';
const WEBSITE_URL = 'https://daphneandadam.site/'; // UPDATE THIS with your actual website URL

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

  const items = [];

  // Start from row 2 (index 1) to skip headers
  for (let i = 1; i < data.length; i++) {
    const row = data[i];

    // Skip empty rows
    if (!row[0] || row[0].toString().trim() === '') {
      continue;
    }

    items.push({
      id: i, // Row index (1-based, matches sheet row number)
      productName: row[0] || '',
      manufacturer: row[1] || '',
      price: row[2] || '',
      productUrl: row[3] || '',
      imageUrl: row[4] || '',
      claimed: isClaimed(row[5]),
      claimedBy: row[6] || '', // Optional: Column G can store who claimed it
      totalContributed: parseFloat(row[8]) || 0 // Column I: Total contributions
    });
  }

  return { items: items };
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
    sheet.getRange(1, 1, 1, 10).setValues([[
      'Claim Token',
      'Item ID',
      'Item Name',
      'Guest Name',
      'Guest Email',
      'Product URL',
      'Created At',
      'Status',
      'First Reminder Sent',
      'Second Reminder Sent'
    ]]);
    sheet.getRange(1, 1, 1, 10).setFontWeight('bold');
  }

  return sheet;
}

/**
 * Create a pending claim for an item
 */
function createPendingClaim(itemId, itemName, guestName, guestEmail, productUrl) {
  if (!itemId || !guestEmail) {
    return { success: false, message: 'Item ID and email are required' };
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

  let subject, body;

  if (reminderType === 'first') {
    subject = `Did you purchase ${itemName}?`;
    body = `Hi ${guestName},

We noticed you were looking at "${itemName}" from ${COUPLE_NAMES}'s wedding registry.

If you purchased this item, please click the link below to let us know so others don't buy duplicates:

${confirmUrl}

If you decided not to purchase it, no action is needed - the item will remain available for others.

Thank you!
${COUPLE_NAMES}`;
  } else {
    subject = `Reminder: Confirm your registry purchase`;
    body = `Hi ${guestName},

Just a friendly reminder about "${itemName}" from ${COUPLE_NAMES}'s wedding registry.

If you purchased this item, please confirm by clicking the link below:

${confirmUrl}

This helps us ensure no duplicate gifts are purchased.

Thank you so much!
${COUPLE_NAMES}`;
  }

  try {
    MailApp.sendEmail({
      to: guestEmail,
      subject: subject,
      body: body
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
