console.log('main.js loaded');

// Tab Navigation
const tabButtons = document.querySelectorAll('.tab-button');
const tabContents = document.querySelectorAll('.tab-content');

tabButtons.forEach(button => {
    button.addEventListener('click', () => {
        const targetTab = button.dataset.tab;

        // Update button states and ARIA attributes
        tabButtons.forEach(btn => {
            btn.classList.remove('active');
            btn.setAttribute('aria-selected', 'false');
        });
        button.classList.add('active');
        button.setAttribute('aria-selected', 'true');

        // Update content visibility — remove active from all, then
        // force reflow before re-adding to restart CSS animations
        tabContents.forEach(content => {
            content.classList.remove('active');
            if (content.id === targetTab) {
                void content.offsetWidth; // force reflow to restart animations
                content.classList.add('active');
            }
        });
    });
});

// Registry State
let registryData = []; // Will store all registry items with their data
let priceDescending = true; // Default: most expensive first
let statusFilter = 'all'; // 'all', 'unclaimed', 'claimed'
let registryLoading = false;
let hasCache = false; // Track if we loaded from cache

// Google Apps Script Web App URL - UPDATE THIS after deploying your script
const REGISTRY_API_URL = 'https://script.google.com/macros/s/AKfycbyG2l1-g-l8pHfzq6UfYOGuMZNoUwyPUEJZ_41WR1yHtxso-0K2o4_SBKOsaaNmLaKONQ/exec';
const REGISTRY_CACHE_KEY = 'wedding_registry_cache';

// Parse price string to number for sorting
function parsePrice(priceStr) {
    if (!priceStr && priceStr !== 0) return 0;
    // If it's already a number, return it
    if (typeof priceStr === 'number') return priceStr;
    // Convert to string and remove currency symbols and commas, parse as float
    return parseFloat(String(priceStr).replace(/[^0-9.-]+/g, '')) || 0;
}

// Format price for display (ensures $ prefix)
function formatPrice(price) {
    if (!price && price !== 0) return '';
    // If it's a number, format it as currency
    if (typeof price === 'number') {
        return '$' + price.toFixed(2);
    }
    // If it's a string, ensure it has $ prefix
    const priceStr = String(price);
    if (priceStr.startsWith('$')) return priceStr;
    return '$' + priceStr;
}

// Load cached registry data from localStorage
function loadCachedRegistry() {
    try {
        const cached = localStorage.getItem(REGISTRY_CACHE_KEY);
        if (cached) {
            const data = JSON.parse(cached);
            if (data && data.items && data.items.length > 0) {
                registryData = data.items;
                hasCache = true;
                return true;
            }
        }
    } catch (e) {
        console.log('No valid cache found');
    }
    return false;
}

// Save registry data to localStorage
function saveRegistryCache() {
    try {
        localStorage.setItem(REGISTRY_CACHE_KEY, JSON.stringify({
            items: registryData,
            timestamp: Date.now()
        }));
    } catch (e) {
        console.log('Could not save cache:', e);
    }
}

// Fetch registry data from Google Sheets
async function fetchRegistryData() {
    try {
        registryLoading = true;

        // If we have cached data, show it immediately with refresh indicator
        if (hasCache && registryData.length > 0) {
            showRefreshIndicator();
        } else {
            showLoadingState();
        }

        const response = await fetch(REGISTRY_API_URL);
        if (!response.ok) {
            throw new Error('Failed to fetch registry data');
        }

        const data = await response.json();

        if (data.error) {
            throw new Error(data.error);
        }

        // Transform the data to match our expected format
        const sheetItems = data.items.map(item => ({
            id: item.id,
            rowIndex: item.id, // For updating the sheet
            url: item.productUrl,
            image: item.imageUrl,
            title: item.productName,
            manufacturer: item.manufacturer,
            price: formatPrice(item.price),
            priceValue: parsePrice(item.price),
            claimed: item.claimed,
            claimedBy: item.claimedBy || '',
            totalContributed: parseFloat(item.totalContributed) || 0
        }));

        // Filter out any fund items from sheet data (fund items are handled separately)
        const fundIds = fundItems.map(item => item.id);
        registryData = sheetItems.filter(item => !fundIds.includes(item.id));

        // Save to cache for next visit
        saveRegistryCache();

        registryLoading = false;
        hideRefreshIndicator();
        renderRegistry();

    } catch (error) {
        console.error('Error fetching registry:', error);
        registryLoading = false;
        hideRefreshIndicator();

        // If we have cached data, keep showing it
        if (hasCache && registryData.length > 0) {
            // Just hide the refresh indicator, keep showing cached data
            console.log('Using cached data due to fetch error');
        } else {
            showErrorState(error.message);
        }
    }
}

// Show loading state in the grid (only when no cache)
function showLoadingState() {
    const grid = document.querySelector('.registry-grid');
    grid.innerHTML = `
        <div class="text-center text-neutral-300 text-xl py-12" style="grid-column: 1 / -1;">
            <div class="loading-spinner"></div>
            <p class="mt-4">Loading registry...</p>
        </div>
    `;
}

// Show refresh indicator (when we have cached data)
function showRefreshIndicator() {
    // Remove existing indicator if any
    hideRefreshIndicator();

    const container = document.querySelector('.registry-container');
    const indicator = document.createElement('div');
    indicator.id = 'registry-refresh-indicator';
    indicator.className = 'registry-refresh-indicator';
    indicator.innerHTML = `
        <div class="loading-spinner-small"></div>
        <span>Refreshing...</span>
    `;

    // Insert after the filters
    const filters = container.querySelector('.registry-filters');
    if (filters) {
        filters.after(indicator);
    } else {
        container.prepend(indicator);
    }
}

// Hide refresh indicator
function hideRefreshIndicator() {
    const indicator = document.getElementById('registry-refresh-indicator');
    if (indicator) {
        indicator.remove();
    }
}

