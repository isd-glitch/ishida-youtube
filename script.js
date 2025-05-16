class InvidiousAPI {
    constructor() {
        this.instances = [
            'https://invidious.projectsegfau.lt',
            'https://invidious.dhusch.de',
            'https://inv.bp.projectsegfau.lt',
            'https://invidious.slipfox.xyz',
            'https://invidious.privacydev.net',
            'https://vid.puffyan.us',
            'https://yt.artemislena.eu'
        ];
        this.currentInstance = this.instances[0];
        this.retryCount = 3;
        this.instanceIndex = 0;
    }

    async init() {
        await this.switchToWorkingInstance();
        // 定期的にインスタンスの健全性をチェック
        setInterval(() => this.checkInstanceHealth(), 300000); // 5分ごと
    }

    async checkInstanceHealth() {
        try {
            const response = await this.fetchWithTimeout(`${this.currentInstance}/api/v1/stats`, {
                timeout: 3000
            });
            if (!response.ok) {
                await this.switchToWorkingInstance();
            }
        } catch (error) {
            await this.switchToWorkingInstance();
        }
    }

    async switchToWorkingInstance() {
        const startIndex = this.instanceIndex;
        do {
            try {
                const instance = this.instances[this.instanceIndex];
                const response = await this.fetchWithTimeout(`${instance}/api/v1/videos/trending?region=JP`, {
                    timeout: 5000
                });
                if (response.ok) {
                    this.currentInstance = instance;
                    console.log(`使用するインスタンス: ${instance}`);
                    return true;
                }
            } catch (error) {
                console.log(`インスタンス ${this.instances[this.instanceIndex]} は利用できません`);
            }
            this.instanceIndex = (this.instanceIndex + 1) % this.instances.length;
        } while (this.instanceIndex !== startIndex);

        throw new Error('利用可能なインスタンスが見つかりません');
    }

    async fetchWithTimeout(url, options = {}) {
        const { timeout = 5000 } = options;
        const controller = new AbortController();
        const id = setTimeout(() => controller.abort(), timeout);
        try {
            const response = await fetch(url, {
                ...options,
                signal: controller.signal
            });
            clearTimeout(id);
            return response;
        } catch (error) {
            clearTimeout(id);
            throw error;
        }
    }

    async request(endpoint, params = {}) {
        let lastError;
        for (let i = 0; i < this.retryCount; i++) {
            try {
                const queryString = new URLSearchParams(params).toString();
                const url = `${this.currentInstance}${endpoint}${queryString ? '?' + queryString : ''}`;
                const response = await this.fetchWithTimeout(url);
                
                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }
                
                return await response.json();
            } catch (error) {
                lastError = error;
                await this.switchToWorkingInstance();
            }
        }
        throw lastError;
    }

    // 検索API
    async search(query, params = {}) {
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
        
        return this.request('/api/v1/search', searchParams);
    }

    // 動画詳細の取得
    async getVideoDetails(videoId) {
        try {
            const data = await this.request(`/api/v1/videos/${videoId}`);
            // HLSストリームURLを追加
            if (data.adaptiveFormats) {
                data.hlsUrl = data.adaptiveFormats
                    .find(format => format.type.includes('video'))?.url;
            }
            return data;
        } catch (error) {
            console.error('動画詳細の取得に失敗:', error);
            throw error;
        }
    }

    // トレンド動画の取得
    async getTrending(params = {}) {
        return this.request('/api/v1/trending', { region: 'JP', ...params });
    }

    // コメントの取得
    async getComments(videoId) {
        return this.request(`/api/v1/comments/${videoId}`);
    }

    // チャンネル情報の取得
    async getChannel(channelId) {
        return this.request(`/api/v1/channels/${channelId}`);
    }

    // サムネイルURLの生成
    getThumbnailUrl(videoId, quality = 'hqdefault') {
        // プライマリとフォールバックのサムネイルURLを生成
        const urls = this.instances.map(instance => 
            `${instance}/vi/${videoId}/${quality}.jpg`
        );
        
        // YouTube直接URLもフォールバックとして追加
        urls.push(`https://i.ytimg.com/vi/${videoId}/${quality}.jpg`);
        
        return urls;
    }
}

