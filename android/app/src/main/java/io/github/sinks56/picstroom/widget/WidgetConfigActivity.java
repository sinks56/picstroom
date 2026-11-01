package io.github.sinks56.picstroom.widget;

import android.app.Activity;
import android.appwidget.AppWidgetManager;
import android.content.Intent;
import android.content.res.ColorStateList;
import android.graphics.Color;
import android.graphics.Typeface;
import android.os.Bundle;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.widget.CheckBox;
import android.widget.CompoundButton;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.Switch;
import android.widget.TextView;

import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowInsetsCompat;

import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;

/**
 * Settings screen for one widget. Built in code (true black, square corners, compact) and
 * shared by the three widget types; each only differs in its kind.
 */
public abstract class WidgetConfigActivity extends Activity {
    protected abstract String kind();

    private static final int BG = Color.BLACK;
    private static final int PANEL = 0xFF161616;
    private static final int TEXT = Color.WHITE;
    private static final int MUTED = 0xFF9A9A9A;

    private int widgetId = AppWidgetManager.INVALID_APPWIDGET_ID;
    private WidgetConfig cfg;
    private WidgetConfig before;
    private LinearLayout content;
    private final List<CheckBox> feedBoxes = new ArrayList<>();
    private final List<String> feedBoxIds = new ArrayList<>();
    private TextView feedCount;

    @Override
    protected void onCreate(Bundle b) {
        super.onCreate(b);
        setResult(RESULT_CANCELED);
        widgetId = getIntent().getIntExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, AppWidgetManager.INVALID_APPWIDGET_ID);
        if (widgetId == AppWidgetManager.INVALID_APPWIDGET_ID) { finish(); return; }

