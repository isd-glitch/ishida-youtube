const INVIDIOUS_INSTANCES = [
    'https://invidious.projectsegfau.lt',
    'https://iv.nboeck.de',
    'https://invidious.private.coffee',
    'https://invidious.slipfox.xyz',
    'https://yt.artemislena.eu',
    'https://invidious.dhusch.de'
];

let currentInstance = INVIDIOUS_INSTANCES[0];
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

// インスタンスの可用性をチェックし、利用可能なインスタンスに切り替える
async function switchToWorkingInstance() {
    for (const instance of INVIDIOUS_INSTANCES) {
        try {
            const response = await fetch(`${instance}/api/v1/stats`);
            if (response.ok) {
                currentInstance = instance;
                console.log(`使用するインスタンス: ${instance}`);
                return true;
            }
        } catch (error) {
            console.log(`インスタンス ${instance} は利用できません`);
        }
    }
    return false;
}

// API呼び出しの改善
async function fetchAPI(endpoint, params = {}) {
    for (let i = 0; i < INVIDIOUS_INSTANCES.length; i++) {
        try {
            const instance = INVIDIOUS_INSTANCES[i];
            const queryString = new URLSearchParams(params).toString();
            const url = `${instance}${endpoint}${queryString ? '?' + queryString : ''}`;
            
            const response = await fetch(url);
            if (!response.ok) throw new Error('API request failed');
            
            currentInstance = instance; // 成功したインスタンスを記録
            return await response.json();
        } catch (error) {
            console.error(`インスタンス ${INVIDIOUS_INSTANCES[i]} でエラー:`, error);
            if (i === INVIDIOUS_INSTANCES.length - 1) {
                throw error; // 全てのインスタンスで失敗
            }
        }
    }
}