// VideoManager クラス - 動画の状態管理
class VideoManager {
    constructor(api) {
        this.api = api;
        this.currentVideo = null;
        this.currentVideos = [];
        this.searchHistory = new Set();
        this.watchHistory = new Set();
        this.loadHistoryFromStorage();
        this.formats = new Map();
    }

    // ローカルストレージからの履歴読み込み
    loadHistoryFromStorage() {
        try {
            const searchHistory = localStorage.getItem('searchHistory');
            const watchHistory = localStorage.getItem('watchHistory');
            if (searchHistory) this.searchHistory = new Set(JSON.parse(searchHistory));
            if (watchHistory) this.watchHistory = new Set(JSON.parse(watchHistory));
        } catch (error) {
            console.error('履歴の読み込みに失敗しました:', error);
        }
    }

    // 履歴の保存
    saveHistoryToStorage() {
        try {
            localStorage.setItem('searchHistory', JSON.stringify([...this.searchHistory]));
            localStorage.setItem('watchHistory', JSON.stringify([...this.watchHistory]));
        } catch (error) {
            console.error('履歴の保存に失敗しました:', error);
        }
    }

    // 検索履歴に追加
    addToSearchHistory(query) {
        this.searchHistory.add(query);
        if (this.searchHistory.size > 100) {
            const [firstItem] = this.searchHistory;
            this.searchHistory.delete(firstItem);
        }
        this.saveHistoryToStorage();
    }

    // 視聴履歴に追加
    addToWatchHistory(videoId) {
        this.watchHistory.add(videoId);
        if (this.watchHistory.size > 200) {
            const [firstItem] = this.watchHistory;
            this.watchHistory.delete(firstItem);
        }
        this.saveHistoryToStorage();
    }

    // 検索の実行
    async search(query, params = {}) {
        try {
            this.addToSearchHistory(query);
            const results = await this.api.search(query, params);
            this.currentVideos = results;
            return results;
        } catch (error) {
            console.error('検索に失敗しました:', error);
            throw error;
        }
    }

    // 動画の読み込み
    async loadVideo(videoId) {
        try {
            const video = await this.api.getVideoDetails(videoId);
            this.currentVideo = video;
            this.addToWatchHistory(videoId);
            return video;
        } catch (error) {
            console.error('動画の読み込みに失敗しました:', error);
            throw error;
        }
    }

    // トレンド動画の取得
    async getTrending(params = {}) {
        try {
            const videos = await this.api.getTrending(params);
            this.currentVideos = videos;
            return videos;
        } catch (error) {
            console.error('トレンド動画の取得に失敗しました:', error);
            throw error;
        }
    }

    // 動画のストリーミングURLを取得
    async getVideoStreamUrl(videoId, quality = 'medium') {
        try {
            const videoInfo = await this.api.getVideoDetails(videoId);
            if (!videoInfo.formatStreams) {
                throw new Error('利用可能なストリームが見つかりません');
            }

            // フォーマットをキャッシュ
            this.formats.set(videoId, videoInfo.formatStreams);

            // 品質に基づいてストリームを選択
            const streams = videoInfo.formatStreams.sort((a, b) => {
                const qualityA = parseInt(a.quality) || 0;
                const qualityB = parseInt(b.quality) || 0;
                return qualityB - qualityA;
            });

            let selectedStream;
            switch (quality) {
                case 'high':
                    selectedStream = streams[0];
                    break;
                case 'low':
                    selectedStream = streams[streams.length - 1];
                    break;
                default:
                    selectedStream = streams[Math.floor(streams.length / 2)] || streams[0];
            }

            if (!selectedStream || !selectedStream.url) {
                throw new Error('適切なストリームが見つかりません');
            }

            return selectedStream.url;
        } catch (error) {
            console.error('ストリームURLの取得に失敗:', error);
            throw error;
        }
    }

