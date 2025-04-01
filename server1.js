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

// Create downloads directory if it doesn't exist
if (!fs.existsSync('downloads')) {
  fs.mkdirSync('downloads');
}

// Route to get available formats
app.post('/get-formats', (req, res) => {
  const url = req.body.url;
  if (!url) return res.status(400).json({ error: 'URL is required' });

  exec(`yt-dlp -F ${url}`, (error, stdout, stderr) => {
    if (error) {
      return res.status(500).json({ error: stderr });
    }
    
    const formats = parseFormats(stdout);
    res.json({ formats });
  });
});

// Route to start download
app.post('/download', (req, res) => {
  const { url, format, type } = req.body;
  if (!url) return res.status(400).json({ error: 'URL is required' });

  const downloadId = Date.now().toString();
  activeDownloads[downloadId] = { progress: 0 };

  let command;
  if (type === 'mp3') {
    command = `yt-dlp -x --audio-format mp3 --newline -o "downloads/%(title)s.%(ext)s" ${url}`;
  } else {
    command = `yt-dlp -f ${format}+bestaudio --merge-output-format mp4 --newline -o "downloads/%(title)s.%(ext)s" ${url}`;
  }

  const ytDlpProcess = exec(command);

  ytDlpProcess.stdout.on('data', (data) => {
    try {
      // Parse each line of output
      data.toString().split('\n').forEach(line => {
        if (line.trim() === '') return;
        
        try {
          const progressData = JSON.parse(line);
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
    } catch (e) {
      console.error('Error processing output:', e);
    }
  });

  ytDlpProcess.stderr.on('data', (data) => {
    console.error('Error:', data.toString());
  });

  ytDlpProcess.on('close', (code) => {
    if (code !== 0) {
      activeDownloads[downloadId].error = 'Download failed';
    }
  });

  res.json({ downloadId });
});

// Route to check download progress
app.get('/progress/:id', (req, res) => {
  const download = activeDownloads[req.params.id];
  if (!download) {
    return res.status(404).json({ error: 'Download not found' });
  }
  
  if (download.error) {
    return res.status(500).json({ error: download.error });
  }
  
  res.json({ 
    progress: download.progress,
    filename: download.filename
  });
});

// Route to download completed file
app.get('/download-file/:id', (req, res) => {
  const download = activeDownloads[req.params.id];
  if (!download || !download.filename) {
    return res.status(404).json({ error: 'File not ready' });
  }

  const filePath = path.join(__dirname, 'downloads', download.filename);
  
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'File not found' });
  }

  res.download(filePath, (err) => {
    if (!err) {
      fs.unlinkSync(filePath); // Clean up after download
      delete activeDownloads[req.params.id];
    }
  });
});

// Helper function to parse formats
function parseFormats(output) {
  const lines = output.split('\n');
  const formats = [];
  let inFormatTable = false;

  for (const line of lines) {
    if (line.includes('ID  EXT')) {
      inFormatTable = true;
      continue;
    }
    if (!inFormatTable) continue;
    if (line.trim() === '') break;

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

const PORT = 3000;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});