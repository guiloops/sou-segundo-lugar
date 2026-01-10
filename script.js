// Canvas setup
const canvas = document.getElementById('spriteCanvas');
const ctx = canvas.getContext('2d');
ctx.imageSmoothingEnabled = false;

// Sprite sheet configuration
// MANUALLY SET THESE VALUES based on your spritesheet:
// - How many pixels wide is each character sprite?
// - How many pixels tall is each character sprite?
// - How many sprites are in a row (if arranged in a grid)?
let spriteSheet = null;
let spriteSheetLoaded = false;
let SPRITE_WIDTH = 64;   // MANUAL: Width of each sprite in pixels
let SPRITE_HEIGHT = 64;  // MANUAL: Height of each sprite in pixels
let FRAMES_PER_ROW = 5;  // MANUAL: Number of sprites per row (if grid layout)
const FRAME_CHANGE_INTERVAL = 750; // Default frame change interval (overridden per character)
const SCALE = 1.75; // Scale factor for display
const CHARACTER_SPAWN_INTERVAL = 25000; // Spawn new character every 20 seconds

// Center character position adjustment (in pixels)
const CENTER_CHARACTER_OFFSET_X = -41; // Adjust horizontal position (positive = right, negative = left)
const CENTER_CHARACTER_OFFSET_Y = 41; // Adjust vertical position (positive = down, negative = up)

// Global data
let framesByRow = {}; // Store frames grouped by row
let validRows = []; // Store all valid row indices

// Character class
class Character {
    constructor(x, y, isCenterCharacter = false) {
        this.x = x;
        this.y = y;
        this.width = SPRITE_WIDTH * SCALE;
        this.height = SPRITE_HEIGHT * SCALE;
        this.validFrames = [];
        this.currentFrameIndex = 0;
        this.currentFrame = 0;
        this.rowRepeatCount = 0;
        this.currentRowRepeatTarget = 0;
        this.lastFrameTime = Date.now();
        this.frameChangeInterval = Math.random() * (1000 - 500) + 500;
        this.isCenterCharacter = isCenterCharacter;
        this.initialFrameStartTime = null; // Will be set when play is pressed
        this.initialFrameDuration = 10000; // 10 seconds in milliseconds
        
        if (isCenterCharacter) {
            // Set to second frame from row 32 (1-indexed, so row 31 in 0-indexed)
            const targetRow = 31; // Row 32 in 1-indexed = row 31 in 0-indexed
            const frameIndexInRow = 2; // Second frame (0-indexed)
            const framesPerRow = FRAMES_PER_ROW || 5;
            this.currentFrame = targetRow * framesPerRow + frameIndexInRow;
            this.validFrames = [this.currentFrame]; // Just this one frame for now
        } else {
            this.selectRandomRow();
        }
    }
    
    // Start the initial frame timer (called when play is pressed)
    startInitialFrameTimer() {
        if (this.isCenterCharacter && this.initialFrameStartTime === null) {
            this.initialFrameStartTime = Date.now();
        }
    }
    
    selectRandomRow() {
        if (validRows.length === 0) return;
        
        // Choose a random row
        const randomRow = validRows[Math.floor(Math.random() * validRows.length)];
        this.validFrames = [...framesByRow[randomRow]]; // Copy the array
        
        // Sort frames in the row to ensure sequential order
        this.validFrames.sort((a, b) => a - b);
        
        // Set repeat target to number of frames in this row
        this.currentRowRepeatTarget = this.validFrames.length;
        this.rowRepeatCount = 0;
        
        // Reset to first frame
        this.currentFrameIndex = 0;
        this.currentFrame = this.validFrames[0];
    }
    
    update() {
        // Center character always stays in initial frame and never animates
        if (this.isCenterCharacter) {
            return; // Don't animate, keep initial frame forever
        }
        
        const now = Date.now();
        if (now - this.lastFrameTime >= this.frameChangeInterval) {
            this.lastFrameTime = now;
            
            if (this.validFrames.length === 0) return;
            
            // Move to next frame sequentially
            this.currentFrameIndex = (this.currentFrameIndex + 1) % this.validFrames.length;
            this.currentFrame = this.validFrames[this.currentFrameIndex];
            
            // If we've completed a full cycle of the row
            if (this.currentFrameIndex === 0) {
                this.rowRepeatCount++;
                
                // If we've repeated the row the target number of times, select a new random row
                if (this.rowRepeatCount >= this.currentRowRepeatTarget) {
                    this.selectRandomRow();
                }
            }
        }
    }
    