// Show error state
function showErrorState(message) {
    const grid = document.querySelector('.registry-grid');
    grid.innerHTML = `
        <div class="text-center text-neutral-300 py-12" style="grid-column: 1 / -1;">
            <p class="text-xl mb-4">Unable to load registry</p>
            <p class="text-neutral-400 mb-4">${message}</p>
            <button onclick="fetchRegistryData()" class="bg-white text-black px-6 py-2 rounded-full hover:bg-neutral-200 transition-colors">
                Try Again
            </button>
        </div>
    `;
}

// Fund items stored separately from registry items
const fundItems = [
    {
        id: 'honeymoon-fund',
        rowIndex: null,
        url: null,
        image: 'images/Assets/Japan.jpg',
        title: 'Honeymoon Fund',
        manufacturer: 'Japan',
        manufacturerPrefix: false,
        price: '',
        priceValue: 0,
        claimed: false,
        claimedBy: '',
        isHardcoded: true,
        isFund: true,
        fundMessage: "We've been dreaming of going to Japan for years and we are hoping to make it a reality in 2027!"
    },
    {
        id: 'car-fund',
        rowIndex: null,
        url: null,
        image: 'https://static.overfuel.com/photos/92/143220/2021HYS060031_640_01.webp',
        title: 'Car Loan Paydown',
        manufacturer: 'Littlefoot',
        manufacturerPrefix: false,
        price: '',
        priceValue: 0,
        claimed: false,
        claimedBy: '',
        isHardcoded: true,
        isFund: true,
        fundMessage: "Help us pay down our remaining debts and prepare for home ownership!"
    }
];

// Registry Items - Initialize by fetching from Google Sheets
function initializeRegistry() {
    // Remove any static registry items (for backwards compatibility)
    const staticItems = document.querySelectorAll('.registry-item');
    staticItems.forEach(item => item.remove());

    // Render fund items immediately
    renderFundItems();

    // Try to load cached data first for instant display
    if (loadCachedRegistry()) {
        // Filter out any fund items from cache
        registryData = registryData.filter(item => !item.isFund && item.id !== 'honeymoon-fund' && item.id !== 'car-fund');
        renderRegistry();
    }

    // Then fetch fresh data from Google Sheets
    fetchRegistryData();
}

// Render fund items at bottom of registry
function renderFundItems() {
    const grid = document.getElementById('fundItemsGrid');
    grid.innerHTML = '';
    fundItems.forEach(item => {
        const card = createCard(item);
        grid.appendChild(card);
    });
}

// Create a card element from item data
function createCard(item) {
    const card = document.createElement('div');
    card.className = 'registry-card';
    card.dataset.itemId = item.id;
    card.dataset.claimed = item.claimed;

    // Determine button states
    const hasUrl = !!item.url;
    const isClaimed = item.claimed;
    const isFund = item.isFund === true;

    // Determine which buttons to show
    let buttonsHtml;
    if (isClaimed) {
        // Claimed items show disabled "Claimed" button
        buttonsHtml = `
            <button class="claim-button claimed" disabled>
                Claimed
            </button>
        `;
    } else if (isFund) {
        // Fund items only show "Contribute" button
        buttonsHtml = `
            <button class="contribute-btn"
                    data-item-id="${item.id}"
                    onclick="openContributeModal('${item.id}')">
                Contribute
            </button>
        `;
    } else {
        // Regular items only show "Gift Item" button (if URL exists)
        buttonsHtml = hasUrl ? `
            <button class="gift-item-btn"
                    data-item-id="${item.id}"
                    onclick="openGiftModal('${item.id}')">
                Gift Item
            </button>
        ` : '';
    }

    // Get image config if available
    // Uses object-fit: contain as baseline so full image is available
    // Scale: 1.5 = default (mimics cover-like crop), <1.5 = show more, >1.5 = zoom in more
    // Position: controls focal point via transform-origin (where the scale anchors)
    const imgConfig = (typeof REGISTRY_IMAGE_CONFIG !== 'undefined' && REGISTRY_IMAGE_CONFIG[item.id]) || null;
    let imgStyle = '';
    if (imgConfig) {
        const pos = imgConfig.position || '50% 50%';
        const scale = imgConfig.scale ?? 1.5;
        imgStyle = `style="object-fit: contain; transform-origin: ${pos}; transform: scale(${scale});"`;
    }

    card.innerHTML = `
        <div class="registry-card-link">
            <div class="registry-card-image-wrapper">
                <img src="${item.image}" alt="${item.title}" class="registry-card-image" ${imgStyle} onerror="this.src='https://via.placeholder.com/300x300?text=Image+Not+Found'">
            </div>
            <div class="registry-card-content">
                <h3 class="registry-card-title">${item.title}${item.manufacturer ? ` <span class="registry-card-manufacturer">${item.manufacturerPrefix !== false ? 'by ' : ''}${item.manufacturer}</span>` : ''}</h3>
                ${item.price ? `<p class="registry-card-price">${item.price}</p>` : ''}
            </div>
        </div>
        <div class="registry-card-buttons">
            ${buttonsHtml}
        </div>
    `;

    return card;
}

// Render registry with current sort and filter settings
function renderRegistry() {
    const grid = document.querySelector('.registry-grid');
    grid.innerHTML = '';

    // Sort items by price
    let sortedItems = [...registryData].sort((a, b) => {
        if (priceDescending) {
            return b.priceValue - a.priceValue;
        } else {
            return a.priceValue - b.priceValue;
        }
    });

    // Helper to check if item is claimed
    const isItemClaimed = (item) => item.claimed;

    // For 'all' filter: show available first (sorted by price), then claimed/funded (sorted by price)
    if (statusFilter === 'all') {
        const available = sortedItems.filter(item => !isItemClaimed(item));
        const claimed = sortedItems.filter(item => isItemClaimed(item));
        sortedItems = [...available, ...claimed];
    }

    // Filter and render
    sortedItems.forEach(item => {
        // Apply status filter
        const isClaimed = isItemClaimed(item);
        if (statusFilter === 'unclaimed' && isClaimed) return;
        if (statusFilter === 'claimed' && !isClaimed) return;

        const card = createCard(item);
        grid.appendChild(card);
    });

    // Show message if no items match filter
    if (grid.children.length === 0) {
        const emptyMessage = document.createElement('div');
        emptyMessage.className = 'text-center text-neutral-300 text-xl py-8';
        emptyMessage.style.gridColumn = '1 / -1';
        emptyMessage.textContent = statusFilter === 'claimed'
            ? 'No items have been claimed yet.'
            : 'All items have been claimed!';
        grid.appendChild(emptyMessage);
    }
}