// 検索機能の改善
async function searchVideos(query, params = {}) {
    try {
        const searchParams = {
            q: query,
            region: 'JP',
            type: 'video',
            ...params
        };
        
        const results = await fetchAPI('/api/v1/search', searchParams);
        return Array.isArray(results) ? results : [];
    } catch (error) {
        console.error('検索エラー:', error);
        return [];
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
            throw new Error('動画の取得に失敗しました');
        }
        return await response.json();
    } catch (error) {
        console.error('動画データの取得エラー:', error);
        throw error;
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

// サムネイル取得の改善
function getVideoThumbnail(videoId, quality = 'maxresdefault') {
    const qualities = ['maxresdefault', 'sddefault', 'hqdefault', 'mqdefault', 'default'];
    const img = document.createElement('img');
    let currentQualityIndex = qualities.indexOf(quality);

    return new Promise((resolve) => {
        img.onload = () => {
            // 画像が正常にロードされた場合
            if (img.naturalWidth > 120) {
                resolve(img.src);
            } else if (currentQualityIndex < qualities.length - 1) {
                // 次の品質を試す
                currentQualityIndex++;
                img.src = `${currentInstance}/vi/${videoId}/${qualities[currentQualityIndex]}.jpg`;
            } else {
                // デフォルトのサムネイルを使用
                resolve(`${currentInstance}/vi/${videoId}/hqdefault.jpg`);
            }
        };

        img.onerror = () => {
            if (currentQualityIndex < qualities.length - 1) {
                // エラーの場合、次の品質を試す
                currentQualityIndex++;
                img.src = `${currentInstance}/vi/${videoId}/${qualities[currentQualityIndex]}.jpg`;
            } else {
                // デフォルトのサムネイルを使用
                resolve(`${currentInstance}/vi/${videoId}/hqdefault.jpg`);
            }
        };

        img.src = `${currentInstance}/vi/${videoId}/${quality}.jpg`;
    });
}

// 動画カードの生成を改善
async function createVideoCard(video) {
    const card = document.createElement('div');
    card.className = 'video-card';
    
    // サムネイルを非同期で取得
    const thumbnailUrl = await getVideoThumbnail(video.videoId);
    
    card.innerHTML = `
        <div class="thumbnail-wrapper">
            <img class="thumbnail" 
                 src="${thumbnailUrl}" 
                 alt="${video.title}"
                 loading="lazy">
            <span class="video-duration">${formatDuration(video.lengthSeconds)}</span>
        </div>
        <div class="video-info">
            <div class="channel-avatar">
                <img src="${video.authorThumbnails?.[0]?.url || ''}" 
                     alt="${video.author}"
                     onerror="this.src='https://via.placeholder.com/36'">
            </div>
            <div class="video-details">
                <h3 class="video-title">${video.title}</h3>
                <p class="channel-name">${video.author}</p>
                <div class="video-meta">
                    <span>${formatViewCount(video.viewCount)}回視聴</span>
                    <span>•</span>
                    <span>${formatPublishedDate(video.published)}</span>
                </div>
            </div>
        </div>
    `;

    card.addEventListener('click', () => {
        router.navigate(`${window.location.origin}/watch`, { v: video.videoId });
    });

    return card;
}

// 動画モーダルの表示
async function showVideoModal(video) {
    const modal = document.getElementById('videoModal');
    const modalTitle = document.getElementById('modalTitle');
    const videoPlayer = document.getElementById('videoPlayer');
    
    try {
        showLoadingOverlay();
        const videoDetails = await getVideoDetails(video.videoId);
        
        modalTitle.textContent = video.title;
        document.title = `${video.title} - ようつべ`;

        // プレーヤーの設定
        videoPlayer.innerHTML = `
            <iframe
                src="${currentInstance}/embed/${video.videoId}?autoplay=1"
                width="100%"
                height="100%"
                frameborder="0"
                allowfullscreen
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            ></iframe>
        `;

        // 動画情報の更新
        updateVideoInfo(video, videoDetails);
        
        // コメントと関連動画の読み込み
        await Promise.all([
            loadComments(video.videoId),
            loadRelatedVideos(video.videoId)
        ]);

        modal.style.display = 'block';
    } catch (error) {
        console.error('動画の読み込みに失敗しました:', error);
        alert('動画を読み込めませんでした。');
    } finally {
        hideLoadingOverlay();
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
    
    // 視聴履歴に追加
    userPrefs.addToWatchHistory(video);
    
    // 関連動画の取得と表示を更新
    const recommendations = await userPrefs.getRecommendations();
    renderRelatedVideos(recommendations);
    
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
    if (!seconds) return '0:00';
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    
    if (hours > 0) {
        return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${minutes}:${secs.toString().padStart(2, '0')}`;
}

function formatViews(views) {
    if (views >= 1000000000) {
        return `${Math.floor(views / 100000000) / 10}B`;
    }
    if (views >= 1000000) {
        return `${Math.floor(views / 100000) / 10}M`;
    }
    if (views >= 1000) {
        return `${Math.floor(views / 100) / 10}K`;
    }
    return views.toString();
}

function formatDate(dateString) {
    const date = new Date(dateString);
    const now = new Date();
    const diff = now - date;
    
    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    const months = Math.floor(days / 30);
    const years = Math.floor(days / 365);

    if (years > 0) return `${years}年前`;
    if (months > 0) return `${months}ヶ月前`;
    if (days > 0) return `${days}日前`;
    if (hours > 0) return `${hours}時間前`;
    if (minutes > 0) return `${minutes}分前`;
    return '数秒前';
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
            handleSearch(query);
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
    setupSearchForm();
    setupFilters();
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

// ユーザーの検索履歴とおすすめ情報を管理するクラス
class UserPreferences {
    constructor() {
        this.searchHistory = this.getFromStorage('searchHistory') || [];
        this.watchHistory = this.getFromStorage('watchHistory') || [];
        this.preferences = this.getFromStorage('preferences') || {
            categories: {},
            tags: {},
            channels: {}
        };
    }

    // ローカルストレージから情報を取得
    getFromStorage(key) {
        const data = localStorage.getItem(`youtubeclone_${key}`);
        return data ? JSON.parse(data) : null;
    }

    // ローカルストレージに情報を保存
    saveToStorage(key, data) {
        localStorage.setItem(`youtubeclone_${key}`, JSON.stringify(data));
    }

    // 検索クエリを履歴に追加
    addSearchQuery(query) {
        this.searchHistory.unshift(query);
        if (this.searchHistory.length > 100) {
            this.searchHistory.pop();
        }
        this.saveToStorage('searchHistory', this.searchHistory);
    }

    // 視聴した動画を履歴に追加
    addToWatchHistory(video) {
        const now = new Date().toISOString();
        this.watchHistory.unshift({
            videoId: video.videoId,
            title: video.title,
            timestamp: now,
            tags: video.tags || [],
            category: video.category
        });

        // カテゴリと関連タグの重みを更新
        this.updatePreferences(video);
        
        if (this.watchHistory.length > 200) {
            this.watchHistory.pop();
        }
        this.saveToStorage('watchHistory', this.watchHistory);
        this.saveToStorage('preferences', this.preferences);
    }

    // ユーザーの興味関心を更新
    updatePreferences(video) {
        // カテゴリの重みを更新
        if (video.category) {
            this.preferences.categories[video.category] = 
                (this.preferences.categories[video.category] || 0) + 1;
        }

        // タグの重みを更新
        if (video.tags) {
            video.tags.forEach(tag => {
                this.preferences.tags[tag] = 
                    (this.preferences.tags[tag] || 0) + 1;
            });
        }

        // チャンネルの重みを更新
        if (video.channelId) {
            this.preferences.channels[video.channelId] = 
                (this.preferences.channels[video.channelId] || 0) + 1;
        }
    }

    // おすすめ動画のスコアを計算
    calculateVideoScore(video) {
        let score = 0;

        // カテゴリマッチ
        if (video.category && this.preferences.categories[video.category]) {
            score += this.preferences.categories[video.category] * 2;
        }

        // タグマッチ
        if (video.tags) {
            video.tags.forEach(tag => {
                if (this.preferences.tags[tag]) {
                    score += this.preferences.tags[tag];
                }
            });
        }

        // チャンネルマッチ
        if (video.channelId && this.preferences.channels[video.channelId]) {
            score += this.preferences.channels[video.channelId] * 3;
        }

        return score;
    }

    // おすすめ動画を取得
    async getRecommendations() {
        try {
            // 最近の検索クエリとカテゴリから動画を取得
            const recentQueries = this.searchHistory.slice(0, 5);
            const topCategories = Object.entries(this.preferences.categories)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 3)
                .map(([category]) => category);

            // 複数のクエリを並行して実行
            const videos = await Promise.all([
                ...recentQueries.map(query => searchVideos(query)),
                ...topCategories.map(category => getCategoryVideos(category))
            ]);

            // 結果を統合してスコアを計算
            const allVideos = videos.flat();
            const scoredVideos = allVideos.map(video => ({
                ...video,
                score: this.calculateVideoScore(video)
            }));

            // スコアで並び替えて重複を除去
            return Array.from(new Set(scoredVideos
                .sort((a, b) => b.score - a.score)
                .map(video => video.videoId)))
                .slice(0, 20);
        } catch (error) {
            console.error('おすすめ動画の取得中にエラーが発生しました:', error);
            return [];
        }
    }
}

// ユーザー設定のインスタンスを作成
const userPrefs = new UserPreferences();

// 検索機能を更新
async function handleSearch(query) {
    if (!query) return;
    
    userPrefs.addSearchQuery(query);
    const videos = await searchVideos(query);
    renderVideos(videos);
}

// ページ読み込み時におすすめを表示
window.addEventListener('DOMContentLoaded', async () => {
    try {
        const success = await switchToWorkingInstance();
        if (!success) {
            alert('申し訳ありませんが、現在サービスにアクセスできません。後でもう一度お試しください。');
        }
        const recommendations = await userPrefs.getRecommendations();
        if (recommendations.length > 0) {
            renderVideos(recommendations);
        } else {
            // 初回訪問時は人気の動画を表示
            const trendingVideos = await getCategoryVideos('trending');
            renderVideos(trendingVideos);
        }
    } catch (error) {
        console.error('初期化エラー:', error);
    }
});

// ショート動画の管理クラス
class ShortsPlayer {
    constructor() {
        this.currentShort = 0;
        this.shorts = [];
        this.isPlaying = false;
        this.container = document.querySelector('.shorts-video-container');
        this.setupEventListeners();
    }

    async loadShorts() {
        try {
            // Invidiousからショート動画を取得（lengthが60秒以下の動画をフィルタリング）
            const response = await fetch(`${currentInstance}/api/v1/trending?type=short`);
            const videos = await response.json();
            this.shorts = videos.filter(video => video.lengthSeconds <= 60);
            this.playShort(0);
        } catch (error) {
            console.error('ショート動画の読み込みに失敗しました:', error);
        }
    }

    setupEventListeners() {
        // ナビゲーションボタン
        document.querySelector('.shorts-nav.prev').addEventListener('click', () => this.previousShort());
        document.querySelector('.shorts-nav.next').addEventListener('click', () => this.nextShort());

        // キーボードナビゲーション
        document.addEventListener('keydown', (e) => {
            if (document.getElementById('shortsContent').style.display === 'none') return;
            
            if (e.key === 'ArrowUp') {
                e.preventDefault();
                this.previousShort();
            } else if (e.key === 'ArrowDown') {
                e.preventDefault();
                this.nextShort();
            }
        });

        // アクションボタン
        const actions = document.querySelectorAll('.shorts-action');
        actions.forEach(action => {
            action.addEventListener('click', (e) => {
                if (action.classList.contains('like-button')) {
                    this.handleLike();
                } else if (action.classList.contains('comment-button')) {
                    this.toggleComments();
                }
            });
        });
    }

    async playShort(index) {
        if (!this.shorts[index]) return;

        const short = this.shorts[index];
        this.currentShort = index;

        // 動画プレーヤーの更新
        this.container.innerHTML = `
            <iframe
                src="${currentInstance}/embed/${short.videoId}?autoplay=1&loop=1"
                width="100%"
                height="100%"
                frameborder="0"
                allowfullscreen
            ></iframe>
        `;

        // 情報の更新
        document.querySelector('.shorts-title').textContent = short.title;
        document.querySelector('.shorts-channel .channel-name').textContent = short.author;
        document.querySelector('.shorts-action.like-button .count').textContent = this.formatCount(short.likeCount);
        document.querySelector('.shorts-action.comment-button .count').textContent = this.formatCount(short.commentCount);
    }

    previousShort() {
        if (this.currentShort > 0) {
            this.playShort(this.currentShort - 1);
        }
    }

    nextShort() {
        if (this.currentShort < this.shorts.length - 1) {
            this.playShort(this.currentShort + 1);
        }
    }

    handleLike() {
        const likeButton = document.querySelector('.shorts-action.like-button');
        likeButton.classList.toggle('active');
    }

    toggleComments() {
        const comments = document.querySelector('.shorts-comments');
        const isHidden = comments.style.display === 'none';
        comments.style.display = isHidden ? 'block' : 'none';
        
        if (isHidden) {
            this.loadComments();
        }
    }

    async loadComments() {
        const short = this.shorts[this.currentShort];
        if (!short) return;

        try {
            const response = await fetch(`${currentInstance}/api/v1/comments/${short.videoId}`);
            const comments = await response.json();
            this.displayComments(comments);
        } catch (error) {
            console.error('コメントの読み込みに失敗しました:', error);
        }
    }

    displayComments(comments) {
        const container = document.querySelector('.comments-container');
        container.innerHTML = comments.map(comment => `
            <div class="comment">
                <div class="comment-avatar">
                    <i class="fas fa-user-circle"></i>
                </div>
                <div class="comment-content">
                    <div class="comment-author">${comment.author}</div>
                    <div class="comment-text">${comment.text}</div>
                </div>
            </div>
        `).join('');
    }

    formatCount(count) {
        if (count >= 1000000) {
            return `${(count / 1000000).toFixed(1)}M`;
        } else if (count >= 1000) {
            return `${(count / 1000).toFixed(1)}K`;
        }
        return count.toString();
    }
}

// ショート動画セクションの切り替え
document.querySelector('[data-page="shorts"]').addEventListener('click', () => {
    document.getElementById('regularContent').style.display = 'none';
    document.getElementById('shortsContent').style.display = 'block';
    
    // ショートプレーヤーの初期化
    if (!window.shortsPlayer) {
        window.shortsPlayer = new ShortsPlayer();
        window.shortsPlayer.loadShorts();
    }
});

// 通常コンテンツへの切り替え
document.querySelector('[data-page="home"]').addEventListener('click', () => {
    document.getElementById('regularContent').style.display = 'block';
    document.getElementById('shortsContent').style.display = 'none';
});

// URLルーティングとページ管理
class Router {
    constructor() {
        this.routes = {
            '/': this.showHome.bind(this),
            '/watch': this.showVideo.bind(this),
            '/shorts': this.showShorts.bind(this),
            '/results': this.showSearchResults.bind(this),
            '/channel': this.showChannel.bind(this)
        };
        this.setupEventListeners();
    }

    setupEventListeners() {
        window.addEventListener('popstate', () => this.handleRoute());
        document.addEventListener('click', (e) => {
            if (e.target.matches('a[data-route]')) {
                e.preventDefault();
                this.navigate(e.target.href);
            }
        });
    }

    navigate(url, params = {}) {
        const urlObj = new URL(url);
        if (params) {
            Object.keys(params).forEach(key => 
                urlObj.searchParams.set(key, params[key])
            );
        }
        window.history.pushState({}, '', urlObj.toString());
        this.handleRoute();
    }

    handleRoute() {
        const path = window.location.pathname;
        const handler = this.routes[path] || this.routes['/'];
        handler(new URLSearchParams(window.location.search));
    }

    async showHome() {
        document.getElementById('regularContent').style.display = 'block';
        document.getElementById('shortsContent').style.display = 'none';
        document.getElementById('videoModal').style.display = 'none';
        await loadTrendingVideos();
    }

    async showVideo(params) {
        const videoId = params.get('v');
        if (!videoId) {
            this.navigate('/');
            return;
        }

        showLoadingOverlay();
        try {
            const video = await getVideoDetails(videoId);
            await showVideoModal(video);
            document.title = `${video.title} - ようつべ`;
        } catch (error) {
            console.error('動画の読み込みに失敗しました:', error);
            this.navigate('/');
        } finally {
            hideLoadingOverlay();
        }
    }

    showShorts() {
        document.getElementById('regularContent').style.display = 'none';
        document.getElementById('shortsContent').style.display = 'block';
        document.getElementById('videoModal').style.display = 'none';
        
        if (!window.shortsPlayer) {
            window.shortsPlayer = new ShortsPlayer();
            window.shortsPlayer.loadShorts();
        }
    }

    async showSearchResults(params) {
        const query = params.get('search_query');
        if (!query) {
            this.navigate('/');
            return;
        }

        document.getElementById('regularContent').style.display = 'block';
        document.getElementById('shortsContent').style.display = 'none';
        document.getElementById('videoModal').style.display = 'none';
        
        showLoadingOverlay();
        try {
            const results = await searchVideos(query);
            displayVideos(results);
            document.title = `${query} - ようつべ`;
        } catch (error) {
            console.error('検索に失敗しました:', error);
        } finally {
            hideLoadingOverlay();
        }
    }
}

// ローディング overlay の表示/非表示
function showLoadingOverlay() {
    let overlay = document.querySelector('.loading-overlay');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.className = 'loading-overlay';
        overlay.innerHTML = '<div class="loading-spinner"><i class="fas fa-spinner fa-spin fa-3x"></i></div>';
        document.body.appendChild(overlay);
    }
    overlay.style.display = 'flex';
}

function hideLoadingOverlay() {
    const overlay = document.querySelector('.loading-overlay');
    if (overlay) {
        overlay.style.display = 'none';
    }
}

// 動画カードの生成を更新
function createVideoCard(video) {
    const card = document.createElement('div');
    card.className = 'video-card';
    card.innerHTML = `
        <div class="thumbnail-wrapper">
            <img class="thumbnail" src="${currentInstance}/vi/${video.videoId}/maxres.jpg" 
                 onerror="this.onerror=null; this.src='${currentInstance}/vi/${video.videoId}/mqdefault.jpg';"
                 alt="${video.title}">
            <span class="video-duration">${formatDuration(video.lengthSeconds)}</span>
        </div>
        <div class="video-info">
            <div class="channel-avatar">
                <img src="${video.authorThumbnails?.[0]?.url || ''}" alt="${video.author}" 
                     onerror="this.src='https://via.placeholder.com/36'">
            </div>
            <div class="video-details">
                <h3 class="video-title">${video.title}</h3>
                <p class="channel-name">${video.author}</p>
                <div class="video-meta">
                    <span>${formatViews(video.viewCount)}回視聴</span>
                    <span>•</span>
                    <span>${formatDate(video.published)}</span>
                </div>
            </div>
        </div>
    `;

    card.addEventListener('click', async () => {
        router.navigate(`${window.location.origin}/watch?v=${video.videoId}`);
    });

    return card;
}

// 検索フォームの処理を更新
document.querySelector('.search-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const searchInput = document.getElementById('search');
    const query = searchInput.value.trim();
    if (query) {
        router.navigate(`${window.location.origin}/results`, { search_query: query });
    }
});

// サイドバーナビゲーションの更新
document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', () => {
        const page = item.dataset.page;
        if (page === 'home') {
            router.navigate('/');
        } else if (page === 'shorts') {
            router.navigate('/shorts');
        }
    });
});

// ルーターの初期化
const router = new Router();

// 初期ルートの処理
document.addEventListener('DOMContentLoaded', () => {
    router.handleRoute();
});

// 検索フォームのイベントハンドラ
function setupSearchForm() {
    const searchForm = document.querySelector('.search-form');
    const searchInput = document.getElementById('search');
    const searchSuggestions = document.getElementById('searchSuggestions');
    let debounceTimeout;

    // 検索候補の表示
    searchInput.addEventListener('input', () => {
        clearTimeout(debounceTimeout);
        debounceTimeout = setTimeout(async () => {
            const query = searchInput.value.trim();
            if (query.length < 2) {
                searchSuggestions.style.display = 'none';
                return;
            }

            try {
                const suggestions = await fetchAPI('/api/v1/search/suggestions', { q: query });
                if (suggestions && suggestions.length > 0) {
                    searchSuggestions.innerHTML = suggestions
                        .map(suggestion => `
                            <div class="suggestion-item">
                                <i class="fas fa-search"></i>
                                <span>${suggestion}</span>
                            </div>
                        `).join('');
                    searchSuggestions.style.display = 'block';
                }
            } catch (error) {
                console.error('検索候補の取得に失敗:', error);
            }
        }, 300);
    });

    // 検索実行
    searchForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const query = searchInput.value.trim();
        if (query) {
            showLoadingOverlay();
            try {
                const videos = await searchVideos(query, currentFilters);
                router.navigate(`${window.location.origin}/results`, { 
                    search_query: query,
                    ...currentFilters
                });
                renderVideos(videos);
            } catch (error) {
                console.error('検索に失敗しました:', error);
            } finally {
                hideLoadingOverlay();
                searchSuggestions.style.display = 'none';
            }
        }
    });

    // 検索候補クリック
    searchSuggestions.addEventListener('click', (e) => {
        const suggestionItem = e.target.closest('.suggestion-item');
        if (suggestionItem) {
            searchInput.value = suggestionItem.querySelector('span').textContent;
            searchForm.dispatchEvent(new Event('submit'));
        }
    });

    // 検索候補の非表示
    document.addEventListener('click', (e) => {
        if (!searchInput.contains(e.target) && !searchSuggestions.contains(e.target)) {
            searchSuggestions.style.display = 'none';
        }
    });
}

// フィルター機能の設定
function setupFilters() {
    const filterDropdown = document.getElementById('filterDropdown');
    const filterButton = document.getElementById('filterButton');

    filterButton.addEventListener('click', () => {
        filterDropdown.style.display = 
            filterDropdown.style.display === 'none' ? 'block' : 'none';
    });

    // フィルターの変更を監視
    document.querySelectorAll('.filter-section input').forEach(input => {
        input.addEventListener('change', async () => {
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

            // 現在の検索クエリで再検索
            const searchInput = document.getElementById('search');
            const query = searchInput.value.trim();
            if (query) {
                const videos = await searchVideos(query, currentFilters);
                renderVideos(videos);
            }
        });
    });

    // フィルタードロップダウンの外側クリックで閉じる
    document.addEventListener('click', (e) => {
        if (!filterButton.contains(e.target) && !filterDropdown.contains(e.target)) {
            filterDropdown.style.display = 'none';
        }
    });
}

// ページ読み込み時に設定を適用
document.addEventListener('DOMContentLoaded', () => {
    setupSearchForm();
    setupFilters();
    // ...existing code...
});
