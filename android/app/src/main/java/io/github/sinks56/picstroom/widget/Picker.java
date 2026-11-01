package io.github.sinks56.picstroom.widget;

import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Random;
import java.util.Set;

/** Which pictures a widget may show (the pool) and which of them it shows now (the pick). */
public final class Picker {
    public static final long DAY_MS = 24L * 3600 * 1000;

    private Picker() {}

    public static List<Item> pool(WidgetConfig cfg, Snapshot snap, Map<String, List<Item>> nativeByFeed, long now) {
        if (WidgetConfig.KIND_FAVS.equals(cfg.kind)) return new ArrayList<>(snap.favs);

        Set<String> allowed = allowedFeeds(cfg, snap);
        long minT = cfg.days > 0 ? now - cfg.days * DAY_MS : 0;
        Map<String, String> titles = snap.feedTitles();

        List<Item> out = new ArrayList<>();
        Set<String> seenUrls = new HashSet<>();
        for (Item it : snap.imgs) {
            if (!allowed.contains(it.feedId)) continue;
            if (minT > 0 && it.t > 0 && it.t < minT) continue;
            if (seenUrls.add(it.url)) out.add(it);
        }
        if (nativeByFeed != null) {
            for (String feedId : allowed) {
                List<Item> list = nativeByFeed.get(feedId);
                if (list == null) continue;
                String title = titles.get(feedId);
                for (Item it : list) {
                    if (minT > 0 && it.t > 0 && it.t < minT) continue;
                    if (seenUrls.add(it.url)) out.add(new Item(it.id, feedId, title, it.url, it.src, it.title, it.t));
                }
            }
        }
        return out;
    }

    /** Feed ids a random-kind widget may draw from (selected feeds that still exist, or all feeds). */
    public static Set<String> allowedFeeds(WidgetConfig cfg, Snapshot snap) {
        Set<String> existing = new LinkedHashSet<>();
        for (Snapshot.FeedInfo f : snap.feeds) existing.add(f.id);
        if (!WidgetConfig.KIND_SEL.equals(cfg.kind)) return existing;
        Set<String> allowed = new LinkedHashSet<>();
        for (String id : cfg.feedIds) if (existing.contains(id)) allowed.add(id);
        return allowed;
    }

    /** Picks up to cfg.count pictures, avoiding `avoid` (recently shown ids) while there is anything else. */
    public static List<Item> pick(List<Item> pool, WidgetConfig cfg, Set<String> avoid, Random rnd) {
        int n = cfg.count;
        if (pool.isEmpty()) return new ArrayList<>();
        if (WidgetConfig.KIND_FAVS.equals(cfg.kind) && WidgetConfig.ORDER_NEWEST.equals(cfg.order)) {
            List<Item> sorted = new ArrayList<>(pool);
            Collections.sort(sorted, new Comparator<Item>() {
                @Override public int compare(Item a, Item b) { return Long.compare(b.t, a.t); }
            });
            return new ArrayList<>(sorted.subList(0, Math.min(n, sorted.size())));
        }
        List<Item> fresh = new ArrayList<>();
        List<Item> stale = new ArrayList<>();
        for (Item it : pool) (avoid != null && avoid.contains(it.id) ? stale : fresh).add(it);

        List<Item> out = pickFrom(fresh, n, rnd);
        if (out.size() < n) out.addAll(pickFrom(stale, n - out.size(), rnd));
        return out;
    }

    /** Random pick that spreads across feeds: each pick first chooses a feed, preferring ones not yet used. */
    static List<Item> pickFrom(List<Item> items, int n, Random rnd) {
        Map<String, List<Item>> byFeed = new LinkedHashMap<>();
        for (Item it : items) {
            List<Item> l = byFeed.get(it.feedId);
            if (l == null) byFeed.put(it.feedId, l = new ArrayList<>());
            l.add(it);
        }
        List<Item> out = new ArrayList<>();
        Set<String> used = new HashSet<>();
        while (out.size() < n && !byFeed.isEmpty()) {
            List<String> choices = new ArrayList<>();
            for (String f : byFeed.keySet()) if (!used.contains(f)) choices.add(f);
            if (choices.isEmpty()) choices.addAll(byFeed.keySet());
            String feed = choices.get(rnd.nextInt(choices.size()));
            List<Item> bucket = byFeed.get(feed);
            out.add(bucket.remove(rnd.nextInt(bucket.size())));
            used.add(feed);
            if (bucket.isEmpty()) byFeed.remove(feed);
        }
        return out;
    }
}