// Toggle price sort direction
function togglePriceSort() {
    priceDescending = !priceDescending;
    const btn = document.getElementById('priceSortBtn');
    btn.classList.toggle('ascending', !priceDescending);
    renderRegistry();
}

// Set status filter
function setStatusFilter(filter) {
    statusFilter = filter;

    // Update button states
    document.querySelectorAll('.status-toggle-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.filter === filter);
    });

    renderRegistry();
}

// Open gift item modal with item-specific data
function openGiftModal(itemId) {
    const item = registryData.find(i => i.id === itemId || i.id === parseInt(itemId));
    if (!item || !item.url) return;

    // Store item data in hidden form fields
    document.getElementById('giftItemId').value = item.id;
    document.getElementById('giftItemNameHidden').value = item.title;
    document.getElementById('giftProductUrl').value = item.url;

    // Show item name in modal
    const itemNameEl = document.getElementById('giftModalItemName');
    itemNameEl.textContent = item.title;
    itemNameEl.style.display = 'block';

    // Reset form
    document.getElementById('giftClaimForm').reset();
    document.getElementById('giftContinueBtn').disabled = false;
    document.getElementById('giftContinueBtn').textContent = 'Continue to Product';

    // Show the modal
    document.getElementById('giftItemModal').classList.add('active');

    // Prevent body scroll while modal is open
    document.body.style.overflow = 'hidden';
}

// Handle gift claim form submission
async function handleGiftClaim(event) {
    event.preventDefault();

    const form = event.target;
    const continueBtn = document.getElementById('giftContinueBtn');
    const guestEmail = document.getElementById('giftGuestEmail').value.trim();
    const guestName = document.getElementById('giftGuestName').value.trim();
    const itemId = document.getElementById('giftItemId').value;
    const itemName = document.getElementById('giftItemNameHidden').value;
    const productUrl = document.getElementById('giftProductUrl').value;

    // Validate email
    if (!guestEmail) {
        alert('Please enter your email address.');
        return;
    }

    // Validate name
    if (!guestName) {
        alert('Please enter your name.');
        return;
    }

    // Disable button while processing
    continueBtn.disabled = true;
    continueBtn.textContent = 'Processing...';

    try {
        // Create pending claim via API (use text/plain to avoid CORS preflight)
        const response = await fetch(REGISTRY_API_URL, {
            method: 'POST',
            body: JSON.stringify({
                action: 'createPendingClaim',
                itemId: itemId,
                itemName: itemName,
                guestName: guestName,
                guestEmail: guestEmail,
                productUrl: productUrl
            })
        });

        const result = await response.json();

        if (result.success) {
            // Close modal and redirect to product
            closeGiftModal();
            window.open(productUrl, '_blank');
        } else {
            alert(result.message || 'Something went wrong. Please try again.');
            continueBtn.disabled = false;
            continueBtn.textContent = 'Continue to Product';
        }
    } catch (error) {
        console.error('Error creating pending claim:', error);
        // Still redirect on error - the claim just won't be tracked
        closeGiftModal();
        window.open(productUrl, '_blank');
    }
}

// Close gift item modal
function closeGiftModal() {
    document.getElementById('giftItemModal').classList.remove('active');
    document.body.style.overflow = '';

    // Reset copy button state
    const copyBtn = document.querySelector('.copy-address-btn');
    copyBtn.classList.remove('copied');
    document.getElementById('copyBtnText').textContent = 'Copy Address';

    // Reset continue button state
    const continueBtn = document.getElementById('giftContinueBtn');
    continueBtn.disabled = false;
    continueBtn.textContent = 'Continue to Product';
}

// Close modal when clicking on backdrop
function closeGiftModalOnBackdrop(event) {
    if (event.target === document.getElementById('giftItemModal')) {
        closeGiftModal();
    }
}

// Copy shipping address to clipboard with feedback
function copyShippingAddress() {
    const address = '221 Bartlett Drive\nMadison, CT 06443';

    navigator.clipboard.writeText(address).then(() => {
        const copyBtn = document.querySelector('.copy-address-btn');
        const copyBtnText = document.getElementById('copyBtnText');

        copyBtn.classList.add('copied');
        copyBtnText.textContent = 'Copied!';

        // Reset after 2 seconds
        setTimeout(() => {
            copyBtn.classList.remove('copied');
            copyBtnText.textContent = 'Copy Address';
        }, 2000);
    }).catch(err => {
        console.error('Failed to copy address:', err);
        alert('Unable to copy. Address: 221 Bartlett Drive, Madison, CT 06443');
    });
}

// ============================================
// CONTRIBUTION MODAL (WED-28)
// ============================================

// Payment accounts
const PAYMENT_ACCOUNTS = {
    venmo: '@Adag96',
    paypal: 'https://paypal.me/adagostino96',
    zelle: 'adag96@gmail.com'
};

let selectedPaymentMethod = null;
let currentContributionData = null;