    draw() {
        if (!spriteSheetLoaded || !spriteSheet || this.validFrames.length === 0) return;
        
        // Calculate source position in spritesheet
        const framesPerRow = FRAMES_PER_ROW || Math.floor(spriteSheet.width / SPRITE_WIDTH);
        const row = Math.floor(this.currentFrame / framesPerRow);
        const col = this.currentFrame % framesPerRow;
        
        const sourceX = col * SPRITE_WIDTH;
        const sourceY = row * SPRITE_HEIGHT;
        
        // Draw the sprite frame at this character's position
        ctx.drawImage(
            spriteSheet,
            sourceX, sourceY, SPRITE_WIDTH, SPRITE_HEIGHT, // Source rectangle
            this.x, this.y, this.width, this.height         // Destination rectangle
        );
    }
    
    getBounds() {
        return {
            x: this.x,
            y: this.y,
            width: this.width,
            height: this.height
        };
    }
}

// Characters array
let characters = [];
let spawnTimer = null;
let gameStarted = false;
let centerCharacter = null;
let backgroundAudio = null;
let songs = [];
let songTimer = null;
let elapsedTime = 0; // Time elapsed since play was pressed (in seconds)
let startTime = null; // Timestamp when play was pressed
let hasEverStarted = false; // Track if game has ever been started
let displayedSongs = new Set(); // Track which songs have been added to the scroll
let audioDuration = 0; // Total duration of the audio file in seconds
let songListVisible = false; // Track if song list is visible
let lastCurrentSong = null; // Track the last current song to detect changes

// Check if a frame is blank (all transparent or all same color)
function isFrameBlank(frameIndex) {
    const framesPerRow = FRAMES_PER_ROW || Math.floor(spriteSheet.width / SPRITE_WIDTH);
    const row = Math.floor(frameIndex / framesPerRow);
    const col = frameIndex % framesPerRow;
    
    const sourceX = col * SPRITE_WIDTH;
    const sourceY = row * SPRITE_HEIGHT;
    
    // Create a temporary canvas to sample the frame
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = SPRITE_WIDTH;
    tempCanvas.height = SPRITE_HEIGHT;
    const tempCtx = tempCanvas.getContext('2d');
    
    // Draw the frame region to temp canvas
    tempCtx.drawImage(
        spriteSheet,
        sourceX, sourceY, SPRITE_WIDTH, SPRITE_HEIGHT,
        0, 0, SPRITE_WIDTH, SPRITE_HEIGHT
    );
    
    // Sample pixels to check if frame is blank
    const imageData = tempCtx.getImageData(0, 0, SPRITE_WIDTH, SPRITE_HEIGHT);
    const pixels = imageData.data;
    
    // Check if all pixels are transparent (alpha = 0) or all same color
    let firstPixel = null;
    let hasContent = false;
    
    for (let i = 0; i < pixels.length; i += 4) {
        const r = pixels[i];
        const g = pixels[i + 1];
        const b = pixels[i + 2];
        const a = pixels[i + 3];
        
        // If pixel is not fully transparent
        if (a > 0) {
            if (firstPixel === null) {
                firstPixel = { r, g, b, a };
            } else {
                // Check if this pixel is different from the first non-transparent pixel
                if (r !== firstPixel.r || g !== firstPixel.g || b !== firstPixel.b || a !== firstPixel.a) {
                    hasContent = true;
                    break;
                }
            }
        }
    }
    
    // Frame is blank if it's all transparent or all the same color
    return !hasContent && firstPixel === null;
}

// Detect valid (non-blank) frames and group by row
function detectValidFrames() {
    const framesPerRow = FRAMES_PER_ROW || Math.floor(spriteSheet.width / SPRITE_WIDTH);
    const rows = Math.floor(spriteSheet.height / SPRITE_HEIGHT);
    const totalFrames = framesPerRow * rows;
    
    // Group valid frames by row
    framesByRow = {};
    for (let i = 0; i < totalFrames; i++) {
        if (!isFrameBlank(i)) {
            const row = Math.floor(i / framesPerRow);
            if (!framesByRow[row]) {
                framesByRow[row] = [];
            }
            framesByRow[row].push(i);
        }
    }
    
    // Get all rows that have valid frames
    validRows = Object.keys(framesByRow).map(Number);
    
    if (validRows.length === 0) {
        console.error('No valid frames found');
        return;
    }
}


// Check if two rectangles collide
function checkCollision(rect1, rect2) {
    return !(rect1.x + rect1.width < rect2.x ||
             rect2.x + rect2.width < rect1.x ||
             rect1.y + rect1.height < rect2.y ||
             rect2.y + rect2.height < rect1.y);
}

// Check if a position collides with any existing character
function hasCollision(x, y, width, height) {
    const testRect = { x, y, width, height };
    for (let char of characters) {
        if (checkCollision(testRect, char.getBounds())) {
            return true;
        }
    }
    return false;
}