    // 動画の再生
    async playVideo(videoId, quality = 'medium') {
        try {
            const streamUrl = await this.getVideoStreamUrl(videoId, quality);
            const videoDetails = await this.api.getVideoDetails(videoId);
            this.currentVideo = videoDetails;
            this.addToWatchHistory(videoId);

            return {
                streamUrl,
                details: videoDetails
            };
        } catch (error) {
            console.error('動画の再生に失敗:', error);
            throw error;
        }
    }
}

// 動画再生インターフェース
async function initializeVideoPlayer() {
    const player = new VideoPlayer('videoPlayer', videoManager);
    
    // 動画を読み込む関数
    async function loadVideo(videoId) {
        try {
            showLoadingOverlay();
            const success = await player.loadVideo(videoId);
            
            if (success) {
                // 関連動画とコメントを読み込む
                await Promise.all([
                    loadRelatedVideos(videoId),
                    loadComments(videoId)
                ]);
            } else {
                showError('動画を読み込めませんでした');
            }
        } catch (error) {
            console.error('動画の読み込みエラー:', error);
            showError('動画の読み込み中にエラーが発生しました');
        } finally {
            hideLoadingOverlay();
        }
    }

    // 関連動画の読み込み
    async function loadRelatedVideos(videoId) {
        const container = document.getElementById('relatedVideosContainer');
        if (!container) return;

        try {
            const currentVideo = await videoManager.api.getVideoDetails(videoId);
            const searchResults = await videoManager.search(currentVideo.title, {
                type: 'video',
                page: 1
            });

            // 現在の動画を除外
            const relatedVideos = searchResults
                .filter(video => video.videoId !== videoId)
                .slice(0, 10);

            container.innerHTML = '';
            relatedVideos.forEach(video => {
                const card = createVideoCard(video);
                container.appendChild(card);
            });
        } catch (error) {
            console.error('関連動画の読み込みエラー:', error);
            container.innerHTML = '<div class="error">関連動画を読み込めませんでした</div>';
        }
    }

    // コメントの読み込み
    async function loadComments(videoId) {
        const container = document.getElementById('commentsContainer');
        if (!container) return;

        try {
            const comments = await videoManager.api.getComments(videoId);
            container.innerHTML = '';

            if (!comments || comments.length === 0) {
                container.innerHTML = '<div class="no-comments">コメントはありません</div>';
                return;
            }

            comments.forEach(comment => {
                const commentElement = document.createElement('div');
                commentElement.className = 'comment';
                commentElement.innerHTML = `
                    <div class="comment-author">
                        <img src="${comment.authorThumbnails?.[0]?.url || '/assets/user-placeholder.png'}" 
                             alt="${comment.author}">
                        <span>${comment.author}</span>
                    </div>
                    <div class="comment-content">${formatComment(comment.content)}</div>
                    <div class="comment-meta">
                        <span>${formatDate(comment.published)}</span>
                        <span>${formatCount(comment.likeCount)} likes</span>
                    </div>
                `;
                container.appendChild(commentElement);
            });
        } catch (error) {
            console.error('コメントの読み込みエラー:', error);
            container.innerHTML = '<div class="error">コメントを読み込めませんでした</div>';
        }
    }

    return {
        loadVideo,
        player
    };
}