function openContributeModal(itemId) {
    // Look in both registry items and fund items
    const item = registryData.find(i => i.id === itemId || i.id === parseInt(itemId) || i.id === String(itemId))
              || fundItems.find(i => i.id === itemId);
    if (!item) return;

    // Store item data
    document.getElementById('contributeItemId').value = item.id;
    document.getElementById('contributeItemNameHidden').value = item.title;

    // Populate item preview
    document.getElementById('contributeItemImage').src = item.image;
    document.getElementById('contributeItemName').textContent = item.title;

    // Show subtitle for fund items, price for regular items
    const subtitleText = item.isFund ? (item.manufacturer || '') : (item.price || '');
    document.getElementById('contributeItemPrice').textContent = subtitleText;

    // Show fund message if applicable
    const fundMessageEl = document.getElementById('contributeFundMessage');
    if (item.fundMessage) {
        fundMessageEl.textContent = item.fundMessage;
        fundMessageEl.style.display = 'block';
    } else {
        fundMessageEl.style.display = 'none';
    }

    // Reset form and state
    document.getElementById('contributeForm').reset();
    selectedPaymentMethod = null;
    currentContributionData = null;

    // Reset payment method selection
    document.querySelectorAll('.payment-method-btn').forEach(btn => btn.classList.remove('selected'));
    document.getElementById('paymentNextBtn').disabled = true;

    // Reset Step 3 "I've Sent It" button state
    const step3Btn = document.querySelector('#contributeStep3 .modal-next-btn');
    if (step3Btn) {
        step3Btn.disabled = false;
        step3Btn.textContent = "I've Sent It";
    }

    // Go to step 1
    goToContributeStep(1);

    // Show modal
    document.getElementById('contributeModal').classList.add('active');
    document.body.style.overflow = 'hidden';
}

function closeContributeModal() {
    document.getElementById('contributeModal').classList.remove('active');
    document.body.style.overflow = '';
}

function closeContributeModalOnBackdrop(event) {
    if (event.target === document.getElementById('contributeModal')) {
        closeContributeModal();
    }
}

function goToContributeStep(step) {
    // Hide all steps
    document.querySelectorAll('.contribute-step').forEach(s => s.classList.remove('active'));
    // Show target step
    document.getElementById('contributeStep' + step).classList.add('active');
}

function handleContributeStep1(event) {
    event.preventDefault();

    const amount = parseFloat(document.getElementById('contributeAmount').value);
    const name = document.getElementById('contributeName').value.trim();
    const email = document.getElementById('contributeEmail').value.trim();

    if (!amount || amount <= 0) {
        alert('Please enter a valid amount.');
        return;
    }

    if (!name) {
        alert('Please enter your name.');
        return;
    }

    if (!email) {
        alert('Please enter your email.');
        return;
    }

    // Store data for later
    currentContributionData = {
        itemId: document.getElementById('contributeItemId').value,
        itemName: document.getElementById('contributeItemNameHidden').value,
        amount: amount,
        guestName: name,
        guestEmail: email
    };

    // Update step 2 amount display
    document.getElementById('step2Amount').textContent = '$' + amount.toFixed(2);

    // Go to step 2
    goToContributeStep(2);
}

function selectPaymentMethod(method) {
    selectedPaymentMethod = method;

    // Update UI
    document.querySelectorAll('.payment-method-btn').forEach(btn => {
        btn.classList.toggle('selected', btn.dataset.method === method);
    });

    // Enable next button
    document.getElementById('paymentNextBtn').disabled = false;
}

function setupPaymentInstructions() {
    console.log('setupPaymentInstructions called', { currentContributionData, selectedPaymentMethod });
    if (!currentContributionData || !selectedPaymentMethod) return;

    const amount = '$' + currentContributionData.amount.toFixed(2);
    document.getElementById('step3Amount').textContent = amount;

    const account = PAYMENT_ACCOUNTS[selectedPaymentMethod];
    document.getElementById('paymentAccountDisplay').textContent = account;

    const paymentLink = document.getElementById('openPaymentLink');
    const zelleInstructions = document.getElementById('zelleInstructions');
    const methodNote = document.getElementById('paymentMethodNote');

    if (selectedPaymentMethod === 'venmo') {
        // Venmo deep link
        const venmoUsername = account.replace('@', '');
        const venmoUrl = `https://venmo.com/${venmoUsername}?txn=pay&amount=${currentContributionData.amount}&note=${encodeURIComponent(currentContributionData.itemName + ' - Wedding Registry')}`;

        // Store URL in data attribute and use explicit click handler
        // This avoids issues with href being cached or overwritten
        paymentLink.dataset.url = venmoUrl;
        paymentLink.href = venmoUrl;
        paymentLink.onclick = function(e) {
            e.preventDefault();
            const url = this.dataset.url;
            console.log('Opening URL:', url);
            window.open(url, '_blank');
        };
        paymentLink.style.display = 'flex';
        document.getElementById('paymentMethodName').textContent = 'Venmo';
        zelleInstructions.style.display = 'none';
        methodNote.textContent = 'Include "' + currentContributionData.itemName + '" in the note';
    } else if (selectedPaymentMethod === 'paypal') {
        // PayPal link
        const paypalUrl = account + '/' + currentContributionData.amount;
        paymentLink.dataset.url = paypalUrl;
        paymentLink.href = paypalUrl;
        paymentLink.onclick = function(e) {
            e.preventDefault();
            const url = this.dataset.url;
            console.log('Opening URL:', url);
            window.open(url, '_blank');
        };
        paymentLink.style.display = 'flex';
        document.getElementById('paymentMethodName').textContent = 'PayPal';
        zelleInstructions.style.display = 'none';
        methodNote.textContent = 'Include "' + currentContributionData.itemName + '" in the note';
    } else if (selectedPaymentMethod === 'zelle') {
        // Zelle - no link, just instructions
        paymentLink.style.display = 'none';
        zelleInstructions.style.display = 'block';
        methodNote.textContent = '';
    }
}

// Override goToContributeStep to setup payment on step 3
const originalGoToStep = goToContributeStep;
goToContributeStep = function(step) {
    if (step === 3) {
        setupPaymentInstructions();
    }
    // Hide all steps
    document.querySelectorAll('.contribute-step').forEach(s => s.classList.remove('active'));
    // Show target step
    document.getElementById('contributeStep' + step).classList.add('active');
};

