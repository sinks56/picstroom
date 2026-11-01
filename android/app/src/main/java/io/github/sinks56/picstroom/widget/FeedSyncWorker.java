package io.github.sinks56.picstroom.widget;

import android.content.Context;
import android.util.Log;

import androidx.annotation.NonNull;
import androidx.work.Worker;
import androidx.work.WorkerParameters;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.Callable;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;

/**
 * Fetches the feeds that random widgets use, straight from the network, so the widgets
 * show new pictures even when the app has not been opened for days. Results live in
 * widget-native.json and are merged with the app's own snapshot when picking.
 */
public class FeedSyncWorker extends Worker {
    private static final String RELAY = "https://picstroom-proxy.pages.dev/?url=";
    private static final String RELAY_ORIGIN = "https://sinks56.github.io";
    private static final int MAX_FEEDS = 80;
    private static final int KEEP_PER_FEED = 60;
    private static final long MAX_BYTES = 3L * 1024 * 1024;

    public FeedSyncWorker(@NonNull Context context, @NonNull WorkerParameters params) {
        super(context, params);
    }

    @NonNull
    @Override
    public Result doWork() {
        Context app = getApplicationContext();
        try {
            Snapshot snap = WidgetStore.loadSnapshot(app);
            Set<String> wanted = new LinkedHashSet<>();
            boolean allWifiOnly = true, any = false;
            for (int id : WidgetStore.widgetIds(app)) {
                WidgetConfig cfg = WidgetStore.loadConfig(app, id);
                if (cfg == null || !cfg.isRandomKind()) continue;
                any = true;
                if (!cfg.wifiOnly) allWifiOnly = false;
                wanted.addAll(Picker.allowedFeeds(cfg, snap));
            }
            if (!any || wanted.isEmpty()) return Result.success();
            if (allWifiOnly && WidgetUpdater.isMetered(app)) return Result.success();

            final Map<String, Snapshot.FeedInfo> byId = new LinkedHashMap<>();
            for (Snapshot.FeedInfo f : snap.feeds) if (wanted.contains(f.id)) byId.put(f.id, f);

            Map<String, List<Item>> store = WidgetStore.loadNative(app);
            // Forget feeds that are gone.
            store.keySet().retainAll(new LinkedHashSet<>(snap.feedTitles().keySet()));

            ExecutorService pool = Executors.newFixedThreadPool(4);
            Map<String, Future<List<Item>>> jobs = new LinkedHashMap<>();
            int n = 0;
            final long now = System.currentTimeMillis();
            for (final Snapshot.FeedInfo f : byId.values()) {
                if (n++ >= MAX_FEEDS) break;
                jobs.put(f.id, pool.submit(new Callable<List<Item>>() {
                    @Override public List<Item> call() throws Exception {
                        String xml = fetch(f.url);
                        return FeedParser.parse(xml, f.id, f.title, f.url, now);
                    }
                }));
            }
            pool.shutdown();
            for (Map.Entry<String, Future<List<Item>>> e : jobs.entrySet()) {
                if (isStopped()) { pool.shutdownNow(); return Result.retry(); }
                try {
                    List<Item> fresh = e.getValue().get(40, TimeUnit.SECONDS);
                    if (fresh.isEmpty()) continue;
                    store.put(e.getKey(), merge(fresh, store.get(e.getKey())));
                } catch (Exception ignored) { /* leave this feed's older pictures in place */ }
            }
            WidgetStore.saveNative(app, store);
        } catch (Throwable t) {
            Log.w("PicStroomWidget", "feed sync failed", t);
            return Result.retry();
        }
        return Result.success();
    }

    static List<Item> merge(List<Item> fresh, List<Item> old) {
        List<Item> out = new ArrayList<>();
        Set<String> urls = new LinkedHashSet<>();
        for (Item it : fresh) if (urls.add(it.url)) out.add(it);
        if (old != null) for (Item it : old) if (out.size() < KEEP_PER_FEED && urls.add(it.url)) out.add(it);
        return out.size() > KEEP_PER_FEED ? new ArrayList<>(out.subList(0, KEEP_PER_FEED)) : out;
    }

    static String fetch(String url) throws IOException {
        try {
            return get(url, null);
        } catch (IOException direct) {
            try {
                return get(RELAY + URLEncoder.encode(url, "UTF-8"), RELAY_ORIGIN);
            } catch (IOException viaRelay) {
                throw direct;
            }
        }
    }

    private static String get(String url, String origin) throws IOException {
        String current = url;
        for (int hop = 0; hop < 4; hop++) {
            HttpURLConnection c = (HttpURLConnection) new URL(current).openConnection();
            try {
                c.setInstanceFollowRedirects(false);
                c.setConnectTimeout(10000);
                c.setReadTimeout(15000);
                c.setRequestProperty("User-Agent", ImageCache.UA);
                c.setRequestProperty("Accept", "application/rss+xml, application/atom+xml, application/xml, text/xml;q=0.9, */*;q=0.5");
                if (origin != null) c.setRequestProperty("Origin", origin);
                int code = c.getResponseCode();
                if (code >= 300 && code < 400) {
                    String loc = c.getHeaderField("Location");
                    if (loc == null) throw new IOException("redirect without location");
                    current = new URL(new URL(current), loc).toString();
                    if (!current.startsWith("https://")) throw new IOException("insecure redirect");
                    continue;
                }
                if (code != 200) throw new IOException("HTTP " + code);
                try (InputStream in = c.getInputStream()) {
                    ByteArrayOutputStream bo = new ByteArrayOutputStream(65536);
                    byte[] buf = new byte[16384];
                    int n;
                    long total = 0;
                    while ((n = in.read(buf)) > 0) {
                        total += n;
                        if (total > MAX_BYTES) break; // the newest items come first; a truncated tail is fine
                        bo.write(buf, 0, n);
                    }
                    return new String(bo.toByteArray(), StandardCharsets.UTF_8);
                }
            } finally {
                c.disconnect();
            }
        }
        throw new IOException("too many redirects");
    }
}
