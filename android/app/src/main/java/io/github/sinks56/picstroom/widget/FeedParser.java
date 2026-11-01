package io.github.sinks56.picstroom.widget;

import java.net.URI;
import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Date;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.TimeZone;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Minimal, forgiving RSS/Atom image extractor for widgets (the app itself parses feeds in
 * the web layer, which is not running when a widget refreshes). It only needs pictures,
 * links, titles and dates, so it works on text rather than a strict XML parse - real-world
 * feeds are often not well-formed.
 */
public final class FeedParser {
    private static final int MAX_ITEMS = 30;
    private static final int MAX_PER_ITEM = 4;

    private static final Pattern ITEM = Pattern.compile("<(item|entry)[\\s>].*?</\\1\\s*>", Pattern.DOTALL | Pattern.CASE_INSENSITIVE);
    private static final Pattern TITLE = Pattern.compile("<title[^>]*>(.*?)</title>", Pattern.DOTALL | Pattern.CASE_INSENSITIVE);
    private static final Pattern RSS_LINK = Pattern.compile("<link[^>]*>\\s*([^<\\s][^<]*?)\\s*</link>", Pattern.DOTALL | Pattern.CASE_INSENSITIVE);
    private static final Pattern ATOM_LINK = Pattern.compile("<link\\b[^>]*>", Pattern.CASE_INSENSITIVE);
    private static final Pattern DATE = Pattern.compile("<(?:pubDate|published|updated|dc:date)[^>]*>\\s*([^<]+?)\\s*</", Pattern.CASE_INSENSITIVE);
    private static final Pattern MEDIA = Pattern.compile("<media:(?:content|thumbnail)\\b[^>]*>", Pattern.CASE_INSENSITIVE);
    private static final Pattern ENCLOSURE = Pattern.compile("<enclosure\\b[^>]*>", Pattern.CASE_INSENSITIVE);
    private static final Pattern IMG = Pattern.compile("<img\\b[^>]*>", Pattern.CASE_INSENSITIVE);
    private static final Pattern IMG_SRC = Pattern.compile("\\b(?:data-src|data-lazy-src|data-original|src)\\s*=\\s*[\"']([^\"']+)[\"']", Pattern.CASE_INSENSITIVE);
    private static final Pattern IMG_EXT = Pattern.compile("\\.(?:jpe?g|png|webp|avif|gif)(?:[?#].*)?$", Pattern.CASE_INSENSITIVE);
    private static final Pattern JUNK = Pattern.compile("emoji|gravatar|avatar|pixel|spacer|blank\\.|1x1|/ads?/|feedburner\\.com/~|\\.svg|logo|badge|sprite|/smilies/|share[-_]?button", Pattern.CASE_INSENSITIVE);

    private FeedParser() {}

    public static List<Item> parse(String xml, String feedId, String feedTitle, String feedUrl, long now) {
        List<Item> out = new ArrayList<>();
        if (xml == null) return out;
        Matcher m = ITEM.matcher(xml);
        Set<String> seen = new LinkedHashSet<>();
        while (m.find() && out.size() < MAX_ITEMS * MAX_PER_ITEM) {
            String raw = m.group();
            String text = unwrap(raw);
            String title = clean(first(TITLE, text));
            String link = postLink(text, feedUrl);
            long t = parseDate(first(DATE, text));
            if (t <= 0) t = now;
            int added = 0;
            for (String img : images(text, feedUrl)) {
                if (!seen.add(img)) continue;
                out.add(new Item("n" + Integer.toHexString(img.hashCode()), feedId, feedTitle, img, link.isEmpty() ? img : link, title, t));
                if (++added >= MAX_PER_ITEM) break;
            }
        }
        return out.size() > MAX_ITEMS * 2 ? new ArrayList<>(out.subList(0, MAX_ITEMS * 2)) : out;
    }

    // ---- helpers ------------------------------------------------------------------

    /** Drop CDATA wrappers and, if the markup was entity-escaped, unescape the tags. */
    static String unwrap(String s) {
        String t = s.replace("<![CDATA[", "").replace("]]>", "");
        if (t.contains("&lt;")) t = t.replace("&lt;", "<").replace("&gt;", ">").replace("&quot;", "\"").replace("&#39;", "'").replace("&apos;", "'");
        return t;
    }

    static String first(Pattern p, String s) {
        Matcher m = p.matcher(s);
        return m.find() ? m.group(1) : "";
    }

    static String clean(String s) {
        String t = s.replaceAll("<[^>]+>", "").replace("&amp;", "&").replace("&#8217;", "\u2019").replace("&#8211;", "\u2013")
                .replace("&quot;", "\"").replace("&#39;", "'").replace("&nbsp;", " ").trim();
        return t.length() > 200 ? t.substring(0, 200) : t;
    }

    static String attr(String tag, String name) {
        Matcher m = Pattern.compile("\\b" + name + "\\s*=\\s*[\"']([^\"']*)[\"']", Pattern.CASE_INSENSITIVE).matcher(tag);
        return m.find() ? m.group(1) : "";
    }

