/**
 * Registry Image Dev Tool
 *
 * Activated via URL parameter: ?devImages=1
 * Allows visual configuration of image position and zoom for registry items.
 */
(function() {
    // Only activate if URL param is present
    if (!new URLSearchParams(window.location.search).has('devImages')) {
        return;
    }

    console.log('[Registry Image Dev] Dev mode activated');

    // Store current adjustments (will be populated from existing config)
    const adjustments = {};

    // Copy existing config if available
    if (typeof REGISTRY_IMAGE_CONFIG !== 'undefined') {
        Object.assign(adjustments, REGISTRY_IMAGE_CONFIG);
    }

    // State for drag operations
    let activeImage = null;
    let dragStartX = 0;
    let dragStartY = 0;
    let startPosX = 50;
    let startPosY = 50;

    // Create floating control panel
    const panel = document.createElement('div');
    panel.id = 'registry-image-dev-panel';
    panel.innerHTML = `
        <div style="font-weight: bold; margin-bottom: 8px; border-bottom: 1px solid #666; padding-bottom: 8px;">
            Image Dev Tool
        </div>
        <div id="dev-current-item" style="margin-bottom: 8px; color: #aaa;">
            Click an image to select
        </div>
        <div style="margin-bottom: 8px;">
            <label style="display: block; margin-bottom: 4px;">Zoom: <span id="dev-zoom-value">1.5</span>x</label>
            <input type="range" id="dev-zoom-slider" min="1.0" max="2.5" step="0.05" value="1.5"
                   style="width: 100%; cursor: pointer;">
            <div style="font-size: 10px; color: #888; margin-top: 2px;">1.0 = full image, 1.5 = default crop</div>
        </div>
        <div style="margin-bottom: 8px;">
            <label style="display: block; margin-bottom: 4px;">Position: <span id="dev-position-value">50% 50%</span></label>
            <div style="font-size: 11px; color: #888;">Drag image to adjust position</div>
        </div>
        <div style="display: flex; gap: 8px; margin-top: 12px;">
            <button id="dev-reset-btn" style="flex: 1; padding: 6px; cursor: pointer; background: #555; color: white; border: none; border-radius: 4px;">
                Reset
            </button>
            <button id="dev-copy-btn" style="flex: 1; padding: 6px; cursor: pointer; background: #4a7c59; color: white; border: none; border-radius: 4px;">
                Copy Config
            </button>
        </div>
        <div id="dev-copy-feedback" style="margin-top: 8px; color: #4a7c59; display: none; text-align: center;">
            Copied!
        </div>
    `;
    panel.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: #333;
        color: white;
        padding: 16px;
        border-radius: 8px;
        font-family: system-ui, sans-serif;
        font-size: 13px;
        z-index: 10000;
        box-shadow: 0 4px 20px rgba(0,0,0,0.4);
        min-width: 200px;
    `;
    document.body.appendChild(panel);

    const zoomSlider = document.getElementById('dev-zoom-slider');
    const zoomValue = document.getElementById('dev-zoom-value');
    const positionValue = document.getElementById('dev-position-value');
    const currentItemDisplay = document.getElementById('dev-current-item');
    const copyFeedback = document.getElementById('dev-copy-feedback');

    // Get or create adjustment for an item
    function getAdjustment(itemId) {
        if (!adjustments[itemId]) {
            adjustments[itemId] = { position: '50% 50%', scale: 1.5 };
        }
        return adjustments[itemId];
    }

    // Parse position string to x, y percentages
    function parsePosition(posStr) {
        const match = posStr.match(/(\d+(?:\.\d+)?)%\s+(\d+(?:\.\d+)?)%/);
        if (match) {
            return { x: parseFloat(match[1]), y: parseFloat(match[2]) };
        }
        return { x: 50, y: 50 };
    }

    // Apply adjustment to an image element
    // Uses contain + scale approach for smooth zoom control
    // Position controls transform-origin (where the scale anchors)
    function applyAdjustment(img, itemId) {
        const adj = adjustments[itemId];
        if (adj) {
            const scale = adj.scale ?? 1.5;
            img.style.objectFit = 'contain';
            img.style.transformOrigin = adj.position;
            img.style.transform = `scale(${scale})`;
        } else {
            // No config = default cover behavior
            img.style.objectFit = '';
            img.style.transformOrigin = '';
            img.style.transform = '';
        }
    }

    // Update the UI display for current selection
    function updateUI() {
        if (!activeImage) return;
        const itemId = activeImage.closest('.registry-card')?.dataset.itemId;
        if (!itemId) return;

        const adj = getAdjustment(itemId);
        const pos = parsePosition(adj.position);
        zoomSlider.value = adj.scale;
        zoomValue.textContent = adj.scale.toFixed(2);
        positionValue.textContent = adj.position;
        currentItemDisplay.textContent = `Item ID: ${itemId}`;
    }

    // Setup image for dev mode
    function setupImage(img) {
        const card = img.closest('.registry-card');
        if (!card) return;

        const itemId = card.dataset.itemId;
        if (!itemId) return;

        // Create crosshair overlay
        const wrapper = img.parentElement;
        if (!wrapper.classList.contains('registry-card-image-wrapper')) return;

        const overlay = document.createElement('div');
        overlay.className = 'dev-image-overlay';
        overlay.style.cssText = `
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            cursor: crosshair;
            z-index: 10;
        `;

        // Crosshair indicator
        const crosshair = document.createElement('div');
        crosshair.className = 'dev-crosshair';
        crosshair.style.cssText = `
            position: absolute;
            width: 20px;
            height: 20px;
            border: 2px solid rgba(255,255,255,0.8);
            border-radius: 50%;
            transform: translate(-50%, -50%);
            pointer-events: none;
            box-shadow: 0 0 4px rgba(0,0,0,0.5);
            display: none;
        `;
        overlay.appendChild(crosshair);

        // Position label on image
        const label = document.createElement('div');
        label.className = 'dev-position-label';
        label.style.cssText = `
            position: absolute;
            bottom: 4px;
            left: 4px;
            background: rgba(0,0,0,0.7);
            color: white;
            padding: 2px 6px;
            font-size: 11px;
            font-family: monospace;
            border-radius: 3px;
            pointer-events: none;
        `;
        overlay.appendChild(label);

        wrapper.appendChild(overlay);

        // Update crosshair position
        function updateCrosshair() {
            const adj = adjustments[itemId] || { position: '50% 50%', scale: 1.0 };
            const pos = parsePosition(adj.position);
            crosshair.style.left = pos.x + '%';
            crosshair.style.top = pos.y + '%';
            crosshair.style.display = 'block';
            label.textContent = `${pos.x.toFixed(0)}% ${pos.y.toFixed(0)}% | ${adj.scale.toFixed(2)}x`;
        }
        updateCrosshair();

        // Click to select
        overlay.addEventListener('click', (e) => {
            // Remove selection from previous
            document.querySelectorAll('.dev-image-overlay.selected').forEach(el => {
                el.classList.remove('selected');
                el.style.outline = '';
            });

            // Select this one
            overlay.classList.add('selected');
            overlay.style.outline = '3px solid #4a7c59';
            activeImage = img;
            updateUI();
        });

        // Drag to position
        overlay.addEventListener('mousedown', (e) => {
            if (e.button !== 0) return;
            e.preventDefault();

            activeImage = img;

            // Select this image
            document.querySelectorAll('.dev-image-overlay.selected').forEach(el => {
                el.classList.remove('selected');
                el.style.outline = '';
            });
            overlay.classList.add('selected');
            overlay.style.outline = '3px solid #4a7c59';

            const rect = overlay.getBoundingClientRect();
            const adj = getAdjustment(itemId);
            const pos = parsePosition(adj.position);

            dragStartX = e.clientX;
            dragStartY = e.clientY;
            startPosX = pos.x;
            startPosY = pos.y;

            function onMouseMove(e) {
                const dx = e.clientX - dragStartX;
                const dy = e.clientY - dragStartY;

                // Convert pixel movement to percentage (inverted because we're moving the focal point)
                const pctX = (dx / rect.width) * 100;
                const pctY = (dy / rect.height) * 100;

                // Clamp to 0-100
                const newX = Math.max(0, Math.min(100, startPosX + pctX));
                const newY = Math.max(0, Math.min(100, startPosY + pctY));

                adj.position = `${newX.toFixed(0)}% ${newY.toFixed(0)}%`;
                applyAdjustment(img, itemId);
                updateCrosshair();
                updateUI();
            }

            function onMouseUp() {
                document.removeEventListener('mousemove', onMouseMove);
                document.removeEventListener('mouseup', onMouseUp);
            }

            document.addEventListener('mousemove', onMouseMove);
            document.addEventListener('mouseup', onMouseUp);
        });

        // Scroll to zoom
        overlay.addEventListener('wheel', (e) => {
            e.preventDefault();
            activeImage = img;

            const adj = getAdjustment(itemId);
            const delta = e.deltaY > 0 ? -0.05 : 0.05;
            adj.scale = Math.max(1.0, Math.min(2.5, (adj.scale ?? 1.5) + delta));

            applyAdjustment(img, itemId);
            updateCrosshair();
            updateUI();
        });
    }

    // Zoom slider handler
    zoomSlider.addEventListener('input', () => {
        if (!activeImage) return;
        const itemId = activeImage.closest('.registry-card')?.dataset.itemId;
        if (!itemId) return;

        const adj = getAdjustment(itemId);
        adj.scale = parseFloat(zoomSlider.value);
        applyAdjustment(activeImage, itemId);

        // Update crosshair for this image
        const overlay = activeImage.parentElement.querySelector('.dev-image-overlay');
        if (overlay) {
            const label = overlay.querySelector('.dev-position-label');
            const pos = parsePosition(adj.position);
            if (label) label.textContent = `${pos.x.toFixed(0)}% ${pos.y.toFixed(0)}% | ${adj.scale.toFixed(2)}x`;
        }
        updateUI();
    });

    // Reset button
    document.getElementById('dev-reset-btn').addEventListener('click', () => {
        if (!activeImage) return;
        const itemId = activeImage.closest('.registry-card')?.dataset.itemId;
        if (!itemId) return;

        delete adjustments[itemId];
        activeImage.style.objectPosition = '';
        activeImage.style.transform = '';

        // Update crosshair
        const overlay = activeImage.parentElement.querySelector('.dev-image-overlay');
        if (overlay) {
            const crosshair = overlay.querySelector('.dev-crosshair');
            const label = overlay.querySelector('.dev-position-label');
            if (crosshair) {
                crosshair.style.left = '50%';
                crosshair.style.top = '50%';
            }
            if (label) label.textContent = '50% 50% | 1.50x';
        }
        updateUI();
    });

    // Copy config button
    document.getElementById('dev-copy-btn').addEventListener('click', () => {
        // Filter out default values
        const filtered = {};
        for (const [id, adj] of Object.entries(adjustments)) {
            if (adj.position !== '50% 50%' || adj.scale !== 1.0) {
                filtered[id] = adj;
            }
        }

        // Format as JS object
        let output = 'const REGISTRY_IMAGE_CONFIG = {\n';
        for (const [id, adj] of Object.entries(filtered)) {
            output += `    "${id}": { position: "${adj.position}", scale: ${adj.scale.toFixed(2)} },\n`;
        }
        output += '};';

        navigator.clipboard.writeText(output).then(() => {
            copyFeedback.style.display = 'block';
            setTimeout(() => {
                copyFeedback.style.display = 'none';
            }, 2000);
        });

        console.log('[Registry Image Dev] Config copied:\n', output);
    });

    // Initialize all existing images
    function initializeDevMode() {
        document.querySelectorAll('.registry-card-image').forEach(img => {
            // Apply any existing config
            const itemId = img.closest('.registry-card')?.dataset.itemId;
            if (itemId && adjustments[itemId]) {
                applyAdjustment(img, itemId);
            }
            setupImage(img);
        });
    }

    // Watch for new cards being added (registry loads async)
    const observer = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
            mutation.addedNodes.forEach((node) => {
                if (node.nodeType === Node.ELEMENT_NODE) {
                    if (node.classList?.contains('registry-card')) {
                        const img = node.querySelector('.registry-card-image');
                        if (img) {
                            const itemId = node.dataset.itemId;
                            if (itemId && adjustments[itemId]) {
                                applyAdjustment(img, itemId);
                            }
                            setupImage(img);
                        }
                    }
                    // Also check children
                    node.querySelectorAll?.('.registry-card').forEach(card => {
                        const img = card.querySelector('.registry-card-image');
                        if (img) {
                            const itemId = card.dataset.itemId;
                            if (itemId && adjustments[itemId]) {
                                applyAdjustment(img, itemId);
                            }
                            setupImage(img);
                        }
                    });
                }
            });
        });
    });

    observer.observe(document.body, { childList: true, subtree: true });

    // Initialize when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initializeDevMode);
    } else {
        initializeDevMode();
    }
})();
