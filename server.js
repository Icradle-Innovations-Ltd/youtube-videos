const express = require('express');
const cors = require('cors');
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');

const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Track active downloads
const activeDownloads = {};

// Create necessary directories
if (!fs.existsSync('downloads')) fs.mkdirSync('downloads');
if (!fs.existsSync('public')) fs.mkdirSync('public');

// Routes
app.post('/api/get-formats', async (req, res) => {
  try {
    const url = req.body.url;
    if (!url) return res.status(400).json({ error: 'URL is required' });

    const formats = await getVideoFormats(url);
    res.json({ formats });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/download', async (req, res) => {
  try {
    const { url, format, type } = req.body;
    if (!url) return res.status(400).json({ error: 'URL is required' });

    const downloadId = Date.now().toString();
    activeDownloads[downloadId] = { progress: 0 };

    startDownload(url, format, type, downloadId);
    res.json({ downloadId });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/progress/:id', (req, res) => {
  const download = activeDownloads[req.params.id];
  if (!download) return res.status(404).json({ error: 'Download not found' });
  res.json({ progress: download.progress, filename: download.filename });
});

app.get('/api/check-completion/:id', (req, res) => {
  const download = activeDownloads[req.params.id];
  if (!download) {
    return res.status(404).json({ error: 'Download not found' });
  }
  
  // Check if file exists
  if (download.filename) {
    const filePath = path.join(__dirname, 'downloads', download.filename);
    if (fs.existsSync(filePath)) {
      return res.json({ filename: download.filename });
    }
  }
  
  res.json({ progress: download.progress || 0 });
});

app.get('/api/download-file/:id', (req, res) => {
  const download = activeDownloads[req.params.id];
  if (!download?.filename) {
    return res.status(404).json({ error: 'File not ready' });
  }

  const filePath = path.join(__dirname, 'downloads', download.filename);
  res.download(filePath, download.filename, (err) => {
    if (!err) {
      fs.unlinkSync(filePath);
      delete activeDownloads[req.params.id];
    }
  });
});

// Helper functions
async function getVideoFormats(url) {
  return new Promise((resolve, reject) => {
    exec(`yt-dlp -F ${url}`, (error, stdout, stderr) => {
      if (error) return reject(new Error(stderr));
      resolve(parseFormats(stdout));
    });
  });
}

function startDownload(url, format, type, downloadId) {
  let command;
  if (type === 'mp3') {
    command = `yt-dlp -x --audio-format mp3 --newline -o "downloads/%(title)s.%(ext)s" ${url}`;
  } else {
    const formatSpec = format ? `${format}+bestaudio` : 'bestvideo+bestaudio';
    command = `yt-dlp -f ${formatSpec} --merge-output-format mp4 --newline -o "downloads/%(title)s.%(ext)s" ${url}`;
  }

  const ytDlpProcess = exec(command);

  ytDlpProcess.stdout.on('data', (data) => {
    try {
      const progressData = JSON.parse(data.toString());
      if (progressData.percent) {
        activeDownloads[downloadId].progress = progressData.percent;
      }
      if (progressData._filename) {
        activeDownloads[downloadId].filename = path.basename(progressData._filename);
      }
    } catch (e) {
      // Not JSON output, ignore
    }
  });

  ytDlpProcess.on('close', (code) => {
    if (code !== 0) {
      activeDownloads[downloadId].error = 'Download failed';
    }
  });
}

function parseFormats(output) {
  const lines = output.split('\n');
  const formats = [];
  let inFormatTable = false;

  for (const line of lines) {
    if (line.includes('ID  EXT')) inFormatTable = true;
    else if (!inFormatTable) continue;
    else if (line.trim() === '') break;

    const parts = line.split(/\s+/).filter(Boolean);
    if (parts.length >= 4) {
      formats.push({
        id: parts[0],
        ext: parts[1],
        resolution: parts[2],
        note: parts.slice(3).join(' ')
      });
    }
  }

  return formats.filter(f => 
    f.ext === 'mp4' || 
    f.ext === 'webm' || 
    (f.note.includes('audio only') && f.ext === 'm4a')
  );
}

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});