async function finalizeContribution() {
    if (!currentContributionData || !selectedPaymentMethod) return;

    const nextBtn = document.querySelector('#contributeStep3 .modal-next-btn');
    nextBtn.disabled = true;
    nextBtn.textContent = 'Processing...';

    try {
        const response = await fetch(REGISTRY_API_URL, {
            method: 'POST',
            body: JSON.stringify({
                action: 'createPendingContribution',
                itemId: currentContributionData.itemId,
                itemName: currentContributionData.itemName,
                amount: currentContributionData.amount,
                guestName: currentContributionData.guestName,
                guestEmail: currentContributionData.guestEmail,
                paymentMethod: selectedPaymentMethod
            })
        });

        const result = await response.json();

        if (result.success) {
            // Show success step
            goToContributeStep(4);
        } else {
            alert(result.message || 'Something went wrong. Please try again.');
            nextBtn.disabled = false;
            nextBtn.textContent = "I've Sent It";
        }
    } catch (error) {
        console.error('Error creating contribution:', error);
        alert('Something went wrong. Please try again.');
        nextBtn.disabled = false;
        nextBtn.textContent = "I've Sent It";
    }
}

// Close modals on Escape key
document.addEventListener('keydown', function(event) {
    if (event.key === 'Escape') {
        closeGiftModal();
        closeContributeModal();
    }
});

// ============================================
// CONFIRMATION PAGE LOGIC (WED-34)
// ============================================

let currentClaimToken = null;
let currentContributionToken = null;

// Check for confirmation token on page load
function checkForConfirmationToken() {
    const urlParams = new URLSearchParams(window.location.search);
    console.log('checkForConfirmationToken called');

    // Check for contribution confirmation first
    const contributionToken = urlParams.get('contribution');
    if (contributionToken) {
        currentContributionToken = contributionToken;
        console.log('Set currentContributionToken:', currentContributionToken);
        showContributionConfirmView(contributionToken);
        return;
    }

    // Check for claim confirmation
    const token = urlParams.get('confirm');
    if (token) {
        currentClaimToken = token;
        console.log('Set currentClaimToken:', currentClaimToken);
        showConfirmationView(token);
    }
}

// Show confirmation view and hide main site
async function showConfirmationView(token) {
    // Hide all main content
    document.querySelector('.tab-nav').style.display = 'none';
    document.querySelectorAll('.tab-content').forEach(el => el.style.display = 'none');

    // Show confirmation view
    const confirmView = document.getElementById('confirmationView');
    confirmView.style.display = 'flex';

    // Load claim data
    try {
        const response = await fetch(REGISTRY_API_URL, {
            method: 'POST',
            body: JSON.stringify({
                action: 'getPendingClaim',
                token: token
            })
        });

        const result = await response.json();

        if (result.success && result.claim) {
            const claim = result.claim;

            // Check if already processed
            if (claim.status === 'confirmed') {
                showConfirmationState('success', 'This item has already been confirmed. Thank you!');
                return;
            }
            if (claim.status === 'cancelled') {
                showConfirmationState('cancelled', 'This claim was already cancelled.');
                return;
            }
            if (claim.status === 'already_claimed') {
                showConfirmationState('error', 'This item was already claimed by someone else.');
                return;
            }

            // Show confirmation content
            document.getElementById('confirmItemName').textContent = claim.itemName || 'Registry Item';
            document.getElementById('confirmationLoading').style.display = 'none';
            document.getElementById('confirmationContent').style.display = 'block';
        } else {
            showConfirmationState('error', result.message || 'This link is invalid or has expired.');
        }
    } catch (error) {
        console.error('Error loading claim:', error);
        showConfirmationState('error', 'Unable to load claim information. Please try again later.');
    }
}

// Wrapper for claim confirmation state (uses shared utility)
function showConfirmationState(state, message) {
    showConfirmState('confirmation', state, message);
}

// Handle "Yes, I bought it" click
async function handleConfirmPurchase() {
    if (!currentClaimToken) return;

    const yesBtn = document.getElementById('confirmYesBtn');
    const noBtn = document.getElementById('confirmNoBtn');

    yesBtn.disabled = true;
    noBtn.disabled = true;
    yesBtn.textContent = 'Confirming...';

    try {
        const response = await fetch(REGISTRY_API_URL, {
            method: 'POST',
            body: JSON.stringify({
                action: 'confirmClaim',
                token: currentClaimToken
            })
        });

        const result = await response.json();

        if (result.success) {
            showConfirmationState('success', 'The item has been marked as claimed. Thank you for letting us know!');
        } else {
            showConfirmationState('error', result.message || 'Unable to confirm. Please try again.');
        }
    } catch (error) {
        console.error('Error confirming claim:', error);
        showConfirmationState('error', 'Something went wrong. Please try again later.');
    }
}

// Handle "No, I changed my mind" click
async function handleCancelClaim() {
    if (!currentClaimToken) return;

    const yesBtn = document.getElementById('confirmYesBtn');
    const noBtn = document.getElementById('confirmNoBtn');

    yesBtn.disabled = true;
    noBtn.disabled = true;
    noBtn.textContent = 'Processing...';

    try {
        const response = await fetch(REGISTRY_API_URL, {
            method: 'POST',
            body: JSON.stringify({
                action: 'cancelClaim',
                token: currentClaimToken
            })
        });

        const result = await response.json();

        if (result.success) {
            showConfirmationState('cancelled');
        } else {
            showConfirmationState('error', result.message || 'Unable to cancel. Please try again.');
        }
    } catch (error) {
        console.error('Error cancelling claim:', error);
        showConfirmationState('error', 'Something went wrong. Please try again later.');
    }
}

// Save a note from the claim confirmation page (uses shared utility)
function saveConfirmationNote() {
    console.log('saveConfirmationNote called, token:', currentClaimToken);
    saveNote({
        noteInputId: 'confirmationNote',
        saveBtnId: 'saveNoteBtn',
        savedMsgId: 'noteSavedMsg',
        apiAction: 'saveClaimNote',
        apiUrl: REGISTRY_API_URL,
        token: currentClaimToken
    });
}

// Run confirmation check on page load
document.addEventListener('DOMContentLoaded', checkForConfirmationToken);

// ============================================
// CONTRIBUTION CONFIRMATION PAGE LOGIC (WED-28)
// ============================================

