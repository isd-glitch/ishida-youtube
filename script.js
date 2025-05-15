const INSTANCES = [
    'https://yewtu.be',
    'https://invidious.snopyta.org',
    'https://invidious.kavin.rocks'
];

let currentInstance = INSTANCES[0];

// インスタンスが利用可能かチェック
async function checkInstance(instance) {
    try {
        const response = await fetch(`${instance}/api/v1/stats`);
        return response.ok;
    } catch (error) {
        return false;
    }
}

// 利用可能なインスタンスを見つける
async function findWorkingInstance() {
    for (const instance of INSTANCES) {
        if (await checkInstance(instance)) {
            currentInstance = instance;
            return true;
        }
    }
    return false;
}

// 動画を検索
async function searchVideos(query) {
    showLoading(true);
    try {
        const response = await fetch(`${currentInstance}/api/v1/search?q=${encodeURIComponent(query)}`);
        const data = await response.json();
        return data;
    } catch (error) {
        console.error('検索エラー:', error);
        return [];
    } finally {
        showLoading(false);
    }
}

// トレンド動画を取得
async function getTrendingVideos() {
    showLoading(true);
    try {
        const response = await fetch(`${currentInstance}/api/v1/trending`);
        const data = await response.json();
        return data;
    } catch (error) {
        console.error('トレンド動画の取得エラー:', error);
        return [];
    } finally {
        showLoading(false);
    }
}

// 動画の表示
function renderVideos(videos) {
    const container = document.getElementById('videoContainer');
    container.innerHTML = '<div class="loading-spinner" id="loading"><i class="fas fa-spinner fa-spin fa-2x"></i></div>';
    
    videos.forEach(video => {
        const videoCard = document.createElement('div');
        videoCard.className = 'video-card';
        
        const duration = video.lengthSeconds ? formatDuration(video.lengthSeconds) : '';
        
        videoCard.innerHTML = `
            <div class="video-thumbnail">
                <img src="${video.videoThumbnails?.[0]?.url || ''}" alt="${video.title}" loading="lazy">
            </div>
            <div class="video-info">
                <h3 class="video-title">${video.title}</h3>
                <div class="video-meta">
                    <span class="video-author">${video.author}</span>
                    <span class="video-duration">${duration}</span>
                </div>
            </div>
        `;
        
        videoCard.addEventListener('click', () => {
            window.open(`${currentInstance}/watch?v=${video.videoId}`, '_blank');
        });
        
        container.appendChild(videoCard);
    });
}

// 時間のフォーマット
function formatDuration(seconds) {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const remainingSeconds = seconds % 60;
    
    if (hours > 0) {
        return `${hours}:${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
    }
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
}

// ローディング表示の制御
function showLoading(show) {
    const loading = document.getElementById('loading');
    if (show) {
        loading.classList.add('active');
    } else {
        loading.classList.remove('active');
    }
}

// イベントリスナーの設定
document.getElementById('searchButton').addEventListener('click', async () => {
    const query = document.getElementById('search').value;
    if (query) {
        const videos = await searchVideos(query);
        renderVideos(videos);
    }
});

document.getElementById('search').addEventListener('keypress', async (e) => {
    if (e.key === 'Enter') {
        const query = e.target.value;
        if (query) {
            const videos = await searchVideos(query);
            renderVideos(videos);
        }
    }
});

// 初期化
async function init() {
    if (await findWorkingInstance()) {
        const trendingVideos = await getTrendingVideos();
        renderVideos(trendingVideos);
    } else {
        alert('申し訳ありませんが、現在利用可能なサーバーが見つかりません。');
    }
}

// アプリケーションの開始
init();
