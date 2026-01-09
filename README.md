# sou segundo lugar

An interactive web experience featuring animated sprites, music playback, and dynamic character spawning.

## Features

- Animated character sprites with frame detection
- Audio playback with song tracking
- Dynamic character spawning with random intervals
- Interactive song list with clickable navigation
- Real-time timer display
- Scroll bar showing current song name

## Setup Instructions for GitHub Pages

1. Push this repository to GitHub
2. Go to your repository settings
3. Navigate to "Pages" in the left sidebar
4. Under "Source", select the branch (usually `main` or `master`)
5. Click "Save"
6. Your site will be available at `https://yourusername.github.io/repository-name/`

## File Structure

```
.
├── index.html
├── styles.css
├── script.js
├── README.md
├── character-spritesheet.png
└── album/
    ├── masters_-14lufs.wav
    └── songs.txt
```

## Configuration

Edit `script.js` to adjust:
- `SPRITE_WIDTH` and `SPRITE_HEIGHT`: Size of each sprite frame
- `FRAMES_PER_ROW`: Number of sprites per row in the spritesheet
- `SCALE`: Display scale factor for sprites
- `CHARACTER_SPAWN_INTERVAL`: Base time between character spawns (with random variation)
- `CENTER_CHARACTER_OFFSET_X` and `CENTER_CHARACTER_OFFSET_Y`: Position adjustment for center character

## Songs Format

The `album/songs.txt` file should contain songs in the format:
```
song title startTime-endTime
```

Example:
```
projetor 1:18-4:20
branco 4:20-7:22
```

## Controls

- Click the play/pause button (or press Space) to start/stop the audio
- Click any character to open the song list
- Click a song name in the list to jump to that song's start time
