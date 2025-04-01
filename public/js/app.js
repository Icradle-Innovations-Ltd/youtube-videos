// DOM Elements
const elements = {
    youtubeUrl: document.getElementById('youtubeUrl'),
    fetchBtn: document.getElementById('fetchBtn'),
    formatSelection: document.getElementById('formatSelection'),
    videoFormats: document.getElementById('videoFormats'),
    downloadBtn: document.getElementById('downloadBtn'),
    progressContainer: document.getElementById('progressContainer'),
    progressFill: document.getElementById('progressFill'),
    progressText: document.getElementById('progressText'),
    statusMessage: document.getElementById('statusMessage'),
    cancelBtn: document.getElementById('cancelBtn')
  };
  
  // State
  let currentDownloadId = null;
  let selectedFormat = null;
  let selectedType = null;
  let progressInterval = null;
  
  // Event Listeners
  elements.fetchBtn.addEventListener('click', fetchFormats);
  elements.downloadBtn.addEventListener('click', startDownload);
  elements.cancelBtn.addEventListener('click', cancelDownload);
  
  // Main Functions
  async function fetchFormats() {
    const url = elements.youtubeUrl.value.trim();
    if (!url) return showError('Please enter a YouTube URL');
  
    showStatus('Fetching available formats...');
    toggleLoadingState(true);
    
    try {
      const response = await fetch('/api/get-formats', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url })
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to fetch formats');
      }
      
      const data = await response.json();
      displayFormats(data.formats);
      elements.formatSelection.classList.remove('hidden');
      clearStatus();
    } catch (error) {
      showError(error.message);
    } finally {
      toggleLoadingState(false);
    }
  }
  
  function displayFormats(formats) {
    elements.videoFormats.innerHTML = '';
    
    // Filter and group video formats
    const videoFormats = formats.filter(f => !f.note.includes('audio only'));
    const formatGroups = {};
    
    videoFormats.forEach(format => {
      const resolution = format.resolution || 'Unknown';
      if (!formatGroups[resolution]) formatGroups[resolution] = [];
      formatGroups[resolution].push(format);
    });
    
    // Create format buttons
    Object.entries(formatGroups).forEach(([resolution, formats]) => {
      const btn = document.createElement('button');
      btn.className = 'format-btn';
      btn.textContent = `${resolution} (${formats[0].ext})`;
      btn.dataset.format = formats[0].id;
      btn.dataset.type = 'mp4';
      
      btn.addEventListener('click', () => {
        document.querySelectorAll('.format-btn').forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
        selectedFormat = btn.dataset.format;
        selectedType = btn.dataset.type;
        elements.downloadBtn.classList.remove('hidden');
      });
      
      elements.videoFormats.appendChild(btn);
    });
    
    // MP3 button
    document.querySelector('.mp3-btn').addEventListener('click', function() {
      document.querySelectorAll('.format-btn').forEach(b => b.classList.remove('selected'));
      this.classList.add('selected');
      selectedFormat = null;
      selectedType = 'mp3';
      elements.downloadBtn.classList.remove('hidden');
    });
  }
  
  async function startDownload() {
    const url = elements.youtubeUrl.value.trim();
    if (!url) return showError('Please enter a YouTube URL');
  
    showStatus('Starting download...');
    toggleDownloadState(true);
    
    try {
      const response = await fetch('/api/download', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, format: selectedFormat, type: selectedType })
      });
      
      const data = await response.json();
      if (data.error) throw new Error(data.error);
      
      currentDownloadId = data.downloadId;
      monitorProgress();
    } catch (error) {
      showError(error.message);
      resetDownloadState();
    }
  }
  
  function monitorProgress() {
    clearInterval(progressInterval);
    
    progressInterval = setInterval(async () => {
      try {
        const response = await fetch(`/api/progress/${currentDownloadId}`);
        const data = await response.json();
        
        if (data.error) {
          clearInterval(progressInterval);
          showError(data.error);
          resetDownloadState();
          return;
        }
        
        updateProgress(data.progress);
        
        if (data.filename || data.progress >= 100) {
          clearInterval(progressInterval);
          completeDownload(data.filename);
        }
      } catch (error) {
        clearInterval(progressInterval);
        showError('Progress update failed');
        resetDownloadState();
      }
    }, 800);
  }
  
  function updateProgress(progress) {
    const percent = Math.round(progress || 0);
    elements.progressFill.style.width = `${percent}%`;
    elements.progressText.textContent = `Downloading: ${percent}%`;
    
    if (percent > 0 && percent < 100) {
      elements.cancelBtn.classList.remove('hidden');
    }
  }
  
  async function completeDownload(filename) {
    try {
      showSuccess('Preparing your download...');
      
      // Trigger download
      const a = document.createElement('a');
      a.href = `/api/download-file/${currentDownloadId}`;
      a.download = filename || 'video.mp4';
      document.body.appendChild(a);
      a.click();
      
      // Clean up
      setTimeout(() => {
        document.body.removeChild(a);
        showSuccess('Download completed!');
        resetDownloadState();
      }, 2000);
      
    } catch (error) {
      showError('Failed to complete download');
      resetDownloadState();
    }
  }
  
  async function cancelDownload() {
    if (!currentDownloadId) return;
    
    try {
      showStatus('Cancelling download...');
      clearInterval(progressInterval);
      await fetch(`/api/cancel-download/${currentDownloadId}`, { method: 'POST' });
      showError('Download cancelled');
    } catch (error) {
      showError('Failed to cancel download');
    } finally {
      resetDownloadState();
    }
  }
  
  // Helper Functions
  function toggleLoadingState(isLoading) {
    elements.fetchBtn.disabled = isLoading;
    elements.fetchBtn.innerHTML = isLoading 
      ? '<span class="spinner"></span> Processing...' 
      : 'Get Formats';
  }
  
  function toggleDownloadState(isDownloading) {
    elements.downloadBtn.disabled = isDownloading;
    elements.progressContainer.classList.toggle('hidden', !isDownloading);
    elements.youtubeUrl.disabled = isDownloading;
    elements.fetchBtn.disabled = isDownloading;
    elements.cancelBtn.classList.add('hidden');
  }
  
  function resetDownloadState() {
    clearInterval(progressInterval);
    currentDownloadId = null;
    toggleDownloadState(false);
  }
  
  function showStatus(message) {
    elements.statusMessage.textContent = message;
    elements.statusMessage.className = 'status';
  }
  
  function showError(message) {
    elements.statusMessage.textContent = message;
    elements.statusMessage.className = 'error';
  }
  
  function showSuccess(message) {
    elements.statusMessage.textContent = message;
    elements.statusMessage.className = 'success';
  }
  
  function clearStatus() {
    elements.statusMessage.textContent = '';
    elements.statusMessage.className = '';
  }
  
  // Clean up on page exit
  window.addEventListener('beforeunload', () => {
    if (currentDownloadId) {
      fetch(`/api/cancel-download/${currentDownloadId}`, { 
        method: 'POST',
        keepalive: true 
      });
    }
  });