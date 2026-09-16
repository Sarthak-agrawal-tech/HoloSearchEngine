import { CheerioCrawler } from 'crawlee';

const crawler = new CheerioCrawler({
    async requestHandler({ request, $ }) {
        console.log("Got page:", request.url);
        
        // Let's just find anything with "crunchyroll" in the href
        const crunchy = $('a[href*="crunchyroll.com"]').map((_, el) => ({
            text: $(el).text().trim(),
            href: $(el).attr('href'),
            title: $(el).attr('title'),
            class: $(el).attr('class')
        })).get();
        console.log("Crunchyroll links:", crunchy);
    }
});

crawler.run(['https://myanimelist.net/anime/20/Naruto']);
