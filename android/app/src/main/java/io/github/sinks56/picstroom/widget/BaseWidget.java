package io.github.sinks56.picstroom.widget;

import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;
import android.content.Intent;
import android.os.Bundle;

/** Shared behaviour of the three widget types; each subclass only names its kind. */
public abstract class BaseWidget extends AppWidgetProvider {
    protected abstract String kind();

    @Override
    public void onUpdate(Context ctx, AppWidgetManager mgr, int[] ids) {
        for (int id : ids) {
            WidgetConfig cfg = WidgetStore.loadConfig(ctx, id);
            if (cfg == null) {
                cfg = new WidgetConfig(kind());
                if (WidgetConfig.KIND_SEL.equals(kind())) {
                    for (Snapshot.FeedInfo f : WidgetStore.loadSnapshot(ctx).feeds) cfg.feedIds.add(f.id);
                }
                WidgetStore.saveConfig(ctx, id, cfg);
            }
            WidgetScheduler.schedule(ctx, id, cfg);
            WidgetUpdater.enqueue(ctx, id, WidgetUpdater.A_INIT);
            if (cfg.isRandomKind()) WidgetScheduler.ensureFeedSync(ctx);
        }
    }

    @Override
    public void onAppWidgetOptionsChanged(Context ctx, AppWidgetManager mgr, int id, Bundle newOptions) {
        WidgetUpdater.enqueue(ctx, id, WidgetUpdater.A_RESIZE);
    }

    @Override
    public void onReceive(Context ctx, Intent intent) {
        if (WidgetUpdater.ACTION_SHUFFLE.equals(intent.getAction())) {
            int id = intent.getIntExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, AppWidgetManager.INVALID_APPWIDGET_ID);
            if (id != AppWidgetManager.INVALID_APPWIDGET_ID) WidgetUpdater.enqueue(ctx, id, WidgetUpdater.A_SHUFFLE);
            return;
        }
        super.onReceive(ctx, intent);
    }

    @Override
    public void onDeleted(Context ctx, int[] ids) {
        for (int id : ids) {
            WidgetStore.deleteWidget(ctx, id);
            WidgetScheduler.cancel(ctx, id);
        }
    }

    @Override
    public void onDisabled(Context ctx) {
        if (WidgetStore.widgetIds(ctx).isEmpty()) WidgetScheduler.cancelFeedSync(ctx);
    }
}