// Check if a position collides with UI elements (scroll bar or message box)
function hasUICollision(x, y, width, height) {
    const testRect = { x, y, width, height };
    
    // Top scroll bar exclusion zone (height: 60px)
    const scrollBarRect = {
        x: 0,
        y: 0,
        width: canvas.width,
        height: 60
    };
    if (checkCollision(testRect, scrollBarRect)) {
        return true;
    }
    
    // Bottom right message box exclusion zone
    const startMessage = document.getElementById('startMessage');
    if (startMessage) {
        const messageRect = startMessage.getBoundingClientRect();
        const messageBoxRect = {
            x: messageRect.left,
            y: messageRect.top,
            width: messageRect.width,
            height: messageRect.height
        };
        if (checkCollision(testRect, messageBoxRect)) {
            return true;
        }
    }
    
    return false;
}

// Find a random position that doesn't collide
function findRandomPosition() {
    const charWidth = SPRITE_WIDTH * SCALE;
    const charHeight = SPRITE_HEIGHT * SCALE;
    const maxX = canvas.width - charWidth;
    const maxY = canvas.height - charHeight;
    
    // Top scroll bar height
    const scrollBarHeight = 60;
    const minY = scrollBarHeight; // Start below the scroll bar
    
    // Try up to 1000000 times to find a valid position
    for (let i = 0; i < 1000000; i++) {
        const x = Math.random() * maxX;
        const y = minY + Math.random() * (maxY - minY); // Ensure we're below scroll bar
        
        // Check both character collisions and UI collisions
        if (!hasCollision(x, y, charWidth, charHeight) && 
            !hasUICollision(x, y, charWidth, charHeight)) {
            return { x, y };
        }
    }
    
    // If we can't find a position, return null (screen is full)
    return null;
}

// Add a new character
function addCharacter() {
    const position = findRandomPosition();
    
    if (position === null) {
        // Screen is full, stop spawning
        if (spawnTimer) {
            clearTimeout(spawnTimer);
            spawnTimer = null;
        }
        return;
    }
    
    const character = new Character(position.x, position.y);
    characters.push(character);
}

// Remove all characters except center character one by one, half second apart
function removeCharactersOneByOne() {
    // Stop spawning new characters
    if (spawnTimer) {
        clearInterval(spawnTimer);
        spawnTimer = null;
    }
    
    // Get all characters except the center character
    const charactersToRemove = characters.filter(char => !char.isCenterCharacter);
    
    // Remove them one by one with 0.5 second delay between each
    charactersToRemove.forEach((character, index) => {
        setTimeout(() => {
            const charIndex = characters.indexOf(character);
            if (charIndex !== -1) {
                characters.splice(charIndex, 1);
            }
        }, index * 500); // 500ms = 0.5 seconds
    });
}

// Check if mouse is over any character
function isMouseOverCharacter(mouseX, mouseY) {
    for (let character of characters) {
        const charBounds = character.getBounds();
        if (mouseX >= charBounds.x && 
            mouseX <= charBounds.x + charBounds.width &&
            mouseY >= charBounds.y && 
            mouseY <= charBounds.y + charBounds.height) {
            return true;
        }
    }
    return false;
}

// Handle mouse movement to change cursor
function handleCanvasMouseMove(event) {
    const rect = canvas.getBoundingClientRect();
    const mouseX = event.clientX - rect.left;
    const mouseY = event.clientY - rect.top;
    
    if (isMouseOverCharacter(mouseX, mouseY)) {
        canvas.style.cursor = 'pointer';
    } else {
        canvas.style.cursor = 'default';
    }
}

