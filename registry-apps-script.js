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
 *
 * EXPECTED SHEET FORMAT (Tab name: "REGISTRY"):
 * Row 1: Headers
 * Column A: Product Name
 * Column B: Manufacturer/Brand
 * Column C: Price (e.g., "$199.99")
 * Column D: Product URL (link to purchase)
 * Column E: Image URL (thumbnail image)
 * Column F: Claimed (TRUE/FALSE or Yes/No, empty = not claimed)
 */

const SHEET_NAME = 'REGISTRY';

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
      claimedBy: row[6] || '' // Optional: Column G can store who claimed it
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
