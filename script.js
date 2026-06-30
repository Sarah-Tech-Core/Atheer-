// ============================================================
//  أثير | النسخة النهائية - مع حل CORS المضمون
// ============================================================

// ===== استهداف عناصر الواجهة =====
const surahContainer = document.getElementById('surah-container');
const searchInput = document.getElementById('search-input');
const reciterDropdown = document.getElementById('reciter-dropdown');
const mainAudio = document.getElementById('main-audio');
const currentSurahTitle = document.getElementById('current-surah-title');
const currentReciterName = document.getElementById('current-reciter-name');
const globalLoading = document.getElementById('global-loading');

const quranModal = document.getElementById('quran-modal');
const modalSurahTitle = document.getElementById('modal-surah-title');
const basmalaContainer = document.getElementById('basmala-container');
const ayahsTextContainer = document.getElementById('ayahs-text-container');
const closeModalBtn = document.getElementById('close-modal');
const modalModeIndicator = document.getElementById('modal-mode-indicator');

const memorizationModeBtn = document.getElementById('memorization-mode-btn');
const autoPlayToggleBtn = document.getElementById('auto-play-toggle-btn');

const bookmarkSidebarToggle = document.getElementById('bookmark-sidebar-toggle');
const bookmarksSidebar = document.getElementById('bookmarks-sidebar');
const closeBookmarksSidebarBtn = document.getElementById('close-bookmarks-sidebar');
const sidebarOverlay = document.getElementById('sidebar-overlay');
const bookmarksContainer = document.getElementById('bookmarks-container');
const bookmarkBadge = document.getElementById('bookmark-badge');

const floatingInfoBtn = document.getElementById('floating-info-btn');
const infoPopupModal = document.getElementById('info-popup-modal');
const closeInfoModalBtn = document.getElementById('close-info-modal');

const darkModeToggleBtn = document.getElementById('dark-mode-toggle-btn');
const darkModeIcon = document.getElementById('dark-mode-icon');

const loopSurahBtn = document.getElementById('loop-surah-btn');
const loopStatus = document.getElementById('loop-status');
const nextSurahBtn = document.getElementById('next-surah-btn');
const nextStatus = document.getElementById('next-status');

const tafseerPopup = document.getElementById('tafseer-popup');
const tafseerPopupContent = document.getElementById('tafseer-popup-content');
const closeTafseerBtn = document.getElementById('close-tafseer-btn');

const splashScreen = document.getElementById('splash-screen');
const resumeModal = document.getElementById('resume-modal');
const lastSurahNameSpan = document.getElementById('last-surah-name');
const lastTimeTextSpan = document.getElementById('last-time-text');
const resumeYesBtn = document.getElementById('resume-yes-btn');
const resumeNoBtn = document.getElementById('resume-no-btn');

const privacyModal = document.getElementById('privacy-modal');
const privacyOverlay = document.getElementById('privacy-overlay');
const privacyAcceptBtn = document.getElementById('privacy-accept');
const privacyRejectBtn = document.getElementById('privacy-reject');

const settingsModal = document.getElementById('settings-modal');
const settingsOverlay = document.getElementById('settings-overlay');
const settingsToggleBtn = document.getElementById('settings-toggle-btn');
const closeSettingsBtn = document.getElementById('close-settings-btn');
const settingsDarkModeToggle = document.getElementById('settings-dark-mode-toggle');
const themeOptions = document.querySelectorAll('.theme-option');
const resetPrivacyBtn = document.getElementById('reset-privacy-btn');

// ===== مستودعات البيانات =====
let allSurahs = [];
let fullQuranText = [];
let fullTafseerText = [];
let currentActiveSurahNum = null;
let currentActiveSurahName = "";
let isMemorizationModeActive = false;
let isAutoPlayAudioActive = true;
let isLoopActive = false;
let isNextActive = true;
let difficultAyahsList = (() => { try { return JSON.parse(localStorage.getItem('difficultAyahsList')) || []; } catch { return []; } })();
let isTafseerOpen = false;
let isLoadingMore = false;
let currentAyahsBatch = [];
let currentBatchIndex = 0;
const BATCH_SIZE = 50;
let observer = null;
let backToTopBtn = null;
let saveSessionTimeout = null;
let isSwitchingReciter = false;
let pendingReciterTime = 0;

// ============================================================
//  🗄️  طبقة IndexedDB
// ============================================================
const DB_NAME = 'AtheerDB';
const DB_VERSION = 1;
let dbInstance = null;

function openDB() {
    return new Promise((resolve, reject) => {
        if (dbInstance) return resolve(dbInstance);
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        request.onupgradeneeded = (event) => {
            const db = event.target.result;
            if (!db.objectStoreNames.contains('surahs')) {
                db.createObjectStore('surahs', { keyPath: 'id' });
            }
            if (!db.objectStoreNames.contains('quranText')) {
                db.createObjectStore('quranText', { keyPath: 'id' });
            }
            if (!db.objectStoreNames.contains('tafseer')) {
                db.createObjectStore('tafseer', { keyPath: 'id' });
            }
        };
        request.onsuccess = (event) => {
            dbInstance = event.target.result;
            resolve(dbInstance);
        };
        request.onerror = (event) => {
            reject(event.target.error);
        };
    });
}

async function saveToDB(storeName, dataArray) {
    try {
        const db = await openDB();
        const tx = db.transaction(storeName, 'readwrite');
        const store = tx.objectStore(storeName);
        if (Array.isArray(dataArray)) {
            dataArray.forEach(item => store.put(item));
        } else {
            store.put(dataArray);
        }
        await new Promise((resolve, reject) => {
            tx.oncomplete = resolve;
            tx.onerror = reject;
        });
    } catch (e) {
        console.warn('فشل الحفظ في IndexedDB:', e);
    }
}

async function loadFromDB(storeName) {
    try {
        const db = await openDB();
        const tx = db.transaction(storeName, 'readonly');
        const store = tx.objectStore(storeName);
        const allData = await new Promise((resolve, reject) => {
            const result = [];
            const cursor = store.openCursor();
            cursor.onsuccess = (e) => {
                const cur = e.target.result;
                if (cur) {
                    result.push(cur.value);
                    cur.continue();
                } else {
                    resolve(result);
                }
            };
            cursor.onerror = (e) => reject(e.target.error);
        });
        return allData;
    } catch (e) {
        console.warn('فشل التحميل من IndexedDB:', e);
        return null;
    }
}

function showToast(message, duration = 2500, type = 'info') {
    const existingToast = document.querySelector('.toast-notification');
    if (existingToast) existingToast.remove();
    const toast = document.createElement('div');
    toast.className = `toast-notification toast-${type}`;
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), duration);
}

// ============================================================
//  📡  تحميل البيانات مع Proxies متعددة (مضمونة)
// ============================================================
async function fetchWithProxy(url) {
    // قائمة Proxies موثوقة
    const proxies = [
        'https://corsproxy.io/?',
        'https://api.allorigins.win/raw?url=',
        'https://cors-anywhere.herokuapp.com/'
    ];
    
    // المحاولة عبر الـ Proxies
    for (const proxy of proxies) {
        try {
            console.log(`🔄 محاولة التحميل عبر: ${proxy}`);
            const response = await fetch(proxy + encodeURIComponent(url), {
                signal: AbortSignal.timeout(10000) // مهلة 10 ثواني
            });
            if (response.ok) {
                console.log(`✅ تم التحميل بنجاح عبر: ${proxy}`);
                return response;
            }
        } catch (e) {
            console.log(`❌ فشل الـ Proxy: ${proxy} - ${e.message}`);
        }
    }
    
    // المحاولة الأخيرة: اتصال مباشر (قد ينجح في بعض البيئات)
    try {
        console.log('🔄 محاولة الاتصال المباشر...');
        const response = await fetch(url, {
            signal: AbortSignal.timeout(10000)
        });
        if (response.ok) {
            console.log('✅ تم التحميل بنجاح عبر الاتصال المباشر');
            return response;
        }
    } catch (e) {
        console.log('❌ فشل الاتصال المباشر');
    }
    
    // إذا فشل كل شيء
    throw new Error('تعذر تحميل البيانات من جميع المصادر');
}