// Load sprite sheet
function loadSpriteSheet() {
    spriteSheet = new Image();
    spriteSheet.onload = () => {
        // Set canvas to full window size
        canvas.width = window.innerWidth || 800;
        canvas.height = window.innerHeight || 600;
        
        // Function to position the center character above the title box on the left
        function centerCharacterOnScreen() {
            if (centerCharacter) {
                const startMessage = document.getElementById('startMessage');
                if (startMessage) {
                    const messageRect = startMessage.getBoundingClientRect();
                    const isMobile = window.innerWidth <= 768;
                    
                    if (isMobile) {
                        // On mobile: position character above the message box in the top area
                        // Since box is full width, position in top-left area
                        const spacing = 15;
                        const leftX = 20; // Fixed left position
                        const aboveY = messageRect.top - SPRITE_HEIGHT * SCALE - spacing; // Above the box
                        
                        // Ensure character doesn't go off screen on mobile
                        const minX = 10;
                        const maxX = canvas.width - centerCharacter.width - 10;
                        const minY = 70; // Below scroll bar
                        const maxY = canvas.height - centerCharacter.height - 10;
                        
                        centerCharacter.x = Math.max(minX, Math.min(maxX, leftX));
                        centerCharacter.y = Math.max(minY, Math.min(maxY, aboveY));
                    } else {
                        // Desktop: position above the message box, aligned to the left edge
                        const offsetX = CENTER_CHARACTER_OFFSET_X;
                        const offsetY = CENTER_CHARACTER_OFFSET_Y;
                        const spacing = 20;
                        
                        const leftX = messageRect.left + offsetX;
                        const aboveY = messageRect.top - SPRITE_HEIGHT * SCALE - spacing + offsetY;
                        
                        centerCharacter.x = leftX;
                        centerCharacter.y = aboveY;
                    }
                } else {
                    // Fallback to left side if message box not found
                    const isMobile = window.innerWidth <= 768;
                    centerCharacter.x = isMobile ? 15 : 30;
                    centerCharacter.y = isMobile ? 80 : 100;
                }
            }
        }
        
        // Update canvas size on window resize and re-center character
        window.addEventListener('resize', () => {
            canvas.width = window.innerWidth || 800;
            canvas.height = window.innerHeight || 600;
            centerCharacterOnScreen();
        });
        
        spriteSheetLoaded = true;
        
        // Detect valid frames (non-blank) - this must happen before creating characters
        detectValidFrames();
        
        // Ensure validRows is populated before creating characters
        if (validRows.length === 0) {
            console.error('No valid rows found! Cannot create characters.');
            return;
        }
        
        // Start animation loop (but characters won't animate until game starts)
        startAnimation();
        
        // Wait 100ms before showing character
        setTimeout(() => {
            characters = [];
            // Position above the title box on the left
            const startMessage = document.getElementById('startMessage');
            const isMobile = window.innerWidth <= 768;
            let centerX = isMobile ? 15 : 30; // Default left position
            let centerY = isMobile ? 80 : 100; // Default top position
            
            if (startMessage) {
                const messageRect = startMessage.getBoundingClientRect();
                
                if (isMobile) {
                    // On mobile: position character above the message box in the top area
                    // Since box is full width, position in top-left area
                    const spacing = 15;
                    centerX = 20; // Fixed left position
                    centerY = messageRect.top - SPRITE_HEIGHT * SCALE - spacing; // Above the box
                    
                    // Ensure character doesn't go off screen on mobile
                    const minX = 10;
                    const maxX = canvas.width - SPRITE_WIDTH * SCALE - 10;
                    const minY = 70; // Below scroll bar
                    const maxY = canvas.height - SPRITE_HEIGHT * SCALE - 10;
                    
                    centerX = Math.max(minX, Math.min(maxX, centerX));
                    centerY = Math.max(minY, Math.min(maxY, centerY));
                } else {
                    // Desktop: position above the message box, aligned to the left edge
                    const offsetX = CENTER_CHARACTER_OFFSET_X;
                    const offsetY = CENTER_CHARACTER_OFFSET_Y;
                    const spacing = 20;
                    
                    centerX = messageRect.left + offsetX;
                    centerY = messageRect.top - SPRITE_HEIGHT * SCALE - spacing + offsetY;
                }
            }
            
            centerCharacter = new Character(centerX, centerY, true); // true = isCenterCharacter
            characters.push(centerCharacter);
            
            // Set default cursor
            canvas.style.cursor = 'default';
            
            // Add event listeners to canvas
            canvas.addEventListener('click', handleCanvasClick);
            canvas.addEventListener('mousemove', handleCanvasMouseMove);
            
            // Add touch support for mobile
            canvas.addEventListener('touchstart', (e) => {
                e.preventDefault();
                const touch = e.touches[0];
                const rect = canvas.getBoundingClientRect();
                const touchX = touch.clientX - rect.left;
                const touchY = touch.clientY - rect.top;
                
                // Check if touch is on any character
                let touchedCharacter = null;
                for (let character of characters) {
                    const charBounds = character.getBounds();
                    if (touchX >= charBounds.x && 
                        touchX <= charBounds.x + charBounds.width &&
                        touchY >= charBounds.y && 
                        touchY <= charBounds.y + charBounds.height) {
                        touchedCharacter = character;
                        break;
                    }
                }
                
                if (touchedCharacter) {
                    toggleSongList();
                } else {
                    // Touch outside any character - close song list if open
                    if (songListVisible) {
                        const songListBox = document.getElementById('songListBox');
                        if (songListBox) {
                            songListBox.classList.remove('visible');
                            songListVisible = false;
                        }
                    }
                }
            }, { passive: false });
        }, 100);
    };
    spriteSheet.onerror = () => {
        console.error('Failed to load sprite sheet. Make sure character-spritesheet.png exists.');
    };
    spriteSheet.src = 'character-spritesheet.png';
}

