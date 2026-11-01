package io.github.sinks56.picstroom.widget;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.content.Context;
import android.content.Intent;
import android.content.res.Configuration;
import android.graphics.Bitmap;
import android.net.ConnectivityManager;
import android.net.Uri;
import android.os.Bundle;
import android.util.Log;
import android.view.View;
import android.widget.RemoteViews;

import androidx.work.Data;
import androidx.work.ExistingWorkPolicy;
import androidx.work.OneTimeWorkRequest;
import androidx.work.WorkManager;

import java.io.IOException;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashSet;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Random;
import java.util.Set;

import io.github.sinks56.picstroom.R;

/** Chooses the pictures, draws the collage and pushes the RemoteViews to one widget. */
public final class WidgetUpdater {
    private static final String TAG = "PicStroomWidget";
    public static final String ACTION_SHUFFLE = "io.github.sinks56.picstroom.widget.SHUFFLE";

    public static final int A_INIT = 0;     // draw; pick only if nothing is shown yet
    public static final int A_REFRESH = 1;  // scheduled refresh: new pictures
    public static final int A_SHUFFLE = 2;  // user asked for new pictures
    public static final int A_SYNC = 3;     // the app synced new data: drop pictures that no longer apply
    public static final int A_RESIZE = 4;   // same pictures, new size

    public interface Cancel { boolean isCancelled(); }

    private static final int[] HITS = {R.id.hit0, R.id.hit1, R.id.hit2, R.id.hit3, R.id.hit4};
    private static final Random RND = new Random();

    private WidgetUpdater() {}

    // ---- scheduling ----------------------------------------------------------------

    public static void enqueue(Context ctx, int widgetId, int action) {
        Data data = new Data.Builder().putInt("id", widgetId).putInt("action", action).build();
        OneTimeWorkRequest req = new OneTimeWorkRequest.Builder(RenderWorker.class).setInputData(data).build();
        WorkManager.getInstance(ctx.getApplicationContext())
                .enqueueUniqueWork("render-" + widgetId, ExistingWorkPolicy.APPEND_OR_REPLACE, req);
    }

    public static void enqueueAll(Context ctx, int action) {
        for (int id : WidgetStore.widgetIds(ctx)) enqueue(ctx, id, action);
    }

    // ---- the update itself (call off the main thread) -----------------------------------

    public static void update(Context ctx, int id, int action, Cancel cancel) {
        Context app = ctx.getApplicationContext();
        WidgetConfig cfg = WidgetStore.loadConfig(app, id);
        if (cfg == null) return;
        AppWidgetManager mgr = AppWidgetManager.getInstance(app);
        Snapshot snap = WidgetStore.loadSnapshot(app);
        Map<String, List<Item>> nativeItems = cfg.isRandomKind() ? WidgetStore.loadNative(app) : null;
        long now = System.currentTimeMillis();
        List<Item> pool = Picker.pool(cfg, snap, nativeItems, now);
        WidgetStore.State st = WidgetStore.loadState(app, id);

        // 1. which pictures
        boolean newest = WidgetConfig.KIND_FAVS.equals(cfg.kind) && WidgetConfig.ORDER_NEWEST.equals(cfg.order);
        List<Item> chosen;
        boolean reroll = (action == A_SHUFFLE || action == A_REFRESH) && cfg.canShuffle();
        if (newest) {
            chosen = Picker.pick(pool, cfg, null, RND);
        } else if (reroll) {
            Set<String> avoid = new LinkedHashSet<>(st.seen);
            for (Item it : st.picks) avoid.add(it.id);
            chosen = Picker.pick(pool, cfg, avoid, RND);
        } else {
            chosen = keepValid(cfg, snap, pool, st.picks);
            if (chosen.size() < cfg.count) {
                Set<String> have = new HashSet<>();
                for (Item it : chosen) have.add(it.id);
                List<Item> rest = new ArrayList<>();
                for (Item it : pool) if (!have.contains(it.id)) rest.add(it);
                chosen.addAll(Picker.pickFrom(rest, cfg.count - chosen.size(), RND));
            }
        }

        // 2. load them (replacing any that fail); stay on cached pictures when offline / Wi-Fi only
        boolean metered = isMetered(app);
        boolean allowNet = !(cfg.wifiOnly && metered);
        List<Item> shown = new ArrayList<>();
        List<Bitmap> bitmaps = new ArrayList<>();
        loadAll(app, cfg, chosen, pool, allowNet, shown, bitmaps, cancel);
        if (cancel != null && cancel.isCancelled()) return;
        if (shown.isEmpty() && !st.picks.isEmpty()) {
            // Could not get anything new: keep what was on screen (cached) instead of blanking.
            loadAll(app, cfg, st.picks, new ArrayList<Item>(), false, shown, bitmaps, cancel);
        }

        if (shown.isEmpty()) {
            mgr.updateAppWidget(id, messageViews(app, cfg, id, emptyMessage(cfg, snap, pool, nativeItems, allowNet, !chosen.isEmpty())));
            return;
        }

        // 3. draw
        int[] px = widgetPixels(app, mgr, id);
        float density = px[2] / 1000f;
        boolean tall = CollageLayout.isTall(px[0], px[1]);
        float[][] cells = CollageLayout.cells(shown.size(), cfg.hero(), tall);
        List<String> captions = new ArrayList<>();
        for (Item it : shown) captions.add(cfg.caption ? captionOf(it) : "");
        Bitmap collage = CollageRenderer.render(bitmaps, captions, cells, px[0], px[1], cfg.fit, density);

        RemoteViews rv = new RemoteViews(app.getPackageName(),
                app.getResources().getIdentifier(CollageLayout.layoutName(shown.size(), cfg.hero(), tall), "layout", app.getPackageName()));
        rv.setImageViewBitmap(R.id.collage, collage);
        for (int i = 0; i < shown.size(); i++) rv.setOnClickPendingIntent(HITS[i], tapIntent(app, cfg, id, i, shown.get(i)));
        if (cfg.shuffleButton && cfg.canShuffle()) {
            rv.setViewVisibility(R.id.shuffle, View.VISIBLE);
            rv.setOnClickPendingIntent(R.id.shuffle, shuffleIntent(app, cfg, id));
        } else {
            rv.setViewVisibility(R.id.shuffle, View.GONE);
        }
        mgr.updateAppWidget(id, rv);

        // 4. remember
        st.picks = shown;
        for (Item it : shown) { st.seen.remove(it.id); st.seen.add(it.id); }
        st.at = now;
        WidgetStore.saveState(app, id, st);
        ImageCache.trim(app);
    }

