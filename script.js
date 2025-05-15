const API_BASE = 'https://yewtu.be/api/v1';

// Search for videos
async function searchVideos(query) {
    const response = await fetch(`${API_BASE}/search?q=${encodeURIComponent(query)}`);
    const data = await response.json();
    return data;
}

// Render videos
function renderVideos(videos) {
    const container = document.getElementById('videoContainer');
    container.innerHTML = '';
    videos.forEach(video => {
        const videoCard = document.createElement('div');
        videoCard.className = 'video-card';
        videoCard.innerHTML = `
            <img src="${video.videoThumbnails[0].url}" alt="${video.title}">
            <h3>${video.title}</h3>
            <p>${video.author}</p>
        `;
        videoCard.addEventListener('click', () => {
            window.open(`https://yewtu.be/watch?v=${video.videoId}`, '_blank');
        });
        container.appendChild(videoCard);
    });
}

// Event listener for search
document.getElementById('searchButton').addEventListener('click', async () => {
    const query = document.getElementById('search').value;
    if (query) {
        const videos = await searchVideos(query);
        renderVideos(videos);
    }
});