// Show/hide song list box
function toggleSongList() {
    const songListBox = document.getElementById('songListBox');
    const songListContent = document.getElementById('songListContent');
    const startMessage = document.getElementById('startMessage');
    
    if (!songListBox || !songListContent || !startMessage) return;
    
    if (songListVisible) {
        // Hide the box
        songListBox.classList.remove('visible');
        songListVisible = false;
    } else {
        // Show the box and populate with song titles
        songListContent.innerHTML = '';
        
        songs.forEach(song => {
            const songItem = document.createElement('div');
            songItem.className = 'song-list-item';
            songItem.textContent = song.title;
            
            // Add click handler to seek to song start time
            songItem.addEventListener('click', (e) => {
                seekToSong(song.startTime);
                e.stopPropagation(); // Prevent event bubbling
            });
            
            songListContent.appendChild(songItem);
        });
        
        // Position the box above the message box on bottom right
        const messageRect = startMessage.getBoundingClientRect();
        const offsetY = 20; // Space above message box
        
        // First render to get dimensions
        songListBox.style.visibility = 'hidden';
        songListBox.style.opacity = '0';
        songListBox.style.display = 'flex';
        
        setTimeout(() => {
            const boxHeight = songListBox.offsetHeight || 200;
            const boxWidth = songListBox.offsetWidth || 250;
            
            // Position above the message box, right-aligned
            songListBox.style.right = `${window.innerWidth - messageRect.right}px`;
            songListBox.style.bottom = `${window.innerHeight - messageRect.top + offsetY}px`;
            songListBox.style.left = 'auto';
            songListBox.style.top = 'auto';
            
            // Adjust if box goes off screen
            const rect = songListBox.getBoundingClientRect();
            if (rect.top < 0) {
                songListBox.style.bottom = `${window.innerHeight - messageRect.bottom - offsetY}px`; // Show below instead
            }
            if (rect.left < 0) {
                songListBox.style.right = '30px';
            }
            
            songListBox.classList.add('visible');
            songListVisible = true;
        }, 0);
    }
}

// Handle canvas click to detect any character click
function handleCanvasClick(event) {
    if (characters.length === 0) return;
    
    const rect = canvas.getBoundingClientRect();
    const clickX = event.clientX - rect.left;
    const clickY = event.clientY - rect.top;
    
    // Check if click is on any character
    let clickedCharacter = null;
    for (let character of characters) {
        const charBounds = character.getBounds();
        if (clickX >= charBounds.x && 
            clickX <= charBounds.x + charBounds.width &&
            clickY >= charBounds.y && 
            clickY <= charBounds.y + charBounds.height) {
            clickedCharacter = character;
            break;
        }
    }
    
    if (clickedCharacter) {
        // Position box above the message box on bottom right
        toggleSongList();
        event.stopPropagation(); // Prevent event from bubbling
    } else {
        // Click outside any character - close song list if open
        if (songListVisible) {
            const songListBox = document.getElementById('songListBox');
            if (songListBox) {
                songListBox.classList.remove('visible');
                songListVisible = false;
            }
        }
    }
}

// Close song list when clicking outside
document.addEventListener('click', (event) => {
    if (songListVisible) {
        const songListBox = document.getElementById('songListBox');
        if (songListBox && !songListBox.contains(event.target) && event.target !== canvas) {
            songListBox.classList.remove('visible');
            songListVisible = false;
        }
    }
});

// Animation loop
function startAnimation() {
    function animate() {
        // Ensure canvas has valid dimensions
        if (canvas.width === 0 || canvas.height === 0) {
            canvas.width = window.innerWidth || 800;
            canvas.height = window.innerHeight || 600;
        }
        
        // Clear canvas with white background
        ctx.fillStyle = 'lightgrey';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        
        // Update and draw all characters (only animate if game started)
        for (let character of characters) {
            if (gameStarted) {
                character.update();
            }
            character.draw();
        }
        
        requestAnimationFrame(animate);
    }
    
    animate();
}

// Convert time string (MM:SS) to seconds
function timeToSeconds(timeStr) {
    const parts = timeStr.split(':');
    const minutes = parseInt(parts[0], 10);
    const seconds = parseInt(parts[1], 10);
    return minutes * 60 + seconds;
}

// Convert seconds to time string (MM:SS)
function secondsToTime(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
}

// Update timer display
function updateTimer() {
    const timerText = document.getElementById('timerText');
    if (timerText) {
        const elapsed = secondsToTime(elapsedTime);
        const total = secondsToTime(audioDuration);
        timerText.textContent = `${elapsed}/${total}`;
    }
}

