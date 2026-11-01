package io.github.sinks56.picstroom.widget;

import org.json.JSONException;
import org.json.JSONObject;

/** One picture a widget can show: a feed image or a favourite. */
public final class Item {
    public final String id;
    public final String feedId;
    public final String feed;   // feed title (caption); may be empty
    public final String url;    // image url
    public final String src;    // post url
    public final String title;  // may be empty
    public final long t;        // publish / saved time, ms

    public Item(String id, String feedId, String feed, String url, String src, String title, long t) {
        this.id = id == null ? "" : id;
        this.feedId = feedId == null ? "" : feedId;
        this.feed = feed == null ? "" : feed;
        this.url = url == null ? "" : url;
        this.src = src == null || src.isEmpty() ? this.url : src;
        this.title = title == null ? "" : title;
        this.t = t;
    }

    public JSONObject toJson() throws JSONException {
        JSONObject o = new JSONObject();
        o.put("id", id).put("feedId", feedId).put("feed", feed).put("url", url)
                .put("src", src).put("title", title).put("t", t);
        return o;
    }

    public static Item fromJson(JSONObject o) {
        return new Item(o.optString("id"), o.optString("feedId"), o.optString("feed"), o.optString("url"),
                o.optString("src"), o.optString("title"), o.optLong("t"));
    }
}
