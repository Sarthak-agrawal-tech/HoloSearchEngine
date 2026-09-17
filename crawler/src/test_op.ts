import { CheerioCrawler } from 'crawlee';

const crawler = new CheerioCrawler({
    async requestHandler({ request, $ }) {
        console.log("\n\n--- Testing Streaming Selectors on:", request.url, "---");
        
        // Let's test a few different CSS selectors
        
        const try1 = $('.pb16 a').map((_, el) => $(el).attr('title') || $(el).text().trim()).get();
        console.log("Selector .pb16 a:", try1);
        
        const try2 = $('.broadcast a').map((_, el) => $(el).attr('title') || $(el).text().trim()).get();
        console.log("Selector .broadcast a:", try2);
        
        const try3 = $('.js-streaming-platforms a').map((_, el) => $(el).attr('title') || $(el).text().trim()).get();
        console.log("Selector .js-streaming-platforms a:", try3);

        const try4 = $('.anime-detail-header-stats a').map((_, el) => $(el).attr('title') || $(el).text().trim()).get();
        console.log("Selector .anime-detail-header-stats a:", try4);

        // Find all links containing crunchyroll or netflix just to be sure
        const crLinks = $('a[href*="crunchyroll.com"], a[href*="netflix.com"]').map((_, el) => ({
            title: $(el).attr('title'),
            href: $(el).attr('href'),
            parentClass: $(el).parent().attr('class')
        })).get();
        console.log("Hardcoded platform links found:", crLinks);
    }
});

crawler.run(['https://myanimelist.net/anime/21/One_Piece']);
