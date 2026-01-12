// Google Apps Script for Wedding RSVP Form
// Instructions:
// 1. Go to sheets.google.com and create a new spreadsheet
// 2. Name it "Wedding RSVPs" or whatever you prefer
// 3. Click Extensions > Apps Script
// 4. Delete any existing code and paste this entire script
// 5. Click the disk icon to save
// 6. Click Deploy > New deployment
// 7. Click the gear icon next to "Select type" and choose "Web app"
// 8. Set "Execute as" to "Me"
// 9. Set "Who has access" to "Anyone"
// 10. Click Deploy
// 11. Copy the Web app URL and give it to Claude to update your HTML

function doPost(e) {
  try {
    // Get the active spreadsheet
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();

    // If this is the first submission, add headers
    if (sheet.getLastRow() === 0) {
      sheet.appendRow(['Timestamp', 'Name', 'Attendance', 'Mailing Address', 'Dietary Restrictions', 'Hotel Block', 'Additional Notes']);
    }

    // Parse the incoming data
    var data = JSON.parse(e.postData.contents);

    // Log the received data for debugging
    Logger.log('Received data: ' + JSON.stringify(data));

    // Add the response to the sheet with explicit values
    var row = [
      new Date(),
      data.name || '',
      data.attendance || '',
      data.mailingAddress || '',
      data.dietaryRestrictions || '',
      data.hotelBlock || '',
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