    static String postLink(String item, String feedUrl) {
        String l = first(RSS_LINK, item);
        if (l.isEmpty()) {
            Matcher m = ATOM_LINK.matcher(item);
            String fallback = "";
            while (m.find()) {
                String tag = m.group();
                String href = attr(tag, "href");
                if (href.isEmpty()) continue;
                String rel = attr(tag, "rel");
                if (rel.isEmpty() || rel.equalsIgnoreCase("alternate")) { fallback = href; break; }
            }
            l = fallback;
        }
        return resolve(l.replace("&amp;", "&").trim(), feedUrl);
    }

    static List<String> images(String item, String feedUrl) {
        Set<String> out = new LinkedHashSet<>();
        // 1. media:content / thumbnail and enclosures that are pictures
        Matcher m = MEDIA.matcher(item);
        Set<String> thumbs = new LinkedHashSet<>();
        while (m.find()) {
            String tag = m.group();
            String url = attr(tag, "url");
            if (url.isEmpty()) continue;
            boolean thumb = tag.toLowerCase(Locale.ROOT).startsWith("<media:thumbnail");
            String type = attr(tag, "type").toLowerCase(Locale.ROOT);
            String medium = attr(tag, "medium").toLowerCase(Locale.ROOT);
            boolean isImage = type.startsWith("image/") || medium.equals("image") || thumb
                    || (type.isEmpty() && medium.isEmpty() && IMG_EXT.matcher(url).find());
            if (!isImage) continue;
            if (smallDeclared(tag)) continue;
            String r = accept(url, feedUrl);
            if (r != null) (thumb ? thumbs : out).add(r);
        }
        m = ENCLOSURE.matcher(item);
        while (m.find()) {
            String tag = m.group();
            String url = attr(tag, "url");
            String type = attr(tag, "type").toLowerCase(Locale.ROOT);
            if (url.isEmpty() || !(type.startsWith("image/") || (type.isEmpty() && IMG_EXT.matcher(url).find()))) continue;
            String r = accept(url, feedUrl);
            if (r != null) out.add(r);
        }
        // 2. <img> tags in the post body
        m = IMG.matcher(item);
        while (m.find()) {
            String tag = m.group();
            if (smallDeclared(tag)) continue;
            Matcher s = IMG_SRC.matcher(tag);
            String best = null;
            while (s.find()) {
                String u = s.group(1);
                if (u.startsWith("data:")) continue;
                if (tag.regionMatches(true, s.start(), "src", 0, 3) && best != null) continue; // prefer lazy-load original
                best = u;
            }
            if (best == null) continue;
            String r = accept(best, feedUrl);
            if (r != null) out.add(r);
        }
        if (out.isEmpty()) out.addAll(thumbs);
        return new ArrayList<>(out);
    }

    private static boolean smallDeclared(String tag) {
        int w = intAttr(tag, "width");
        int h = intAttr(tag, "height");
        return (w > 0 && w < 200) || (h > 0 && h < 120);
    }

    private static int intAttr(String tag, String name) {
        String v = attr(tag, name).replaceAll("[^0-9]", "");
        if (v.isEmpty() || v.length() > 5) return 0;
        return Integer.parseInt(v);
    }

    private static String accept(String url, String feedUrl) {
        String u = resolve(url.replace("&amp;", "&").trim(), feedUrl);
        if (u.isEmpty() || JUNK.matcher(u).find()) return null;
        return u;
    }

    static String resolve(String url, String base) {
        if (url == null || url.isEmpty()) return "";
        if (url.startsWith("//")) return "https:" + url;
        if (url.startsWith("http://")) return "https://" + url.substring(7);
        if (url.startsWith("https://")) return url;
        if (url.startsWith("/") && base != null) {
            try {
                URI b = new URI(base);
                if (b.getHost() != null) return "https://" + b.getHost() + url;
            } catch (Exception ignored) { }
        }
        return "";
    }

    private static final String[] DATE_FORMATS = {
            "EEE, dd MMM yyyy HH:mm:ss Z", "EEE, dd MMM yyyy HH:mm:ss zzz", "EEE, d MMM yyyy HH:mm:ss Z",
            "yyyy-MM-dd'T'HH:mm:ssXXX", "yyyy-MM-dd'T'HH:mm:ss'Z'", "yyyy-MM-dd'T'HH:mm:ss.SSSXXX", "yyyy-MM-dd HH:mm:ss"
    };

    static long parseDate(String s) {
        if (s == null || s.isEmpty()) return 0;
        String v = s.trim().replaceAll("(\\d{2}:\\d{2}:\\d{2})\\.\\d+", "$1");
        for (String f : DATE_FORMATS) {
            try {
                SimpleDateFormat df = new SimpleDateFormat(f, Locale.US);
                df.setTimeZone(TimeZone.getTimeZone("UTC"));
                Date d = df.parse(v);
                if (d != null) return d.getTime();
            } catch (Exception ignored) { }
        }
        return 0;
    }
}