// Save a note from the contribution confirmation page (uses shared utility)
function saveContributionNote() {
    console.log('saveContributionNote called, token:', currentContributionToken);
    saveNote({
        noteInputId: 'contributionNote',
        saveBtnId: 'saveContributionNoteBtn',
        savedMsgId: 'contributionNoteSavedMsg',
        apiAction: 'saveContributionNote',
        apiUrl: REGISTRY_API_URL,
        token: currentContributionToken
    });
}

// Show contribution confirmation view and hide main site
async function showContributionConfirmView(token) {
    // Hide all main content
    document.querySelector('.tab-nav').style.display = 'none';
    document.querySelectorAll('.tab-content').forEach(el => el.style.display = 'none');

    // Show contribution confirmation view
    const confirmView = document.getElementById('contributionConfirmView');
    confirmView.style.display = 'flex';

    // Load contribution data
    try {
        const response = await fetch(REGISTRY_API_URL, {
            method: 'POST',
            body: JSON.stringify({
                action: 'getPendingContribution',
                token: token
            })
        });

        const result = await response.json();

        if (result.success && result.contribution) {
            const contribution = result.contribution;

            // Check if already processed
            if (contribution.status === 'confirmed') {
                showContributionConfirmState('success', 'This contribution has already been confirmed. Thank you!');
                return;
            }
            if (contribution.status === 'pending_verification') {
                showContributionConfirmState('success', 'This contribution is already pending verification. Thank you!');
                return;
            }
            if (contribution.status === 'cancelled') {
                showContributionConfirmState('cancelled', 'This contribution was already cancelled.');
                return;
            }

            // Show confirmation content
            document.getElementById('contributionItemName').textContent = contribution.itemName || 'Registry Item';
            document.getElementById('contributionAmountDisplay').textContent = '$' + parseFloat(contribution.amount).toFixed(2);
            document.getElementById('contributionConfirmLoading').style.display = 'none';
            document.getElementById('contributionConfirmContent').style.display = 'block';
        } else {
            showContributionConfirmState('error', result.message || 'This link is invalid or has expired.');
        }
    } catch (error) {
        console.error('Error loading contribution:', error);
        showContributionConfirmState('error', 'Unable to load contribution information. Please try again later.');
    }
}

// Wrapper for contribution confirmation state (uses shared utility)
function showContributionConfirmState(state, message) {
    showConfirmState('contributionConfirm', state, message);
}

// Handle "Yes, I sent it" click
async function handleConfirmContribution() {
    if (!currentContributionToken) return;

    const yesBtn = document.getElementById('contributionYesBtn');
    const noBtn = document.getElementById('contributionNoBtn');

    yesBtn.disabled = true;
    noBtn.disabled = true;
    yesBtn.textContent = 'Confirming...';

    try {
        const response = await fetch(REGISTRY_API_URL, {
            method: 'POST',
            body: JSON.stringify({
                action: 'confirmContribution',
                token: currentContributionToken
            })
        });

        const result = await response.json();

        if (result.success) {
            showContributionConfirmState('success', 'Your contribution is pending verification. We\'ll update the registry once it\'s confirmed. Thank you!');
        } else {
            showContributionConfirmState('error', result.message || 'Unable to confirm. Please try again.');
        }
    } catch (error) {
        console.error('Error confirming contribution:', error);
        showContributionConfirmState('error', 'Something went wrong. Please try again later.');
    }
}

// Handle "No, I changed my mind" click
async function handleCancelContribution() {
    if (!currentContributionToken) return;

    const yesBtn = document.getElementById('contributionYesBtn');
    const noBtn = document.getElementById('contributionNoBtn');

    yesBtn.disabled = true;
    noBtn.disabled = true;
    noBtn.textContent = 'Processing...';

    try {
        const response = await fetch(REGISTRY_API_URL, {
            method: 'POST',
            body: JSON.stringify({
                action: 'cancelContribution',
                token: currentContributionToken
            })
        });

        const result = await response.json();

        if (result.success) {
            showContributionConfirmState('cancelled');
        } else {
            showContributionConfirmState('error', result.message || 'Unable to cancel. Please try again.');
        }
    } catch (error) {
        console.error('Error cancelling contribution:', error);
        showContributionConfirmState('error', 'Something went wrong. Please try again later.');
    }
}

// Handle claim button click - syncs with Google Sheets
async function handleClaim(event, itemId) {
    event.preventDefault();
    event.stopPropagation();

    const item = registryData.find(i => i.id === itemId);
    if (!item || item.claimed) return;

    // Optional: Ask for the guest's name
    const claimedBy = prompt('Your name (optional - to help the couple know who claimed this):') || '';

    if (confirm('Are you sure you want to mark this item as claimed? This will let others know you plan to purchase it.')) {
        // Update UI immediately for responsiveness
        item.claimed = true;
        item.claimedBy = claimedBy;
        renderRegistry();

        // Only sync to Google Sheets if not a hardcoded item
        if (!item.isHardcoded) {
            try {
                // Sync to Google Sheets
                const response = await fetch(REGISTRY_API_URL, {
                    method: 'POST',
                    body: JSON.stringify({
                        action: 'claim',
                        rowIndex: item.rowIndex,
                        claimedBy: claimedBy
                    })
                });

                const result = await response.json();

                if (!result.success) {
                    // Revert if the server rejected it (e.g., already claimed by someone else)
                    item.claimed = false;
                    item.claimedBy = '';
                    renderRegistry();
                    alert(result.message || 'Failed to claim item. Please try again.');
                }
            } catch (error) {
                console.error('Error claiming item:', error);
                // Keep the optimistic update - the sheet might have been updated anyway
                // User can refresh to see actual state
            }
        }
    }
}

// Initialize registry when DOM is ready
document.addEventListener('DOMContentLoaded', initializeRegistry);

