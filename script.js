const INSTANCES = [
    'https://invidious.projectsegfau.lt',
    'https://invidious.slipfox.xyz',
    'https://iv.melmac.space',
    'https://invidious.privacydev.net',
    'https://vid.puffyan.us'
];

let currentInstance = INSTANCES[0];
let currentVideos = [];
let currentFilters = {
    uploadDate: '',
    type: [],
    duration: '',
    sort: 'relevance'
};

// APIエンドポイント
const endpoints = {
    trending: '/api/v1/trending',
    popular: '/api/v1/popular',
    search: '/api/v1/search',
    video: '/api/v1/videos',
    comments: '/api/v1/comments',
    channel: '/api/v1/channels'
};

// インスタンスの可用性チェック
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

// API呼び出し
async function fetchAPI(endpoint, params = {}) {
    const queryString = new URLSearchParams({
        region: 'JP',
        ...params
    }).toString();
    
    try {
        const response = await fetch(`${currentInstance}${endpoint}?${queryString}`);
        if (!response.ok) throw new Error('API request failed');
        const data = await response.json();
        if (Array.isArray(data) || data.videoId) {
            return data;
        }
        throw new Error('Invalid response format');
    } catch (error) {
        console.error('API Error:', error);
        const currentIndex = INSTANCES.indexOf(currentInstance);
        if (currentIndex < INSTANCES.length - 1) {
            currentInstance = INSTANCES[currentIndex + 1];
            console.log('Switching to instance:', currentInstance);
            return fetchAPI(endpoint, params);
        }
        return null;
    }
}

// 動画の検索
async function searchVideos(query) {
    showLoading(true);
    try {
        const videos = await fetchAPI(endpoints.search, {
            q: query,
            ...currentFilters
        });
        currentVideos = videos || [];
        return videos;
    } finally {
        showLoading(false);
    }
}

// カテゴリー別の動画取得
async function getCategoryVideos(category, type = '') {
    showLoading(true);
    try {
        let endpoint = endpoints.trending;
        const params = {};
        
        switch (category) {
            case 'popular':
                endpoint = endpoints.popular;
                break;
            case 'music':
            case 'gaming':
            case 'news':
            case 'sports':
                params.type = category;
                break;
        }
        
        const videos = await fetchAPI(endpoint, params);
        currentVideos = videos || [];
        return videos;
    } finally {
        showLoading(false);
    }
}

// 動画の詳細情報を取得
async function getVideoDetails(videoId) {
    try {
        return await fetchAPI(`${endpoints.video}/${videoId}`);
    } catch (error) {
        console.error('動画詳細の取得エラー:', error);
        return null;
    }
}

// コメントの取得
async function getVideoComments(videoId) {
    try {
        return await fetchAPI(`${endpoints.comments}/${videoId}`);
    } catch (error) {
        console.error('コメントの取得エラー:', error);
        return [];
    }
}

// 関連動画の取得
async function getRelatedVideos(videoId) {
    try {
        const video = await getVideoDetails(videoId);
        if (!video) return [];
        
        // チャンネルの他の動画やタグベースでの検索
        const searchQueries = [
            video.author,
            ...video.keywords || []
        ];
        
        const relatedVideos = await Promise.all(
            searchQueries.map(query => searchVideos(query))
        );
        
        return relatedVideos.flat()
            .filter(v => v.videoId !== videoId)
            .slice(0, 12);
    } catch (error) {
        console.error('関連動画の取得エラー:', error);
        return [];
    }
}

// 動画カードの作成
function createVideoCard(video, isRelated = false) {
    const videoCard = document.createElement('div');
    videoCard.className = 'video-card';
    
    // サムネイルURLの修正
    const thumbnail = video.videoThumbnails?.find(t => 
        t.quality === 'medium' && t.url && !t.url.includes('undefined')
    )?.url;
    
    const defaultThumbnail = `${currentInstance}/vi/${video.videoId}/mqdefault.jpg`;
    const thumbnailUrl = thumbnail || defaultThumbnail;
    
    // チャンネルアイコンURLの修正
    const authorThumbnail = video.authorThumbnails?.[0]?.url;
    const defaultAuthorThumbnail = 'https://via.placeholder.com/36';
    const authorThumbnailUrl = authorThumbnail 
        ? (authorThumbnail.startsWith('http') ? authorThumbnail : `${currentInstance}${authorThumbnail}`)
        : defaultAuthorThumbnail;
    
    const duration = formatDuration(video.lengthSeconds);
    
    videoCard.innerHTML = `
        <div class="video-thumbnail">
            <img src="${thumbnailUrl}" alt="${video.title}" loading="lazy" onerror="this.src='${defaultThumbnail}'">
            ${duration ? `<span class="video-duration">${duration}</span>` : ''}
        </div>
        <div class="video-info">
            <div class="channel-avatar">
                <img src="${authorThumbnailUrl}" alt="${video.author}" onerror="this.src='${defaultAuthorThumbnail}'">
            </div>
            <div class="video-details">
                <h3 class="video-title">${video.title}</h3>
                <div class="video-meta">
                    <span>${video.author}</span>
                    <span>${formatViewCount(video.viewCount)} 回視聴</span>
                    <span>${formatPublishedTime(video.publishedText)}</span>
                </div>
            </div>
        </div>
    `;
    
    videoCard.addEventListener('click', () => {
        showVideoModal(video);
    });
    
    return videoCard;
}

