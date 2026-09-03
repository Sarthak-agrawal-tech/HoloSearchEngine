import { CheerioCrawler } from 'crawlee';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface PageResult {
    url: string;
    title: string | null;
    textContent: string | null;
    excerpt: string | null;
    textLength: number;
    wordCount: number;
}

// -------------------------------------------------------------
// 🚀 MASSIVE SEED GENERATOR (Discovers ALL 25,000+ Anime on MAL)
// -------------------------------------------------------------
const SEED_URLS: string[] = [];

// 1. Top Anime List Pagination (Top 10,000 anime)
for (let limit = 0; limit <= 10000; limit += 50) {
    SEED_URLS.push(`https://myanimelist.net/topanime.php?limit=${limit}`);
}

// 2. A-Z Letter Index Pagination (Covers entire alphabetical database)
const LETTERS = ['0-9', ...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')];
for (const letter of LETTERS) {
    // Paginate each letter up to show=1500 (30 pages per letter = 1,500 anime per letter)
    for (let show = 0; show <= 1500; show += 50) {
        SEED_URLS.push(`https://myanimelist.net/anime.php?letter=${letter}&show=${show}`);
    }
}

// 3. Seasonal Archive Seeds (2000 to 2026 - covers all past/present seasonal anime)
const SEASONS = ['winter', 'spring', 'summer', 'fall'];
for (let year = 2000; year <= 2026; year++) {
    for (const season of SEASONS) {
        SEED_URLS.push(`https://myanimelist.net/anime/season/${year}/${season}`);
    }
}

// 4. Popular Genre Seeds (Genres 1 to 50)
for (let genreId = 1; genreId <= 50; genreId++) {
    SEED_URLS.push(`https://myanimelist.net/anime/genre/${genreId}`);
}

const OUTPUT_PATH = path.resolve(__dirname, '..', 'data', 'crawl-results.json');

// State tracking sets for fast deduplication
let results: PageResult[] = [];
const seenAnimeIds = new Set<string>();
const seenUrls = new Set<string>();

let pagesProcessed = 0;
let newPagesExtracted = 0;

/**
 * Loads previous crawl data to ensure zero re-crawling of old items.
 */
async function loadExistingResults() {
    try {
        const fileData = await fs.readFile(OUTPUT_PATH, 'utf-8');
        const existing: PageResult[] = JSON.parse(fileData);
        results = existing;
        for (const item of results) {
            seenUrls.add(item.url);
            const match = item.url.match(/\/anime\/(\d+)/);
            if (match) {
                seenAnimeIds.add(match[1]);
            }
        }
        console.log(`[RESUME] Loaded ${results.length} previously saved anime entries from disk.`);
    } catch {
        console.log(`[NEW] Starting a new dataset.`);
    }
}

const crawler = new CheerioCrawler({
    useSessionPool: true,
    sessionPoolOptions: {
        maxPoolSize: 50,
    },

    // Speed & Politeness Settings
    maxRequestsPerCrawl: 250000,
    maxConcurrency: 6, // Increased concurrency for higher throughput
    requestHandlerTimeoutSecs: 30,
    maxRequestRetries: 3,

    async requestHandler({ request, body, $, enqueueLinks }) {
        pagesProcessed++;

        // High-capacity link discovery
        await enqueueLinks({
            regexps: [
                // Anime overview detail pages
                /^https:\/\/myanimelist\.net\/anime\/\d+(?:\/[\w-]+)?\/?$/,

                // Letter index pagination
                /^https:\/\/myanimelist\.net\/anime\.php\?letter=[\w-]+(&show=\d+)?$/,

                // Top anime pagination
                /^https:\/\/myanimelist\.net\/topanime\.php\?limit=\d+$/,

                // Genre & Season pagination
                /^https:\/\/myanimelist\.net\/anime\/genre\/\d+/,
                /^https:\/\/myanimelist\.net\/anime\/season\/\d{4}\/\w+/,
            ],
            limit: 1000, // Enqueue up to 1000 links per page for deep discovery
        });

        // Skip discovery/listing pages from being saved into the JSON database
        if (
            request.url.includes('/anime.php?') ||
            request.url.includes('/topanime.php') ||
            request.url.includes('/anime/genre/') ||
            request.url.includes('/anime/season/')
        ) {
            return;
        }

        // Ignore junk non-overview subpages
        if (
            request.url.includes('/characters') ||
            request.url.includes('/staff') ||
            request.url.includes('/reviews') ||
            request.url.includes('/forum') ||
            request.url.includes('/pics') ||
            request.url.includes('/episode') ||
            request.url.includes('/userrecs') ||
            request.url.includes('/stats') ||
            request.url.includes('/video')
        ) {
            return;
        }

        // Deduplicate by numeric Anime ID
        const animeIdMatch = request.url.match(/\/anime\/(\d+)/);
        if (!animeIdMatch) return;

        const animeId = animeIdMatch[1];
        if (seenAnimeIds.has(animeId)) {
            return;
        }
        seenAnimeIds.add(animeId);
        seenUrls.add(request.url);

        // Targeted DOM Extraction
        const title = $('h1.title-name').text().trim() || $('span[itemprop="name"]').text().trim() || $('title').text().trim();
        const synopsis = $('[itemprop="description"]').text().trim();
        const sidebarInfo = $('.spaceit_pad').text().trim();
        const score = $('.score-label').text().trim();

        const fullContent = `Title: ${title}\nScore: ${score}\n\nSynopsis:\n${synopsis}\n\nDetails:\n${sidebarInfo}`.trim();

        if (!synopsis || fullContent.length < 50) {
            return;
        }

        const result: PageResult = {
            url: request.url,
            title: title,
            textContent: fullContent,
            excerpt: synopsis.substring(0, 200),
            textLength: fullContent.length,
            wordCount: fullContent.split(/\s+/).length,
        };

        results.push(result);
        newPagesExtracted++;
        console.log(`[OK] (${results.length}) ${title} | +${newPagesExtracted} new in this session`);

        // Periodically write to disk every 20 items
        if (results.length % 20 === 0) {
            await fs.mkdir(path.dirname(OUTPUT_PATH), { recursive: true });
            await fs.writeFile(OUTPUT_PATH, JSON.stringify(results, null, 2), 'utf-8');
        }
    },

    failedRequestHandler({ request }) {
        console.error(`[FAIL] ${request.url} - ${request.errorMessages ?? 'Unknown error'}`);
    },
});

async function main() {
    await loadExistingResults();

    console.log(`Initialized ${SEED_URLS.length} discovery seed URLs...\n`);

    await crawler.run(SEED_URLS);

    await fs.mkdir(path.dirname(OUTPUT_PATH), { recursive: true });
    await fs.writeFile(OUTPUT_PATH, JSON.stringify(results, null, 2), 'utf-8');

    console.log(`\nCrawl session complete.`);
    console.log(`New anime added in this run: ${newPagesExtracted}`);
    console.log(`Total database size: ${results.length} unique anime.`);
    console.log(`Saved to → ${OUTPUT_PATH}`);
}

main().catch((err) => {
    console.error('Fatal:', err);
    process.exit(1);
});