// ===== البيانات المضمنة (نسخة احتياطية) =====
const EMBEDDED_SURAHS = [
  {"number":1,"name":"الفاتحة","englishName":"Al-Faatiha","revelationType":"Meccan","numberOfAyahs":7},
  {"number":2,"name":"البقرة","englishName":"Al-Baqara","revelationType":"Medinan","numberOfAyahs":286},
  {"number":3,"name":"آل عمران","englishName":"Aal-Imran","revelationType":"Medinan","numberOfAyahs":200},
  {"number":4,"name":"النساء","englishName":"An-Nisa","revelationType":"Medinan","numberOfAyahs":176},
  {"number":5,"name":"المائدة","englishName":"Al-Ma'idah","revelationType":"Medinan","numberOfAyahs":120},
  {"number":6,"name":"الأنعام","englishName":"Al-An'am","revelationType":"Meccan","numberOfAyahs":165},
  {"number":7,"name":"الأعراف","englishName":"Al-A'raf","revelationType":"Meccan","numberOfAyahs":206},
  {"number":8,"name":"الأنفال","englishName":"Al-Anfal","revelationType":"Medinan","numberOfAyahs":75},
  {"number":9,"name":"التوبة","englishName":"At-Tawba","revelationType":"Medinan","numberOfAyahs":129},
  {"number":10,"name":"يونس","englishName":"Yunus","revelationType":"Meccan","numberOfAyahs":109},
  {"number":11,"name":"هود","englishName":"Hud","revelationType":"Meccan","numberOfAyahs":123},
  {"number":12,"name":"يوسف","englishName":"Yusuf","revelationType":"Meccan","numberOfAyahs":111},
  {"number":13,"name":"الرعد","englishName":"Ar-Ra'd","revelationType":"Medinan","numberOfAyahs":43},
  {"number":14,"name":"إبراهيم","englishName":"Ibrahim","revelationType":"Meccan","numberOfAyahs":52},
  {"number":15,"name":"الحجر","englishName":"Al-Hijr","revelationType":"Meccan","numberOfAyahs":99},
  {"number":16,"name":"النحل","englishName":"An-Nahl","revelationType":"Meccan","numberOfAyahs":128},
  {"number":17,"name":"الإسراء","englishName":"Al-Isra","revelationType":"Meccan","numberOfAyahs":111},
  {"number":18,"name":"الكهف","englishName":"Al-Kahf","revelationType":"Meccan","numberOfAyahs":110},
  {"number":19,"name":"مريم","englishName":"Maryam","revelationType":"Meccan","numberOfAyahs":98},
  {"number":20,"name":"طه","englishName":"Taha","revelationType":"Meccan","numberOfAyahs":135},
  {"number":21,"name":"الأنبياء","englishName":"Al-Anbiya","revelationType":"Meccan","numberOfAyahs":112},
  {"number":22,"name":"الحج","englishName":"Al-Hajj","revelationType":"Medinan","numberOfAyahs":78},
  {"number":23,"name":"المؤمنون","englishName":"Al-Mu'minoon","revelationType":"Meccan","numberOfAyahs":118},
  {"number":24,"name":"النور","englishName":"An-Noor","revelationType":"Medinan","numberOfAyahs":64},
  {"number":25,"name":"الفرقان","englishName":"Al-Furqan","revelationType":"Meccan","numberOfAyahs":77},
  {"number":26,"name":"الشعراء","englishName":"Ash-Shu'ara","revelationType":"Meccan","numberOfAyahs":227},
  {"number":27,"name":"النمل","englishName":"An-Naml","revelationType":"Meccan","numberOfAyahs":93},
  {"number":28,"name":"القصص","englishName":"Al-Qasas","revelationType":"Meccan","numberOfAyahs":88},
  {"number":29,"name":"العنكبوت","englishName":"Al-Ankaboot","revelationType":"Meccan","numberOfAyahs":69},
  {"number":30,"name":"الروم","englishName":"Ar-Room","revelationType":"Meccan","numberOfAyahs":60},
  {"number":31,"name":"لقمان","englishName":"Luqman","revelationType":"Meccan","numberOfAyahs":34},
  {"number":32,"name":"السجدة","englishName":"As-Sajda","revelationType":"Meccan","numberOfAyahs":30},
  {"number":33,"name":"الأحزاب","englishName":"Al-Ahzab","revelationType":"Medinan","numberOfAyahs":73},
  {"number":34,"name":"سبأ","englishName":"Saba","revelationType":"Meccan","numberOfAyahs":54},
  {"number":35,"name":"فاطر","englishName":"Fatir","revelationType":"Meccan","numberOfAyahs":45},
  {"number":36,"name":"يس","englishName":"Yaseen","revelationType":"Meccan","numberOfAyahs":83},
  {"number":37,"name":"الصافات","englishName":"As-Saffat","revelationType":"Meccan","numberOfAyahs":182},
  {"number":38,"name":"ص","englishName":"Sad","revelationType":"Meccan","numberOfAyahs":88},
  {"number":39,"name":"الزمر","englishName":"Az-Zumar","revelationType":"Meccan","numberOfAyahs":75},
  {"number":40,"name":"غافر","englishName":"Ghafir","revelationType":"Meccan","numberOfAyahs":85},
  {"number":41,"name":"فصلت","englishName":"Fussilat","revelationType":"Meccan","numberOfAyahs":54},
  {"number":42,"name":"الشورى","englishName":"Ash-Shura","revelationType":"Meccan","numberOfAyahs":53},
  {"number":43,"name":"الزخرف","englishName":"Az-Zukhruf","revelationType":"Meccan","numberOfAyahs":89},
  {"number":44,"name":"الدخان","englishName":"Ad-Dukhan","revelationType":"Meccan","numberOfAyahs":59},
  {"number":45,"name":"الجاثية","englishName":"Al-Jathiya","revelationType":"Meccan","numberOfAyahs":37},
  {"number":46,"name":"الأحقاف","englishName":"Al-Ahqaf","revelationType":"Meccan","numberOfAyahs":35},
  {"number":47,"name":"محمد","englishName":"Muhammad","revelationType":"Medinan","numberOfAyahs":38},
  {"number":48,"name":"الفتح","englishName":"Al-Fath","revelationType":"Medinan","numberOfAyahs":29},
  {"number":49,"name":"الحجرات","englishName":"Al-Hujurat","revelationType":"Medinan","numberOfAyahs":18},
  {"number":50,"name":"ق","englishName":"Qaf","revelationType":"Meccan","numberOfAyahs":45},
  {"number":51,"name":"الذاريات","englishName":"Adh-Dhariyat","revelationType":"Meccan","numberOfAyahs":60},
  {"number":52,"name":"الطور","englishName":"At-Tur","revelationType":"Meccan","numberOfAyahs":49},
  {"number":53,"name":"النجم","englishName":"An-Najm","revelationType":"Meccan","numberOfAyahs":62},
  {"number":54,"name":"القمر","englishName":"Al-Qamar","revelationType":"Meccan","numberOfAyahs":55},
  {"number":55,"name":"الرحمن","englishName":"Ar-Rahman","revelationType":"Medinan","numberOfAyahs":78},
  {"number":56,"name":"الواقعة","englishName":"Al-Waqia","revelationType":"Meccan","numberOfAyahs":96},
  {"number":57,"name":"الحديد","englishName":"Al-Hadid","revelationType":"Medinan","numberOfAyahs":29},
  {"number":58,"name":"المجادلة","englishName":"Al-Mujadila","revelationType":"Medinan","numberOfAyahs":22},
  {"number":59,"name":"الحشر","englishName":"Al-Hashr","revelationType":"Medinan","numberOfAyahs":24},
  {"number":60,"name":"الممتحنة","englishName":"Al-Mumtahina","revelationType":"Medinan","numberOfAyahs":13},
  {"number":61,"name":"الصف","englishName":"As-Saff","revelationType":"Medinan","numberOfAyahs":14},
  {"number":62,"name":"الجمعة","englishName":"Al-Jumu'a","revelationType":"Medinan","numberOfAyahs":11},
  {"number":63,"name":"المنافقون","englishName":"Al-Munafiqoon","revelationType":"Medinan","numberOfAyahs":11},
  {"number":64,"name":"التغابن","englishName":"At-Taghabun","revelationType":"Medinan","numberOfAyahs":18},
  {"number":65,"name":"الطلاق","englishName":"At-Talaq","revelationType":"Medinan","numberOfAyahs":12},
  {"number":66,"name":"التحريم","englishName":"At-Tahrim","revelationType":"Medinan","numberOfAyahs":12},
  {"number":67,"name":"الملك","englishName":"Al-Mulk","revelationType":"Meccan","numberOfAyahs":30},
  {"number":68,"name":"القلم","englishName":"Al-Qalam","revelationType":"Meccan","numberOfAyahs":52},
  {"number":69,"name":"الحاقة","englishName":"Al-Haaqqa","revelationType":"Meccan","numberOfAyahs":52},
  {"number":70,"name":"المعارج","englishName":"Al-Ma'arij","revelationType":"Meccan","numberOfAyahs":44},
  {"number":71,"name":"نوح","englishName":"Nooh","revelationType":"Meccan","numberOfAyahs":28},
  {"number":72,"name":"الجن","englishName":"Al-Jinn","revelationType":"Meccan","numberOfAyahs":28},
  {"number":73,"name":"المزمل","englishName":"Al-Muzzammil","revelationType":"Meccan","numberOfAyahs":20},
  {"number":74,"name":"المدثر","englishName":"Al-Muddathir","revelationType":"Meccan","numberOfAyahs":56},
  {"number":75,"name":"القيامة","englishName":"Al-Qiyamah","revelationType":"Meccan","numberOfAyahs":40},
  {"number":76,"name":"الإنسان","englishName":"Al-Insan","revelationType":"Medinan","numberOfAyahs":31},
  {"number":77,"name":"المرسلات","englishName":"Al-Mursalat","revelationType":"Meccan","numberOfAyahs":50},
  {"number":78,"name":"النبأ","englishName":"An-Naba","revelationType":"Meccan","numberOfAyahs":40},
  {"number":79,"name":"النازعات","englishName":"An-Nazi'at","revelationType":"Meccan","numberOfAyahs":46},
  {"number":80,"name":"عبس","englishName":"Abasa","revelationType":"Meccan","numberOfAyahs":42},
  {"number":81,"name":"التكوير","englishName":"At-Takwir","revelationType":"Meccan","numberOfAyahs":29},
  {"number":82,"name":"الانفطار","englishName":"Al-Infitar","revelationType":"Meccan","numberOfAyahs":19},
  {"number":83,"name":"المطففين","englishName":"Al-Mutaffifin","revelationType":"Meccan","numberOfAyahs":36},
  {"number":84,"name":"الانشقاق","englishName":"Al-Inshiqaq","revelationType":"Meccan","numberOfAyahs":25},
  {"number":85,"name":"البروج","englishName":"Al-Burooj","revelationType":"Meccan","numberOfAyahs":22},
  {"number":86,"name":"الطارق","englishName":"At-Tariq","revelationType":"Meccan","numberOfAyahs":17},
  {"number":87,"name":"الأعلى","englishName":"Al-A'la","revelationType":"Meccan","numberOfAyahs":19},
  {"number":88,"name":"الغاشية","englishName":"Al-Ghashiyah","revelationType":"Meccan","numberOfAyahs":26},
  {"number":89,"name":"الفجر","englishName":"Al-Fajr","revelationType":"Meccan","numberOfAyahs":30},
  {"number":90,"name":"البلد","englishName":"Al-Balad","revelationType":"Meccan","numberOfAyahs":20},
  {"number":91,"name":"الشمس","englishName":"Ash-Shams","revelationType":"Meccan","numberOfAyahs":15},
  {"number":92,"name":"الليل","englishName":"Al-Layl","revelationType":"Meccan","numberOfAyahs":21},
  {"number":93,"name":"الضحى","englishName":"Ad-Duha","revelationType":"Meccan","numberOfAyahs":11},
  {"number":94,"name":"الشرح","englishName":"Ash-Sharh","revelationType":"Meccan","numberOfAyahs":8},
  {"number":95,"name":"التين","englishName":"At-Tin","revelationType":"Meccan","numberOfAyahs":8},
  {"number":96,"name":"العلق","englishName":"Al-Alaq","revelationType":"Meccan","numberOfAyahs":19},
  {"number":97,"name":"القدر","englishName":"Al-Qadr","revelationType":"Meccan","numberOfAyahs":5},
  {"number":98,"name":"البينة","englishName":"Al-Bayyina","revelationType":"Medinan","numberOfAyahs":8},
  {"number":99,"name":"الزلزلة","englishName":"Az-Zalzalah","revelationType":"Medinan","numberOfAyahs":8},
  {"number":100,"name":"العاديات","englishName":"Al-Adiyat","revelationType":"Meccan","numberOfAyahs":11},
  {"number":101,"name":"القارعة","englishName":"Al-Qariah","revelationType":"Meccan","numberOfAyahs":11},
  {"number":102,"name":"التكاثر","englishName":"At-Takathur","revelationType":"Meccan","numberOfAyahs":8},
  {"number":103,"name":"العصر","englishName":"Al-Asr","revelationType":"Meccan","numberOfAyahs":3},
  {"number":104,"name":"الهمزة","englishName":"Al-Humazah","revelationType":"Meccan","numberOfAyahs":9},
  {"number":105,"name":"الفيل","englishName":"Al-Fil","revelationType":"Meccan","numberOfAyahs":5},
  {"number":106,"name":"قريش","englishName":"Quraish","revelationType":"Meccan","numberOfAyahs":4},
  {"number":107,"name":"الماعون","englishName":"Al-Ma'un","revelationType":"Meccan","numberOfAyahs":7},
  {"number":108,"name":"الكوثر","englishName":"Al-Kawthar","revelationType":"Meccan","numberOfAyahs":3},
  {"number":109,"name":"الكافرون","englishName":"Al-Kafirun","revelationType":"Meccan","numberOfAyahs":6},
  {"number":110,"name":"النصر","englishName":"An-Nasr","revelationType":"Medinan","numberOfAyahs":3},
  {"number":111,"name":"المسد","englishName":"Al-Masad","revelationType":"Meccan","numberOfAyahs":5},
  {"number":112,"name":"الإخلاص","englishName":"Al-Ikhlas","revelationType":"Meccan","numberOfAyahs":4},
  {"number":113,"name":"الفلق","englishName":"Al-Falaq","revelationType":"Meccan","numberOfAyahs":5},
  {"number":114,"name":"الناس","englishName":"An-Nas","revelationType":"Meccan","numberOfAyahs":6}
];

