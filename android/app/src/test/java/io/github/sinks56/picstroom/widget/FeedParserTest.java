package io.github.sinks56.picstroom.widget;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

import java.util.List;

public class FeedParserTest {
    private static final String BASE = "https://blog.test/feed";

    private static List<Item> parse(String xml) {
        return FeedParser.parse(xml, "f1", "Blog", BASE, 1_700_000_000_000L);
    }

    @Test
    public void rssWithMediaContentAndEnclosure() {
        String xml = "<rss><channel><item><title>Hello &amp; welcome</title><link>https://blog.test/p1</link>"
                + "<pubDate>Mon, 02 Oct 2023 10:00:00 +0000</pubDate>"
                + "<media:content url=\"https://cdn.test/a.jpg\" medium=\"image\" width=\"1200\" height=\"800\"/>"
                + "<enclosure url=\"https://cdn.test/b.png\" type=\"image/png\"/>"
                + "</item></channel></rss>";
        List<Item> items = parse(xml);
        assertEquals(2, items.size());
        assertEquals("https://cdn.test/a.jpg", items.get(0).url);
        assertEquals("https://blog.test/p1", items.get(0).src);
        assertEquals("Hello & welcome", items.get(0).title);
        assertEquals("Blog", items.get(0).feed);
        assertEquals(1696240800000L, items.get(0).t);
    }

    @Test
    public void imagesInsideCdataAndEscapedHtml() {
        String xml = "<rss><item><title>T</title><link>https://blog.test/p2</link>"
                + "<description><![CDATA[<p>hi</p><img src=\"https://cdn.test/c.jpg?w=800&amp;h=600\" width=\"800\">]]></description></item>"
                + "<item><title>U</title><link>https://blog.test/p3</link>"
                + "<description>&lt;img src=&quot;//cdn.test/d.jpg&quot;&gt;</description></item></rss>";
        List<Item> items = parse(xml);
        assertEquals(2, items.size());
        assertEquals("https://cdn.test/c.jpg?w=800&h=600", items.get(0).url);
        assertEquals("https://cdn.test/d.jpg", items.get(1).url);
    }

    @Test
    public void atomEntriesAndRelativeUrls() {
        String xml = "<feed><entry><title>A</title><link rel=\"alternate\" href=\"https://blog.test/e1\"/>"
                + "<updated>2023-10-02T10:00:00Z</updated>"
                + "<content type=\"html\">&lt;img data-src=\"/uploads/e1.jpg\" src=\"data:image/gif;base64,AAAA\"&gt;</content></entry></feed>";
        List<Item> items = parse(xml);
        assertEquals(1, items.size());
        assertEquals("https://blog.test/uploads/e1.jpg", items.get(0).url);
        assertEquals("https://blog.test/e1", items.get(0).src);
        assertEquals(1696240800000L, items.get(0).t);
    }

    @Test
    public void skipsTrackingPixelsEmojiAndTinyPictures() {
        String xml = "<rss><item><title>T</title><link>https://blog.test/p</link><description><![CDATA["
                + "<img src=\"https://stats.test/pixel.gif\" width=\"1\" height=\"1\">"
                + "<img src=\"https://s.w.org/images/core/emoji/14/72x72/1f600.png\">"
                + "<img src=\"https://cdn.test/thumb.jpg\" width=\"64\" height=\"64\">"
                + "<img src=\"https://cdn.test/real.jpg\" width=\"900\" height=\"600\">]]></description></item></rss>";
        List<Item> items = parse(xml);
        assertEquals(1, items.size());
        assertEquals("https://cdn.test/real.jpg", items.get(0).url);
    }

    @Test
    public void thumbnailsAreOnlyUsedWhenNothingBetterExists() {
        String xml = "<rss><item><title>T</title><link>https://blog.test/p</link>"
                + "<media:thumbnail url=\"https://cdn.test/t.jpg\"/></item>"
                + "<item><title>U</title><link>https://blog.test/q</link>"
                + "<media:thumbnail url=\"https://cdn.test/t2.jpg\"/>"
                + "<media:content url=\"https://cdn.test/big.jpg\" medium=\"image\"/></item></rss>";
        List<Item> items = parse(xml);
        assertEquals(2, items.size());
        assertEquals("https://cdn.test/t.jpg", items.get(0).url);
        assertEquals("https://cdn.test/big.jpg", items.get(1).url);
    }

    @Test
    public void garbageAndEmptyFeedsGiveNothing() {
        assertTrue(parse("").isEmpty());
        assertTrue(parse("<html>not a feed</html>").isEmpty());
        assertTrue(parse(null).isEmpty());
    }

    @Test
    public void duplicatePicturesAreReportedOnce() {
        String xml = "<rss><item><title>T</title><link>https://blog.test/p</link>"
                + "<media:content url=\"https://cdn.test/a.jpg\" medium=\"image\"/>"
                + "<description><![CDATA[<img src=\"https://cdn.test/a.jpg\">]]></description></item></rss>";
        assertEquals(1, parse(xml).size());
    }
}
