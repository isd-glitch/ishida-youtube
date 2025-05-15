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

// APIエンドポイント関数の改善
async function fetchAPI(endpoint, params = {}) {
    let currentInstanceIndex = INVIDIOUS_INSTANCES.indexOf(currentInstance);
    let attempts = 0;

    while (attempts < INVIDIOUS_INSTANCES.length) {
        try {
            const queryString = new URLSearchParams(params).toString();
            const url = `${currentInstance}${endpoint}${queryString ? '?' + queryString : ''}`;
            const response = await fetch(url);
            
            if (!response.ok) throw new Error('API request failed');
            
            const data = await response.json();
            return data;
        } catch (error) {
            console.error(`Instance ${currentInstance} failed:`, error);
            currentInstanceIndex = (currentInstanceIndex + 1) % INVIDIOUS_INSTANCES.length;
            currentInstance = INVIDIOUS_INSTANCES[currentInstanceIndex];
            attempts++;
        }
    }
    throw new Error('すべてのインスタンスでリクエストが失敗しました');
}

// 検索機能の強化
async function searchVideos(query, params = {}) {
    showLoadingOverlay();
    try {
        const searchParams = {
            q: query,
            page: params.page || 1,
            sort_by: params.sort || 'relevance',
            date: params.date || '',
            duration: params.duration || '',
            type: params.type || 'video',
            region: 'JP',
            ...params
        };

        const results = await fetchAPI('/api/v1/search', searchParams);
        return Array.isArray(results) ? results : [];
    } catch (error) {
        console.error('検索エラー:', error);
        return [];
    } finally {
        hideLoadingOverlay();
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

// 動画の詳細情報を取得する関数の改善
async function getVideoDetails(videoId) {
    try {
        const data = await fetchAPI(`/api/v1/videos/${videoId}`);
        if (!data) throw new Error('動画データが取得できません');

        // タイムスタンプの修正
        if (data.published) {
            data.publishedText = formatPublishedTime(data.published);
        }

        return data;
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
function getVideoThumbnailUrls(videoId) {
    return {
        maxres: `${currentInstance}/vi/${videoId}/maxres.jpg`,
        hqdefault: `${currentInstance}/vi/${videoId}/hqdefault.jpg`,
        mqdefault: `${currentInstance}/vi/${videoId}/mqdefault.jpg`,
        sddefault: `${currentInstance}/vi/${videoId}/sddefault.jpg`,
        default: `${currentInstance}/vi/${videoId}/default.jpg`
    };
}

// 動画カードの作成
function createVideoCard(video, isRelated = false) {
    const videoCard = document.createElement('div');
    videoCard.className = 'video-card';
    
    const thumbnails = getVideoThumbnailUrls(video.videoId);
    const duration = formatDuration(video.lengthSeconds);
    
    videoCard.innerHTML = `
        <div class="video-thumbnail">
            <img src="${thumbnails.hqdefault}" alt="${video.title}" loading="lazy" 
                 onerror="this.src='${thumbnails.mqdefault}'">
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
    
    try {
        showLoadingOverlay();
        const videoDetails = await getVideoDetails(video.videoId);
        
        modalTitle.textContent = videoDetails.title;
        
        // プレーヤーのHTML
        videoPlayer.innerHTML = `
            <iframe
                src="${currentInstance}/embed/${videoDetails.videoId}?autoplay=1"
                width="100%"
                height="100%"
                frameborder="0"
                allowfullscreen
                allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture"
            ></iframe>
        `;

        // 動画情報の更新
        updateVideoInfo(videoDetails);
        
        modal.style.display = 'block';
        document.title = `${videoDetails.title} - ようつべ`;
    } catch (error) {
        console.error('動画の読み込みエラー:', error);
        alert('動画を読み込めませんでした。');
    } finally {
        hideLoadingOverlay();
    }
}

// 動画情報の更新関数
function updateVideoInfo(videoDetails) {
    document.querySelector('.video-title').textContent = videoDetails.title;
    document.querySelector('.video-meta-stats').innerHTML = `
        ${formatViewCount(videoDetails.viewCount)}回視聴 • 
        ${formatPublishedTime(videoDetails.published)}
    `;
    
    // チャンネル情報
    const channelAvatar = document.querySelector('.channel-info .channel-avatar img');
    const channelName = document.querySelector('.channel-info .channel-name');
    const subscriberCount = document.querySelector('.channel-info .subscriber-count');
    
    if (videoDetails.authorThumbnails?.length > 0) {
        channelAvatar.src = videoDetails.authorThumbnails[0].url;
    }
    channelName.textContent = videoDetails.author;
    subscriberCount.textContent = videoDetails.subCountText || '';
    
    // 動画の説明
    document.querySelector('.video-description').innerHTML = 
        videoDetails.description?.replace(/\n/g, '<br>') || '説明はありません。';
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

function formatPublishedTime(timestamp) {
    if (!timestamp) return '';
    
    const date = new Date(timestamp * 1000);
    const now = new Date();
    const diff = Math.floor((now - date) / 1000);
    
    if (diff < 60) return '数秒前';
    if (diff < 3600) return `${Math.floor(diff / 60)}分前`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}時間前`;
    if (diff < 2592000) return `${Math.floor(diff / 86400)}日前`;
    if (diff < 31536000) return `${Math.floor(diff / 2592000)}ヶ月前`;
    
    return `${Math.floor(diff / 31536000)}年前`;
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
