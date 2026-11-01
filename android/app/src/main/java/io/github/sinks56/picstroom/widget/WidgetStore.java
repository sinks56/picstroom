package io.github.sinks56.picstroom.widget;

import android.appwidget.AppWidgetManager;
import android.content.ComponentName;
import android.content.Context;
import android.content.SharedPreferences;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/** Everything widgets persist: per-widget config and state, the app's snapshot, and natively fetched pictures. */
public final class WidgetStore {
    private static final String PREFS = "picstroom_widgets";
    private static final String SNAPSHOT_FILE = "widget-data.json";
    private static final String NATIVE_FILE = "widget-native.json";
    private static final int SEEN_MAX = 150;

    private WidgetStore() {}

    private static SharedPreferences prefs(Context c) {
        return c.getApplicationContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    // ---- config ---------------------------------------------------------------------

    public static void saveConfig(Context c, int id, WidgetConfig cfg) {
        prefs(c).edit().putString("cfg_" + id, cfg.clamp().toJson()).apply();
    }

    public static WidgetConfig loadConfig(Context c, int id) {
        String j = prefs(c).getString("cfg_" + id, null);
        return j == null ? null : WidgetConfig.fromJson(j);
    }

    public static void deleteWidget(Context c, int id) {
        prefs(c).edit().remove("cfg_" + id).remove("state_" + id).apply();
    }

    /** All widget ids of PicStroom's three widget types. */
    public static List<Integer> widgetIds(Context c) {
        AppWidgetManager m = AppWidgetManager.getInstance(c);
        List<Integer> ids = new ArrayList<>();
        for (Class<?> k : new Class<?>[]{FavoritesWidget.class, RandomWidget.class, SelectedWidget.class}) {
            for (int id : m.getAppWidgetIds(new ComponentName(c, k))) ids.add(id);
        }
        return ids;
    }

    // ---- per-widget state (what is shown right now, and what was shown recently) ------

    public static final class State {
        public List<Item> picks = new ArrayList<>();
        public Set<String> seen = new LinkedHashSet<>();
        public long at;
    }

    public static State loadState(Context c, int id) {
        State s = new State();
        String j = prefs(c).getString("state_" + id, null);
        if (j == null) return s;
        try {
            JSONObject o = new JSONObject(j);
            s.at = o.optLong("at");
            JSONArray p = o.optJSONArray("picks");
            if (p != null) for (int i = 0; i < p.length(); i++) s.picks.add(Item.fromJson(p.getJSONObject(i)));
            JSONArray se = o.optJSONArray("seen");
            if (se != null) for (int i = 0; i < se.length(); i++) s.seen.add(se.getString(i));
        } catch (JSONException ignored) { }
        return s;
    }

    public static void saveState(Context c, int id, State s) {
        try {
            JSONObject o = new JSONObject();
            o.put("at", s.at);
            JSONArray p = new JSONArray();
            for (Item it : s.picks) p.put(it.toJson());
            o.put("picks", p);
            // keep only the most recent ids
            List<String> seen = new ArrayList<>(s.seen);
            if (seen.size() > SEEN_MAX) seen = seen.subList(seen.size() - SEEN_MAX, seen.size());
            JSONArray se = new JSONArray();
            for (String x : seen) se.put(x);
            o.put("seen", se);
            prefs(c).edit().putString("state_" + id, o.toString()).apply();
        } catch (JSONException ignored) { }
    }

    public static void clearState(Context c, int id) {
        prefs(c).edit().remove("state_" + id).apply();
    }

    // ---- snapshot written by the app -------------------------------------------------

    private static Snapshot cachedSnapshot;
    private static long cachedStamp = -1;

    public static synchronized void saveSnapshot(Context c, String json) throws IOException {
        writeAtomic(new File(c.getFilesDir(), SNAPSHOT_FILE), json);
        cachedSnapshot = null;
    }

    public static synchronized Snapshot loadSnapshot(Context c) {
        File f = new File(c.getFilesDir(), SNAPSHOT_FILE);
        long stamp = f.exists() ? f.lastModified() * 31 + f.length() : 0;
        if (cachedSnapshot != null && stamp == cachedStamp) return cachedSnapshot;
        Snapshot s;
        try {
            s = f.exists() ? Snapshot.parse(read(f)) : new Snapshot();
        } catch (IOException e) {
            s = new Snapshot();
        }
        cachedSnapshot = s;
        cachedStamp = stamp;
        return s;
    }

    // ---- pictures fetched natively from the feeds ------------------------------------

    public static synchronized Map<String, List<Item>> loadNative(Context c) {
        Map<String, List<Item>> out = new HashMap<>();
        File f = new File(c.getFilesDir(), NATIVE_FILE);
        if (!f.exists()) return out;
        try {
            JSONObject o = new JSONObject(read(f));
            java.util.Iterator<String> keys = o.keys();
            while (keys.hasNext()) {
                String feedId = keys.next();
                JSONArray a = o.getJSONArray(feedId);
                List<Item> list = new ArrayList<>();
                for (int i = 0; i < a.length(); i++) list.add(Item.fromJson(a.getJSONObject(i)));
                out.put(feedId, list);
            }
        } catch (IOException | JSONException ignored) { }
        return out;
    }

    public static synchronized void saveNative(Context c, Map<String, List<Item>> data) throws IOException {
        try {
            JSONObject o = new JSONObject();
            for (Map.Entry<String, List<Item>> e : data.entrySet()) {
                JSONArray a = new JSONArray();
                for (Item it : e.getValue()) a.put(it.toJson());
                o.put(e.getKey(), a);
            }
            writeAtomic(new File(c.getFilesDir(), NATIVE_FILE), o.toString());
        } catch (JSONException e) {
            throw new IOException(e);
        }
    }

    // ---- files ------------------------------------------------------------------------

    static String read(File f) throws IOException {
        try (InputStream in = new FileInputStream(f)) {
            ByteArrayOutputStream bo = new ByteArrayOutputStream();
            byte[] buf = new byte[16384];
            int n;
            while ((n = in.read(buf)) > 0) bo.write(buf, 0, n);
            return new String(bo.toByteArray(), StandardCharsets.UTF_8);
        }
    }

    static void writeAtomic(File f, String text) throws IOException {
        File tmp = new File(f.getParentFile(), f.getName() + ".tmp");
        try (FileOutputStream out = new FileOutputStream(tmp)) {
            out.write(text.getBytes(StandardCharsets.UTF_8));
            out.getFD().sync();
        }
        if (!tmp.renameTo(f)) {
            if (f.exists() && !f.delete()) throw new IOException("cannot replace " + f);
            if (!tmp.renameTo(f)) throw new IOException("cannot write " + f);
        }
    }
}