// 動画モーダルの表示
async function showVideoModal(video) {
    const modal = document.getElementById('videoModal');
    const modalTitle = document.getElementById('modalTitle');
    const videoPlayer = document.getElementById('videoPlayer');
    const videoDetails = await getVideoDetails(video.videoId);
    
    // 動画プレーヤーの設定
    modalTitle.textContent = video.title;
    videoPlayer.innerHTML = `
        <iframe src="${currentInstance}/embed/${video.videoId}?autoplay=1"
                allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture"
                allowfullscreen></iframe>
    `;
    
    // 動画情報の表示
    document.querySelector('.video-title').textContent = video.title;
    document.querySelector('.video-meta-stats').innerHTML = `
        ${formatViewCount(video.viewCount)} 回視聴 • ${formatPublishedTime(video.publishedText)}
    `;
    
    // チャンネル情報の表示
    const channelAvatar = document.querySelector('.channel-info .channel-avatar img');
    const channelName = document.querySelector('.channel-info .channel-name');
    const subscriberCount = document.querySelector('.channel-info .subscriber-count');
    
    channelAvatar.src = `${currentInstance}/ggpht${video.authorThumbnails?.[0]?.url?.split('ggpht')[1] || ''}`;
    channelName.textContent = video.author;
    subscriberCount.textContent = videoDetails?.subCountText || '';
    
    // 動画の説明
    document.querySelector('.video-description').innerHTML = 
        video.description?.replace(/\n/g, '<br>') || '説明はありません。';
    
    // コメントの読み込み
    const comments = await getVideoComments(video.videoId);
    renderComments(comments);
    
    // 関連動画の読み込み
    const relatedVideos = await getRelatedVideos(video.videoId);
    renderRelatedVideos(relatedVideos);
    
    modal.style.display = 'block';
}

// コメントの表示
function renderComments(comments) {
    const container = document.getElementById('comments-container');
    container.innerHTML = '';
    
    if (!comments || comments.length === 0) {
        container.innerHTML = '<p>コメントはありません。</p>';
        return;
    }
    
    comments.forEach(comment => {
        const commentElement = document.createElement('div');
        commentElement.className = 'comment';
        commentElement.innerHTML = `
            <div class="comment-header">
                <img src="${comment.authorThumbnails?.[0]?.url || ''}" 
                     alt="${comment.author}" 
                     class="comment-avatar"
                     onerror="this.src='https://via.placeholder.com/32'">
                <div class="comment-meta">
                    <span class="comment-author">${comment.author}</span>
                    <span class="comment-time">${comment.publishedText}</span>
                </div>
            </div>
            <div class="comment-content">${comment.content}</div>
            <div class="comment-actions">
                <button><i class="fas fa-thumbs-up"></i> ${formatCount(comment.likeCount)}</button>
                <button><i class="fas fa-thumbs-down"></i></button>
                <button>返信</button>
            </div>
        `;
        container.appendChild(commentElement);
    });
}

// 関連動画の表示
function renderRelatedVideos(videos) {
    const container = document.getElementById('relatedVideosContainer');
    container.innerHTML = '';
    videos.forEach(video => {
        container.appendChild(createVideoCard(video, true));
    });
}

// フィルターの適用
function applyFilters(videos) {
    let filteredVideos = [...videos];
    
    // アップロード日でフィルター
    if (currentFilters.uploadDate) {
        const now = new Date();
        const timeLimit = {
            hour: 3600000,
            today: 86400000,
            week: 604800000,
            month: 2592000000,
            year: 31536000000
        }[currentFilters.uploadDate];
        
        filteredVideos = filteredVideos.filter(video => {
            const publishDate = new Date(video.published * 1000);
            return now - publishDate <= timeLimit;
        });
    }
    
    // 動画の種類でフィルター
    if (currentFilters.type.length > 0) {
        filteredVideos = filteredVideos.filter(video => 
            currentFilters.type.includes(video.type)
        );
    }
    
    // 長さでフィルター
    if (currentFilters.duration) {
        filteredVideos = filteredVideos.filter(video => {
            const duration = video.lengthSeconds;
            switch (currentFilters.duration) {
                case 'short': return duration <= 240;
                case 'medium': return duration > 240 && duration <= 1200;
                case 'long': return duration > 1200;
                default: return true;
            }
        });
    }
    
    // ソート
    switch (currentFilters.sort) {
        case 'date':
            filteredVideos.sort((a, b) => b.published - a.published);
            break;
        case 'rating':
            filteredVideos.sort((a, b) => (b.likeCount || 0) - (a.likeCount || 0));
            break;
        case 'views':
            filteredVideos.sort((a, b) => (b.viewCount || 0) - (a.viewCount || 0));
            break;
    }
    
    return filteredVideos;
}