    private static void loadAll(Context app, WidgetConfig cfg, List<Item> candidates, List<Item> pool, boolean allowNet,
                                List<Item> shown, List<Bitmap> bitmaps, Cancel cancel) {
        java.util.ArrayDeque<Item> queue = new java.util.ArrayDeque<>(candidates);
        Set<String> tried = new HashSet<>();
        for (Item it : shown) tried.add(it.url);
        List<Item> spare = null;
        boolean offline = !allowNet;
        int guard = 0;
        while (shown.size() < cfg.count && guard++ < cfg.count + 12) {
            if (cancel != null && cancel.isCancelled()) return;
            Item it = queue.poll();
            if (it == null) {
                if (spare == null) {
                    spare = new ArrayList<>(pool);
                    Collections.shuffle(spare, RND);
                }
                while (it == null && !spare.isEmpty()) {
                    Item cand = spare.remove(spare.size() - 1);
                    if (tried.contains(cand.url)) continue;
                    if (offline && !ImageCache.has(app, cand.url)) continue;
                    it = cand;
                }
                if (it == null) break;
            }
            if (!tried.add(it.url)) continue;
            try {
                Bitmap b = ImageCache.load(app, it.url, it.src, !offline);
                if (b != null) { shown.add(it); bitmaps.add(b); }
            } catch (IOException e) {
                offline = true; // network trouble: fall back to what is cached
            } catch (RuntimeException | OutOfMemoryError e) {
                Log.w(TAG, "image failed: " + e);
            }
        }
    }

    /** Keep current pictures that still apply (a removed favourite, or a deselected feed, drops out). */
    static List<Item> keepValid(WidgetConfig cfg, Snapshot snap, List<Item> pool, List<Item> picks) {
        List<Item> out = new ArrayList<>();
        if (cfg.isRandomKind()) {
            Set<String> allowed = Picker.allowedFeeds(cfg, snap);
            for (Item it : picks) if (allowed.contains(it.feedId)) out.add(it);
        } else {
            Set<String> ids = new HashSet<>();
            for (Item it : pool) ids.add(it.id);
            for (Item it : picks) if (ids.contains(it.id)) out.add(it);
        }
        return out;
    }

    static String emptyMessage(WidgetConfig cfg, Snapshot snap, List<Item> pool, Map<String, List<Item>> nat,
                               boolean allowNet, boolean hadCandidates) {
        if (WidgetConfig.KIND_FAVS.equals(cfg.kind)) {
            if (pool.isEmpty()) return "No favourites yet\nTap the heart on a picture in PicStroom";
        } else {
            if (WidgetConfig.KIND_SEL.equals(cfg.kind) && Picker.allowedFeeds(cfg, snap).isEmpty())
                return "No feeds selected\nLong-press the widget, then Settings";
            if (snap.feeds.isEmpty()) return "Open PicStroom once\nto load your feeds";
            if (pool.isEmpty()) {
                return cfg.days > 0 ? "No pictures from the last " + cfg.days + (cfg.days == 1 ? " day" : " days")
                        : "No pictures yet\nOpen PicStroom to load your feeds";
            }
        }
        if (!allowNet) return "Waiting for Wi-Fi";
        return "Couldn't load pictures\nTap to retry";
    }

