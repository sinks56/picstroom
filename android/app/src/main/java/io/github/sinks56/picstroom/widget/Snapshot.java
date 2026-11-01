package io.github.sinks56.picstroom.widget;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/** The feeds, newest pictures and favourites the app last synced to native storage. */
public final class Snapshot {
    public static final class FeedInfo {
        public final String id, title, url;
        public final int order;
        public FeedInfo(String id, String title, String url, int order) {
            this.id = id; this.title = title; this.url = url; this.order = order;
        }
    }

    public final List<FeedInfo> feeds = new ArrayList<>();
    public final List<Item> favs = new ArrayList<>();
    public final List<Item> imgs = new ArrayList<>();
    public long at;

    public boolean isEmpty() { return feeds.isEmpty() && favs.isEmpty() && imgs.isEmpty(); }

    public Map<String, String> feedTitles() {
        Map<String, String> m = new LinkedHashMap<>();
        for (FeedInfo f : feeds) m.put(f.id, f.title);
        return m;
    }

    public static Snapshot parse(String json) {
        Snapshot s = new Snapshot();
        if (json == null || json.isEmpty()) return s;
        try {
            JSONObject o = new JSONObject(json);
            s.at = o.optLong("at");
            JSONArray feeds = o.optJSONArray("feeds");
            Map<String, String> titles = new LinkedHashMap<>();
            if (feeds != null) for (int i = 0; i < feeds.length(); i++) {
                JSONObject f = feeds.optJSONObject(i);
                if (f == null) continue;
                FeedInfo fi = new FeedInfo(f.optString("id"), f.optString("title"), f.optString("url"), f.optInt("order", i));
                s.feeds.add(fi);
                titles.put(fi.id, fi.title);
            }
            JSONArray favs = o.optJSONArray("favs");
            if (favs != null) for (int i = 0; i < favs.length(); i++) {
                JSONObject f = favs.optJSONObject(i);
                if (f == null) continue;
                Item it = new Item(f.optString("id"), f.optString("feedId"), f.optString("feed"), f.optString("url"),
                        f.optString("src"), f.optString("title"), f.optLong("t"));
                if (!it.url.isEmpty()) s.favs.add(it);
            }
            JSONArray imgs = o.optJSONArray("imgs");
            if (imgs != null) for (int i = 0; i < imgs.length(); i++) {
                JSONObject f = imgs.optJSONObject(i);
                if (f == null) continue;
                String feedId = f.optString("feedId");
                Item it = new Item(f.optString("id"), feedId, titles.get(feedId), f.optString("url"),
                        f.optString("src"), f.optString("title"), f.optLong("t"));
                if (!it.url.isEmpty()) s.imgs.add(it);
            }
        } catch (JSONException ignored) {
            // A corrupt file just means "nothing synced yet".
        }
        return s;
    }
}
