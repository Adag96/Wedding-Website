// Google Apps Script for Wedding RSVP Form
// Instructions:
// 1. Open the existing Wedding RSVPs Google Spreadsheet
// 2. Click Extensions > Apps Script
// 3. Replace the existing code with this entire script
// 4. Click the disk icon to save
// 5. Click Deploy > Manage deployments
// 6. Edit the existing deployment and click "Deploy"
// (The URL stays the same if editing existing deployment)

function doPost(e) {
  try {
    // Get the spreadsheet and look for "Final RSVPs" tab
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName('Final RSVPs');

    // Create the sheet if it doesn't exist
    if (!sheet) {
      sheet = ss.insertSheet('Final RSVPs');
      sheet.appendRow(['Timestamp', 'Name', 'Attendance', 'Meal Selection', 'Additional Notes']);
    }

    // Parse the incoming data
    var data = JSON.parse(e.postData.contents);

    // Log the received data for debugging
    Logger.log('Received data: ' + JSON.stringify(data));

    // Add the response to the sheet
    var row = [
      new Date(),
      data.name || '',
      data.attendance || '',
      data.mealSelection || '',
      data.additionalNotes || ''
    ];

    Logger.log('Row to append: ' + JSON.stringify(row));
    sheet.appendRow(row);

    // Return success response
    return ContentService.createTextOutput(JSON.stringify({
      status: 'success',
      message: 'RSVP recorded successfully'
    })).setMimeType(ContentService.MimeType.JSON);

  } catch (error) {
    // Log the error
    Logger.log('Error: ' + error.toString());

    // Return error response
    return ContentService.createTextOutput(JSON.stringify({
      status: 'error',
      message: error.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

// Test function (optional)
function doGet(e) {
  return ContentService.createTextOutput('Wedding RSVP form backend is running!');
}