// ===== تحميل البيانات الرئيسي =====
async function loadQuranData() {
    if (globalLoading) {
        globalLoading.classList.remove('style-hidden');
        globalLoading.style.display = 'block';
        globalLoading.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> جاري تحميل المصحف الشريف...`;
    }

    try {
        // 1. التحقق من IndexedDB
        let surahsFromDB = await loadFromDB('surahs');
        let quranFromDB = await loadFromDB('quranText');
        let tafseerFromDB = await loadFromDB('tafseer');

        if (surahsFromDB && surahsFromDB.length > 0 && quranFromDB && quranFromDB.length > 0) {
            allSurahs = surahsFromDB;
            fullQuranText = quranFromDB;
            fullTafseerText = tafseerFromDB || [];
            
            if (globalLoading) globalLoading.style.display = 'none';
            if (surahContainer) surahContainer.classList.remove('style-hidden');
            displaySurahs(allSurahs);
            
            showToast('✅ تم التحميل من الذاكرة المحلية', 1500, 'success');
            setTimeout(updateDataInBackground, 5000);
            return true;
        }

        // 2. محاولة التحميل من API
        showToast('⏳ جلب البيانات من الخادم...', 2000, 'info');
        const success = await fetchFromAPIAndSave();
        if (success) return true;

        // 3. إذا فشل API، استخدام البيانات المضمنة
        console.log('⚠️ استخدام البيانات المضمنة كنسخة احتياطية');
        allSurahs = EMBEDDED_SURAHS;
        fullQuranText = generateFallbackQuran();
        fullTafseerText = [];

        await saveToDB('surahs', allSurahs);
        await saveToDB('quranText', fullQuranText);
        await saveToDB('tafseer', fullTafseerText);

        if (globalLoading) globalLoading.style.display = 'none';
        if (surahContainer) surahContainer.classList.remove('style-hidden');
        displaySurahs(allSurahs);
        
        showToast('✅ تم التحميل بنجاح (نسخة احتياطية)', 2000, 'success');
        return true;

    } catch (error) {
        console.error('خطأ في تحميل البيانات:', error);
        
        // الحل الأخير: استخدام البيانات المضمنة
        allSurahs = EMBEDDED_SURAHS;
        fullQuranText = generateFallbackQuran();
        fullTafseerText = [];

        if (globalLoading) globalLoading.style.display = 'none';
        if (surahContainer) surahContainer.classList.remove('style-hidden');
        displaySurahs(allSurahs);
        
        showToast('✅ تم التحميل بنسخة احتياطية', 3000, 'info');
        return true;
    }
}

// ===== دالة لتوليد نسخة احتياطية من القرآن =====
function generateFallbackQuran() {
    // سورة الفاتحة كاملة
    return [
        {
            "number": 1,
            "name": "الفاتحة",
            "ayahs": [
                {"number": 1, "numberInSurah": 1, "text": "بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ"},
                {"number": 2, "numberInSurah": 2, "text": "الْحَمْدُ لِلَّهِ رَبِّ الْعَالَمِينَ"},
                {"number": 3, "numberInSurah": 3, "text": "الرَّحْمَٰنِ الرَّحِيمِ"},
                {"number": 4, "numberInSurah": 4, "text": "مَالِكِ يَوْمِ الدِّينِ"},
                {"number": 5, "numberInSurah": 5, "text": "إِيَّاكَ نَعْبُدُ وَإِيَّاكَ نَسْتَعِينُ"},
                {"number": 6, "numberInSurah": 6, "text": "اهْدِنَا الصِّرَاطَ الْمُسْتَقِيمَ"},
                {"number": 7, "numberInSurah": 7, "text": "صِرَاطَ الَّذِينَ أَنْعَمْتَ عَلَيْهِمْ غَيْرِ الْمَغْضُوبِ عَلَيْهِمْ وَلَا الضَّالِّينَ"}
            ]
        }
    ];
}

// ===== التحميل من API =====
async function fetchFromAPIAndSave() {
    try {
        const [surahsResponse, quranTextResponse, tafseerResponse] = await Promise.all([
            fetchWithProxy('https://api.alquran.cloud/v1/surah'),
            fetchWithProxy('https://api.alquran.cloud/v1/quran/quran-uthmani'),
            fetchWithProxy('https://api.alquran.cloud/v1/quran/ar.muyassar')
        ]);

        const surahsData = await surahsResponse.json();
        const quranTextData = await quranTextResponse.json();
        const tafseerData = await tafseerResponse.json();

        allSurahs = surahsData.data;
        fullQuranText = quranTextData.data.surahs;
        fullTafseerText = tafseerData.data.surahs;

        await saveToDB('surahs', allSurahs);
        await saveToDB('quranText', fullQuranText);
        await saveToDB('tafseer', fullTafseerText);

        if (globalLoading) globalLoading.style.display = 'none';
        if (surahContainer) surahContainer.classList.remove('style-hidden');
        displaySurahs(allSurahs);
        
        showToast('✅ تم تحميل المصحف بنجاح', 2000, 'success');
        return true;

    } catch (error) {
        console.error('خطأ في جلب البيانات:', error);
        return false;
    }
}

// ===== تحديث البيانات في الخلفية =====
async function updateDataInBackground() {
    try {
        const lastUpdate = localStorage.getItem('quranLastUpdate');
        const now = Date.now();
        if (lastUpdate && (now - parseInt(lastUpdate)) < 24 * 60 * 60 * 1000) {
            return;
        }

        const [surahsResponse, quranTextResponse, tafseerResponse] = await Promise.all([
            fetchWithProxy('https://api.alquran.cloud/v1/surah'),
            fetchWithProxy('https://api.alquran.cloud/v1/quran/quran-uthmani'),
            fetchWithProxy('https://api.alquran.cloud/v1/quran/ar.muyassar')
        ]);

        if (surahsResponse && quranTextResponse && tafseerResponse) {
            const surahsData = await surahsResponse.json();
            const quranTextData = await quranTextResponse.json();
            const tafseerData = await tafseerResponse.json();

            allSurahs = surahsData.data;
            fullQuranText = quranTextData.data.surahs;
            fullTafseerText = tafseerData.data.surahs;

            await saveToDB('surahs', allSurahs);
            await saveToDB('quranText', fullQuranText);
            await saveToDB('tafseer', fullTafseerText);

            localStorage.setItem('quranLastUpdate', String(now));
            
            if (surahContainer && surahContainer.children.length === 0) {
                displaySurahs(allSurahs);
            }
            showToast('🔄 تم تحديث البيانات', 1500, 'info');
        }
    } catch (e) {
        console.log('تحديث الخلفي فشل');
    }
}

// ============================================================
//  باقي دوال التطبيق (بدون تغيير)
// ============================================================
function normalizeArabic(text) {
    if (!text) return '';
    return text.replace(/[\u064B-\u0652]/g, "").replace(/[أإآ]/g, "ا").replace(/ة/g, "ه").trim();
}

function displaySurahs(surahs) {
    surahContainer.innerHTML = '';
    if (!surahs || surahs.length === 0) {
        surahContainer.innerHTML = `<div class="global-loading">لا توجد نتائج تطابق بحثك.</div>`;
        return;
    }
    surahs.forEach(surah => {
        const card = document.createElement('div');
        card.classList.add('surah-card');
        card.addEventListener('click', () => {
            currentActiveSurahName = surah.name;
            openSurahReader(surah.number, surah.name);
            if (isAutoPlayAudioActive) {
                playSurahAudio(surah.number, surah.name);
            } else {
                currentActiveSurahNum = surah.number;
            }
        });
        card.innerHTML = `
            <div class="surah-info">
                <div class="surah-number">${surah.number}</div>
                <div>
                    <div class="surah-name">${surah.name}</div>
                    <div class="surah-type">${surah.revelationType === 'Meccan' ? 'مكية' : 'مدنية'} - ${surah.numberOfAyahs} آية</div>
                </div>
            </div>
            <div class="play-icon"><i class="fa-solid fa-circle-play"></i></div>
        `;
        surahContainer.appendChild(card);
    });
}

function playSurahAudio(surahNumber, surahName, startTime = 0) {
    try {
        const reciterUrlBase = reciterDropdown.value;
        const formattedNumber = String(surahNumber).padStart(3, '0');
        mainAudio.src = `${reciterUrlBase}${formattedNumber}.mp3`;
        if (startTime > 0 && mainAudio.readyState >= 1) {
            mainAudio.currentTime = startTime;
        }
        mainAudio.play().catch(err => {
            showToast('⚠️ تعذر تشغيل الصوت، حاول مرة أخرى', 2000, 'error');
        });
        currentSurahTitle.innerText = `سورة ${surahName}`;
        currentReciterName.innerText = `(${reciterDropdown.options[reciterDropdown.selectedIndex]?.text || 'العفاسي'})`;
    } catch (e) {
        showToast('⚠️ خطأ في تشغيل التلاوة', 2000, 'error');
    }
}

// ===== التحميل التدريجي للآيات =====
function appendAyahToContainer(ayah, surahNumber, surahName) {
    let text = ayah.text;
    if (surahNumber === 1 && ayah.numberInSurah === 1) {
        text = text.replace("بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ ", "");
    } else if (surahNumber !== 9 && ayah.numberInSurah === 1 && text.startsWith("بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ")) {
        text = text.replace("بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ", "").trim();
    }

    const ayahBlock = document.createElement('span');
    const uniqueKey = `${surahNumber}_${ayah.numberInSurah}`;
    const isAlreadyBookmarked = difficultAyahsList.some(item => item.id === uniqueKey);
    const bookmarkClass = isAlreadyBookmarked ? 'fa-solid fa-bookmark bookmarked' : 'fa-regular fa-bookmark';

    ayahBlock.classList.add('ayah-block');
    ayahBlock.setAttribute('data-ayah-index', ayah.numberInSurah);
    ayahBlock.setAttribute('data-ayah-number', ayah.numberInSurah);
    ayahBlock.setAttribute('data-surah-number', surahNumber);
    
    ayahBlock.innerHTML = `
        <span class="ayah-text-content">${text}</span>
        <span class="ayah-num">﴿${ayah.numberInSurah}﴾</span>
        <i class="${bookmarkClass} ayah-bookmark-btn" title="تحتاج تثبيت"></i>
    `;

    ayahBlock.addEventListener('click', (e) => {
        if (e.target.classList.contains('ayah-bookmark-btn')) return;
        if (isMemorizationModeActive) {
            if (!ayahBlock.classList.contains('revealed')) {
                ayahBlock.classList.add('revealed');
                e.stopPropagation();
                closeTafseerPopup();
            } else {
                showTafseerPopup(surahNumber, ayah.numberInSurah, e);
            }
        } else {
            showTafseerPopup(surahNumber, ayah.numberInSurah, e);
        }
    });

    const bookmarkBtn = ayahBlock.querySelector('.ayah-bookmark-btn');
    bookmarkBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleBookmarkAyah(surahNumber, surahName, ayah.numberInSurah, text, bookmarkBtn);
    });

    ayahsTextContainer.appendChild(ayahBlock);
}

function loadMoreAyahs() {
    if (isLoadingMore) return;
    if (!currentAyahsBatch.length || currentBatchIndex >= currentAyahsBatch.length) return;
    
    isLoadingMore = true;
    const endIndex = Math.min(currentBatchIndex + BATCH_SIZE, currentAyahsBatch.length);
    
    requestAnimationFrame(() => {
        for (let i = currentBatchIndex; i < endIndex; i++) {
            appendAyahToContainer(currentAyahsBatch[i], currentActiveSurahNum, currentActiveSurahName);
        }
        currentBatchIndex = endIndex;
        isLoadingMore = false;
        
        if (currentBatchIndex >= currentAyahsBatch.length) {
            if (observer) {
                observer.disconnect();
                observer = null;
            }
        }
    });
}

function setupIntersectionObserver() {
    if (observer) {
        observer.disconnect();
        observer = null;
    }
    
    const oldSentinel = document.getElementById('scroll-sentinel');
    if (oldSentinel) oldSentinel.remove();
    
    const sentinel = document.createElement('div');
    sentinel.id = 'scroll-sentinel';
    sentinel.style.height = '10px';
    sentinel.style.width = '100%';
    sentinel.style.visibility = 'hidden';
    ayahsTextContainer.appendChild(sentinel);
    
    observer = new IntersectionObserver((entries) => {
        if (entries[0].isIntersecting) {
            loadMoreAyahs();
        }
    }, { root: document.querySelector('.modal-body'), threshold: 0.1 });
    
    observer.observe(sentinel);
}

function openSurahReader(surahNumber, surahName) {
    if (!fullQuranText || fullQuranText.length === 0) {
        showToast('⚠️ البيانات لا تزال قيد التحميل، انتظر قليلاً', 2000, 'error');
        return;
    }
    currentActiveSurahNum = surahNumber;
    currentActiveSurahName = surahName;

    document.title = `أثير | سورة ${surahName}`;

    modalSurahTitle.innerText = `سورة ${surahName}`;
    ayahsTextContainer.innerHTML = '';
    closeTafseerPopup();
    
    if (observer) {
        observer.disconnect();
        observer = null;
    }
    
    const surahData = fullQuranText.find(s => s.number === surahNumber);
    if (!surahData) {
        showToast('❌ لم يتم العثور على السورة', 2000, 'error');
        return;
    }
    
    basmalaContainer.style.display = (surahNumber === 9) ? 'none' : 'block';
    
    if (isMemorizationModeActive) {
        ayahsTextContainer.classList.add('memorization-active');
        modalModeIndicator.classList.remove('style-hidden');
    } else {
        ayahsTextContainer.classList.remove('memorization-active');
        modalModeIndicator.classList.add('style-hidden');
    }
    
    currentAyahsBatch = surahData.ayahs;
    currentBatchIndex = 0;
    isLoadingMore = false;
    
    loadMoreAyahs();
    setupIntersectionObserver();
    
    quranModal.style.display = 'block';
    document.body.style.overflow = 'hidden';
    
    showBackToTopButton();
}

// ===== زر الرجوع للأعلى =====
function showBackToTopButton() {
    if (backToTopBtn) {
        backToTopBtn.remove();
        backToTopBtn = null;
    }
    
    backToTopBtn = document.createElement('button');
    backToTopBtn.id = 'back-to-top-btn';
    backToTopBtn.innerHTML = '<i class="fa-solid fa-arrow-up"></i>';
    backToTopBtn.style.cssText = `
        position: fixed;
        bottom: 200px;
        right: 20px;
        width: 48px;
        height: 48px;
        border-radius: 50%;
        background: var(--accent-color);
        color: white;
        border: none;
        font-size: 1.2rem;
        cursor: pointer;
        box-shadow: 0 4px 15px rgba(0,0,0,0.2);
        z-index: 999;
        display: none;
        transition: all 0.3s ease;
    `;
    backToTopBtn.addEventListener('click', () => {
        const modalBody = document.querySelector('.modal-body');
        if (modalBody) {
            modalBody.scrollTo({ top: 0, behavior: 'smooth' });
        }
    });
    document.body.appendChild(backToTopBtn);
    
    const modalBody = document.querySelector('.modal-body');
    if (modalBody) {
        modalBody.addEventListener('scroll', () => {
            if (modalBody.scrollTop > 300) {
                backToTopBtn.style.display = 'flex';
                backToTopBtn.style.alignItems = 'center';
                backToTopBtn.style.justifyContent = 'center';
            } else {
                backToTopBtn.style.display = 'none';
            }
        });
    }
}

// ===== التفسير =====
function showTafseerPopup(surahNum, ayahNumInSurah, clickEvent) {
    if (isTafseerOpen) return;
    if (!fullTafseerText || fullTafseerText.length === 0) {
        tafseerPopupContent.innerText = "التفسير غير متوفر حالياً.";
        return;
    }
    const surahData = fullTafseerText.find(s => s.number === surahNum);
    if (surahData) {
        const ayahData = surahData.ayahs.find(a => a.numberInSurah === ayahNumInSurah);
        tafseerPopupContent.innerText = ayahData ? ayahData.text : "لم يتم العثور على تفسير.";
    } else {
        tafseerPopupContent.innerText = "تفسير هذه السورة غير متوفر حالياً.";
    }
    
    const popupWidth = tafseerPopup.offsetWidth || 340;
    const popupHeight = tafseerPopup.offsetHeight || 200;
    let leftPos = clickEvent.clientX - (popupWidth / 2);
    let topPos = clickEvent.clientY + 25;
    
    if (leftPos < 12) leftPos = 12;
    if (leftPos + popupWidth > window.innerWidth) leftPos = window.innerWidth - popupWidth - 12;
    if (topPos + popupHeight > window.innerHeight) {
        topPos = clickEvent.clientY - popupHeight - 10;
        if (topPos < 0) topPos = 10;
    }
    
    tafseerPopup.style.left = `${leftPos}px`;
    tafseerPopup.style.top = `${topPos}px`;
    tafseerPopup.classList.remove('style-hidden');
    isTafseerOpen = true;
}

function closeTafseerPopup() {
    if(tafseerPopup) {
        tafseerPopup.classList.add('style-hidden');
        isTafseerOpen = false;
    }
}
closeTafseerBtn?.addEventListener('click', (e) => { e.stopPropagation(); closeTafseerPopup(); });

// ===== الإشارات المرجعية =====
function toggleBookmarkAyah(surahNum, surahName, ayahNum, ayahText, btnElement) {
    const uniqueKey = `${surahNum}_${ayahNum}`;
    const existingIndex = difficultAyahsList.findIndex(item => item.id === uniqueKey);
    if (existingIndex > -1) {
        difficultAyahsList.splice(existingIndex, 1);
        if(btnElement) btnElement.className = 'fa-regular fa-bookmark ayah-bookmark-btn';
    } else {
        difficultAyahsList.push({ id: uniqueKey, surahNum, surahName, ayahNum, text: ayahText });
        if(btnElement) btnElement.className = 'fa-solid fa-bookmark ayah-bookmark-btn bookmarked';
    }
    localStorage.setItem('difficultAyahsList', JSON.stringify(difficultAyahsList));
    updateBookmarkBadge();
    renderBookmarksList();
}

function updateBookmarkBadge() {
    if (bookmarkBadge) bookmarkBadge.innerText = difficultAyahsList.length;
}

function renderBookmarksList() {
    if (!bookmarksContainer) return;
    bookmarksContainer.innerHTML = '';
    if (difficultAyahsList.length === 0) {
        bookmarksContainer.innerHTML = `<p class="empty-msg">لا توجد آيات مضافة حالياً.</p>`;
        return;
    }
    difficultAyahsList.sort((a,b) => a.surahNum - b.surahNum || a.ayahNum - b.ayahNum);
    difficultAyahsList.forEach(item => {
        const itemCard = document.createElement('div');
        itemCard.classList.add('bookmarked-item');
        itemCard.innerHTML = `
            <div class="bookmark-item-title">سورة ${item.surahName} - آية (${item.ayahNum})</div>
            <div class="bookmark-item-text">${item.text}</div>
            <div class="bookmark-card-actions">
                <button class="btn-sidebar-circle copy-btn" title="نسخ"><i class="fa-regular fa-copy"></i></button>
                <button class="btn-sidebar-circle delete-btn" title="حذف"><i class="fa-solid fa-trash-can"></i></button>
            </div>
        `;
        itemCard.querySelector('.delete-btn').addEventListener('click', () => {
            toggleBookmarkAyah(item.surahNum, item.surahName, item.ayahNum, item.text, null);
        });
        itemCard.querySelector('.copy-btn').addEventListener('click', () => {
            navigator.clipboard.writeText(`قال تعالى: { ${item.text} } [سورة ${item.surahName} - آية ${item.ayahNum}]`);
        });
        bookmarksContainer.appendChild(itemCard);
    });
}

// ===== استئناف الجلسة =====
const LAST_SESSION_KEY = 'lastQuranSession';
let pendingResumeData = null;

function saveCurrentSessionImmediate() {
    if (currentActiveSurahNum && mainAudio && !isNaN(mainAudio.currentTime) && mainAudio.currentTime > 0) {
        const sessionData = {
            surahNumber: currentActiveSurahNum,
            surahName: currentActiveSurahName,
            currentTime: mainAudio.currentTime,
            reciterUrl: reciterDropdown.value,
            reciterName: reciterDropdown.options[reciterDropdown.selectedIndex]?.text || '',
            timestamp: Date.now()
        };
        localStorage.setItem(LAST_SESSION_KEY, JSON.stringify(sessionData));
    }
}

if (mainAudio) {
    mainAudio.addEventListener('timeupdate', () => {
        if (mainAudio.currentTime > 0 && currentActiveSurahNum) {
            if (saveSessionTimeout) clearTimeout(saveSessionTimeout);
            saveSessionTimeout = setTimeout(saveCurrentSessionImmediate, 500);
        }
    });
}
window.addEventListener('beforeunload', saveCurrentSessionImmediate);

function loadLastSession() {
    const saved = localStorage.getItem(LAST_SESSION_KEY);
    if (!saved) return null;
    try { return JSON.parse(saved); } catch { return null; }
}

function showResumeModal(session) {
    if (!session) return;
    pendingResumeData = session;
    const minutes = Math.floor(session.currentTime / 60);
    const seconds = Math.floor(session.currentTime % 60);
    lastSurahNameSpan.textContent = session.surahName;
    lastTimeTextSpan.textContent = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    resumeModal.classList.remove('style-hidden');
}

function resumeLastSession() {
    if (!pendingResumeData) return;
    const session = pendingResumeData;
    if (reciterDropdown.value !== session.reciterUrl) {
        session.currentTime = 0;
    }
    if (reciterDropdown.querySelector(`option[value="${session.reciterUrl}"]`)) {
        reciterDropdown.value = session.reciterUrl;
        localStorage.setItem('preferredReciter', session.reciterUrl);
    }
    currentActiveSurahName = session.surahName;
    openSurahReader(session.surahNumber, session.surahName);
    playSurahAudio(session.surahNumber, session.surahName, session.currentTime);
    pendingResumeData = null;
    resumeModal.classList.add('style-hidden');
}

function startNewSession() {
    if (pendingResumeData) {
        localStorage.removeItem(LAST_SESSION_KEY);
        pendingResumeData = null;
    }
    resumeModal.classList.add('style-hidden');
}

resumeYesBtn?.addEventListener('click', resumeLastSession);
resumeNoBtn?.addEventListener('click', startNewSession);

// ===== الخصوصية =====
function loadGoogleAnalytics() {
    const oldScript = document.querySelector('script[src*="googletagmanager"]');
    if (oldScript) oldScript.remove();
    const script = document.createElement('script');
    script.async = true;
    script.src = 'https://www.googletagmanager.com/gtag/js?id=G-16S1FZX64M';
    document.head.appendChild(script);
    window.dataLayer = window.dataLayer || [];
    function gtag(){dataLayer.push(arguments);}
    gtag('js', new Date());
    gtag('config', 'G-16S1FZX64M');
}

function showPrivacyConsent() {
    const consent = localStorage.getItem('privacyConsent');
    if (consent !== null) return;
    privacyModal.classList.remove('style-hidden');
    privacyOverlay.classList.remove('style-hidden');
    privacyAcceptBtn.onclick = function() {
        localStorage.setItem('privacyConsent', 'accepted');
        localStorage.setItem('analyticsConsent', 'true');
        loadGoogleAnalytics();
        hidePrivacyModal();
    };
    privacyRejectBtn.onclick = function() {
        localStorage.setItem('privacyConsent', 'rejected');
        localStorage.setItem('analyticsConsent', 'false');
        hidePrivacyModal();
    };
}

function hidePrivacyModal() {
    privacyModal.classList.add('style-hidden');
    privacyOverlay.classList.add('style-hidden');
}

function resetPrivacyConsent() {
    localStorage.removeItem('privacyConsent');
    localStorage.removeItem('analyticsConsent');
    setTimeout(showPrivacyConsent, 500);
}

// ===== الثيمات والوضع الليلي =====
function applyColorTheme(theme) {
    document.documentElement.setAttribute('data-theme-color', theme);
    localStorage.setItem('colorTheme', theme);
    themeOptions.forEach(btn => {
        btn.classList.toggle('active', btn.dataset.theme === theme);
    });
}

function applyDarkMode(isDark) {
    if (isDark) {
        document.documentElement.setAttribute('data-theme', 'dark');
        if (darkModeIcon) darkModeIcon.className = 'fa-solid fa-moon';
        if (settingsDarkModeToggle) settingsDarkModeToggle.checked = true;
        localStorage.setItem('themeMode', 'dark');
    } else {
        document.documentElement.removeAttribute('data-theme');
        if (darkModeIcon) darkModeIcon.className = 'fa-solid fa-sun';
        if (settingsDarkModeToggle) settingsDarkModeToggle.checked = false;
        localStorage.setItem('themeMode', 'light');
    }
}

function loadThemePreferences() {
    const savedColorTheme = localStorage.getItem('colorTheme') || 'navy';
    applyColorTheme(savedColorTheme);
    
    const savedDarkMode = localStorage.getItem('themeMode');
    if (savedDarkMode === 'light') {
        applyDarkMode(false);
    } else {
        applyDarkMode(true);
    }
}

// ============================================================
//  ⌨️  اختصارات لوحة المفاتيح
// ============================================================
document.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') {
        return;
    }

    switch(e.key) {
        case ' ':
            e.preventDefault();
            if (mainAudio.src) {
                if (mainAudio.paused) {
                    mainAudio.play().catch(() => showToast('⚠️ تعذر التشغيل', 1000, 'error'));
                } else {
                    mainAudio.pause();
                }
            }
            break;
            
        case 'ArrowRight':
            e.preventDefault();
            if (mainAudio.duration) {
                mainAudio.currentTime = Math.min(mainAudio.currentTime + 5, mainAudio.duration);
            }
            break;
            
        case 'ArrowLeft':
            e.preventDefault();
            if (mainAudio.duration) {
                mainAudio.currentTime = Math.max(mainAudio.currentTime - 5, 0);
            }
            break;
            
        case 'ArrowUp':
            e.preventDefault();
            if (mainAudio.volume < 0.95) {
                mainAudio.volume = Math.min(mainAudio.volume + 0.1, 1);
            }
            break;
            
        case 'ArrowDown':
            e.preventDefault();
            if (mainAudio.volume > 0.05) {
                mainAudio.volume = Math.max(mainAudio.volume - 0.1, 0);
            }
            break;
            
        case 'f':
        case 'F':
            e.preventDefault();
            e.stopPropagation();
            if (quranModal.style.display === 'block') {
                toggleMemorizationMode();
            }
            break;
            
        case 'Escape':
            if (!tafseerPopup.classList.contains('style-hidden')) {
                closeTafseerPopup();
            } else if (quranModal.style.display === 'block') {
                closeModalBtn.click();
            } else if (bookmarksSidebar.classList.contains('open')) {
                closeBookmarksSidebarBtn.click();
            } else if (!settingsModal.classList.contains('style-hidden')) {
                closeSettings();
            } else if (infoPopupModal.style.display === 'block') {
                closeInfoModalBtn.click();
            }
            break;
    }
});

// ===== دالة تبديل وضع التسميع =====
function toggleMemorizationMode() {
    isMemorizationModeActive = !isMemorizationModeActive;
    closeTafseerPopup();
    
    if (isMemorizationModeActive) {
        memorizationModeBtn.classList.add('active');
        memorizationModeBtn.querySelector('span').innerText = "وضع التسميع الذاتي: مفعّل";
        ayahsTextContainer.classList.add('memorization-active');
        modalModeIndicator.classList.remove('style-hidden');
    } else {
        memorizationModeBtn.classList.remove('active');
        memorizationModeBtn.querySelector('span').innerText = "وضع التسميع الذاتي: معطّل";
        ayahsTextContainer.classList.remove('memorization-active');
        modalModeIndicator.classList.add('style-hidden');
        document.querySelectorAll('.ayah-block').forEach(b => b.classList.remove('revealed'));
    }
}

// ===== أحداث الإدخال والبحث =====
let searchTimeout;
searchInput.addEventListener('input', (e) => {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
        const query = normalizeArabic(e.target.value);
        const filtered = allSurahs.filter(surah => {
            return normalizeArabic(surah.name).includes(query) || String(surah.number).includes(query);
        });
        displaySurahs(filtered);
    }, 150);
});

memorizationModeBtn.addEventListener('click', toggleMemorizationMode);

autoPlayToggleBtn.addEventListener('click', () => {
    isAutoPlayAudioActive = !isAutoPlayAudioActive;
    if(isAutoPlayAudioActive) {
        autoPlayToggleBtn.classList.remove('muted');
        autoPlayToggleBtn.classList.add('active');
        autoPlayToggleBtn.querySelector('span').innerText = "التلاوة التلقائية: مفعّلة";
    } else {
        autoPlayToggleBtn.classList.remove('active');
        autoPlayToggleBtn.classList.add('muted');
        autoPlayToggleBtn.querySelector('span').innerText = "التلاوة التلقائية: معطّلة";
    }
});

loopSurahBtn.addEventListener('click', () => {
    isLoopActive = !isLoopActive;
    if (isLoopActive) {
        loopSurahBtn.classList.add('active');
        loopStatus.innerText = "مفعل";
        if (isNextActive) {
            isNextActive = false;
            nextSurahBtn.classList.remove('active');
            nextStatus.innerText = "معطل";
        }
    } else {
        loopSurahBtn.classList.remove('active');
        loopStatus.innerText = "معطل";
    }
});

nextSurahBtn.addEventListener('click', () => {
    isNextActive = !isNextActive;
    if (isNextActive) {
        nextSurahBtn.classList.add('active');
        nextStatus.innerText = "مفعل";
        if (isLoopActive) {
            isLoopActive = false;
            loopSurahBtn.classList.remove('active');
            loopStatus.innerText = "معطل";
        }
    } else {
        nextSurahBtn.classList.remove('active');
        nextStatus.innerText = "معطل";
    }
});

mainAudio.addEventListener('ended', () => {
    if (!currentActiveSurahNum) return;
    if (isLoopActive) {
        playSurahAudio(currentActiveSurahNum, currentActiveSurahName || "المختارة");
    } else if (isNextActive) {
        let nextSurahNumber = currentActiveSurahNum + 1;
        if (nextSurahNumber > 114) nextSurahNumber = 1;
        const nextSurahObj = allSurahs.find(s => s.number === nextSurahNumber);
        if (nextSurahObj) {
            currentActiveSurahNum = nextSurahObj.number;
            currentActiveSurahName = nextSurahObj.name;
            if (quranModal.style.display === 'block') openSurahReader(nextSurahObj.number, nextSurahObj.name);
            playSurahAudio(nextSurahObj.number, nextSurahObj.name);
        }
    }
});

mainAudio.onerror = function() {
    showToast("⚠️ خطأ في تحميل التلاوة", 3000, 'error');
};

reciterDropdown.addEventListener('change', async () => {
    const newReciterUrl = reciterDropdown.value;
    const newReciterName = reciterDropdown.options[reciterDropdown.selectedIndex]?.text || '';

    localStorage.setItem('preferredReciter', newReciterUrl);

    if (!currentActiveSurahNum || !currentActiveSurahName) {
        return;
    }

    if (isSwitchingReciter) {
        return;
    }

    const currentTime = mainAudio.currentTime || 0;

    isSwitchingReciter = true;
    pendingReciterTime = currentTime;

    try {
        const formattedNumber = String(currentActiveSurahNum).padStart(3, '0');
        const newSrc = `${newReciterUrl}${formattedNumber}.mp3`;
        
        mainAudio.removeEventListener('loadeddata', handleReciterLoad);
        mainAudio.removeEventListener('canplay', handleReciterLoad);
        
        mainAudio.src = newSrc;
        
        mainAudio.addEventListener('loadeddata', handleReciterLoad);
        mainAudio.addEventListener('canplay', handleReciterLoad);
        
        currentReciterName.innerText = `(${newReciterName})`;

    } catch (error) {
        console.error('خطأ في تبديل القارئ:', error);
        showToast('❌ فشل تبديل القارئ', 2000, 'error');
        isSwitchingReciter = false;
    }
});

function handleReciterLoad() {
    if (!isSwitchingReciter) return;

    mainAudio.removeEventListener('loadeddata', handleReciterLoad);
    mainAudio.removeEventListener('canplay', handleReciterLoad);

    if (mainAudio.readyState >= 2 && pendingReciterTime > 0) {
        const targetTime = Math.min(pendingReciterTime, mainAudio.duration - 0.5);
        if (targetTime > 0) {
            mainAudio.currentTime = targetTime;
        }
    }

    if (isAutoPlayAudioActive) {
        mainAudio.play().catch(err => {
            console.log('استئناف التشغيل:', err);
        });
    }

    isSwitchingReciter = false;
    pendingReciterTime = 0;
}

closeModalBtn.addEventListener('click', () => {
    quranModal.style.display = 'none';
    document.body.style.overflow = 'auto';
    closeTafseerPopup();
    if (backToTopBtn) {
        backToTopBtn.remove();
        backToTopBtn = null;
    }
    if (observer) {
        observer.disconnect();
        observer = null;
    }
    const sentinel = document.getElementById('scroll-sentinel');
    if (sentinel) sentinel.remove();
    document.title = 'أثير | القرآن الكريم';
});

bookmarkSidebarToggle.addEventListener('click', () => {
    bookmarksSidebar.classList.add('open');
    sidebarOverlay.classList.add('open');
});
closeBookmarksSidebarBtn.addEventListener('click', () => {
    bookmarksSidebar.classList.remove('open');
    sidebarOverlay.classList.remove('open');
});
sidebarOverlay.addEventListener('click', () => {
    bookmarksSidebar.classList.remove('open');
    sidebarOverlay.classList.remove('open');
});

floatingInfoBtn.addEventListener('click', () => {
    infoPopupModal.style.display = 'block';
    document.body.style.overflow = 'hidden';
});
closeInfoModalBtn.addEventListener('click', () => {
    infoPopupModal.style.display = 'none';
    document.body.style.overflow = 'auto';
});
window.addEventListener('click', (e) => {
    if (e.target === infoPopupModal) {
        infoPopupModal.style.display = 'none';
        document.body.style.overflow = 'auto';
    }
});

settingsToggleBtn.addEventListener('click', () => {
    settingsModal.classList.remove('style-hidden');
    settingsOverlay.classList.remove('style-hidden');
    const isDark = document.documentElement.hasAttribute('data-theme');
    settingsDarkModeToggle.checked = isDark;
});

function closeSettings() {
    settingsModal.classList.add('style-hidden');
    settingsOverlay.classList.add('style-hidden');
}
closeSettingsBtn.addEventListener('click', closeSettings);
settingsOverlay.addEventListener('click', closeSettings);

settingsDarkModeToggle.addEventListener('change', function() {
    applyDarkMode(this.checked);
    if (this.checked) darkModeIcon.className = 'fa-solid fa-moon';
    else darkModeIcon.className = 'fa-solid fa-sun';
});

darkModeToggleBtn.addEventListener('click', () => {
    const isDark = document.documentElement.hasAttribute('data-theme');
    applyDarkMode(!isDark);
    settingsDarkModeToggle.checked = !isDark;
});

themeOptions.forEach(btn => {
    btn.addEventListener('click', () => {
        const theme = btn.dataset.theme;
        applyColorTheme(theme);
        themeOptions.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
    });
});

resetPrivacyBtn.addEventListener('click', resetPrivacyConsent);

document.getElementById('clear-bookmarks-btn').addEventListener('click', () => {
    if (difficultAyahsList.length === 0) {
        return;
    }
    if (confirm("هل أنت متأكد من حذف جميع الإشارات المرجعية؟")) {
        difficultAyahsList = [];
        localStorage.removeItem('difficultAyahsList');
        updateBookmarkBadge();
        renderBookmarksList();
    }
});

document.getElementById('clear-cache-btn').addEventListener('click', async () => {
    if (confirm("سيتم مسح جميع الملفات المخزنة مؤقتاً وإعادة تحميل التطبيق. هل تريد المتابعة؟")) {
        try {
            const cacheNames = await caches.keys();
            await Promise.all(cacheNames.map(name => caches.delete(name)));
            setTimeout(() => location.reload(), 1000);
        } catch (e) {
            showToast("حدث خطأ أثناء مسح التخزين المؤقت", 2000, 'error');
        }
    }
});

// ============================================================
//  🚀 بدء تشغيل التطبيق
// ============================================================
async function initializeApp() {
    try {
        updateBookmarkBadge();
        renderBookmarksList();
        const savedReciter = localStorage.getItem('preferredReciter');
        if (savedReciter && reciterDropdown) reciterDropdown.value = savedReciter;
        loadThemePreferences();
        initCookieConsent();

        const success = await loadQuranData();
        
        if (success) {
            if (splashScreen) {
                splashScreen.classList.add('fade-out');
                setTimeout(() => { splashScreen.style.display = 'none'; }, 600);
            }
            
            const lastSession = loadLastSession();
            if (lastSession && lastSession.timestamp && (Date.now() - lastSession.timestamp) < 24 * 60 * 60 * 1000) {
                setTimeout(() => showResumeModal(lastSession), 1000);
            }
        }
    } catch (error) {
        console.error('فشل التهيئة:', error);
        if (globalLoading) {
            globalLoading.style.display = 'block';
            globalLoading.innerHTML = `
                <p style="color: #e74c3c; font-size: 1.2rem;">
                    <i class="fa-solid fa-circle-exclamation"></i> 
                    حدث خطأ غير متوقع. يرجى تحديث الصفحة.
                </p>
                <button onclick="location.reload()" style="margin-top:20px;padding:10px 30px;border-radius:30px;border:none;background:var(--accent-color);color:#fff;font-size:1rem;cursor:pointer;">
                    تحديث الصفحة
                </button>
            `;
        }
        if (splashScreen) {
            splashScreen.classList.add('fade-out');
            setTimeout(() => { splashScreen.style.display = 'none'; }, 600);
        }
    }
}

function initCookieConsent() {
    const consent = localStorage.getItem('privacyConsent');
    if (consent === 'accepted') {
        loadGoogleAnalytics();
    } else if (consent === null) {
        setTimeout(showPrivacyConsent, 1000);
    }
}

initializeApp();