// Update scroll text based on current elapsed time
function updateScrollText() {
    if (songs.length === 0) return;
    
    // Find the current song based on elapsed time
    let currentSong = null;
    for (let song of songs) {
        if (elapsedTime >= song.startTime && elapsedTime < song.endTime) {
            currentSong = song;
            break;
        }
    }
    
    // If no song matches, use the last song or first song
    if (!currentSong) {
        if (elapsedTime >= songs[songs.length - 1].endTime) {
            currentSong = songs[songs.length - 1];
        } else {
            currentSong = songs[0];
        }
    }
    
    // Check if the current song has changed
    if (currentSong) {
        const songKey = `${currentSong.title}-${currentSong.startTime}`;
        const lastSongKey = lastCurrentSong ? `${lastCurrentSong.title}-${lastCurrentSong.startTime}` : null;
        
        if (songKey !== lastSongKey) {
            // Update scroll to show current song
            updateScrollWithCurrentSong(currentSong.title);
            lastCurrentSong = currentSong;
        }
    }
}

// Update scroll bar to display the current song
function updateScrollWithCurrentSong(songTitle) {    
    const scrollContent = document.getElementById('scrollContent');
    if (!scrollContent) return;
    
    // Clear all existing scroll items
    scrollContent.innerHTML = '';
    
    // Repeat the song title many times to fill the bar and extend beyond both sides
    const repeatCount = 100; // Number of times to repeat the title
    
    // Create repeated text with space separator
    const repeatedText = (songTitle + ' ').repeat(repeatCount);
    
    // Create a single span with all repetitions
    const span = document.createElement('span');
    span.className = 'scroll-text-item';
    span.textContent = repeatedText;
    
    // Add to scroll container
    scrollContent.appendChild(span);
    
    // Make it visible and position to center it, making it spill from both sides
    scrollContent.style.opacity = '1';
    scrollContent.style.visibility = 'visible';
    scrollContent.style.display = 'flex';
    scrollContent.style.alignItems = 'center';
    scrollContent.style.justifyContent = 'flex-start';
    scrollContent.style.height = '60px';
    scrollContent.style.position = 'absolute';
    scrollContent.style.animation = 'none';
    scrollContent.style.overflow = 'visible';
    
    // Position the content to center it, making it spill from both left and right sides
    setTimeout(() => {
        const textWidth = span.offsetWidth;
        const screenWidth = window.innerWidth;
        // Center the text so it extends beyond both edges
        scrollContent.style.left = `${(screenWidth - textWidth) / 2}px`;
    }, 10);
}

// Seek audio to a specific time (in seconds)
function seekToSong(startTimeSeconds) {
    if (!backgroundAudio) return;
    
    // Seek the audio to the song's start time
    backgroundAudio.currentTime = startTimeSeconds;
    
    // If game is not started, start it
    if (!gameStarted) {
        handleMessageBoxClick();
    } else {
        // If audio is paused, resume it
        if (backgroundAudio.paused) {
            backgroundAudio.play().catch(error => {
                console.error('Error playing audio:', error);
            });
        }
    }
    
    // Update elapsed time and start time
    elapsedTime = startTimeSeconds;
    if (gameStarted) {
        startTime = Date.now() - (startTimeSeconds * 1000);
    }
    
    // Update timer display
    updateTimer();
    
    // Update scroll text to reflect the new current song
    updateScrollText();
}