// 動画の表示
function renderVideos(videos) {
    const container = document.getElementById('videoContainer');
    container.innerHTML = '';
    
    if (!videos || videos.length === 0) {
        container.innerHTML = '<p style="text-align: center; padding: 20px;">動画が見つかりませんでした。</p>';
        return;
    }
    
    videos.forEach(video => {
        container.appendChild(createVideoCard(video));
    });
}

// ユーティリティ関数
function formatDuration(seconds) {
    if (!seconds) return '';
    
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const remainingSeconds = seconds % 60;
    
    if (hours > 0) {
        return `${hours}:${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
    }
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
}

function formatViewCount(count) {
    if (!count) return '0';
    
    if (count >= 10000) {
        return `${Math.floor(count / 10000)}万`;
    } else if (count >= 1000) {
        return `${Math.floor(count / 1000)}千`;
    }
    return count.toString();
}

function formatCount(count) {
    if (!count) return '0';
    if (count >= 10000) return `${(count / 10000).toFixed(1)}万`;
    if (count >= 1000) return `${(count / 1000).toFixed(1)}千`;
    return count.toString();
}

function formatPublishedTime(publishedText) {
    return publishedText || '';
}

// ローディング表示の制御
function showLoading(show) {
    const loading = document.getElementById('loading');
    loading.classList.toggle('active', show);
}

// イベントリスナーの設定
document.addEventListener('DOMContentLoaded', () => {
    // サイドバーの開閉
    const menuToggle = document.getElementById('menuToggle');
    const sidebar = document.getElementById('sidebar');
    menuToggle.addEventListener('click', () => {
        sidebar.classList.toggle('open');
    });
    
    // テーマの切り替え
    const savedTheme = localStorage.getItem('theme') || 'light';
    document.body.setAttribute('data-theme', savedTheme);
    
    document.getElementById('themeToggle').addEventListener('click', () => {
        const isDark = document.body.getAttribute('data-theme') === 'dark';
        const newTheme = isDark ? 'light' : 'dark';
        document.body.setAttribute('data-theme', newTheme);
        localStorage.setItem('theme', newTheme);
    });
    
    // 検索機能
    const searchForm = document.querySelector('.search-form');
    const searchInput = document.getElementById('search');
    
    searchForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const query = searchInput.value.trim();
        if (query) {
            const videos = await searchVideos(query);
            renderVideos(applyFilters(videos));
        }
    });
    
    // フィルターの設定
    const filterDropdown = document.getElementById('filterDropdown');
    document.getElementById('filterButton').addEventListener('click', () => {
        filterDropdown.style.display = 
            filterDropdown.style.display === 'none' ? 'block' : 'none';
    });
    
    // フィルターの変更イベント
    document.querySelectorAll('.filter-section input').forEach(input => {
        input.addEventListener('change', () => {
            if (input.type === 'radio') {
                currentFilters[input.name] = input.value;
            } else if (input.type === 'checkbox') {
                const index = currentFilters.type.indexOf(input.value);
                if (input.checked && index === -1) {
                    currentFilters.type.push(input.value);
                } else if (!input.checked && index !== -1) {
                    currentFilters.type.splice(index, 1);
                }
            }
            renderVideos(applyFilters(currentVideos));
        });
    });
    
    // カテゴリーチップの選択
    document.querySelectorAll('.chip').forEach(chip => {
        chip.addEventListener('click', async () => {
            document.querySelector('.chip.active').classList.remove('active');
            chip.classList.add('active');
            const videos = await getCategoryVideos(chip.textContent.toLowerCase());
            renderVideos(applyFilters(videos));
        });
    });
    
    // サイドバーのナビゲーション
    document.querySelectorAll('.nav-item').forEach(item => {
        item.addEventListener('click', async () => {
            document.querySelector('.nav-item.active').classList.remove('active');
            item.classList.add('active');
            const category = item.dataset.page;
            const videos = await getCategoryVideos(category);
            renderVideos(applyFilters(videos));
        });
    });
    
    // モーダルを閉じる
    document.querySelector('.close').addEventListener('click', () => {
        const modal = document.getElementById('videoModal');
        modal.style.display = 'none';
        document.getElementById('videoPlayer').innerHTML = '';
    });
    
    window.addEventListener('click', (event) => {
        const modal = document.getElementById('videoModal');
        if (event.target === modal) {
            modal.style.display = 'none';
            document.getElementById('videoPlayer').innerHTML = '';
        }
    });
    
    // アプリケーションの初期化
    init();
});

// アプリケーションの初期化
async function init() {
    if (await findWorkingInstance()) {
        const videos = await getCategoryVideos('trending');
        renderVideos(applyFilters(videos));
    } else {
        alert('申し訳ありませんが、現在利用可能なサーバーが見つかりません。');
    }
}
