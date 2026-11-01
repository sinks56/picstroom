package io.github.sinks56.picstroom.widget;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertTrue;
import static org.robolectric.Shadows.shadowOf;

import android.app.Activity;
import android.appwidget.AppWidgetManager;
import android.content.Context;
import android.content.Intent;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.Color;
import android.os.Bundle;
import android.view.View;
import android.view.ViewGroup;
import android.widget.FrameLayout;
import android.widget.ImageView;

import org.robolectric.RuntimeEnvironment;

import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.Assume;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.Robolectric;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.annotation.Config;
import org.robolectric.annotation.GraphicsMode;
import org.robolectric.shadows.ShadowAppWidgetManager;

import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.util.ArrayList;
import java.util.List;

/**
 * Runs the real widget code (picker, image cache, collage renderer, generated RemoteViews layouts and the
 * config screens) on the JVM. With -Dpicstroom.shots=DIR (and sample pictures in -Dpicstroom.samples=DIR)
 * it also writes preview PNGs. Without them it only asserts that everything renders.
 */
@RunWith(RobolectricTestRunner.class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(sdk = 34, qualifiers = "xhdpi")
public class WidgetRenderTest {
    private Context ctx;
    private AppWidgetManager mgr;
    private File samples;
    private File shots;

    @Before
    public void setUp() throws Exception {
        ctx = RuntimeEnvironment.getApplication();
        androidx.work.testing.WorkManagerTestInitHelper.initializeTestWorkManager(ctx);
        mgr = AppWidgetManager.getInstance(ctx);
        String s = System.getProperty("picstroom.samples");
        samples = s == null ? null : new File(s);
        String o = System.getProperty("picstroom.shots");
        shots = o == null ? null : new File(o);
        if (shots != null) shots.mkdirs();

        // Snapshot like the app writes it: 3 feeds, 14 pictures, 6 favourites.
        JSONObject snap = new JSONObject();
        snap.put("v", 1);
        snap.put("at", System.currentTimeMillis());
        JSONArray feeds = new JSONArray();
        String[] names = {"Colossal", "Booooooom", "Behance"};
        for (int i = 0; i < 3; i++) {
            feeds.put(new JSONObject().put("id", "f" + i).put("title", names[i]).put("url", "https://f" + i + ".test/rss").put("order", i));
        }
        snap.put("feeds", feeds);
        JSONArray imgs = new JSONArray(), favs = new JSONArray();
        for (int i = 0; i < 14; i++) {
            imgs.put(new JSONObject().put("id", "i" + i).put("feedId", "f" + (i % 3)).put("url", "https://img.test/p" + i + ".jpg")
                    .put("src", "https://f" + (i % 3) + ".test/post" + i).put("title", "Picture " + i).put("t", System.currentTimeMillis() - i * 3600_000L));
        }
        for (int i = 0; i < 6; i++) {
            favs.put(new JSONObject().put("id", "v" + i).put("feedId", "f" + (i % 3)).put("feed", names[i % 3]).put("url", "https://img.test/p" + i + ".jpg")
                    .put("src", "https://f" + (i % 3) + ".test/post" + i).put("title", "Favourite " + i).put("t", 1000 + i));
        }
        snap.put("imgs", imgs);
        snap.put("favs", favs);
        WidgetStore.saveSnapshot(ctx, snap.toString());

        // Pre-fill the picture cache so nothing touches the network.
        File dir = ImageCache.dir(ctx);
        for (int i = 0; i < 14; i++) {
            File out = new File(dir, ImageCache.key("https://img.test/p" + i + ".jpg") + ".jpg");
            Bitmap b = sampleBitmap(i);
            try (FileOutputStream f = new FileOutputStream(out)) { b.compress(Bitmap.CompressFormat.JPEG, 88, f); }
        }
    }

    private Bitmap sampleBitmap(int i) {
        if (samples != null) {
            File f = new File(samples, "s" + (i % 6 + 1) + ".jpg");
            if (f.exists()) {
                Bitmap b = android.graphics.BitmapFactory.decodeFile(f.getAbsolutePath());
                if (b != null) return b;
            }
        }
        // Deterministic colourful stand-in (a diagonal gradient), different aspect per picture.
        int w = 600 + (i % 3) * 120, h = 500 + (i % 4) * 90;
        Bitmap b = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888);
        Canvas c = new Canvas(b);
        android.graphics.Paint p = new android.graphics.Paint();
        p.setShader(new android.graphics.LinearGradient(0, 0, w, h, Color.HSVToColor(new float[]{(i * 47) % 360, .7f, .95f}),
                Color.HSVToColor(new float[]{(i * 47 + 120) % 360, .8f, .5f}), android.graphics.Shader.TileMode.CLAMP));
        c.drawRect(0, 0, w, h, p);
        return b;
    }

    // ---- helpers -------------------------------------------------------------------------

    private int addWidget(Class<?> provider, WidgetConfig cfg, int wDp, int hDp) {
        ShadowAppWidgetManager sh = shadowOf(mgr);
        int id = sh.createWidget((Class) provider, io.github.sinks56.picstroom.R.layout.widget_message);
        Bundle o = new Bundle();
        o.putInt(AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH, wDp);
        o.putInt(AppWidgetManager.OPTION_APPWIDGET_MAX_WIDTH, wDp);
        o.putInt(AppWidgetManager.OPTION_APPWIDGET_MIN_HEIGHT, hDp);
        o.putInt(AppWidgetManager.OPTION_APPWIDGET_MAX_HEIGHT, hDp);
        mgr.updateAppWidgetOptions(id, o);
        WidgetStore.saveConfig(ctx, id, cfg.clamp());
        return id;
    }

    private View render(int id, int wDp, int hDp, String name) throws Exception {
        WidgetUpdater.update(ctx, id, WidgetUpdater.A_SHUFFLE, null);
        View v = shadowOf(mgr).getViewFor(id);
        assertNotNull("no view for " + name, v);
        float d = ctx.getResources().getDisplayMetrics().density;
        int w = Math.round(wDp * d), h = Math.round(hDp * d);
        v.measure(View.MeasureSpec.makeMeasureSpec(w, View.MeasureSpec.EXACTLY), View.MeasureSpec.makeMeasureSpec(h, View.MeasureSpec.EXACTLY));
        v.layout(0, 0, w, h);
        if (shots != null) {
            int pad = 24;
            Bitmap out = Bitmap.createBitmap(w + 2 * pad, h + 2 * pad, Bitmap.Config.ARGB_8888);
            Canvas c = new Canvas(out);
            c.drawColor(0xFF2A2A2A);
            c.translate(pad, pad);
            v.draw(c);
            save(out, name);
        }
        return v;
    }

    private void save(Bitmap b, String name) throws Exception {
        try (FileOutputStream f = new FileOutputStream(new File(shots, name + ".png"))) {
            b.compress(Bitmap.CompressFormat.PNG, 100, f);
        }
    }

    private static WidgetConfig cfg(String kind, int count, String layout) {
        WidgetConfig c = new WidgetConfig(kind);
        c.count = count;
        c.layout = layout;
        if (WidgetConfig.KIND_SEL.equals(kind)) { c.feedIds.add("f0"); c.feedIds.add("f2"); }
        return c;
    }

    private ImageView collage(View v) {
        return (ImageView) v.findViewById(io.github.sinks56.picstroom.R.id.collage);
    }

    // ---- tests ---------------------------------------------------------------------------

    @Test
    public void everyCountAndLayoutRendersAWidget() throws Exception {
        for (int n = 1; n <= 5; n++) {
            for (String layout : new String[]{WidgetConfig.LAYOUT_FEATURE, WidgetConfig.LAYOUT_EVEN}) {
                for (int[] size : new int[][]{{250, 150}, {150, 300}}) {
                    WidgetConfig c = cfg(WidgetConfig.KIND_ALL, n, layout);
                    int id = addWidget(RandomWidget.class, c, size[0], size[1]);
                    String name = String.format("grid-%d-%s-%s", n, layout, size[0] > size[1] ? "wide" : "tall");
                    View v = render(id, size[0], size[1], name);
                    assertNotNull(name, collage(v));
                    for (int i = 0; i < n; i++) {
                        int hit = new int[]{io.github.sinks56.picstroom.R.id.hit0, io.github.sinks56.picstroom.R.id.hit1, io.github.sinks56.picstroom.R.id.hit2,
                                io.github.sinks56.picstroom.R.id.hit3, io.github.sinks56.picstroom.R.id.hit4}[i];
                        assertNotNull(name + " hit" + i, v.findViewById(hit));
                        assertTrue(name + " hit" + i + " has no tap", v.findViewById(hit).hasOnClickListeners());
                    }
                }
            }
        }
    }

    @Test
    public void showcase() throws Exception {
        Assume.assumeNotNull(shots);
        WidgetConfig a = cfg(WidgetConfig.KIND_FAVS, 1, WidgetConfig.LAYOUT_FEATURE);
        render(addWidget(FavoritesWidget.class, a, 180, 180), 180, 180, "w01-favourites-1");

        WidgetConfig b = cfg(WidgetConfig.KIND_FAVS, 2, WidgetConfig.LAYOUT_EVEN);
        b.order = WidgetConfig.ORDER_NEWEST;
        render(addWidget(FavoritesWidget.class, b, 280, 130), 280, 130, "w02-favourites-2-newest");

        WidgetConfig c = cfg(WidgetConfig.KIND_ALL, 3, WidgetConfig.LAYOUT_FEATURE);
        c.caption = true;
        render(addWidget(RandomWidget.class, c, 280, 180), 280, 180, "w03-random-3-captions");

        WidgetConfig d = cfg(WidgetConfig.KIND_SEL, 5, WidgetConfig.LAYOUT_FEATURE);
        d.caption = true;
        render(addWidget(SelectedWidget.class, d, 340, 210), 340, 210, "w04-selected-5-feature");

        WidgetConfig e = cfg(WidgetConfig.KIND_SEL, 4, WidgetConfig.LAYOUT_EVEN);
        render(addWidget(SelectedWidget.class, e, 250, 250), 250, 250, "w05-selected-4-even");

        WidgetConfig f = cfg(WidgetConfig.KIND_ALL, 4, WidgetConfig.LAYOUT_FEATURE);
        f.fit = true;
        render(addWidget(RandomWidget.class, f, 250, 250), 250, 250, "w06-random-4-fit");

        WidgetConfig g = cfg(WidgetConfig.KIND_ALL, 5, WidgetConfig.LAYOUT_EVEN);
        render(addWidget(RandomWidget.class, g, 160, 320), 160, 320, "w07-random-5-tall");

        WidgetConfig h = cfg(WidgetConfig.KIND_ALL, 3, WidgetConfig.LAYOUT_FEATURE);
        h.shuffleButton = false;
        render(addWidget(RandomWidget.class, h, 150, 300), 150, 300, "w08-random-3-tall-noshuffle");

        // messages
        WidgetConfig m1 = cfg(WidgetConfig.KIND_FAVS, 2, WidgetConfig.LAYOUT_FEATURE);
        WidgetStore.saveSnapshot(ctx, new JSONObject().put("v", 1).put("feeds", new JSONArray()).put("imgs", new JSONArray()).put("favs", new JSONArray()).toString());
        render(addWidget(FavoritesWidget.class, m1, 180, 180), 180, 180, "m1-no-favourites");
        WidgetConfig m2 = cfg(WidgetConfig.KIND_SEL, 3, WidgetConfig.LAYOUT_FEATURE);
        m2.feedIds.clear();
        render(addWidget(SelectedWidget.class, m2, 180, 180), 180, 180, "m2-no-feeds-selected");
        WidgetConfig m3 = cfg(WidgetConfig.KIND_ALL, 3, WidgetConfig.LAYOUT_FEATURE);
        render(addWidget(RandomWidget.class, m3, 180, 180), 180, 180, "m3-open-app-once");
    }

    @Test
    public void configScreensBuildAndSave() throws Exception {
        Class<?>[] acts = {FavoritesConfigActivity.class, RandomConfigActivity.class, SelectedConfigActivity.class};
        String[] kinds = {"favourites", "random", "selected"};
        Class<?>[] providers = {FavoritesWidget.class, RandomWidget.class, SelectedWidget.class};
        for (int k = 0; k < 3; k++) {
            int id = shadowOf(mgr).createWidget((Class) providers[k], io.github.sinks56.picstroom.R.layout.widget_message);
            Intent in = new Intent(ctx, acts[k]).putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, id);
            Activity a = (Activity) Robolectric.buildActivity((Class) acts[k], in).setup().get();
            View root = a.findViewById(android.R.id.content);
            assertNotNull(root);
            if (shots != null) {
                float d = ctx.getResources().getDisplayMetrics().density;
                int w = Math.round(360 * d), h = Math.round(1400 * d);
                root.measure(View.MeasureSpec.makeMeasureSpec(w, View.MeasureSpec.EXACTLY), View.MeasureSpec.makeMeasureSpec(h, View.MeasureSpec.AT_MOST));
                int mh = root.getMeasuredHeight();
                root.layout(0, 0, w, mh);
                Bitmap out = Bitmap.createBitmap(w, mh, Bitmap.Config.ARGB_8888);
                root.draw(new Canvas(out));
                save(out, "config-" + kinds[k]);
            }
        }
    }
}
