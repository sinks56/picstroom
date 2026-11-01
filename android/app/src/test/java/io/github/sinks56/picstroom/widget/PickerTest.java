package io.github.sinks56.picstroom.widget;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Random;
import java.util.Set;

public class PickerTest {
    private static final long DAY = Picker.DAY_MS;

    private static Item item(String id, String feed, long t) {
        return new Item(id, feed, "Feed " + feed, "https://img.test/" + id + ".jpg", "https://" + feed + ".test/" + id, "", t);
    }

    private static Snapshot snapshot() {
        Snapshot s = new Snapshot();
        s.feeds.add(new Snapshot.FeedInfo("a", "Feed a", "https://a.test/rss", 0));
        s.feeds.add(new Snapshot.FeedInfo("b", "Feed b", "https://b.test/rss", 1));
        s.feeds.add(new Snapshot.FeedInfo("c", "Feed c", "https://c.test/rss", 2));
        long now = 100 * DAY;
        for (int i = 0; i < 20; i++) s.imgs.add(item("a" + i, "a", now - i * DAY));
        for (int i = 0; i < 3; i++) s.imgs.add(item("b" + i, "b", now - i * DAY));
        s.imgs.add(item("c0", "c", now));
        s.favs.add(item("f1", "a", 10));
        s.favs.add(item("f2", "b", 30));
        s.favs.add(item("f3", "c", 20));
        return s;
    }

    @Test
    public void selectedPoolOnlyHasSelectedFeedsThatStillExist() {
        WidgetConfig cfg = new WidgetConfig(WidgetConfig.KIND_SEL);
        cfg.feedIds.add("b");
        cfg.feedIds.add("deleted");
        List<Item> pool = Picker.pool(cfg, snapshot(), null, 100 * DAY);
        assertEquals(3, pool.size());
        for (Item it : pool) assertEquals("b", it.feedId);
    }

    @Test
    public void daysFilterDropsOldPictures() {
        WidgetConfig cfg = new WidgetConfig(WidgetConfig.KIND_ALL);
        cfg.days = 7;
        List<Item> pool = Picker.pool(cfg, snapshot(), null, 100 * DAY);
        for (Item it : pool) assertTrue(it.id, it.t >= 93 * DAY);
        assertFalse(pool.isEmpty());
    }

    @Test
    public void nativePicturesAreMergedWithoutDuplicates() {
        WidgetConfig cfg = new WidgetConfig(WidgetConfig.KIND_ALL);
        Map<String, List<Item>> nat = new HashMap<>();
        List<Item> l = new ArrayList<>();
        l.add(item("a0", "a", 1));          // same url as a snapshot picture
        l.add(item("n1", "a", 100 * DAY));
        nat.put("a", l);
        nat.put("gone", l);                  // feed no longer exists
        int base = Picker.pool(cfg, snapshot(), null, 100 * DAY).size();
        assertEquals(base + 1, Picker.pool(cfg, snapshot(), nat, 100 * DAY).size());
    }

    @Test
    public void favouritesPoolIsTheFavourites() {
        WidgetConfig cfg = new WidgetConfig(WidgetConfig.KIND_FAVS);
        assertEquals(3, Picker.pool(cfg, snapshot(), null, 0).size());
    }

    @Test
    public void pickReturnsDistinctPicturesSpreadAcrossFeeds() {
        WidgetConfig cfg = new WidgetConfig(WidgetConfig.KIND_ALL);
        cfg.count = 3;
        List<Item> pool = Picker.pool(cfg, snapshot(), null, 100 * DAY);
        Random rnd = new Random(1);
        for (int run = 0; run < 50; run++) {
            List<Item> pick = Picker.pick(pool, cfg, new HashSet<String>(), rnd);
            assertEquals(3, pick.size());
            Set<String> ids = new HashSet<>(), feeds = new HashSet<>();
            for (Item it : pick) { ids.add(it.id); feeds.add(it.feedId); }
            assertEquals(3, ids.size());
            assertEquals("three feeds available, so three different feeds", 3, feeds.size());
        }
    }

    @Test
    public void pickAvoidsRecentlyShownWhileThereIsAnythingElse() {
        WidgetConfig cfg = new WidgetConfig(WidgetConfig.KIND_SEL);
        cfg.feedIds.add("b");
        cfg.count = 2;
        List<Item> pool = Picker.pool(cfg, snapshot(), null, 100 * DAY);
        Set<String> avoid = new HashSet<>();
        avoid.add("b0");
        avoid.add("b1");
        Random rnd = new Random(3);
        for (int run = 0; run < 20; run++) {
            List<Item> pick = Picker.pick(pool, cfg, avoid, rnd);
            assertEquals(2, pick.size());
            boolean usesB2 = false;
            for (Item it : pick) if (it.id.equals("b2")) usesB2 = true;
            assertTrue("the only unseen picture must be used", usesB2);
        }
    }

    @Test
    public void smallPoolsReturnWhatThereIs() {
        WidgetConfig cfg = new WidgetConfig(WidgetConfig.KIND_SEL);
        cfg.feedIds.add("c");
        cfg.count = 5;
        List<Item> pool = Picker.pool(cfg, snapshot(), null, 100 * DAY);
        assertEquals(1, Picker.pick(pool, cfg, new HashSet<String>(), new Random()).size());
        assertEquals(0, Picker.pick(new ArrayList<Item>(), cfg, null, new Random()).size());
    }

    @Test
    public void newestFirstFavouritesAreOrderedBySaveTime() {
        WidgetConfig cfg = new WidgetConfig(WidgetConfig.KIND_FAVS);
        cfg.order = WidgetConfig.ORDER_NEWEST;
        cfg.count = 2;
        List<Item> pick = Picker.pick(Picker.pool(cfg, snapshot(), null, 0), cfg, null, new Random());
        assertEquals("f2", pick.get(0).id);
        assertEquals("f3", pick.get(1).id);
    }

    @Test
    public void removedFavouritesDropOutOfCurrentPicks() {
        WidgetConfig cfg = new WidgetConfig(WidgetConfig.KIND_FAVS);
        Snapshot s = snapshot();
        List<Item> picks = new ArrayList<>(s.favs.subList(0, 2)); // f1, f2
        s.favs.remove(0);                                          // f1 un-favourited
        List<Item> kept = WidgetUpdater.keepValid(cfg, s, Picker.pool(cfg, s, null, 0), picks);
        assertEquals(1, kept.size());
        assertEquals("f2", kept.get(0).id);
    }
}
