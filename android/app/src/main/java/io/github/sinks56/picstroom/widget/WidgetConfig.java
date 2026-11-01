package io.github.sinks56.picstroom.widget;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.util.LinkedHashSet;
import java.util.Set;

/** Per-widget settings. Stored as JSON in SharedPreferences, one entry per widget id. */
public final class WidgetConfig {
    public static final String KIND_FAVS = "favs";
    public static final String KIND_ALL = "all";
    public static final String KIND_SEL = "sel";

    public static final String TAP_OPEN = "open";       // open the tapped picture in PicStroom
    public static final String TAP_SHUFFLE = "shuffle"; // show new pictures
    public static final String TAP_APP = "app";         // just open PicStroom

    public static final String LAYOUT_FEATURE = "feature";
    public static final String LAYOUT_EVEN = "even";

    public static final String ORDER_RANDOM = "random";
    public static final String ORDER_NEWEST = "newest";

    /** Refresh choices in minutes; 0 = manual only. Android's periodic work minimum is 15 min. */
    public static final int[] REFRESH_MINUTES = {15, 30, 60, 180, 360, 1440, 0};
    public static final int[] DAY_CHOICES = {0, 1, 7, 30, 90}; // 0 = any age

    public String kind = KIND_ALL;
    public int count = 3;
    public String layout = LAYOUT_FEATURE;
    public int refreshMin = 60;
    public String tap = TAP_OPEN;
    public boolean caption = false;
    public boolean fit = false;
    public boolean wifiOnly = false;
    public int days = 0;
    public String order = ORDER_RANDOM;
    public boolean shuffleButton = true;
    public Set<String> feedIds = new LinkedHashSet<>();

    public WidgetConfig() {}

    public WidgetConfig(String kind) {
        this.kind = kind;
        if (KIND_FAVS.equals(kind)) count = 2;
    }

    public boolean hero() { return LAYOUT_FEATURE.equals(layout); }

    public boolean isRandomKind() { return !KIND_FAVS.equals(kind); }

    /** Newest-first favourites are a fixed set, so shuffling makes no sense there. */
    public boolean canShuffle() { return !(KIND_FAVS.equals(kind) && ORDER_NEWEST.equals(order)); }

    public WidgetConfig clamp() {
        count = Math.max(1, Math.min(5, count));
        if (!LAYOUT_EVEN.equals(layout)) layout = LAYOUT_FEATURE;
        if (!TAP_SHUFFLE.equals(tap) && !TAP_APP.equals(tap)) tap = TAP_OPEN;
        if (!ORDER_NEWEST.equals(order)) order = ORDER_RANDOM;
        if (!(KIND_FAVS.equals(kind) || KIND_SEL.equals(kind))) kind = KIND_ALL;
        boolean ok = false;
        for (int m : REFRESH_MINUTES) if (m == refreshMin) ok = true;
        if (!ok) refreshMin = 60;
        if (days < 0) days = 0;
        return this;
    }

    public String toJson() {
        try {
            JSONObject o = new JSONObject();
            o.put("kind", kind).put("count", count).put("layout", layout).put("refreshMin", refreshMin)
                    .put("tap", tap).put("caption", caption).put("fit", fit).put("wifiOnly", wifiOnly)
                    .put("days", days).put("order", order).put("shuffleButton", shuffleButton);
            JSONArray a = new JSONArray();
            for (String id : feedIds) a.put(id);
            o.put("feedIds", a);
            return o.toString();
        } catch (JSONException e) {
            throw new IllegalStateException(e);
        }
    }

    public static WidgetConfig fromJson(String json) {
        try {
            JSONObject o = new JSONObject(json);
            WidgetConfig c = new WidgetConfig(o.optString("kind", KIND_ALL));
            c.count = o.optInt("count", c.count);
            c.layout = o.optString("layout", c.layout);
            c.refreshMin = o.optInt("refreshMin", c.refreshMin);
            c.tap = o.optString("tap", c.tap);
            c.caption = o.optBoolean("caption", c.caption);
            c.fit = o.optBoolean("fit", c.fit);
            c.wifiOnly = o.optBoolean("wifiOnly", c.wifiOnly);
            c.days = o.optInt("days", c.days);
            c.order = o.optString("order", c.order);
            c.shuffleButton = o.optBoolean("shuffleButton", c.shuffleButton);
            JSONArray a = o.optJSONArray("feedIds");
            if (a != null) for (int i = 0; i < a.length(); i++) c.feedIds.add(a.optString(i));
            return c.clamp();
        } catch (JSONException e) {
            return null;
        }
    }
}