// フォーマット関数の更新
function formatDate(timestamp) {
    if (!timestamp) return '';
    const date = new Date(typeof timestamp === 'number' ? timestamp * 1000 : timestamp);
    const now = new Date();
    const diff = Math.floor((now - date) / 1000);

    if (diff < 60) return '数秒前';
    if (diff < 3600) return `${Math.floor(diff / 60)}分前`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}時間前`;
    if (diff < 2592000) return `${Math.floor(diff / 86400)}日前`;
    if (diff < 31536000) return `${Math.floor(diff / 2592000)}ヶ月前`;
    return `${Math.floor(diff / 31536000)}年前`;
}

function formatViewCount(count) {
    if (!count) return '0';
    if (count >= 10000) return `${Math.floor(count / 10000)}万`;
    if (count >= 1000) return `${Math.floor(count / 1000)}千`;
    return count.toString();
}

function formatCount(count) {
    if (!count) return '0';
    if (count >= 10000) return `${(count / 10000).toFixed(1)}万`;
    if (count >= 1000) return `${(count / 1000).toFixed(1)}千`;
    return count.toString();
}

function formatComment(content) {
    if (!content) return '';
    return content
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/\n/g, '<br>')
        .replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank">$1</a>');
}

// イベントリスナーの初期化
document.addEventListener('DOMContentLoaded', async () => {
    const videoInterface = await initializeVideoPlayer();

    // ビデオカードのクリックイベント
    document.addEventListener('click', async (e) => {
        const videoCard = e.target.closest('.video-card');
        if (videoCard) {
            const videoId = videoCard.dataset.videoId;
            if (videoId) {
                await videoInterface.loadVideo(videoId);
            }
        }
    });

    // 検索フォームの処理
    const searchForm = document.querySelector('.search-form');
    const searchInput = document.getElementById('search');

    searchForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const query = searchInput.value.trim();
        if (query) {
            showLoadingOverlay();
            try {
                const results = await videoManager.search(query);
                renderVideos(results);
            } catch (error) {
                console.error('検索エラー:', error);
                showError('検索中にエラーが発生しました');
            } finally {
                hideLoadingOverlay();
            }
        }
    });
});

// VideoPlayer クラス - 動画プレーヤーの管理
class VideoPlayer {
    constructor(containerId, manager) {
        this.container = document.getElementById(containerId);
        this.manager = manager;
        this.currentVideo = null;
        this.quality = 'medium';
        this.setupPlayer();
    }

    setupPlayer() {
        this.container.innerHTML = `
            <div class="video-player-wrapper">
                <video id="mainPlayer" controls crossorigin="anonymous" playsinline>
                    <source type="video/mp4">
                    Your browser does not support the video tag.
                </video>
                <div class="player-controls">
                    <div class="quality-selector">
                        <button class="quality-btn">画質</button>
                        <div class="quality-menu">
                            <div data-quality="high">高画質</div>
                            <div data-quality="medium">標準</div>
                            <div data-quality="low">低画質</div>
                        </div>
                    </div>
                </div>
            </div>
        `;

        const video = this.container.querySelector('video');
        video.addEventListener('error', (e) => this.handleVideoError(e));

        // 品質選択のイベントリスナー
        const qualityMenu = this.container.querySelector('.quality-menu');
        qualityMenu.addEventListener('click', (e) => {
            const quality = e.target.dataset.quality;
            if (quality) {
                this.changeQuality(quality);
            }
        });
    }

    async loadVideo(videoId) {
        try {
            const videoData = await this.manager.playVideo(videoId, this.quality);
            this.currentVideo = videoData.details;

            const video = this.container.querySelector('video');
            const source = video.querySelector('source');
            
            // まずHLSストリームを試す
            if (videoData.details.hlsUrl) {
                if (Hls.isSupported()) {
                    const hls = new Hls();
                    hls.loadSource(videoData.details.hlsUrl);
                    hls.attachMedia(video);
                    hls.on(Hls.Events.MANIFEST_PARSED, () => {
                        video.play();
                    });
                } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
                    video.src = videoData.details.hlsUrl;
                    video.play();
                }
            } else {
                // 通常のストリームにフォールバック
                source.src = videoData.streamUrl;
                video.load();
                video.play();
            }

            // タイトルと情報を更新
            this.updateVideoInfo(videoData.details);
            return true;
        } catch (error) {
            console.error('動画の読み込みに失敗:', error);
            this.handleVideoError(error);
            return false;
        }
    }

    handleVideoError(error) {
        console.error('ビデオエラー:', error);
        
        // エラーメッセージを表示
        const errorOverlay = document.createElement('div');
        errorOverlay.className = 'video-error-overlay';
        errorOverlay.innerHTML = `
            <div class="error-message">
                <p>動画の読み込みに失敗しました</p>
                <button class="retry-button">リトライ</button>
            </div>
        `;
        
        this.container.appendChild(errorOverlay);
        
        // リトライボタンのイベントリスナー
        const retryButton = errorOverlay.querySelector('.retry-button');
        retryButton.addEventListener('click', () => {
            errorOverlay.remove();
            if (this.currentVideo) {
                this.loadVideo(this.currentVideo.videoId);
            }
        });
    }

    changeQuality(newQuality) {
        if (this.quality !== newQuality) {
            this.quality = newQuality;
            if (this.currentVideo) {
                this.loadVideo(this.currentVideo.videoId);
            }
        }
    }

    updateVideoInfo(details) {
        const titleElement = document.getElementById('videoTitle');
        const descriptionElement = document.getElementById('videoDescription');
        const viewsElement = document.getElementById('viewCount');
        const dateElement = document.getElementById('uploadDate');

        if (titleElement) titleElement.innerText = details.title;
        if (descriptionElement) descriptionElement.innerText = details.description;
        if (viewsElement) viewsElement.innerText = formatViewCount(details.viewCount);
        if (dateElement) dateElement.innerText = formatDate(details.published);
    }
}

function createVideoCard(video) {
    const card = document.createElement('div');
    card.className = 'video-card';
    card.dataset.videoId = video.videoId;

    // 複数のサムネイルURLを取得
    const thumbnailUrls = api.getThumbnailUrl(video.videoId);
    
    card.innerHTML = `
        <div class="thumbnail">
            <img src="${thumbnailUrls[0]}" 
                 alt="${video.title}" 
                 loading="lazy"
                 data-video-id="${video.videoId}"
                 data-thumbnail-urls='${JSON.stringify(thumbnailUrls)}'
                 onerror="handleThumbnailError(this)">
            <span class="duration">${formatDuration(video.lengthSeconds)}</span>
        </div>
        <div class="video-info">
            <h3 class="title">${video.title}</h3>
            <div class="meta">
                <span class="channel">${video.author}</span>
                <div class="stats">
                    <span class="views">${formatViewCount(video.viewCount)}回視聴</span>
                    <span class="date">${formatDate(video.published)}</span>
                </div>
            </div>
        </div>
    `;

    card.addEventListener('click', () => {
        handleVideoClick(video.videoId);
    });

    return card;
}

// サムネイル読み込みのエラーハンドリングを改善
function handleThumbnailError(img) {
    if (!img.dataset.thumbnailUrls) return;

    try {
        const urls = JSON.parse(img.dataset.thumbnailUrls);
        const currentIndex = urls.indexOf(img.src);
        
        if (currentIndex === -1 || currentIndex === urls.length - 1) {
            // すべてのURLを試し終わった場合はプレースホルダーを表示
            img.src = '/assets/thumbnail-placeholder.png';
            return;
        }

        // 次のURLを試す
        img.src = urls[currentIndex + 1];
    } catch (error) {
        console.error('サムネイル読み込みエラー:', error);
        img.src = '/assets/thumbnail-placeholder.png';
    }
}

// ローディングオーバーレイの制御
function showLoadingOverlay() {
    const overlay = document.querySelector('.loading-overlay');
    if (overlay) {
        overlay.style.display = 'flex';
    }
}

function hideLoadingOverlay() {
    const overlay = document.querySelector('.loading-overlay');
    if (overlay) {
        overlay.style.display = 'none';
    }
}

// エラー表示の改善
function showError(message, duration = 5000) {
    const errorContainer = document.createElement('div');
    errorContainer.className = 'error-message';
    errorContainer.innerHTML = `
        <i class="fas fa-exclamation-circle"></i>
        <span>${message}</span>
    `;
    document.body.appendChild(errorContainer);

    // アニメーション効果を追加
    setTimeout(() => errorContainer.classList.add('show'), 10);
    setTimeout(() => {
        errorContainer.classList.remove('show');
        setTimeout(() => errorContainer.remove(), 300);
    }, duration);
}