// Background music auto-play with toggle control
(function() {
    const audio = document.getElementById('backgroundMusic');
    const toggleBtn = document.getElementById('musicToggle');
    const iconOn = toggleBtn.querySelector('.music-icon-on');
    const iconOff = toggleBtn.querySelector('.music-icon-off');
    let musicStarted = false;

    // Update button icon based on audio state
    function updateIcon() {
        if (audio.paused) {
            iconOn.style.display = 'none';
            iconOff.style.display = 'block';
        } else {
            iconOn.style.display = 'block';
            iconOff.style.display = 'none';
        }
    }

    // Show toggle button and set up toggle functionality
    function showToggle() {
        toggleBtn.style.display = 'flex';
        updateIcon();
    }

    // Toggle music on/off
    toggleBtn.addEventListener('click', function(e) {
        e.stopPropagation();
        if (audio.paused) {
            audio.play();
        } else {
            audio.pause();
        }
        updateIcon();
    });

    // Function to start music
    const startMusic = function() {
        if (musicStarted) return;

        audio.play().then(() => {
            musicStarted = true;
            console.log('Music started successfully');
            showToggle();
            // Remove all listeners after successful play
            document.removeEventListener('click', startMusic, true);
            document.removeEventListener('touchstart', startMusic, true);
            document.removeEventListener('scroll', startMusic, true);
            document.removeEventListener('keydown', startMusic, true);
            document.removeEventListener('mousemove', startMusic, true);
        }).catch(e => console.log('Playback failed:', e));
    };

    // Try to auto-play on page load
    document.addEventListener('DOMContentLoaded', function() {
        audio.play().then(() => {
            musicStarted = true;
            showToggle();
        }).catch(function(error) {
            console.log('Auto-play prevented. Music will start on first user interaction.');

            // Add multiple interaction listeners with capture phase for better compatibility
            document.addEventListener('click', startMusic, true);
            document.addEventListener('touchstart', startMusic, true);
            document.addEventListener('scroll', startMusic, true);
            document.addEventListener('keydown', startMusic, true);
            document.addEventListener('mousemove', startMusic, true);
        });
    });
})();

// Image rotation for side galleries
const galleryImages = [
    'images/gallery/10690004 (1).JPG',
    'images/gallery/10690016.JPG',
    'images/gallery/50375887-66CA-452A-87CF-1B155DB7FFD2-14545-0000068E7D0122C6.JPG',
    'images/gallery/74630007.jpeg',
    'images/gallery/cinestill_400d_06_29_2024_000311290031.jpg',
    'images/gallery/cinestill_400d_08_27_2024_000115900002.jpg',
    'images/gallery/FDCB4890-9CF2-4729-8BB0-76A8D2223851.JPG',
    'images/gallery/IMG_0136.jpg',
    'images/gallery/IMG_0400.jpg',
    'images/gallery/IMG_0783.jpg',
    'images/gallery/IMG_1265.jpg',
    'images/gallery/IMG_1733.JPG',
    'images/gallery/IMG_1833.JPG',
    'images/gallery/IMG_1954.jpg',
    'images/gallery/IMG_2015.JPG',
    'images/gallery/IMG_2225.jpg',
    'images/gallery/IMG_2495.JPG',
    'images/gallery/IMG_2971.jpg',
    'images/gallery/IMG_3034.jpg',
    'images/gallery/IMG_3403.jpg',
    'images/gallery/IMG_3591.jpg',
    'images/gallery/IMG_5222.jpg',
    'images/gallery/IMG_5562.jpeg',
    'images/gallery/IMG_7853.JPG',
    'images/gallery/IMG_7960.jpg',
    'images/gallery/IMG_7962.jpg',
    'images/gallery/IMG_7963.jpg',
    'images/gallery/IMG_7964.jpg',
    'images/gallery/IMG_7965.jpg',
    'images/gallery/IMG_7966.jpg',
    'images/gallery/IMG_7967.jpg',
    'images/gallery/IMG_7968.jpg',
    'images/gallery/IMG_7969.jpg',
    'images/gallery/IMG_7971.jpg',
    'images/gallery/IMG_7972.jpg',
    'images/gallery/IMG_8480.JPG',
    'images/gallery/IMG_8713.jpg',
    'images/gallery/IMG_8952.JPG',
    'images/gallery/IMG_9700.JPG',
    'images/gallery/IMG_9955.jpg'
];

let currentIndices = [0, 1, 2, 3, 4, 5, 6, 7];
let rotationPhase = 0; // 0 = rows 2&4, 1 = rows 1&3

function rotateImages() {
    const images = [
        document.getElementById('leftImage1'),
        document.getElementById('leftImage2'),
        document.getElementById('leftImage3'),
        document.getElementById('leftImage4'),
        document.getElementById('rightImage1'),
        document.getElementById('rightImage2'),
        document.getElementById('rightImage3'),
        document.getElementById('rightImage4')
    ];

    if (rotationPhase === 0) {
        // Rotate rows 2 and 4 (indices 1, 3, 5, 7)
        [1, 3, 5, 7].forEach(i => images[i].classList.add('fade'));

        setTimeout(() => {
            [1, 3, 5, 7].forEach(i => {
                currentIndices[i] = (currentIndices[i] + 8) % galleryImages.length;
                images[i].src = galleryImages[currentIndices[i]];
            });

            [1, 3, 5, 7].forEach(i => images[i].classList.remove('fade'));
        }, 1000);
    } else {
        // Rotate rows 1 and 3 (indices 0, 2, 4, 6)
        [0, 2, 4, 6].forEach(i => images[i].classList.add('fade'));

        setTimeout(() => {
            [0, 2, 4, 6].forEach(i => {
                currentIndices[i] = (currentIndices[i] + 8) % galleryImages.length;
                images[i].src = galleryImages[currentIndices[i]];
            });

            [0, 2, 4, 6].forEach(i => images[i].classList.remove('fade'));
        }, 1000);
    }

    // Toggle rotation phase
    rotationPhase = 1 - rotationPhase;
}

// Rotate images every 5 seconds (alternating between rows 2&4 and rows 1&3)
setInterval(rotateImages, 5000);

// Mobile gallery rotation
const mobileImages = [
    document.getElementById('mobileGallery1'),
    document.getElementById('mobileGallery2'),
    document.getElementById('mobileGallery3'),
    document.getElementById('mobileGallery4'),
    document.getElementById('mobileGallery5'),
    document.getElementById('mobileGallery6'),
    document.getElementById('mobileGallery7')
];