    static String captionOf(Item it) {
        if (!it.feed.isEmpty()) return it.feed;
        try {
            String h = Uri.parse(it.src).getHost();
            return h == null ? "" : h.replaceFirst("^www\\.", "");
        } catch (Exception e) {
            return "";
        }
    }

    // ---- sizes -------------------------------------------------------------------------

    /** {width px, height px, density*1000} of the bitmap to render, capped to keep RemoteViews small. */
    static int[] widgetPixels(Context app, AppWidgetManager mgr, int id) {
        Bundle o = mgr.getAppWidgetOptions(id);
        boolean land = app.getResources().getConfiguration().orientation == Configuration.ORIENTATION_LANDSCAPE;
        int wDp = o == null ? 0 : o.getInt(land ? AppWidgetManager.OPTION_APPWIDGET_MAX_WIDTH : AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH, 0);
        int hDp = o == null ? 0 : o.getInt(land ? AppWidgetManager.OPTION_APPWIDGET_MIN_HEIGHT : AppWidgetManager.OPTION_APPWIDGET_MAX_HEIGHT, 0);
        if (wDp <= 0) wDp = 180;
        if (hDp <= 0) hDp = 180;
        float d = app.getResources().getDisplayMetrics().density;
        return fitPixels(wDp, hDp, d);
    }

    public static int[] fitPixels(int wDp, int hDp, float density) {
        float w = wDp * density, h = hDp * density;
        float s = Math.min(1f, Math.min(1000f / Math.max(w, h), (float) Math.sqrt(900_000f / (w * h))));
        int pw = Math.max(48, Math.round(w * s)), ph = Math.max(48, Math.round(h * s));
        return new int[]{pw, ph, Math.round(density * s * 1000)};
    }

    static boolean isMetered(Context app) {
        try {
            ConnectivityManager cm = (ConnectivityManager) app.getSystemService(Context.CONNECTIVITY_SERVICE);
            return cm != null && cm.isActiveNetworkMetered();
        } catch (RuntimeException e) {
            return false;
        }
    }

    // ---- views and taps ----------------------------------------------------------------

    static RemoteViews messageViews(Context app, WidgetConfig cfg, int id, String message) {
        RemoteViews rv = new RemoteViews(app.getPackageName(), R.layout.widget_message);
        rv.setTextViewText(R.id.message, message);
        boolean retry = message.contains("Tap to retry");
        rv.setOnClickPendingIntent(R.id.message, retry ? shuffleIntent(app, cfg, id) : appIntent(app, id));
        return rv;
    }

    static PendingIntent appIntent(Context app, int id) {
        Intent i = app.getPackageManager().getLaunchIntentForPackage(app.getPackageName());
        if (i == null) i = new Intent();
        return PendingIntent.getActivity(app, id * 8 + 7, i, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    static Class<?> providerFor(String kind) {
        if (WidgetConfig.KIND_FAVS.equals(kind)) return FavoritesWidget.class;
        if (WidgetConfig.KIND_SEL.equals(kind)) return SelectedWidget.class;
        return RandomWidget.class;
    }

    static PendingIntent shuffleIntent(Context app, WidgetConfig cfg, int id) {
        Intent i = new Intent(app, providerFor(cfg.kind));
        i.setAction(ACTION_SHUFFLE);
        i.putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, id);
        i.setData(Uri.parse("picstroom-widget://shuffle/" + id));
        return PendingIntent.getBroadcast(app, id * 8 + 6, i, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    static PendingIntent tapIntent(Context app, WidgetConfig cfg, int id, int cell, Item it) {
        if (WidgetConfig.TAP_SHUFFLE.equals(cfg.tap) && cfg.canShuffle()) return shuffleIntent(app, cfg, id);
        if (WidgetConfig.TAP_APP.equals(cfg.tap) || WidgetConfig.TAP_SHUFFLE.equals(cfg.tap)) return appIntent(app, id);
        Intent i = new Intent(Intent.ACTION_VIEW, openUri(it));
        i.setClassName(app, "io.github.sinks56.picstroom.MainActivity");
        i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        return PendingIntent.getActivity(app, id * 8 + cell, i, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    /** picstroom://image?id=…&u=…&s=…&t=…&f=… (see src/lib/widget-link.ts). */
    public static Uri openUri(Item it) {
        Uri.Builder b = new Uri.Builder().scheme("picstroom").authority("image")
                .appendQueryParameter("id", it.id)
                .appendQueryParameter("u", it.url)
                .appendQueryParameter("s", it.src)
                .appendQueryParameter("f", it.feedId);
        if (!it.title.isEmpty()) b.appendQueryParameter("t", it.title);
        return b.build();
    }
}
