const INSTANCES = [
    'https://y.com.sb',
    'https://invidious.nerdvpn.de',
    'https://inv.vern.cc',
    'https://invidious.protokolla.fi',
    'https://yt.artemislena.eu'
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
    try {
        const queryString = new URLSearchParams({
            ...params
        }).toString();
        
        const response = await fetch(`${currentInstance}${endpoint}${queryString ? '?' + queryString : ''}`);
        if (!response.ok) throw new Error('API request failed');
        return await response.json();
    } catch (error) {
        console.error('API Error:', error);
        // 別のインスタンスを試す
        const currentIndex = INSTANCES.indexOf(currentInstance);
        if (currentIndex < INSTANCES.length - 1) {
            currentInstance = INSTANCES[currentIndex + 1];
            console.log('Switching to instance:', currentInstance);
            return fetchAPI(endpoint, params);
        }
        throw error;
    }
}

// 動画の検索
async function searchVideos(query) {
    showLoading(true);
    try {
        const videos = await fetchAPI('/api/v1/search', {
            q: query,
            type: 'video',
            region: 'JP'
        });
        return Array.isArray(videos) ? videos : [];
    } catch (error) {
        console.error('検索エラー:', error);
        return [];
    } finally {
        showLoading(false);
    }
}

// カテゴリー別の動画取得
async function getCategoryVideos(category) {
    showLoading(true);
    try {
        let endpoint = '/api/v1/trending';
        const params = { region: 'JP' };
        
        switch (category) {
            case 'music':
                params.type = 'Music';
                break;
            case 'gaming':
                params.type = 'Gaming';
                break;
            case 'news':
                params.type = 'News';
                break;
            case 'sports':
                params.type = 'Sports';
                break;
        }
        
        const videos = await fetchAPI(endpoint, params);
        return Array.isArray(videos) ? videos : [];
    } catch (error) {
        console.error('カテゴリー動画の取得エラー:', error);
        return [];
    } finally {
        showLoading(false);
    }
}

// 動画の詳細情報を取得
async function getVideoDetails(videoId) {
    try {
        const response = await fetch(`${currentInstance}/api/v1/videos/${videoId}`);
        if (!response.ok) {
            throw new Error('動画の詳細を取得できませんでした');
        }
        return await response.json();
    } catch (error) {
        console.error('動画の詳細の取得中にエラーが発生しました:', error);
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

// 動画のサムネイルURLを取得
function getThumbnailUrl(video) {
    if (!video || !video.videoId) return '';
    return `${currentInstance}/vi/${video.videoId}/maxresdefault.jpg`;
}

// 動画カードの作成
function createVideoCard(video, isRelated = false) {
    const videoCard = document.createElement('div');
    videoCard.className = 'video-card';
    
    const thumbnailUrl = getThumbnailUrl(video);
    const duration = formatDuration(video.lengthSeconds);
    
    videoCard.innerHTML = `
        <div class="video-thumbnail">
            <img src="${thumbnailUrl}" alt="${video.title}" loading="lazy" 
                 onerror="this.src='${currentInstance}/vi/${video.videoId}/mqdefault.jpg'">
            ${duration ? `<span class="video-duration">${duration}</span>` : ''}
        </div>
        <div class="video-info">
            <div class="channel-avatar">
                <img src="${currentInstance}/ggpht/avatar/${video.authorId}" 
                     alt="${video.author}" 
                     onerror="this.src='https://via.placeholder.com/36'">
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
    
    // プレーヤーコントロールを含むコンテナを作成
    const playerContainer = document.createElement('div');
    playerContainer.className = 'player-container';
    
    // 動画の利用可能なフォーマットを取得
    const formats = videoDetails.formatStreams || [];
    const audioFormats = videoDetails.adaptiveFormats?.filter(f => f.type.startsWith('audio/')) || [];
    
    // プレーヤーのHTML構造
    playerContainer.innerHTML = `
        <div class="video-wrapper">
            <iframe src="${currentInstance}/embed/${video.videoId}?quality=hd720"
                    id="videoFrame"
                    allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture"
                    allowfullscreen></iframe>
        </div>
        <div class="player-controls">
            <div class="quality-control">
                <select id="qualitySelect">
                    ${formats.map(format => `
                        <option value="${format.itag}" 
                                data-url="${format.url}"
                                ${format.qualityLabel === '720p' ? 'selected' : ''}>
                            ${format.qualityLabel}
                        </option>
                    `).join('')}
                </select>
            </div>
            <div class="playback-control">
                <select id="playbackSpeed">
                    <option value="0.25">0.25x</option>
                    <option value="0.5">0.5x</option>
                    <option value="0.75">0.75x</option>
                    <option value="1" selected>1x</option>
                    <option value="1.25">1.25x</option>
                    <option value="1.5">1.5x</option>
                    <option value="2">2x</option>
                </select>
            </div>
            <div class="download-control">
                <select id="downloadFormat">
                    <option value="">動画をダウンロード...</option>
                    ${formats.map(format => `
                        <option value="${format.url}" data-quality="${format.qualityLabel}">
                            ${format.qualityLabel} (${format.container})
                        </option>
                    `).join('')}
                    ${audioFormats.map(format => `
                        <option value="${format.url}">
                            音声のみ (${format.container})
                        </option>
                    `).join('')}
                </select>
            </div>
            <button id="pipButton" title="ピクチャーインピクチャーモード">
                <i class="fas fa-external-link-alt"></i>
            </button>
        </div>
    `;
    
    videoPlayer.innerHTML = '';
    videoPlayer.appendChild(playerContainer);
    
    // イベントリスナーの設定
    const qualitySelect = document.getElementById('qualitySelect');
    const playbackSpeed = document.getElementById('playbackSpeed');
    const downloadFormat = document.getElementById('downloadFormat');
    const pipButton = document.getElementById('pipButton');
    const videoFrame = document.getElementById('videoFrame');
    
    qualitySelect.addEventListener('change', (e) => {
        const selectedOption = e.target.options[e.target.selectedIndex];
        const url = selectedOption.dataset.url;
        videoFrame.src = `${currentInstance}/embed/${video.videoId}?quality=${e.target.value}`;
    });
    
    playbackSpeed.addEventListener('change', (e) => {
        const speed = e.target.value;
        videoFrame.contentWindow.postMessage(
            { type: 'setPlaybackSpeed', speed: parseFloat(speed) },
            '*'
        );
    });
    
    downloadFormat.addEventListener('change', async (e) => {
        const url = e.target.value;
        if (!url) return;
        
        const quality = e.target.options[e.target.selectedIndex].dataset.quality;
        const ext = url.split('.').pop().split('?')[0];
        const filename = `${video.title}-${quality || 'audio'}.${ext}`;
        
        // ダウンロードリンクを作成
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        
        // 選択をリセット
        e.target.value = '';
    });
    
    pipButton.addEventListener('click', () => {
        if (document.pictureInPictureElement) {
            document.exitPictureInPicture();
        } else if (document.pictureInPictureEnabled) {
            videoFrame.requestPictureInPicture();
        }
    });
    
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
    try {
        const videos = await getCategoryVideos('trending');
        if (videos && videos.length > 0) {
            renderVideos(videos);
        } else {
            document.getElementById('videoContainer').innerHTML = 
                '<p style="text-align: center; padding: 20px;">動画を読み込めませんでした。</p>';
        }
    } catch (error) {
        console.error('初期化エラー:', error);
        document.getElementById('videoContainer').innerHTML = 
            '<p style="text-align: center; padding: 20px;">サーバーに接続できません。</p>';
    }
}
