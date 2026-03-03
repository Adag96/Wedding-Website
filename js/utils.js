// Utility functions for Wedding Website

/**
 * Announce a message to screen readers
 * @param {string} message - The message to announce
 */
function announceToScreenReader(message) {
    const announcer = document.getElementById('srAnnouncements');
    if (announcer) {
        announcer.textContent = message;
        // Clear after a short delay to allow re-announcing the same message
        setTimeout(() => { announcer.textContent = ''; }, 1000);
    }
}

/**
 * Generic API request wrapper
 * @param {string} url - The API endpoint URL
 * @param {Object} data - The data to send in the request body
 * @returns {Promise<Object>} The JSON response
 */
async function apiRequest(url, data) {
    const response = await fetch(url, {
        method: 'POST',
        body: JSON.stringify(data)
    });
    return await response.json();
}

/**
 * Unified confirmation state handler for both claim and contribution flows
 * @param {string} prefix - Element ID prefix ('confirmation' or 'contributionConfirm')
 * @param {string} state - State to show: 'loading', 'content', 'success', 'cancelled', 'error'
 * @param {string} [message] - Optional message to display
 */
function showConfirmState(prefix, state, message) {
    // Hide all state elements
    const states = ['Loading', 'Content', 'Success', 'Cancelled', 'Error'];
    states.forEach(s => {
        const el = document.getElementById(prefix + s);
        if (el) el.style.display = 'none';
    });

    // Show the requested state
    const targetId = prefix + state.charAt(0).toUpperCase() + state.slice(1);
    const targetEl = document.getElementById(targetId);

    if (targetEl) {
        if (message) {
            // For error state, update the specific error message element
            if (state === 'error') {
                const errorMsgEl = document.getElementById(prefix + 'ErrorMsg');
                if (errorMsgEl) errorMsgEl.textContent = message;
            } else {
                // For success/cancelled, update the paragraph text
                const pEl = targetEl.querySelector('p');
                if (pEl) pEl.textContent = message;
            }
        }
        targetEl.style.display = 'block';
    }
}

/**
 * Generic note saving function for confirmation pages
 * @param {Object} config - Configuration object
 * @param {string} config.noteInputId - ID of the note textarea
 * @param {string} config.saveBtnId - ID of the save button
 * @param {string} config.savedMsgId - ID of the saved message element
 * @param {string} config.apiAction - API action name ('saveClaimNote' or 'saveContributionNote')
 * @param {string} config.apiUrl - API endpoint URL
 * @param {string} config.token - Authentication token
 */
async function saveNote(config) {
    const note = document.getElementById(config.noteInputId).value.trim();
    if (!note) {
        alert('Please enter a note before saving.');
        return;
    }

    const saveBtn = document.getElementById(config.saveBtnId);
    saveBtn.disabled = true;
    saveBtn.textContent = 'Saving...';

    try {
        const result = await apiRequest(config.apiUrl, {
            action: config.apiAction,
            token: config.token,
            note: note
        });

        if (result.success) {
            document.getElementById(config.savedMsgId).style.display = 'block';
            saveBtn.style.display = 'none';
            document.getElementById(config.noteInputId).disabled = true;
        } else {
            alert(result.message || 'Failed to save note. Please try again.');
            saveBtn.disabled = false;
            saveBtn.textContent = 'Send Note';
        }
    } catch (error) {
        console.error('Error saving note:', error);
        alert('Failed to save note. Please try again.');
        saveBtn.disabled = false;
        saveBtn.textContent = 'Send Note';
    }
}