// Handle message box click to start/stop the game
function handleMessageBoxClick() {
    const playStopIcon = document.getElementById('playStopIcon');
    
    if (!gameStarted) {
        // Start the game
        gameStarted = true;
        
        // Cursor will be updated by mousemove handler
        
        // Update icon to stop
        if (playStopIcon) {
            const isMobile = window.innerWidth <= 768;
            if (isMobile) {
                // Use a better pause symbol for mobile
                playStopIcon.textContent = '⏸';
                playStopIcon.innerHTML = '⏸';
                playStopIcon.style.fontSize = '14px';
            } else {
                playStopIcon.textContent = '⏸';
                playStopIcon.innerHTML = '⏸';
                playStopIcon.style.fontSize = '';
            }
        }
        
        // Resume all scroll text animations
        const scrollContent = document.getElementById('scrollContent');
        if (scrollContent) {
            const scrollItems = scrollContent.querySelectorAll('.scroll-text-item');
            scrollItems.forEach(item => {
                item.style.animationPlayState = 'running';
            });
        }
        
        // Start audio playback
        if (backgroundAudio) {
            console.log('Attempting to play audio, readyState:', backgroundAudio.readyState);
            const playPromise = backgroundAudio.play();
            if (playPromise !== undefined) {
                playPromise
                    .then(() => {
                        console.log('Audio playing successfully');
                    })
                    .catch(error => {
                        console.error('Error playing audio:', error);
                        console.error('Error name:', error.name);
                        console.error('Error message:', error.message);
                        // If audio not ready, wait for it
                        if (backgroundAudio.readyState < 3) {
                            console.log('Waiting for audio to be ready...');
                            backgroundAudio.addEventListener('canplaythrough', () => {
                                console.log('Audio ready, trying to play again...');
                                backgroundAudio.play().catch(e => console.error('Still failed:', e));
                            }, { once: true });
                        }
                    });
            }
        } else {
            console.error('backgroundAudio is null!');
        }
        
        // Start the initial frame timer for center character
        if (centerCharacter && centerCharacter.isCenterCharacter) {
            centerCharacter.startInitialFrameTimer();
        }
        
        // Start song timer
        if (!hasEverStarted) {
            // First time starting - reset to 0 and clear displayed songs
            elapsedTime = 0;
            hasEverStarted = true;
            displayedSongs.clear();
            lastCurrentSong = null;
            
            // Clear scroll content and start fresh
            const scrollContent = document.getElementById('scrollContent');
            if (scrollContent) {
                scrollContent.innerHTML = '';
            }
        }
        
        // Start timer from 0 when music starts
        startTime = Date.now();
        elapsedTime = 0;
        updateTimer(); // Update timer display to show 0:00
        
        songTimer = setInterval(() => {
            elapsedTime = Math.floor((Date.now() - startTime) / 1000);
            updateScrollText();
            updateTimer(); // Update timer display
        }, 100); // Update every 100ms for smooth transitions
        
        // Initial scroll text update (this will add the first song)
        updateScrollText();
        
        // Start spawning new characters with random intervals
        function scheduleNextSpawn() {
            // Calculate random interval: 25 seconds ± 3 seconds (22-28 seconds)
            const randomOffset = (Math.random() * 6 - 3) * 1000; // -3000 to +3000 ms
            const nextSpawnTime = CHARACTER_SPAWN_INTERVAL + randomOffset;
            
            spawnTimer = setTimeout(() => {
                addCharacter();
                if (gameStarted) {
                    scheduleNextSpawn(); // Schedule next spawn
                }
            }, nextSpawnTime);
        }
        scheduleNextSpawn();
    } else {
        // Pause the game
        gameStarted = false;
        
        // Update icon to play
        if (playStopIcon) {
            playStopIcon.textContent = '▶';
            playStopIcon.innerHTML = '▶';
        }
        
        // Pause all scroll text animations (but keep them visible and in place)
        const scrollContent = document.getElementById('scrollContent');
        if (scrollContent) {
            const scrollItems = scrollContent.querySelectorAll('.scroll-text-item');
            scrollItems.forEach(item => {
                item.style.animationPlayState = 'paused';
            });
        }
        
        // Pause audio playback
        if (backgroundAudio) {
            backgroundAudio.pause();
        }
        
        // Stop song timer (but keep elapsedTime for resume)
        if (songTimer) {
            clearInterval(songTimer);
            songTimer = null;
        }
        
        // Stop spawning new characters
        if (spawnTimer) {
            clearTimeout(spawnTimer);
            spawnTimer = null;
        }
    }
}

// Initialize scroll bar (no longer needed for infinite scroll, but kept for compatibility)
function initInfiniteScroll() {
    // Scroll items are now added dynamically when songs change
    // No initialization needed
}

// Load and parse songs from songs.txt
async function loadSongs() {
    try {
        const response = await fetch('album/songs.txt');
        const text = await response.text();
        const lines = text.split('\n').filter(line => line.trim());
        
        songs = [];
        for (let line of lines) {
            // Parse format: "title startTime-endTime"
            const match = line.match(/^(.+?)\s+(\d+:\d+)-(\d+:\d+)$/);
            if (match) {
                const title = match[1].trim();
                const startTime = timeToSeconds(match[2]);
                const endTime = timeToSeconds(match[3]);
                songs.push({ title, startTime, endTime });
            }
        }
        
        // Don't set initial scroll text - it will be added when the game starts
    } catch (error) {
        console.error('Error loading songs.txt:', error);
        // Fallback to default song
        
    }
}