// Initialize with random images from the gallery
let mobileCurrentIndices = [];
let imageUsageHistory = []; // Track which images have been shown

if (mobileImages[0]) {
    // Create array of random unique indices for initial display
    const availableIndices = Array.from({length: galleryImages.length}, (_, i) => i);
    for (let i = 0; i < 7; i++) {
        const randomIndex = Math.floor(Math.random() * availableIndices.length);
        mobileCurrentIndices.push(availableIndices[randomIndex]);
        imageUsageHistory.push(availableIndices[randomIndex]);
        availableIndices.splice(randomIndex, 1);
    }

    // Set initial random images
    mobileImages.forEach((img, i) => {
        img.src = galleryImages[mobileCurrentIndices[i]];
    });
}

let mobileRotationPhase = 0; // 0 = rotate positions with indices 1,3,5; 1 = rotate positions with indices 0,2,4,6

// Function to get next unique image that's not currently displayed
function getNextUniqueImage(currentSlotIndex) {
    // Get all currently displayed image indices
    const currentlyDisplayed = new Set(mobileCurrentIndices);

    // Find images not currently displayed
    let availableImages = [];
    for (let i = 0; i < galleryImages.length; i++) {
        if (!currentlyDisplayed.has(i)) {
            availableImages.push(i);
        }
    }

    // If we have available images, prioritize ones shown least recently
    if (availableImages.length > 0) {
        // Sort by how long ago they were shown (prefer images not in recent history)
        availableImages.sort((a, b) => {
            const aLastIndex = imageUsageHistory.lastIndexOf(a);
            const bLastIndex = imageUsageHistory.lastIndexOf(b);
            return aLastIndex - bLastIndex; // Lower index = shown longer ago = higher priority
        });

        const selectedImage = availableImages[0];
        imageUsageHistory.push(selectedImage);

        // Keep history manageable (last 30 images)
        if (imageUsageHistory.length > 30) {
            imageUsageHistory.shift();
        }

        return selectedImage;
    }

    // Fallback: cycle through gallery avoiding current display
    let nextIndex = (mobileCurrentIndices[currentSlotIndex] + 7) % galleryImages.length;
    let attempts = 0;
    while (currentlyDisplayed.has(nextIndex) && attempts < galleryImages.length) {
        nextIndex = (nextIndex + 1) % galleryImages.length;
        attempts++;
    }

    imageUsageHistory.push(nextIndex);
    if (imageUsageHistory.length > 30) {
        imageUsageHistory.shift();
    }

    return nextIndex;
}

function rotateMobileGallery() {
    // Only rotate if elements exist (i.e., on mobile)
    if (!mobileImages[0]) return;

    let indicesToRotate;
    if (mobileRotationPhase === 0) {
        // Rotate positions 2, 4, and 6 (array indices 1, 3, 5)
        indicesToRotate = [1, 3, 5];
    } else {
        // Rotate positions 1, 3, 5, and 7 (array indices 0, 2, 4, 6)
        indicesToRotate = [0, 2, 4, 6];
    }

    // Fade out the images to be rotated
    indicesToRotate.forEach(i => mobileImages[i].classList.add('fade'));

    setTimeout(() => {
        indicesToRotate.forEach(i => {
            // Get next unique image using smart selection
            const nextImageIndex = getNextUniqueImage(i);
            mobileCurrentIndices[i] = nextImageIndex;
            mobileImages[i].src = galleryImages[nextImageIndex];
            // Fade back in
            mobileImages[i].classList.remove('fade');
        });
    }, 1000);

    // Toggle rotation phase
    mobileRotationPhase = 1 - mobileRotationPhase;
}

// Rotate mobile gallery images every 5 seconds (alternating pattern)
setInterval(rotateMobileGallery, 5000);

function toggleAttendingFields(attending) {
    const mealSelectionField = document.getElementById('mealSelectionField');
    const additionalNotesField = document.getElementById('additionalNotesField');

    if (attending) {
        // Show fields that only appear when attending
        mealSelectionField.style.display = 'block';
        additionalNotesField.style.display = 'block';
    } else {
        // Hide meal selection when not attending, but keep additional notes visible
        mealSelectionField.style.display = 'none';
        document.querySelectorAll('input[name="mealSelection"]').forEach(rb => rb.checked = false);
        additionalNotesField.style.display = 'block';
    }
}

async function handleSubmit(event) {
    event.preventDefault();

    // Get form data
    const formData = new FormData(event.target);
    const name = formData.get('name');
    const attendance = formData.get('attendance');
    const mealSelection = formData.get('mealSelection') || '';
    const additionalNotes = formData.get('additionalNotes') || '';

    // Disable submit button to prevent double submissions
    const submitButton = event.target.querySelector('button[type="submit"]');
    submitButton.disabled = true;
    submitButton.textContent = 'Submitting...';

    try {
        // Send data to Google Sheets
        const response = await fetch('https://script.google.com/macros/s/AKfycbwGeGPoO-osjmusdeSl-2EYq1_K_DRZipMzYpbD_3b51TT21KZK10_I5eWdzweagHU8Bg/exec', {
            method: 'POST',
            mode: 'no-cors',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                name: name,
                attendance: attendance,
                mealSelection: mealSelection,
                additionalNotes: additionalNotes
            })
        });

        // Show success message
        const firstName = name.split(' ')[0];
        const message = attendance === "Yes, I'll be there"
            ? 'Thank you for your RSVP, ' + firstName + '! We look forward to celebrating with you.'
            : 'Thank you for letting us know, ' + firstName + '. We\'ll miss you!';
        alert(message);

        // Reset form
        event.target.reset();
        toggleAttendingFields(false);

    } catch (error) {
        console.error('Error submitting RSVP:', error);
        alert('There was an error submitting your RSVP. Please try again or contact us directly.');
    } finally {
        // Re-enable submit button
        submitButton.disabled = false;
        submitButton.textContent = 'Submit RSVP';
    }
}