        WidgetConfig existing = WidgetStore.loadConfig(this, widgetId);
        before = existing;
        cfg = existing != null ? WidgetConfig.fromJson(existing.toJson()) : new WidgetConfig(kind());
        if (existing == null && WidgetConfig.KIND_SEL.equals(kind())) cfg.feedIds.clear();
        build();
    }

    // ---- UI ------------------------------------------------------------------------------

    private void build() {
        ScrollView scroll = new ScrollView(this);
        scroll.setBackgroundColor(BG);
        scroll.setFillViewport(true);
        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setBackgroundColor(BG);
        scroll.addView(root, new ViewGroup.LayoutParams(-1, -2));

        content = new LinearLayout(this);
        content.setOrientation(LinearLayout.VERTICAL);
        content.setPadding(dp(12), dp(12), dp(12), dp(8));
        root.addView(content, new LinearLayout.LayoutParams(-1, 0, 1f));

        TextView title = text(titleText(), 18, TEXT, true);
        content.addView(title);
        TextView sub = text(subtitleText(), 12, MUTED, false);
        sub.setPadding(0, dp(2), 0, dp(6));
        content.addView(sub);

        // pictures
        section("Pictures");
        content.addView(segmented(new String[]{"1", "2", "3", "4", "5"}, cfg.count - 1, 5, new Choice() {
            @Override public void picked(int i) { cfg.count = i + 1; }
        }));
        section("Collage");
        content.addView(segmented(new String[]{"Feature", "Even"}, cfg.hero() ? 0 : 1, 2, new Choice() {
            @Override public void picked(int i) { cfg.layout = i == 0 ? WidgetConfig.LAYOUT_FEATURE : WidgetConfig.LAYOUT_EVEN; }
        }));
        hint("Feature: one bigger picture and the rest beside it. Even: equal cells. The collage turns to fit wide or tall widgets.");

        if (WidgetConfig.KIND_SEL.equals(kind())) addFeedPicker();

        if (WidgetConfig.KIND_FAVS.equals(kind())) {
            section("Order");
            content.addView(segmented(new String[]{"Shuffle", "Newest first"}, WidgetConfig.ORDER_NEWEST.equals(cfg.order) ? 1 : 0, 2, new Choice() {
                @Override public void picked(int i) { cfg.order = i == 1 ? WidgetConfig.ORDER_NEWEST : WidgetConfig.ORDER_RANDOM; }
            }));
        } else {
            section("Only pictures from the last");
            String[] dl = new String[WidgetConfig.DAY_CHOICES.length];
            int sel = 0;
            for (int i = 0; i < dl.length; i++) {
                int d = WidgetConfig.DAY_CHOICES[i];
                dl[i] = d == 0 ? "Any time" : d == 1 ? "1 day" : d + " days";
                if (d == cfg.days) sel = i;
            }
            content.addView(segmented(dl, sel, 5, new Choice() {
                @Override public void picked(int i) { cfg.days = WidgetConfig.DAY_CHOICES[i]; }
            }));
        }

        section("New pictures every");
        String[] rl = new String[WidgetConfig.REFRESH_MINUTES.length];
        int rsel = 2;
        for (int i = 0; i < rl.length; i++) {
            int m = WidgetConfig.REFRESH_MINUTES[i];
            rl[i] = m == 0 ? "Manual" : m < 60 ? m + " min" : m == 1440 ? "Daily" : (m / 60) + " h";
            if (m == cfg.refreshMin) rsel = i;
        }
        content.addView(segmented(rl, rsel, 4, new Choice() {
            @Override public void picked(int i) { cfg.refreshMin = WidgetConfig.REFRESH_MINUTES[i]; }
        }));
        hint("Android runs background refreshes at most every 15 minutes, and may delay them to save battery.");

        section("Tap a picture to");
        content.addView(segmented(new String[]{"Open it", "Shuffle", "Open app"},
                WidgetConfig.TAP_SHUFFLE.equals(cfg.tap) ? 1 : WidgetConfig.TAP_APP.equals(cfg.tap) ? 2 : 0, 3, new Choice() {
            @Override public void picked(int i) { cfg.tap = i == 1 ? WidgetConfig.TAP_SHUFFLE : i == 2 ? WidgetConfig.TAP_APP : WidgetConfig.TAP_OPEN; }
        }));

        section("Display");
        content.addView(toggle("Feed name on each picture", cfg.caption, new CompoundButton.OnCheckedChangeListener() {
            @Override public void onCheckedChanged(CompoundButton v, boolean on) { cfg.caption = on; }
        }));
        content.addView(toggle("Show whole picture (no cropping)", cfg.fit, new CompoundButton.OnCheckedChangeListener() {
            @Override public void onCheckedChanged(CompoundButton v, boolean on) { cfg.fit = on; }
        }));
        content.addView(toggle("Shuffle button", cfg.shuffleButton, new CompoundButton.OnCheckedChangeListener() {
            @Override public void onCheckedChanged(CompoundButton v, boolean on) { cfg.shuffleButton = on; }
        }));
        content.addView(toggle("Download on Wi-Fi only", cfg.wifiOnly, new CompoundButton.OnCheckedChangeListener() {
            @Override public void onCheckedChanged(CompoundButton v, boolean on) { cfg.wifiOnly = on; }
        }));

        TextView save = text("Save", 15, BG, true);
        save.setGravity(Gravity.CENTER);
        save.setBackgroundColor(TEXT);
        save.setPadding(0, dp(14), 0, dp(14));
        save.setOnClickListener(new View.OnClickListener() {
            @Override public void onClick(View v) { save(); }
        });
        LinearLayout.LayoutParams slp = new LinearLayout.LayoutParams(-1, -2);
        slp.setMargins(dp(12), dp(8), dp(12), dp(12));
        root.addView(save, slp);

        ViewCompat.setOnApplyWindowInsetsListener(scroll, new androidx.core.view.OnApplyWindowInsetsListener() {
            @Override public WindowInsetsCompat onApplyWindowInsets(View v, WindowInsetsCompat insets) {
                Insets bars = insets.getInsets(WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.displayCutout());
                v.setPadding(bars.left, bars.top, bars.right, bars.bottom);
                return WindowInsetsCompat.CONSUMED;
            }
        });
        setContentView(scroll);
    }

    private String titleText() {
        switch (kind()) {
            case WidgetConfig.KIND_FAVS: return "Favourites";
            case WidgetConfig.KIND_SEL: return "Random from feeds";
            default: return "Random";
        }
    }

    private String subtitleText() {
        switch (kind()) {
            case WidgetConfig.KIND_FAVS: return "Pictures you saved with the heart in PicStroom.";
            case WidgetConfig.KIND_SEL: return "Random pictures from the feeds you choose below.";
            default: return "Random pictures from all your feeds.";
        }
    }

    private void addFeedPicker() {
        section("Feeds");
        Snapshot snap = WidgetStore.loadSnapshot(this);
        if (snap.feeds.isEmpty()) {
            hint("No feeds yet. Open PicStroom once so your feeds can sync, then add this widget again.");
            return;
        }
        LinearLayout bar = new LinearLayout(this);
        bar.setOrientation(LinearLayout.HORIZONTAL);
        feedCount = text("", 12, MUTED, false);
        bar.addView(feedCount, new LinearLayout.LayoutParams(0, -2, 1f));
        bar.addView(smallButton("All", new View.OnClickListener() {
            @Override public void onClick(View v) { setAllFeeds(true); }
        }));
        bar.addView(smallButton("None", new View.OnClickListener() {
            @Override public void onClick(View v) { setAllFeeds(false); }
        }));
        bar.setPadding(0, 0, 0, dp(4));
        content.addView(bar);

        List<Snapshot.FeedInfo> sorted = new ArrayList<>(snap.feeds);
        java.util.Collections.sort(sorted, new java.util.Comparator<Snapshot.FeedInfo>() {
            @Override public int compare(Snapshot.FeedInfo a, Snapshot.FeedInfo b) { return Integer.compare(a.order, b.order); }
        });
        for (Snapshot.FeedInfo f : sorted) {
            final CheckBox cb = new CheckBox(this);
            cb.setText(f.title.isEmpty() ? f.url : f.title);
            cb.setTextColor(TEXT);
            cb.setTextSize(TypedValue.COMPLEX_UNIT_SP, 14);
            cb.setSingleLine(true);
            cb.setButtonTintList(ColorStateList.valueOf(TEXT));
            cb.setBackgroundColor(PANEL);
            cb.setPadding(dp(4), dp(6), dp(8), dp(6));
            cb.setChecked(cfg.feedIds.contains(f.id));
            cb.setOnCheckedChangeListener(new CompoundButton.OnCheckedChangeListener() {
                @Override public void onCheckedChanged(CompoundButton v, boolean on) { updateFeedCount(); }
            });
            LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(-1, -2);
            lp.setMargins(0, 0, 0, 1);
            content.addView(cb, lp);
            feedBoxes.add(cb);
            feedBoxIds.add(f.id);
        }
        updateFeedCount();
    }

    private void setAllFeeds(boolean on) {
        for (CheckBox cb : feedBoxes) cb.setChecked(on);
    }

    private void updateFeedCount() {
        int n = 0;
        for (CheckBox cb : feedBoxes) if (cb.isChecked()) n++;
        if (feedCount != null) feedCount.setText(n + " of " + feedBoxes.size() + " selected");
    }

    private void save() {
        if (WidgetConfig.KIND_SEL.equals(kind())) {
            Set<String> ids = new LinkedHashSet<>();
            for (int i = 0; i < feedBoxes.size(); i++) if (feedBoxes.get(i).isChecked()) ids.add(feedBoxIds.get(i));
            if (ids.isEmpty()) {
                android.widget.Toast.makeText(this, "Select at least one feed", android.widget.Toast.LENGTH_SHORT).show();
                return;
            }
            cfg.feedIds = ids;
        }
        cfg.kind = kind();
        cfg.clamp();
        boolean repick = before == null || before.count != cfg.count || before.days != cfg.days
                || !before.feedIds.equals(cfg.feedIds) || !before.order.equals(cfg.order);
        WidgetStore.saveConfig(this, widgetId, cfg);
        if (repick) WidgetStore.clearState(this, widgetId);
        WidgetScheduler.schedule(this, widgetId, cfg);
        if (cfg.isRandomKind()) {
            WidgetScheduler.ensureFeedSync(this);
            if (WidgetStore.loadNative(this).isEmpty()) WidgetScheduler.kickFeedSync(this);
        }
        WidgetUpdater.enqueue(this, widgetId, WidgetUpdater.A_INIT);
        Intent result = new Intent().putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, widgetId);
        setResult(RESULT_OK, result);
        finish();
    }

    // ---- small view helpers ----------------------------------------------------------------

    private interface Choice { void picked(int index); }

    private int dp(int v) {
        return Math.round(v * getResources().getDisplayMetrics().density);
    }

    private TextView text(String s, int sp, int color, boolean bold) {
        TextView t = new TextView(this);
        t.setText(s);
        t.setTextSize(TypedValue.COMPLEX_UNIT_SP, sp);
        t.setTextColor(color);
        if (bold) t.setTypeface(Typeface.DEFAULT_BOLD);
        return t;
    }

    private void section(String label) {
        TextView t = text(label.toUpperCase(java.util.Locale.ROOT), 11, MUTED, true);
        t.setLetterSpacing(0.08f);
        t.setPadding(0, dp(14), 0, dp(5));
        content.addView(t);
    }

    private void hint(String s) {
        TextView t = text(s, 11, MUTED, false);
        t.setPadding(0, dp(4), 0, 0);
        content.addView(t);
    }

    private TextView smallButton(String label, View.OnClickListener l) {
        TextView t = text(label, 12, TEXT, true);
        t.setBackgroundColor(PANEL);
        t.setPadding(dp(12), dp(5), dp(12), dp(5));
        t.setOnClickListener(l);
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(-2, -2);
        lp.setMargins(dp(1), 0, 0, 0);
        t.setLayoutParams(lp);
        return t;
    }

    private View toggle(String label, boolean on, CompoundButton.OnCheckedChangeListener l) {
        Switch s = new Switch(this);
        s.setText(label);
        s.setTextColor(TEXT);
        s.setTextSize(TypedValue.COMPLEX_UNIT_SP, 14);
        s.setChecked(on);
        s.setBackgroundColor(PANEL);
        s.setPadding(dp(10), dp(9), dp(10), dp(9));
        s.setOnCheckedChangeListener(l);
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(-1, -2);
        lp.setMargins(0, 0, 0, 1);
        s.setLayoutParams(lp);
        return s;
    }

    /** Square segmented control; rows of `perRow` buttons, one selected (white on black). */
    private View segmented(String[] labels, int selected, int perRow, final Choice cb) {
        final List<TextView> all = new ArrayList<>();
        LinearLayout col = new LinearLayout(this);
        col.setOrientation(LinearLayout.VERTICAL);
        final int[] sel = {selected};
        for (int start = 0; start < labels.length; start += perRow) {
            LinearLayout row = new LinearLayout(this);
            row.setOrientation(LinearLayout.HORIZONTAL);
            for (int k = 0; k < perRow; k++) {
                int i = start + k;
                TextView t = text(i < labels.length ? labels[i] : "", 13, TEXT, true);
                t.setGravity(Gravity.CENTER);
                t.setPadding(dp(2), dp(10), dp(2), dp(10));
                t.setSingleLine(true);
                LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(0, -2, 1f);
                lp.setMargins(0, 0, k < perRow - 1 ? 1 : 0, 1);
                row.addView(t, lp);
                if (i < labels.length) {
                    all.add(t);
                    final int idx = i;
                    t.setOnClickListener(new View.OnClickListener() {
                        @Override public void onClick(View v) {
                            sel[0] = idx;
                            paint(all, sel[0]);
                            cb.picked(idx);
                        }
                    });
                } else {
                    t.setBackgroundColor(BG);
                }
            }
            col.addView(row, new LinearLayout.LayoutParams(-1, -2));
        }
        paint(all, sel[0]);
        return col;
    }

    private void paint(List<TextView> all, int sel) {
        for (int i = 0; i < all.size(); i++) {
            TextView t = all.get(i);
            boolean on = i == sel;
            t.setBackgroundColor(on ? TEXT : PANEL);
            t.setTextColor(on ? BG : TEXT);
        }
    }
}