// Initialize when page loads
window.addEventListener('DOMContentLoaded', async () => {
    // Load songs first
    await loadSongs();
    
    // Initialize background audio
    const audioPath = 'album/masters.mp3';
    backgroundAudio = new Audio(audioPath);
    console.log('Audio element created, src:', backgroundAudio.src);
    backgroundAudio.loop = false; // Don't loop - we want to detect when it ends
    backgroundAudio.volume = 1.0; // Set volume to 100%
    backgroundAudio.preload = 'auto';
    
    // Add error handling
    backgroundAudio.addEventListener('error', (e) => {
        console.error('Audio error event fired');
        console.error('Audio error object:', backgroundAudio.error);
        if (backgroundAudio.error) {
            console.error('Error code:', backgroundAudio.error.code);
            console.error('Error message:', backgroundAudio.error.message);
            console.error('Audio src:', backgroundAudio.src);
            console.error('Audio readyState:', backgroundAudio.readyState);
        }
    });
    
    // Track loading progress
    backgroundAudio.addEventListener('loadstart', () => {
        console.log('Audio load started');
    });
    
    backgroundAudio.addEventListener('canplay', () => {
        console.log('Audio can play, readyState:', backgroundAudio.readyState);
    });
    
    // Get audio duration when metadata is loaded
    backgroundAudio.addEventListener('loadedmetadata', () => {
        console.log('Audio loaded, duration:', backgroundAudio.duration);
        audioDuration = Math.floor(backgroundAudio.duration);
        updateTimer(); // Update timer with total duration
    });
    
    // Helper function to get readyState name
    const getReadyStateName = (state) => {
        const states = ['HAVE_NOTHING', 'HAVE_METADATA', 'HAVE_CURRENT_DATA', 'HAVE_FUTURE_DATA', 'HAVE_ENOUGH_DATA'];
        return states[state] || 'UNKNOWN';
    };
    
    // Force load
    backgroundAudio.load();
    
    // Test audio file accessibility after a short delay
    setTimeout(async () => {
        try {
            const testResponse = await fetch('album/masters.mp3', { method: 'HEAD' });
            console.log('Audio file test - Status:', testResponse.status, testResponse.statusText);
            console.log('Audio file test - Content-Type:', testResponse.headers.get('Content-Type'));
            console.log('Audio file test - Content-Length:', testResponse.headers.get('Content-Length'));
            if (!testResponse.ok) {
                console.error('Audio file is not accessible! HTTP Status:', testResponse.status);
            }
        } catch (error) {
            console.error('Error testing audio file:', error);
        }
        
        // Log audio element state
        console.log('Audio element state check:');
        console.log('- src:', backgroundAudio.src);
        console.log('- readyState:', backgroundAudio.readyState, '(' + getReadyStateName(backgroundAudio.readyState) + ')');
        console.log('- networkState:', backgroundAudio.networkState);
        console.log('- error:', backgroundAudio.error);
        console.log('- paused:', backgroundAudio.paused);
        console.log('- muted:', backgroundAudio.muted);
        console.log('- volume:', backgroundAudio.volume);
    }, 1000);
    
    // When audio ends, remove all characters except center character one by one
    backgroundAudio.addEventListener('ended', () => {
        // Set game as stopped first
        gameStarted = false;
        
        // Stop the timer
        if (songTimer) {
            clearInterval(songTimer);
            songTimer = null;
        }
        
        // Update play/stop icon to play
        const playStopIcon = document.getElementById('playStopIcon');
        if (playStopIcon) {
            playStopIcon.textContent = '▶';
            playStopIcon.innerHTML = '▶';
        }
        
        // Clear the top bar (scroll content)
        const scrollContent = document.getElementById('scrollContent');
        if (scrollContent) {
            scrollContent.innerHTML = '';
            scrollContent.style.opacity = '0';
            scrollContent.style.visibility = 'hidden';
        }
        
        // Remove characters one by one
        removeCharactersOneByOne();
    });
    
    // Set up media session for media key controls
    if (navigator.mediaSession) {
        navigator.mediaSession.metadata = new MediaMetadata({
            title: 'sou segundo lugar',
            artist: 'guilherme lopes'
        });
    }
    
    // Ensure start message is visible and clickable
    const startMessage = document.getElementById('startMessage');
    if (startMessage) {
        startMessage.style.display = 'block';
        startMessage.style.visibility = 'visible';
        startMessage.style.opacity = '1';
        startMessage.style.zIndex = '99999';
        startMessage.addEventListener('click', handleMessageBoxClick);
    } else {
        console.error('Start message element not found!');
    }
    
    // Add keyboard controls for play/pause
    document.addEventListener('keydown', (event) => {
        // Spacebar to toggle play/pause
        if (event.code === 'Space' || event.key === ' ') {
            event.preventDefault(); // Prevent page scroll
            handleMessageBoxClick();
        }
    });
    
    // Add media key controls (play/pause buttons on keyboard)
    if (navigator.mediaSession) {
        navigator.mediaSession.setActionHandler('play', () => {
            if (!gameStarted) {
                handleMessageBoxClick();
            }
        });
        
        navigator.mediaSession.setActionHandler('pause', () => {
            if (gameStarted) {
                handleMessageBoxClick();
            }
        });
    }
    
    // Initialize timer display (shows 0:00/xx:xx, but doesn't start counting until music starts)
    elapsedTime = 0;
    updateTimer();
    
    loadSpriteSheet();
    initInfiniteScroll();
});
