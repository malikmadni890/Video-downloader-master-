const express = require('express');
const cors = require('cors');
const { spawn } = require('child_process');
const path = require('path');
const os = require('os');
const fs = require('fs');

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;
const TEMP_DIR = path.join(os.tmpdir(), 'downloader-master');

// Ensure temp directory exists
if (!fs.existsSync(TEMP_DIR)) {
  fs.mkdirSync(TEMP_DIR, { recursive: true });
}

// Health check endpoint
app.get('/', (req, res) => {
  res.json({ status: 'Server running', message: 'yt-dlp backend is active' });
});

// Main download endpoint
app.post('/api/download', (req, res) => {
  const { url } = req.body;

  if (!url) {
    return res.status(400).json({ 
      error: 'URL is required' 
    });
  }

  // Validate URL
  if (!url.includes('youtube.com') && !url.includes('youtu.be')) {
    return res.status(400).json({ 
      error: 'Only YouTube URLs supported by this endpoint' 
    });
  }

  console.log(`Downloading: ${url}`);

  // yt-dlp command
  const ytdlp = spawn('yt-dlp', [
    url,
    '-j', // JSON output
    '-f', 'best', // Best format
    '--no-warnings',
    '--quiet'
  ]);

  let output = '';
  let errorOutput = '';

  ytdlp.stdout.on('data', (data) => {
    output += data.toString();
  });

  ytdlp.stderr.on('data', (data) => {
    errorOutput += data.toString();
  });

  ytdlp.on('close', (code) => {
    if (code !== 0) {
      console.error('yt-dlp error:', errorOutput);
      return res.status(400).json({ 
        error: 'Failed to process video. ' + errorOutput 
      });
    }

    try {
      const info = JSON.parse(output);
      
      // Return video info and download URL
      res.json({
        ok: true,
        url: info.url || info.webpage_url,
        title: info.title,
        duration: info.duration,
        ext: info.ext,
        filesize: info.filesize
      });
    } catch (e) {
      console.error('JSON parse error:', e);
      res.status(400).json({ 
        error: 'Failed to parse video info' 
      });
    }
  });

  // Timeout after 60 seconds
  setTimeout(() => {
    ytdlp.kill();
    res.status(408).json({ 
      error: 'Download request timed out' 
    });
  }, 60000);
});

// Fallback endpoint for getting info
app.post('/api/info', (req, res) => {
  const { url } = req.body;

  if (!url) {
    return res.status(400).json({ 
      error: 'URL is required' 
    });
  }

  console.log(`Getting info: ${url}`);

  const ytdlp = spawn('yt-dlp', [
    url,
    '-j',
    '--dump-json',
    '--no-warnings',
    '--quiet'
  ]);

  let output = '';
  let errorOutput = '';

  ytdlp.stdout.on('data', (data) => {
    output += data.toString();
  });

  ytdlp.stderr.on('data', (data) => {
    errorOutput += data.toString();
  });

  ytdlp.on('close', (code) => {
    if (code !== 0) {
      console.error('yt-dlp error:', errorOutput);
      return res.status(400).json({ 
        ok: false,
        error: 'Failed to get video info' 
      });
    }

    try {
      const info = JSON.parse(output);
      
      res.json({
        ok: true,
        data: {
          title: info.title,
          duration: info.duration,
          thumbnail: info.thumbnail,
          formats: [{
            id: 'best',
            kind: 'video',
            quality: 'Best'
          }]
        }
      });
    } catch (e) {
      console.error('JSON parse error:', e);
      res.status(400).json({ 
        ok: false,
        error: 'Failed to parse video info' 
      });
    }
  });

  // Timeout after 60 seconds
  setTimeout(() => {
    ytdlp.kill();
    res.status(408).json({ 
      ok: false,
      error: 'Request timed out' 
    });
  }, 60000);
});

app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
  console.log(`🎬 yt-dlp backend ready for YouTube downloads`);
});
